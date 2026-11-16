/**
 * The migration of an install from before project folders, as the user
 * confirms and follows it (docs/project-folders/migration-ux.md).
 *
 * On a local desktop app or local server the bulk steps of PRD T9 wait until
 * the user confirms: folders for every project, files for every workflow and
 * timeline, and the asset move. Lazy folder creation for a run or a chat turn
 * does not wait. Everywhere else the steps run at startup as they did before.
 *
 * The state is one JSON value per user in `app_settings`, so the desktop
 * server and a `nodetool` command read the same one through the shared
 * database. Every transition is checked here. The process-wide asset move job
 * asks {@link bulkMigrationAllowed} before each pass and each asset, so
 * nothing moves before confirmation or while the migration is paused.
 */
import { homedir } from "node:os";
import { posix } from "node:path";
import { z } from "zod";
import { createLogger, workspaceStorageKind } from "@nodetool-ai/config";
import {
  checkProjectsDir,
  configuredProjectsDir,
  isLocalDeployment,
  migrateProjectFolders,
  PROJECTS_DIR_SETTING,
  ProjectFolderError
} from "@nodetool-ai/execution/service";
import {
  Asset,
  LOOSE_PROJECT_ID,
  PERSONAL_PROJECT_KIND,
  Project,
  Setting,
  TimelineSequence,
  Workflow,
  Workspace
} from "@nodetool-ai/models";
import {
  projectFolderMigrationFailure,
  projectFolderMigrationState,
  type ProjectFolderMigrationFailure,
  type ProjectFolderMigrationLocation,
  type ProjectFolderMigrationPlan,
  type ProjectFolderMigrationStatus
} from "@nodetool-ai/protocol/api-schemas/projects.js";
import { ProjectFolderUnavailableError } from "@nodetool-ai/asset-services/project-asset-file";
import {
  projectAssetMoveJob,
  scheduleLegacyAssetMoves,
  type ProjectAssetMoveJob
} from "./project-asset-move-job.js";
import { migrateTimelineFiles } from "./timeline-file.js";
import { migrateWorkflowFiles } from "./workflow-file.js";

const log = createLogger("nodetool.project-services.project-folder-migration");

/** The `app_settings` key that holds a user's migration state. */
export const PROJECT_FOLDER_MIGRATION_SETTING = "PROJECT_FOLDER_MIGRATION";

/**
 * The environment variable that skips the question. `auto` confirms for each
 * user with the configured projects folder. Anything else asks.
 */
export const PROJECT_FOLDER_MIGRATION_ENV = "NODETOOL_PROJECT_MIGRATION";

/** Failures kept with the state. The count covers the rest. */
const MAX_STORED_FAILURES = 50;

/** Projects read per query while counting projects without a folder. */
const COUNT_BATCH = 500;

const storedState = z.object({
  state: projectFolderMigrationState,
  location: z.string().nullable().default(null),
  confirmed_by: z.enum(["user", "auto"]).nullable().default(null),
  total_assets: z.number().int().nonnegative().default(0),
  failures: z.array(projectFolderMigrationFailure).default([]),
  failure_count: z.number().int().nonnegative().default(0),
  nothing_to_move: z.boolean().default(false),
  dismissed: z.boolean().default(false)
});
type StoredState = z.infer<typeof storedState>;

const NOT_STARTED: StoredState = storedState.parse({ state: "not_started" });

/** Why a migration request was refused. */
export class ProjectFolderMigrationError extends Error {
  override name = "ProjectFolderMigrationError";
  constructor(
    readonly code: "invalid_transition" | "invalid_location" | "not_applicable",
    message: string
  ) {
    super(message);
  }
}

/**
 * True where the migration asks the user first: local workspace storage on a
 * server that is not a production deployment.
 */
export function projectFolderMigrationApplies(): boolean {
  return workspaceStorageKind() === "local" && isLocalDeployment();
}

/** True when `NODETOOL_PROJECT_MIGRATION=auto` confirms without asking. */
export function projectFolderMigrationAutoConfirms(): boolean {
  return process.env[PROJECT_FOLDER_MIGRATION_ENV]?.trim().toLowerCase() === "auto";
}

/**
 * True when macOS asks the user for access before an app may write under
 * `path`: the Documents, Desktop and Downloads folders, iCloud Drive, and
 * external volumes.
 */
export function locationNeedsPermission(
  path: string,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir()
): boolean {
  if (platform !== "darwin") return false;
  const normalized = posix.normalize(path);
  const roots = [
    "/Volumes",
    ...["Documents", "Desktop", "Downloads", "Library/Mobile Documents"].map(
      (name) => posix.join(home, name)
    )
  ];
  return roots.some(
    (root) => normalized === root || normalized.startsWith(`${root}/`)
  );
}

async function readStored(userId: string): Promise<StoredState | null> {
  const row = await Setting.find(userId, PROJECT_FOLDER_MIGRATION_SETTING);
  if (!row) return null;
  try {
    return storedState.parse(JSON.parse(row.value));
  } catch (error) {
    log.warn("Ignoring an unreadable project folder migration state", {
      userId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function writeStored(userId: string, state: StoredState): Promise<void> {
  await Setting.upsert({
    userId,
    key: PROJECT_FOLDER_MIGRATION_SETTING,
    value: JSON.stringify(state)
  });
}

/** Read-modify-write of a user's state, one at a time within this process. */
const stateQueues = new Map<string, Promise<unknown>>();

function updateStored(
  userId: string,
  change: (current: StoredState | null) => StoredState | null
): Promise<StoredState | null> {
  const previous = stateQueues.get(userId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const current = await readStored(userId);
      const updated = change(current);
      if (updated && updated !== current) await writeStored(userId, updated);
      return updated;
    });
  stateQueues.set(userId, next);
  return next;
}

function refuse(message: string): never {
  throw new ProjectFolderMigrationError("invalid_transition", message);
}

function requireApplies(): void {
  if (!projectFolderMigrationApplies()) {
    throw new ProjectFolderMigrationError(
      "not_applicable",
      "This server moves projects into folders without asking"
    );
  }
}

// ── What there is to move ───────────────────────────────────────────────────

async function projectsWithoutFolder(userId: string): Promise<Project[]> {
  const found: Project[] = [];
  let after: { created_at: string; id: string } | undefined;
  for (;;) {
    const batch = await Project.listWithoutFolder(COUNT_BATCH, after, userId);
    found.push(...batch);
    if (batch.length < COUNT_BATCH) return found;
    const last = batch[batch.length - 1];
    after = { created_at: last.created_at, id: last.id };
  }
}

async function unwrittenCount(
  rows: Promise<Array<{ count: number }>>
): Promise<number> {
  return (await rows).reduce((sum, row) => sum + Number(row.count), 0);
}

interface WorkCounts {
  projects: Project[];
  assets: number;
  workflows: number;
  timelines: number;
}

async function countWork(userId: string): Promise<WorkCounts> {
  const [projects, assets, workflows, timelines] = await Promise.all([
    projectsWithoutFolder(userId),
    Asset.countAwaitingFolderMove(userId),
    unwrittenCount(Workflow.projectsWithUnwrittenFiles(userId)),
    unwrittenCount(TimelineSequence.projectsWithUnwrittenFiles(userId))
  ]);
  return { projects, assets, workflows, timelines };
}

function hasWork(counts: WorkCounts): boolean {
  return (
    counts.projects.length > 0 ||
    counts.assets > 0 ||
    counts.workflows > 0 ||
    counts.timelines > 0
  );
}

/** Every user that has something to move, across the whole database. */
async function usersWithWork(): Promise<Set<string>> {
  const users = new Set<string>();
  let after: { created_at: string; id: string } | undefined;
  for (;;) {
    const batch = await Project.listWithoutFolder(COUNT_BATCH, after);
    for (const project of batch) users.add(project.user_id);
    if (batch.length < COUNT_BATCH) break;
    const last = batch[batch.length - 1];
    after = { created_at: last.created_at, id: last.id };
  }
  for (const row of await Asset.listProjectsAwaitingFolderMove()) {
    users.add(row.userId);
  }
  for (const row of await Workflow.projectsWithUnwrittenFiles()) {
    users.add(row.user_id);
  }
  for (const row of await TimelineSequence.projectsWithUnwrittenFiles()) {
    users.add(row.user_id);
  }
  return users;
}

/** The workspaces of a project that no game uses, oldest first. */
async function folderCandidates(
  userId: string,
  projectId: string
): Promise<Workspace[]> {
  const rows = await Workspace.listByProject(userId, projectId);
  const candidates: Workspace[] = [];
  for (const row of rows) {
    if (!(await Workspace.isUsedByGame(row.id))) candidates.push(row);
  }
  return candidates.sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
}

/**
 * The location new project folders go in: `chosen` when given, else the
 * user's setting, the environment variable or the default.
 */
export async function describeMigrationLocation(
  userId: string,
  chosen?: string
): Promise<ProjectFolderMigrationLocation> {
  const configured = await configuredProjectsDir(userId);
  const path = chosen ?? configured.dir;
  let error: string | null = null;
  try {
    // The default directory is created when it is missing. A directory the
    // user names must already exist.
    await checkProjectsDir(path, {
      create: false
    });
  } catch (reason) {
    const missing =
      reason instanceof ProjectFolderError &&
      reason.message === "The projects folder does not exist";
    const mayCreate = chosen === undefined && !configured.fromUser;
    if (!(missing && mayCreate)) {
      error = reason instanceof Error ? reason.message : String(reason);
    }
  }
  return {
    path,
    is_default: chosen === undefined && !configured.fromUser,
    permission_prompt: locationNeedsPermission(path),
    error
  };
}

/** What confirming the migration does for the user. */
export async function buildMigrationPlan(
  userId: string,
  location?: string
): Promise<ProjectFolderMigrationPlan> {
  const counts = await countWork(userId);
  const extra: ProjectFolderMigrationPlan["extra_workspaces"] = [];
  for (const project of counts.projects) {
    if (project.kind === PERSONAL_PROJECT_KIND) continue;
    const candidates = await folderCandidates(userId, project.id);
    if (candidates.length < 2) continue;
    const [kept, ...hidden] = candidates.map((row) => ({
      id: row.id,
      name: row.name,
      path: row.path
    }));
    extra.push({
      project_id: project.id,
      project_name: project.name,
      kept,
      hidden
    });
  }
  return {
    projects: counts.projects.length,
    assets: counts.assets,
    workflows: counts.workflows,
    timelines: counts.timelines,
    extra_workspaces: extra,
    location: await describeMigrationLocation(userId, location)
  };
}

// ── Gate ────────────────────────────────────────────────────────────────────

/**
 * Whether the bulk steps may run for the user now: always where the migration
 * does not ask, and otherwise once it is confirmed and while it is not paused.
 */
export async function bulkMigrationAllowed(userId: string): Promise<boolean> {
  if (!projectFolderMigrationApplies()) return true;
  const stored = await readStored(userId);
  if (!stored) return projectFolderMigrationAutoConfirms();
  return (
    stored.state === "confirmed" ||
    stored.state === "running" ||
    stored.state === "done"
  );
}

projectAssetMoveJob.setGate(bulkMigrationAllowed);

// ── Runner ──────────────────────────────────────────────────────────────────

type Phase = "folders" | "files" | "assets";

interface RunProgress {
  phase: Phase;
  currentProject: string | null;
}

function assetFailure(
  asset: Asset | null,
  assetId: string,
  project: Project | null,
  reason: string
): ProjectFolderMigrationFailure {
  return {
    kind: "asset",
    id: assetId,
    name: asset?.name ?? assetId,
    project_id: project?.id ?? asset?.project_id ?? null,
    project_name: project?.name ?? null,
    reason
  };
}

function projectFailure(
  project: Project | null,
  projectId: string,
  reason: string
): ProjectFolderMigrationFailure {
  return {
    kind: "project",
    id: projectId,
    name: project?.name ?? projectId,
    project_id: projectId,
    project_name: project?.name ?? null,
    reason
  };
}

/**
 * Works through a user's migration: folders, then document files, then the
 * asset move. Each step is idempotent, so a run that stops for a pause or a
 * server stop continues from the database the next time.
 */
export class ProjectFolderMigrationRunner {
  private readonly active = new Map<string, Promise<void>>();
  private readonly progressByUser = new Map<string, RunProgress>();

  constructor(private readonly job: ProjectAssetMoveJob = projectAssetMoveJob) {}

  /** Start the user's run, or return the one under way. Never rejects. */
  start(userId: string): Promise<void> {
    const running = this.active.get(userId);
    if (running) return running;
    const run = this.run(userId)
      .catch((error: unknown) => {
        log.warn("The project folder migration stopped", {
          userId,
          error: error instanceof Error ? error.message : String(error)
        });
      })
      .finally(() => {
        this.active.delete(userId);
        this.progressByUser.delete(userId);
      });
    this.active.set(userId, run);
    return run;
  }

  /** The phase and project this process works on for the user, if any. */
  progress(userId: string): RunProgress | null {
    const progress = this.progressByUser.get(userId);
    return progress ? { ...progress } : null;
  }

  /** Resolves once no run of the user is under way in this process. */
  async idle(userId: string): Promise<void> {
    while (this.active.get(userId)) await this.active.get(userId);
  }

  private setProgress(userId: string, phase: Phase, currentProject: string | null) {
    this.progressByUser.set(userId, { phase, currentProject });
  }

  private async stillRunning(userId: string): Promise<boolean> {
    return (await readStored(userId))?.state === "running";
  }

  private async run(userId: string): Promise<void> {
    const started = await updateStored(userId, (current) =>
      current?.state === "confirmed" ? { ...current, state: "running" } : current
    );
    if (started?.state !== "running") return;
    const failures: ProjectFolderMigrationFailure[] = [];

    this.setProgress(userId, "folders", null);
    const folders = await migrateProjectFolders({ userId });
    for (const failure of folders.failures) {
      const project = await Project.findOwned(userId, failure.projectId);
      failures.push(projectFailure(project, failure.projectId, failure.reason));
    }
    if (!(await this.stillRunning(userId))) return this.record(userId, failures);

    this.setProgress(userId, "files", null);
    const workflows = await migrateWorkflowFiles(userId);
    const timelines = await migrateTimelineFiles(userId);
    if (workflows + timelines > 0) {
      log.info("Wrote document files for the project folder migration", {
        workflows,
        timelines
      });
    }
    if (!(await this.stillRunning(userId))) return this.record(userId, failures);

    this.setProgress(userId, "assets", null);
    let waiting = await Asset.listProjectsAwaitingFolderMove(userId);
    if (waiting.some((row) => !row.projectId || row.projectId === LOOSE_PROJECT_ID)) {
      // Rows in no project move into Personal's folder.
      await Project.migrateToPersonal(userId);
      waiting = await Asset.listProjectsAwaitingFolderMove(userId);
    }
    for (const { projectId } of waiting) {
      if (!projectId || projectId === LOOSE_PROJECT_ID) continue;
      const project = await Project.findOwned(userId, projectId);
      this.setProgress(userId, "assets", project?.name ?? null);
      try {
        const report = await this.job.run(projectId, userId);
        for (const assetId of report.failed) {
          failures.push(
            assetFailure(
              await Asset.find(userId, assetId),
              assetId,
              project,
              report.failureReasons[assetId] ?? "The copy could not be verified"
            )
          );
        }
        if (report.stopped) return this.record(userId, failures);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (!(error instanceof ProjectFolderUnavailableError)) {
          log.warn("Moving the assets of a project failed", { projectId, error: reason });
        }
        failures.push(projectFailure(project, projectId, reason));
      }
      if (!(await this.stillRunning(userId))) return this.record(userId, failures);
    }
    await this.record(userId, failures, true);
  }

  /**
   * Store what this run could not finish. A finished run moves `running` to
   * `done`. A paused one stays paused.
   */
  private async record(
    userId: string,
    failures: ProjectFolderMigrationFailure[],
    finished = false
  ): Promise<void> {
    await updateStored(userId, (current) => {
      if (!current) return current;
      const next: StoredState = {
        ...current,
        failures: failures.slice(0, MAX_STORED_FAILURES),
        failure_count: failures.length
      };
      if (finished && current.state === "running") next.state = "done";
      return next;
    });
  }
}

/** The process-wide runner. */
export const projectFolderMigrationRunner = new ProjectFolderMigrationRunner();

// ── Transitions ─────────────────────────────────────────────────────────────

/** The user's migration as a client shows it. */
export async function getMigrationStatus(
  userId: string,
  runner: ProjectFolderMigrationRunner = projectFolderMigrationRunner
): Promise<ProjectFolderMigrationStatus> {
  const progress = runner.progress(userId);
  if (!projectFolderMigrationApplies()) {
    return statusOf(storedState.parse({ state: "done", nothing_to_move: true }), 0, progress);
  }
  let stored = await readStored(userId);
  if (!stored && projectFolderMigrationAutoConfirms()) {
    stored = await confirmAutomatically(userId, runner);
  }
  if (!stored) {
    if (!hasWork(await countWork(userId))) {
      stored = await updateStored(userId, (current) =>
        current ?? storedState.parse({ state: "done", nothing_to_move: true })
      );
    }
  }
  const state = stored ?? NOT_STARTED;
  const counting =
    state.state === "confirmed" ||
    state.state === "running" ||
    state.state === "paused" ||
    (state.state === "done" && !state.nothing_to_move);
  const remaining = counting ? await Asset.countAwaitingFolderMove(userId) : 0;
  return statusOf(state, remaining, progress);
}

function statusOf(
  state: StoredState,
  remaining: number,
  progress: RunProgress | null
): ProjectFolderMigrationStatus {
  const total = Math.max(state.total_assets, remaining);
  return {
    applies: !state.nothing_to_move,
    state: state.state,
    location: state.location,
    progress: {
      done: total - remaining,
      total,
      phase: progress?.phase ?? null,
      current_project: progress?.currentProject ?? null
    },
    failures: state.failures,
    failure_count: state.failure_count,
    dismissed: state.dismissed
  };
}

/**
 * The plan, read by the client before it asks for confirmation. Moves
 * `not_started` to `plan_shown`. `location` checks a location the user chose.
 */
export async function showMigrationPlan(
  userId: string,
  location?: string
): Promise<ProjectFolderMigrationPlan> {
  requireApplies();
  const plan = await buildMigrationPlan(userId, location);
  await updateStored(userId, (current) =>
    current === null || current.state === "not_started"
      ? { ...NOT_STARTED, state: "plan_shown" }
      : current
  );
  return plan;
}

interface ConfirmOptions {
  location?: string;
  /** Who confirmed. `auto` is the `NODETOOL_PROJECT_MIGRATION=auto` path. */
  by?: "user" | "auto";
  /** Start the run in the background. The CLI runs it itself. */
  start?: boolean;
  runner?: ProjectFolderMigrationRunner;
}

/**
 * Confirm the migration and start it. Requires `plan_shown`, except for the
 * automatic path, which may confirm from `not_started`. A chosen location
 * must be an absolute path to an existing, writable directory, and becomes
 * the user's `PROJECTS_DIR` setting.
 */
export async function confirmMigration(
  userId: string,
  options: ConfirmOptions = {}
): Promise<ProjectFolderMigrationStatus> {
  requireApplies();
  const runner = options.runner ?? projectFolderMigrationRunner;
  const by = options.by ?? "user";
  const current = (await readStored(userId)) ?? NOT_STARTED;
  const allowed =
    current.state === "plan_shown" || (by === "auto" && current.state === "not_started");
  if (!allowed) {
    refuse(
      current.state === "not_started"
        ? "Read the migration plan before confirming it"
        : "The migration is already confirmed"
    );
  }
  const location = await describeMigrationLocation(userId, options.location);
  if (location.error) {
    throw new ProjectFolderMigrationError("invalid_location", location.error);
  }
  if (options.location !== undefined) {
    const configured = await configuredProjectsDir(userId);
    if (configured.dir !== location.path || !configured.fromUser) {
      await Setting.upsert({
        userId,
        key: PROJECTS_DIR_SETTING,
        value: location.path
      });
    }
  }
  const totalAssets = await Asset.countAwaitingFolderMove(userId);
  const confirmed = await updateStored(userId, (latest) => {
    const state = latest ?? NOT_STARTED;
    if (state.state !== current.state) {
      refuse("The migration changed while it was being confirmed");
    }
    return {
      ...state,
      state: "confirmed",
      location: location.path,
      confirmed_by: by,
      total_assets: totalAssets
    };
  });
  if (confirmed && options.start !== false) void runner.start(userId);
  return getMigrationStatus(userId, runner);
}

async function confirmAutomatically(
  userId: string,
  runner: ProjectFolderMigrationRunner
): Promise<StoredState | null> {
  try {
    await confirmMigration(userId, { by: "auto", runner });
  } catch (error) {
    if (!(error instanceof ProjectFolderMigrationError)) throw error;
    log.warn("Could not confirm the project folder migration automatically", {
      userId,
      error: error.message
    });
  }
  return readStored(userId);
}

/** Pause a confirmed or running migration. The asset being moved finishes. */
export async function pauseMigration(
  userId: string,
  runner: ProjectFolderMigrationRunner = projectFolderMigrationRunner
): Promise<ProjectFolderMigrationStatus> {
  requireApplies();
  await updateStored(userId, (current) => {
    if (current?.state !== "running" && current?.state !== "confirmed") {
      refuse("Only a migration that is under way can be paused");
    }
    return { ...current, state: "paused" };
  });
  return getMigrationStatus(userId, runner);
}

/** Continue a paused migration. */
export async function resumeMigration(
  userId: string,
  runner: ProjectFolderMigrationRunner = projectFolderMigrationRunner
): Promise<ProjectFolderMigrationStatus> {
  requireApplies();
  await updateStored(userId, (current) => {
    if (current?.state !== "paused") refuse("Only a paused migration can be resumed");
    return { ...current, state: "confirmed" };
  });
  // A run of this process may still be finishing its current asset. The next
  // one starts once it has.
  void runner.idle(userId).then(() => runner.start(userId));
  return getMigrationStatus(userId, runner);
}

/** Try every failed asset and project again. */
export async function retryMigration(
  userId: string,
  runner: ProjectFolderMigrationRunner = projectFolderMigrationRunner,
  job: ProjectAssetMoveJob = projectAssetMoveJob
): Promise<ProjectFolderMigrationStatus> {
  requireApplies();
  await updateStored(userId, (current) => {
    if (current?.state !== "done" && current?.state !== "running") {
      refuse("Only a started migration can be retried");
    }
    if (current.failure_count === 0) refuse("Nothing failed");
    return {
      ...current,
      state: "confirmed",
      failures: [],
      failure_count: 0,
      dismissed: false
    };
  });
  job.forgetFailures();
  void runner.idle(userId).then(() => runner.start(userId));
  return getMigrationStatus(userId, runner);
}

/** Hide the finished state in the client. */
export async function dismissMigration(
  userId: string,
  runner: ProjectFolderMigrationRunner = projectFolderMigrationRunner
): Promise<ProjectFolderMigrationStatus> {
  requireApplies();
  await updateStored(userId, (current) => {
    if (current?.state !== "done") refuse("Only a finished migration can be dismissed");
    return { ...current, dismissed: true };
  });
  return getMigrationStatus(userId, runner);
}

// ── Hosts ───────────────────────────────────────────────────────────────────

/**
 * The bulk steps as they ran before the migration asked: every project, or
 * the user's, without a state change. A second run changes nothing.
 */
export async function runMigrationSteps(
  userId?: string,
  job: ProjectAssetMoveJob = projectAssetMoveJob
): Promise<void> {
  const report = await migrateProjectFolders({ userId });
  if (report.checked > 0) {
    log.info(`Project folders: ${report.assigned} assigned, ${report.failed} failed`);
  }
  const workflows = await migrateWorkflowFiles(userId);
  if (workflows > 0) log.info(`Workflow files: ${workflows} written`);
  const timelines = await migrateTimelineFiles(userId);
  if (timelines > 0) log.info(`Timeline files: ${timelines} written`);
  const projects = await scheduleLegacyAssetMoves(job, userId);
  if (projects > 0) {
    log.info(`Moving asset files into project folders: ${projects} projects`);
  }
}

/**
 * Server startup. Where the migration does not ask, the bulk steps run for
 * every user. Otherwise each user's state decides: a confirmed or running
 * migration continues, a finished one runs the steps again for anything new,
 * a paused one waits, and a user with nothing to move is recorded as done.
 * `NODETOOL_PROJECT_MIGRATION=auto` confirms for every user that has not
 * answered. Returns once every run is started, not finished.
 */
export async function startProjectFolderMigration(
  runner: ProjectFolderMigrationRunner = projectFolderMigrationRunner
): Promise<void> {
  if (!projectFolderMigrationApplies()) {
    void runMigrationSteps().catch(logStepFailure);
    return;
  }
  const users = await usersWithWork();
  for (const row of await Setting.listByKey(PROJECT_FOLDER_MIGRATION_SETTING)) {
    users.add(row.user_id);
  }
  for (const userId of users) {
    const stored = await readStored(userId);
    if (!stored) {
      if (projectFolderMigrationAutoConfirms()) {
        await confirmAutomatically(userId, runner);
      } else if (!hasWork(await countWork(userId))) {
        await updateStored(userId, (current) =>
          current ?? storedState.parse({ state: "done", nothing_to_move: true })
        );
      }
      continue;
    }
    if (stored.state === "confirmed" || stored.state === "running") {
      // A run that a stopped server left `running` continues. The runner
      // moves `confirmed` to `running` itself.
      if (stored.state === "running") {
        await updateStored(userId, (current) =>
          current?.state === "running" ? { ...current, state: "confirmed" } : current
        );
      }
      void runner.start(userId);
    } else if (stored.state === "done") {
      void runMigrationSteps(userId).catch(logStepFailure);
    }
  }
}

function logStepFailure(error: unknown): void {
  log.warn(
    "Project folder migration failed",
    error instanceof Error ? error : new Error(String(error))
  );
}

/**
 * `nodetool projects migrate --yes`: show the plan when nobody has, confirm
 * it, and run the migration to the end in this process. A confirmed or
 * running migration is continued. A paused one is refused, because the user
 * paused it in the app.
 */
export async function runMigrationToEnd(
  userId: string,
  options: { location?: string; runner?: ProjectFolderMigrationRunner } = {}
): Promise<ProjectFolderMigrationStatus> {
  const runner = options.runner ?? projectFolderMigrationRunner;
  if (!projectFolderMigrationApplies()) {
    await runMigrationSteps(userId);
    await projectAssetMoveJob.idle();
    return getMigrationStatus(userId, runner);
  }
  let stored = (await readStored(userId)) ?? NOT_STARTED;
  if (stored.state === "paused") {
    refuse("The migration is paused. Resume it in NodeTool first");
  }
  if (stored.state === "not_started") {
    await showMigrationPlan(userId, options.location);
    stored = (await readStored(userId)) ?? NOT_STARTED;
  }
  if (stored.state === "plan_shown") {
    await confirmMigration(userId, {
      location: options.location,
      start: false,
      runner
    });
  } else if (stored.state === "running") {
    // Another process may hold it, or one that stopped. Both continue from
    // the database, and every asset step takes the folder lock.
    await updateStored(userId, (current) =>
      current?.state === "running" ? { ...current, state: "confirmed" } : current
    );
  }
  await runner.start(userId);
  return getMigrationStatus(userId, runner);
}
