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
import { randomUUID } from "node:crypto";
import { open, realpath, stat, unlink } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { isAbsolute, join, posix, resolve } from "node:path";
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
  Storyboard,
  JsScript,
  ImageDocument,
  Application,
  Script,
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
import { migrateStoryboardFiles } from "./storyboard-file.js";
import { migrateScriptFiles } from "./script-file.js";
import { migrateAppFiles } from "./app-file.js";
import { migrateJsScriptFiles } from "./js-script-file.js";
import { migrateSketchFiles } from "./sketch-file.js";
import { migrateWorkflowFiles } from "./workflow-file.js";
import type { DocumentFileFailure } from "./document-file-sync.js";

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

/** The shortest wait before a run that left assets waiting starts again. */
const MIN_RESTART_MS = 1_000;

/** Projects read per query while counting projects without a folder. */
const COUNT_BATCH = 500;

/** How often a run records that it is alive. */
const HEARTBEAT_MS = 15_000;

/**
 * How long a run may go without a heartbeat before another process takes it
 * over. Used only when the owner's process cannot be checked directly.
 */
const STALE_MS = 60_000;

/** How often a server looks for a migration another process left. */
const WATCH_MS = 30_000;

/** The wait before a run that stopped on an error starts again. */
const ERROR_RESTART_MS = 30_000;

/** Attempts of one compare-and-set state change before giving up. */
const MAX_STATE_ATTEMPTS = 20;

/** How often `nodetool projects migrate` looks whether another run ended. */
const FOREIGN_RUN_POLL_MS = 2_000;

const storedState = z.object({
  state: projectFolderMigrationState,
  location: z.string().nullable().default(null),
  confirmed_by: z.enum(["user", "auto"]).nullable().default(null),
  total_assets: z.number().int().nonnegative().default(0),
  failures: z.array(projectFolderMigrationFailure).default([]),
  failure_count: z.number().int().nonnegative().default(0),
  nothing_to_move: z.boolean().default(false),
  dismissed: z.boolean().default(false),
  /** The run that holds `running`, so a run another process took over stops. */
  run_id: z.string().nullable().default(null),
  /** The process that last claimed the state, to tell a stopped one. */
  owner_pid: z.number().int().nullable().default(null),
  owner_host: z.string().nullable().default(null),
  heartbeat_at: z.string().nullable().default(null)
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
  // The default macOS file system ignores letter case.
  const normalized = posix.normalize(path).toLowerCase();
  const roots = [
    "/Volumes",
    ...["Documents", "Desktop", "Downloads", "Library/Mobile Documents"].map(
      (name) => posix.join(home, name)
    )
  ].map((root) => root.toLowerCase());
  return roots.some(
    (root) => normalized === root || normalized.startsWith(`${root}/`)
  );
}

async function readStored(userId: string): Promise<StoredState | null> {
  return parseStored(userId, await Setting.find(userId, PROJECT_FOLDER_MIGRATION_SETTING));
}

function parseStored(userId: string, row: Setting | null): StoredState | null {
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

/** Read-modify-write of a user's state, one at a time within this process. */
const stateQueues = new Map<string, Promise<unknown>>();

function serialized<T>(userId: string, step: () => Promise<T>): Promise<T> {
  const previous = stateQueues.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(step);
  stateQueues.set(userId, next);
  return next;
}

/**
 * Change a user's state. The write commits only while the row still holds
 * what `change` was given, so a server and a `nodetool` command never
 * overwrite each other's change. `change` runs again on a lost race, so it
 * must not have side effects. It may throw to refuse.
 */
function updateStored(
  userId: string,
  change: (current: StoredState | null) => StoredState | null
): Promise<StoredState | null> {
  return serialized(userId, async () => {
    for (let attempt = 0; attempt < MAX_STATE_ATTEMPTS; attempt++) {
      const row = await Setting.find(userId, PROJECT_FOLDER_MIGRATION_SETTING);
      const current = parseStored(userId, row);
      const updated = change(current);
      if (!updated || updated === current) return updated;
      const committed = await Setting.upsertManyIf(
        userId,
        { key: PROJECT_FOLDER_MIGRATION_SETTING, expected: row?.value ?? null },
        [{ key: PROJECT_FOLDER_MIGRATION_SETTING, value: JSON.stringify(updated) }]
      );
      if (committed) return updated;
    }
    throw new Error("The project folder migration state kept changing while it was updated");
  });
}

/** This process, as the owner of a state it claims. */
function ownedNow(): Pick<StoredState, "owner_pid" | "owner_host" | "heartbeat_at"> {
  return {
    owner_pid: process.pid,
    owner_host: hostname(),
    heartbeat_at: new Date().toISOString()
  };
}

/** True when a process with this id runs on this machine. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Absolute paths lose `..` segments and a trailing separator. */
function normalizeLocation(location: string): string {
  return isAbsolute(location) ? resolve(location) : location;
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

function nothingToMove(): never {
  throw new ProjectFolderMigrationError("not_applicable", "There is nothing to move");
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

/**
 * The document kinds besides workflows and timelines that are files in the
 * project folder. The migration plan does not count them apart, so they
 * count as work only.
 */
const OTHER_DOCUMENT_KINDS: ReadonlyArray<{
  name: string;
  unwritten: (
    userId?: string
  ) => Promise<Array<{ user_id: string; project_id: string; count: number }>>;
  migrate: (
    userId?: string,
    onFailure?: (failure: DocumentFileFailure) => void
  ) => Promise<number>;
}> = [
  {
    name: "storyboards",
    unwritten: (userId) => Storyboard.projectsWithUnwrittenFiles(userId),
    migrate: migrateStoryboardFiles
  },
  {
    name: "scripts",
    unwritten: (userId) => Script.projectsWithUnwrittenFiles(userId),
    migrate: migrateScriptFiles
  },
  {
    name: "apps",
    unwritten: (userId) => Application.projectsWithUnwrittenFiles(userId),
    migrate: migrateAppFiles
  },
  {
    name: "JS scripts",
    unwritten: (userId) => JsScript.projectsWithUnwrittenFiles(userId),
    migrate: migrateJsScriptFiles
  },
  {
    name: "sketches",
    unwritten: (userId) => ImageDocument.projectsWithUnwrittenFiles(userId),
    migrate: migrateSketchFiles
  }
];

interface WorkCounts {
  projects: Project[];
  assets: number;
  workflows: number;
  timelines: number;
  /** Unwritten files of the {@link OTHER_DOCUMENT_KINDS}. */
  documents: number;
}

async function countWork(userId: string): Promise<WorkCounts> {
  const [projects, assets, workflows, timelines, ...others] = await Promise.all([
    projectsWithoutFolder(userId),
    Asset.countAwaitingFolderMove(userId),
    unwrittenCount(Workflow.projectsWithUnwrittenFiles(userId)),
    unwrittenCount(TimelineSequence.projectsWithUnwrittenFiles(userId)),
    ...OTHER_DOCUMENT_KINDS.map((kind) => unwrittenCount(kind.unwritten(userId)))
  ]);
  const documents = others.reduce((sum, count) => sum + count, 0);
  return { projects, assets, workflows, timelines, documents };
}

function hasWork(counts: WorkCounts): boolean {
  return (
    counts.projects.length > 0 ||
    counts.assets > 0 ||
    counts.workflows > 0 ||
    counts.timelines > 0 ||
    counts.documents > 0
  );
}

const NOTHING_TO_MOVE: StoredState = storedState.parse({
  state: "done",
  nothing_to_move: true
});

/**
 * A user without a state and with nothing to move is recorded as done.
 * Returns the recorded state, or null when there is something to move or the
 * user has a state.
 */
async function recordNothingToMove(userId: string): Promise<StoredState | null> {
  if (hasWork(await countWork(userId))) return null;
  const recorded = await updateStored(userId, (current) => current ?? NOTHING_TO_MOVE);
  return recorded?.nothing_to_move ? recorded : null;
}

/** Refuse a request where the migration does not apply to the user. */
async function requireMigrationApplies(userId: string): Promise<StoredState | null> {
  requireApplies();
  const stored = await readStored(userId);
  if (stored?.nothing_to_move) nothingToMove();
  if (!stored && (await recordNothingToMove(userId))) nothingToMove();
  return stored;
}

/** States where `NODETOOL_PROJECT_MIGRATION=auto` answers for the user. */
function awaitsAnswer(stored: StoredState | null): boolean {
  return !stored || stored.state === "not_started" || stored.state === "plan_shown";
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
  for (const kind of OTHER_DOCUMENT_KINDS) {
    for (const row of await kind.unwritten()) users.add(row.user_id);
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
  const path = chosen === undefined ? configured.dir : normalizeLocation(chosen);
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
  // A link into Documents asks for permission as Documents does.
  const real = await realpath(path).catch(() => path);
  return {
    path,
    is_default: chosen === undefined && !configured.fromUser,
    permission_prompt: locationNeedsPermission(path) || locationNeedsPermission(real),
    error
  };
}

/**
 * Write and remove a file in an existing location. A writable mode is not
 * enough: macOS refuses a folder the app has no permission for only on write.
 */
async function probeWritable(path: string): Promise<string | null> {
  if (!(await stat(path).catch(() => null))) return null;
  const probe = join(path, `.nodetool-write-check-${process.pid}-${randomUUID()}`);
  try {
    const handle = await open(probe, "wx");
    await handle.close();
    await unlink(probe);
    return null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return `The projects folder is not writable${code ? ` (${code})` : ""}`;
  }
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

/** How a run's steps ended. */
type StepsOutcome = "stopped" | "waiting" | "finished";

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

function listsProject(
  failures: ProjectFolderMigrationFailure[],
  projectId: string
): boolean {
  return failures.some((listed) => listed.kind === "project" && listed.id === projectId);
}

export interface ProjectFolderMigrationRunnerOptions {
  /** See {@link HEARTBEAT_MS}. */
  heartbeatMs?: number;
  /** See {@link STALE_MS}. */
  staleMs?: number;
  /** See {@link WATCH_MS}. */
  watchMs?: number;
  /** See {@link ERROR_RESTART_MS}. */
  errorRestartMs?: number;
}

/**
 * Works through a user's migration: folders, then document files, then the
 * asset move. Each step is idempotent, so a run that stops for a pause or a
 * server stop continues from the database the next time.
 *
 * A run claims the state with its own id. It stops at the next check once
 * the state belongs to another run, which happens when another process took
 * over a run it found stopped, or when the user paused and resumed.
 */
export class ProjectFolderMigrationRunner {
  private readonly active = new Map<string, Promise<void>>();
  private readonly progressByUser = new Map<string, RunProgress>();
  private readonly restarts = new Set<NodeJS.Timeout>();
  /** Users whose run this process starts again once a timer fires. */
  private readonly restartPending = new Set<string>();
  private watcher: NodeJS.Timeout | null = null;
  private readonly heartbeatMs: number;
  private readonly staleMs: number;
  private readonly watchMs: number;
  private readonly errorRestartMs: number;

  constructor(
    private readonly job: ProjectAssetMoveJob = projectAssetMoveJob,
    options: ProjectFolderMigrationRunnerOptions = {}
  ) {
    this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
    this.staleMs = options.staleMs ?? STALE_MS;
    this.watchMs = options.watchMs ?? WATCH_MS;
    this.errorRestartMs = options.errorRestartMs ?? ERROR_RESTART_MS;
  }

  /** Start the user's run, or return the one under way. Never rejects. */
  start(userId: string): Promise<void> {
    const running = this.active.get(userId);
    if (running) return running;
    const runId = randomUUID();
    const run = this.run(userId, runId)
      .catch((error: unknown) => this.recover(userId, runId, error))
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

  /** Cancel the restarts and the watch this runner scheduled. A run under way finishes. */
  stop(): void {
    for (const timer of this.restarts) clearTimeout(timer);
    this.restarts.clear();
    this.restartPending.clear();
    if (this.watcher) clearInterval(this.watcher);
    this.watcher = null;
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

  /**
   * True when no process works on the state although it is confirmed or
   * running: its owner stopped, or it stopped sending heartbeats.
   */
  private stalled(state: StoredState, userId: string): boolean {
    if (state.state !== "confirmed" && state.state !== "running") return false;
    if (state.owner_pid === null || state.heartbeat_at === null) return true;
    if (state.owner_host === hostname()) {
      if (state.owner_pid === process.pid) {
        return !this.active.has(userId) && !this.restartPending.has(userId);
      }
      if (!processAlive(state.owner_pid)) return true;
    }
    const beat = Date.parse(state.heartbeat_at);
    return !Number.isFinite(beat) || Date.now() - beat > this.staleMs;
  }

  /**
   * Continue the user's migration when it is confirmed or running and no
   * process works on it. A run that still belongs to a live process is left
   * alone.
   */
  async continueIfStalled(userId: string): Promise<void> {
    if (this.active.has(userId)) return;
    const stored = await readStored(userId);
    if (!stored || !this.stalled(stored, userId)) return;
    if (stored.state === "running") {
      const released = await updateStored(userId, (current) =>
        current?.state === "running" && this.stalled(current, userId)
          ? { ...current, state: "confirmed", run_id: null }
          : current
      );
      if (released?.state !== "confirmed") return;
    }
    void this.start(userId);
  }

  /**
   * Look for migrations another process left, now and every
   * {@link WATCH_MS}, for as long as this runner lives.
   */
  watch(): void {
    if (this.watcher) return;
    const look = async () => {
      if (!projectFolderMigrationApplies()) return;
      for (const row of await Setting.listByKey(PROJECT_FOLDER_MIGRATION_SETTING)) {
        await this.continueIfStalled(row.user_id);
      }
    };
    this.watcher = setInterval(() => {
      void look().catch(logStepFailure);
    }, this.watchMs);
    this.watcher.unref?.();
  }

  private setProgress(userId: string, phase: Phase, currentProject: string | null) {
    this.progressByUser.set(userId, { phase, currentProject });
  }

  private async owns(userId: string, runId: string): Promise<boolean> {
    const stored = await readStored(userId);
    return stored?.state === "running" && stored.run_id === runId;
  }

  private async run(userId: string, runId: string): Promise<void> {
    let claimed = false;
    await updateStored(userId, (current) => {
      claimed = current?.state === "confirmed";
      return claimed && current
        ? { ...current, state: "running", run_id: runId, ...ownedNow() }
        : current;
    });
    if (!claimed) return;

    const heartbeat = setInterval(() => {
      void updateStored(userId, (current) =>
        current?.state === "running" && current.run_id === runId
          ? { ...current, ...ownedNow() }
          : current
      ).catch(logStepFailure);
    }, this.heartbeatMs);
    heartbeat.unref?.();
    try {
      const failures: ProjectFolderMigrationFailure[] = [];
      const outcome = await this.steps(userId, failures, () => this.owns(userId, runId));
      await this.record(userId, runId, failures, outcome);
    } finally {
      clearInterval(heartbeat);
    }
  }

  /**
   * The steps of a run without a state: what `nodetool projects migrate`
   * runs where the migration does not ask.
   */
  async runUnasked(
    userId: string
  ): Promise<{ failures: ProjectFolderMigrationFailure[]; outcome: StepsOutcome }> {
    const failures: ProjectFolderMigrationFailure[] = [];
    try {
      const outcome = await this.steps(userId, failures, async () => true);
      return { failures, outcome };
    } finally {
      this.progressByUser.delete(userId);
    }
  }

  /**
   * Folders, document files and the asset move, while `proceed` says so.
   * Failures are added to `failures`.
   */
  private async steps(
    userId: string,
    failures: ProjectFolderMigrationFailure[],
    proceed: () => Promise<boolean>
  ): Promise<StepsOutcome> {
    this.setProgress(userId, "folders", null);
    const folders = await migrateProjectFolders({ userId });
    for (const failure of folders.failures) {
      const project = await Project.findOwned(userId, failure.projectId);
      failures.push(projectFailure(project, failure.projectId, failure.reason));
    }
    if (!(await proceed())) return "stopped";

    this.setProgress(userId, "files", null);
    const documentFailures: DocumentFileFailure[] = [];
    const onFailure = (failure: DocumentFileFailure) => documentFailures.push(failure);
    const workflows = await migrateWorkflowFiles(userId, onFailure);
    const timelines = await migrateTimelineFiles(userId, onFailure);
    const others: Record<string, number> = {};
    for (const kind of OTHER_DOCUMENT_KINDS) {
      others[kind.name] = await kind.migrate(userId, onFailure);
    }
    // One failure per project, also when its folder failed above or both
    // kinds failed. Retry writes the missing files again.
    for (const failure of documentFailures) {
      const projectId =
        !failure.projectId || failure.projectId === LOOSE_PROJECT_ID
          ? `personal:${userId}`
          : failure.projectId;
      if (listsProject(failures, projectId)) continue;
      const project = await Project.findOwned(userId, projectId);
      failures.push(projectFailure(project, projectId, failure.reason));
    }
    const otherCount = Object.values(others).reduce((sum, n) => sum + n, 0);
    if (workflows + timelines + otherCount > 0) {
      log.info("Wrote document files for the project folder migration", {
        workflows,
        timelines,
        ...others
      });
    }
    if (!(await proceed())) return "stopped";

    this.setProgress(userId, "assets", null);
    let waiting = await Asset.listProjectsAwaitingFolderMove(userId);
    if (waiting.some((row) => !row.projectId || row.projectId === LOOSE_PROJECT_ID)) {
      // Rows in no project move into Personal's folder.
      await Project.migrateToPersonal(userId);
      waiting = await Asset.listProjectsAwaitingFolderMove(userId);
    }
    let deferred: string[] = [];
    for (const { projectId } of waiting) {
      if (!projectId || projectId === LOOSE_PROJECT_ID) continue;
      const outcome = await this.moveAssets(userId, projectId, failures, proceed);
      if (outcome === "stopped") return "stopped";
      if (outcome === "deferred") deferred.push(projectId);
    }
    if (deferred.length > 0) {
      // Assets changed within the settle time wait for it once, so a run
      // started right after an edit still finishes. The timer keeps a
      // `nodetool projects migrate` process alive while it waits.
      await delay(this.job.settleMs);
      if (!(await proceed())) return "stopped";
      const again = deferred;
      deferred = [];
      for (const projectId of again) {
        const outcome = await this.moveAssets(userId, projectId, failures, proceed);
        if (outcome === "stopped") return "stopped";
        if (outcome === "deferred") deferred.push(projectId);
      }
    }
    return deferred.length > 0 ? "waiting" : "finished";
  }

  /**
   * One pass of the asset move over a project. Failures are added to
   * `failures`. "deferred" when assets changed too recently to move.
   */
  private async moveAssets(
    userId: string,
    projectId: string,
    failures: ProjectFolderMigrationFailure[],
    proceed: () => Promise<boolean>
  ): Promise<"stopped" | "deferred" | "passed"> {
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
      if (report.stopped) return "stopped";
      if (!(await proceed())) return "stopped";
      return report.deferred.length > 0 ? "deferred" : "passed";
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!(error instanceof ProjectFolderUnavailableError)) {
        log.warn("Moving the assets of a project failed", { projectId, error: reason });
      }
      // A folder that could not be made is listed once, from the first step.
      if (!listsProject(failures, projectId)) {
        failures.push(projectFailure(project, projectId, reason));
      }
      return (await proceed()) ? "passed" : "stopped";
    }
  }

  /**
   * Store what the run could not finish, while the state is still the run's
   * own. A finished run moves `running` to `done`. A run that left assets
   * waiting moves it back to `confirmed`, so the next run of any process
   * continues, and this process starts one once they may have settled. A
   * paused one stays paused. A run another process took over writes nothing.
   */
  private async record(
    userId: string,
    runId: string,
    failures: ProjectFolderMigrationFailure[],
    outcome: StepsOutcome
  ): Promise<void> {
    const recorded = await updateStored(userId, (current) => {
      if (!current || current.run_id !== runId) return current;
      const next: StoredState = {
        ...current,
        failures: failures.slice(0, MAX_STORED_FAILURES),
        failure_count: failures.length
      };
      if (current.state === "running" && outcome !== "stopped") {
        next.state = outcome === "finished" ? "done" : "confirmed";
        next.run_id = null;
        Object.assign(next, ownedNow());
      }
      return next;
    });
    if (outcome === "waiting" && recorded?.state === "confirmed") {
      this.restartLater(userId, Math.max(this.job.settleMs, MIN_RESTART_MS));
    }
  }

  /**
   * A run that threw gives the state back as `confirmed` and starts again
   * later. Every step is idempotent, so the next run continues.
   */
  private async recover(userId: string, runId: string, error: unknown): Promise<void> {
    log.warn("The project folder migration stopped on an error and starts again later", {
      userId,
      error: error instanceof Error ? error.message : String(error)
    });
    const released = await updateStored(userId, (current) =>
      current?.state === "running" && current.run_id === runId
        ? { ...current, state: "confirmed", run_id: null, ...ownedNow() }
        : current
    );
    if (released?.state === "confirmed") this.restartLater(userId, this.errorRestartMs);
  }

  private restartLater(userId: string, ms: number): void {
    this.restartPending.add(userId);
    const timer = setTimeout(() => {
      this.restarts.delete(timer);
      this.restartPending.delete(userId);
      void this.idle(userId).then(() => this.start(userId));
    }, ms);
    // A server keeps running. A command reports the unfinished state.
    timer.unref?.();
    this.restarts.add(timer);
  }
}

/** The process-wide runner. */
export const projectFolderMigrationRunner = new ProjectFolderMigrationRunner();

// ── Transitions ─────────────────────────────────────────────────────────────

/**
 * The user's migration as a client shows it, as the server answers it. With
 * `NODETOOL_PROJECT_MIGRATION=auto` it confirms for a user who has not
 * answered, a user with nothing to move is recorded as done, and a migration
 * another process left is continued.
 */
export async function getMigrationStatus(
  userId: string,
  runner: ProjectFolderMigrationRunner = projectFolderMigrationRunner
): Promise<ProjectFolderMigrationStatus> {
  if (!projectFolderMigrationApplies()) return unaskedStatus(runner, userId);
  let stored = (await readStored(userId)) ?? (await recordNothingToMove(userId));
  if (projectFolderMigrationAutoConfirms() && awaitsAnswer(stored)) {
    stored = await confirmAutomatically(userId, runner);
  }
  await runner.continueIfStalled(userId);
  return statusFor(userId, stored, runner);
}

/**
 * The user's migration as a client shows it, without changing anything. For
 * a preview such as `nodetool projects migrate` without `--yes`.
 */
export async function readMigrationStatus(
  userId: string,
  runner: ProjectFolderMigrationRunner = projectFolderMigrationRunner
): Promise<ProjectFolderMigrationStatus> {
  if (!projectFolderMigrationApplies()) return unaskedStatus(runner, userId);
  let stored = await readStored(userId);
  if (!stored && !hasWork(await countWork(userId))) stored = NOTHING_TO_MOVE;
  return statusFor(userId, stored, runner);
}

function unaskedStatus(
  runner: ProjectFolderMigrationRunner,
  userId: string
): ProjectFolderMigrationStatus {
  return statusOf(NOTHING_TO_MOVE, 0, runner.progress(userId));
}

async function statusFor(
  userId: string,
  stored: StoredState | null,
  runner: ProjectFolderMigrationRunner
): Promise<ProjectFolderMigrationStatus> {
  const state = (await readStored(userId)) ?? stored ?? NOT_STARTED;
  const counting =
    state.state === "confirmed" ||
    state.state === "running" ||
    state.state === "paused" ||
    (state.state === "done" && !state.nothing_to_move);
  const remaining = counting ? await Asset.countAwaitingFolderMove(userId) : 0;
  return statusOf(state, remaining, runner.progress(userId));
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
  await requireMigrationApplies(userId);
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
 * must be an absolute path to an existing directory this process can write
 * a file in, and becomes the user's `PROJECTS_DIR` setting.
 */
export async function confirmMigration(
  userId: string,
  options: ConfirmOptions = {}
): Promise<ProjectFolderMigrationStatus> {
  await requireMigrationApplies(userId);
  const runner = options.runner ?? projectFolderMigrationRunner;
  const by = options.by ?? "user";
  const row = await Setting.find(userId, PROJECT_FOLDER_MIGRATION_SETTING);
  const current = parseStored(userId, row) ?? NOT_STARTED;
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
  const error = location.error ?? (await probeWritable(location.path));
  if (error) throw new ProjectFolderMigrationError("invalid_location", error);
  const confirmed: StoredState = {
    ...current,
    state: "confirmed",
    location: location.path,
    confirmed_by: by,
    total_assets: await Asset.countAwaitingFolderMove(userId),
    run_id: null,
    ...ownedNow()
  };
  const writes = [
    { key: PROJECT_FOLDER_MIGRATION_SETTING, value: JSON.stringify(confirmed) }
  ];
  if (options.location !== undefined) {
    const configured = await configuredProjectsDir(userId);
    if (configured.dir !== location.path || !configured.fromUser) {
      writes.push({ key: PROJECTS_DIR_SETTING, value: location.path });
    }
  }
  // The transition and the location commit together, and only while the
  // state is still the one read above. A confirmation that lost a race
  // writes neither, so folder creation reads the winner's location.
  const committed = await serialized(userId, () =>
    Setting.upsertManyIf(
      userId,
      { key: PROJECT_FOLDER_MIGRATION_SETTING, expected: row?.value ?? null },
      writes
    )
  );
  if (!committed) refuse("The migration changed while it was being confirmed");
  if (options.start !== false) void runner.start(userId);
  return readMigrationStatus(userId, runner);
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
  await requireMigrationApplies(userId);
  await updateStored(userId, (current) => {
    if (current?.state !== "running" && current?.state !== "confirmed") {
      refuse("Only a migration that is under way can be paused");
    }
    return { ...current, state: "paused" };
  });
  return readMigrationStatus(userId, runner);
}

/** Continue a paused migration. */
export async function resumeMigration(
  userId: string,
  runner: ProjectFolderMigrationRunner = projectFolderMigrationRunner
): Promise<ProjectFolderMigrationStatus> {
  await requireMigrationApplies(userId);
  await updateStored(userId, (current) => {
    if (current?.state !== "paused") refuse("Only a paused migration can be resumed");
    return { ...current, state: "confirmed", run_id: null, ...ownedNow() };
  });
  // A run of this process may still be finishing its current asset. The next
  // one starts once it has.
  void runner.idle(userId).then(() => runner.start(userId));
  return readMigrationStatus(userId, runner);
}

/** Try every failed asset and project again. */
export async function retryMigration(
  userId: string,
  runner: ProjectFolderMigrationRunner = projectFolderMigrationRunner,
  job: ProjectAssetMoveJob = projectAssetMoveJob
): Promise<ProjectFolderMigrationStatus> {
  await requireMigrationApplies(userId);
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
      dismissed: false,
      run_id: null,
      ...ownedNow()
    };
  });
  // Look for the bytes of rows found without any again, too.
  await Asset.clearMissingBytesMarkers(userId);
  job.forgetFailures();
  void runner.idle(userId).then(() => runner.start(userId));
  return readMigrationStatus(userId, runner);
}

/** Hide the finished state in the client. */
export async function dismissMigration(
  userId: string,
  runner: ProjectFolderMigrationRunner = projectFolderMigrationRunner
): Promise<ProjectFolderMigrationStatus> {
  await requireMigrationApplies(userId);
  await updateStored(userId, (current) => {
    if (current?.state !== "done") refuse("Only a finished migration can be dismissed");
    return { ...current, dismissed: true };
  });
  return readMigrationStatus(userId, runner);
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
  for (const kind of OTHER_DOCUMENT_KINDS) {
    const written = await kind.migrate(userId);
    if (written > 0) log.info(`${kind.name} files: ${written} written`);
  }
  const projects = await scheduleLegacyAssetMoves(job, userId);
  if (projects > 0) {
    log.info(`Moving asset files into project folders: ${projects} projects`);
  }
}

/**
 * Server startup. Where the migration does not ask, the bulk steps run for
 * every user. Otherwise each user's state decides: a confirmed or running
 * migration that no live process works on continues, a finished one runs the
 * steps again for anything new, a paused one waits, and a user with nothing
 * to move is recorded as done. `NODETOOL_PROJECT_MIGRATION=auto` confirms for
 * every user that has not answered. From then on the runner looks for
 * migrations another process left. Returns once every run is started, not
 * finished.
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
    const stored = (await readStored(userId)) ?? (await recordNothingToMove(userId));
    if (projectFolderMigrationAutoConfirms() && awaitsAnswer(stored)) {
      await confirmAutomatically(userId, runner);
    } else if (stored?.state === "done" && !stored.nothing_to_move) {
      void runMigrationSteps(userId).catch(logStepFailure);
    } else {
      await runner.continueIfStalled(userId);
    }
  }
  runner.watch();
}

function logStepFailure(error: unknown): void {
  log.warn(
    "Project folder migration failed",
    error instanceof Error ? error : new Error(String(error))
  );
}

/**
 * `nodetool projects migrate --yes`: show the plan when nobody has, confirm
 * it, and run the migration to the end in this process. A confirmed
 * migration is continued. A running one is continued once its process has
 * stopped, or reported once it ends. A paused one is refused, because the
 * user paused it in the app. Where the migration does not ask, the steps run
 * without a state and the status lists what failed.
 */
export async function runMigrationToEnd(
  userId: string,
  options: { location?: string; runner?: ProjectFolderMigrationRunner } = {}
): Promise<ProjectFolderMigrationStatus> {
  const runner = options.runner ?? projectFolderMigrationRunner;
  if (!projectFolderMigrationApplies()) {
    const before = await Asset.countAwaitingFolderMove(userId);
    const { failures, outcome } = await runner.runUnasked(userId);
    const remaining = await Asset.countAwaitingFolderMove(userId);
    return {
      ...statusOf(NOTHING_TO_MOVE, remaining, null),
      state: outcome === "finished" ? "done" : "confirmed",
      progress: { done: Math.max(0, before - remaining), total: before, phase: null, current_project: null },
      failures: failures.slice(0, MAX_STORED_FAILURES),
      failure_count: failures.length
    };
  }
  let stored = (await readStored(userId)) ?? NOT_STARTED;
  if (stored.state === "paused") {
    refuse("The migration is paused. Resume it in NodeTool first");
  }
  if (
    options.location !== undefined &&
    stored.state !== "not_started" &&
    stored.state !== "plan_shown" &&
    normalizeLocation(options.location) !== stored.location
  ) {
    refuse(
      `The migration was confirmed with ${stored.location ?? "the configured folder"}. ` +
        "A location can only be chosen before it is confirmed"
    );
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
  }
  // Run a confirmed migration once. A run of another process continues
  // there: wait for it to end, or take it over once that process stopped.
  let ran = false;
  for (;;) {
    const current = await readStored(userId);
    if (current?.state === "confirmed" && !ran) {
      ran = true;
      await runner.start(userId);
      continue;
    }
    if (current?.state !== "running") break;
    await runner.continueIfStalled(userId);
    await runner.idle(userId);
    if ((await readStored(userId))?.state === "running") await delay(FOREIGN_RUN_POLL_MS);
  }
  return readMigrationStatus(userId, runner);
}
