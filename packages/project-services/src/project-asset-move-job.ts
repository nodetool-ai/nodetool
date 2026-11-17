/**
 * The background job that moves the bytes of assets from before project
 * folders into their project's folder (PRD T9 step 4).
 *
 * One pass works through one project. Each asset is one resumable step,
 * `moveLegacyAssetIntoFolder`, which copies the legacy object into the
 * folder, verifies the copy, names the file on the row and only then deletes
 * the legacy object. After the assets, the pass deletes each legacy folder
 * row that no row names as its parent any more. The directory the row stood
 * for is created first, so an empty folder stays a folder.
 *
 * The job keeps no state that a restart needs. What is left to do is every
 * row of the project that keeps no file in the folder and references none in
 * place, plus every row whose move was interrupted, so a second pass over a
 * finished project changes nothing.
 *
 * It yields to interactive work: one asset is moved at a time, with the event
 * loop running between assets.
 *
 * External assets and their files are never touched. Thumbnails and other
 * derived objects stay in the asset store. An asset of a project whose
 * folder cannot be reached stays where it is.
 */
import { setImmediate as nextTurn } from "node:timers/promises";
import { createLogger } from "@nodetool-ai/config";
import { Asset, LOOSE_PROJECT_ID, Project, moveTargetOf } from "@nodetool-ai/models";
import { ProjectDirectoryResolver, type LegacyFolder } from "@nodetool-ai/protocol";
import type { Workspace } from "@nodetool-ai/runtime";
import type { StorageAdapter } from "@nodetool-ai/storage";
import {
  legacyFolderDirectory,
  moveLegacyAssetIntoFolder,
  type LegacyAssetMoveOptions
} from "@nodetool-ai/asset-services/legacy-asset-move";
import {
  DirectoryNames,
  withProjectFolderLock
} from "@nodetool-ai/asset-services/project-asset";
import {
  ProjectFolderUnavailableError,
  requireProjectFolder
} from "@nodetool-ai/asset-services/project-asset-file";
import { getAssetAdapter } from "@nodetool-ai/asset-services/storage";
import { scheduleProjectHashing } from "./project-hash-job.js";
import { scheduleAssetManifestWrite } from "./project-manifest.js";

const log = createLogger("nodetool.project-services.project-asset-move-job");

/**
 * How long a row must have gone unchanged before its bytes are moved, in ms.
 * A row that was just created may still be waiting for its bytes, and the
 * request that made it may still save it. Such a row is left for a later pass.
 */
export const MOVE_SETTLE_MS = 60_000;

/**
 * How long a row made for a client-direct upload may still get its bytes, in
 * ms: the longest lifetime of an upload URL the asset stores mint (two hours
 * on Supabase, one on S3).
 */
export const CLIENT_UPLOAD_WINDOW_MS = 2 * 60 * 60_000;

/**
 * Whether `row` was made for a client-direct upload whose URL may still be
 * used. Such a row has no size until the upload is finalized, and the client
 * writes the legacy key directly, outside every lock. A move that ran now
 * could delete bytes the client stores after its last look at the key.
 */
function isAwaitingClientUpload(row: Asset, now: number): boolean {
  return (
    row.size === null && now - Date.parse(row.created_at) < CLIENT_UPLOAD_WINDOW_MS
  );
}

/** How long an asset whose move failed waits for its next try, in ms. */
export const MOVE_RETRY_MS = 5 * 60_000;

/** How long a project opened again waits for its next look, in ms. */
export const OPEN_MOVE_INTERVAL_MS = 10_000;

/** How far the move of a project's assets has come. */
export interface AssetMoveProgress {
  /** Assets this pass has finished with, moved or not. */
  done: number;
  /** Assets this pass set out to move. */
  total: number;
}

/** What one pass over a project did. Every list holds asset ids. */
export interface ProjectAssetMoveReport {
  projectId: string;
  /** Assets whose bytes are in the folder now, with no legacy object left. */
  moved: string[];
  /** Rows with no object under any legacy key. Left as they are. */
  withoutBytes: string[];
  /** Assets whose move could not finish. Still readable, tried again later. */
  failed: string[];
  /** Why each asset in {@link failed} could not move, by asset id. */
  failureReasons: Record<string, string>;
  /** Rows changed too recently to move. A later pass takes them. */
  deferred: string[];
  /** Legacy folder rows that were deleted. */
  foldersRemoved: string[];
  /** True when the gate stopped the pass before its last asset. */
  stopped: boolean;
}

/**
 * Whether bulk moves may run for a user now. The project folder migration
 * installs one on the process-wide job, so nothing moves before the user
 * confirms the migration and nothing moves while it is paused.
 */
export type AssetMoveGate = (userId: string) => Promise<boolean>;

export interface ProjectAssetMoveJobOptions {
  /** The asset store that holds the legacy objects. Defaults to the host's. */
  storage?: () => StorageAdapter;
  /** Overrides {@link MOVE_SETTLE_MS}. */
  settleMs?: number;
  /** Passed to every asset move. See `LegacyAssetMoveOptions.afterStep`. */
  afterStep?: LegacyAssetMoveOptions["afterStep"];
  /** Asked before each pass and each asset. See {@link AssetMoveGate}. */
  gate?: AssetMoveGate;
}

interface MoveTarget {
  projectId: string;
  userId: string;
}

/** A row a pass leaves out until it changes or `until` has passed. */
interface Skipped {
  updatedAt: string;
  until: number;
}

function targetKey(projectId: string, userId: string): string {
  return `${userId}\u0000${projectId}`;
}

function isLoose(projectId: string | null | undefined): boolean {
  return !projectId || projectId === LOOSE_PROJECT_ID;
}

function emptyReport(projectId: string): ProjectAssetMoveReport {
  return {
    projectId,
    moved: [],
    withoutBytes: [],
    failed: [],
    failureReasons: {},
    deferred: [],
    foldersRemoved: [],
    stopped: false
  };
}

export class ProjectAssetMoveJob {
  private readonly pending = new Map<string, MoveTarget>();
  private readonly progressByProject = new Map<string, AssetMoveProgress>();
  private readonly skipped = new Map<string, Skipped>();
  private readonly lastPrepared = new Map<string, number>();
  private readonly followUps = new Set<NodeJS.Timeout>();
  private running: Promise<void> | null = null;
  private readonly abort = new AbortController();
  private gate: AssetMoveGate | null;

  constructor(private readonly options: ProjectAssetMoveJobOptions = {}) {
    this.gate = options.gate ?? null;
  }

  /** Install or remove the gate. See {@link AssetMoveGate}. */
  setGate(gate: AssetMoveGate | null): void {
    this.gate = gate;
  }

  private async allows(userId: string): Promise<boolean> {
    if (!this.gate) return true;
    try {
      return await this.gate(userId);
    } catch (error) {
      log.warn("Could not read whether assets may move into project folders", {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Forget the assets whose move failed, so the next pass tries them at once
   * instead of after {@link MOVE_RETRY_MS}. Rows without bytes stay skipped.
   */
  forgetFailures(): void {
    for (const [id, skip] of this.skipped) {
      if (Number.isFinite(skip.until)) this.skipped.delete(id);
    }
  }

  /**
   * Move the assets of the project in the background. A project already
   * waiting is not queued twice, and one that is being worked on gets
   * another pass afterwards. Never throws.
   */
  schedule(projectId: string, userId: string): void {
    if (this.abort.signal.aborted || isLoose(projectId)) return;
    this.pending.set(targetKey(projectId, userId), { projectId, userId });
    this.ensureRunning();
  }

  /**
   * Look for assets of the project that still have to move, and schedule the
   * project when there are any. The progress it returns is what
   * {@link progress} reports from then on, so a caller that answers a client
   * right after this call already shows the move. A project looked at within
   * the last {@link OPEN_MOVE_INTERVAL_MS} is not looked at again. Never
   * throws.
   */
  async prepare(
    projectId: string,
    userId: string
  ): Promise<AssetMoveProgress | null> {
    const key = targetKey(projectId, userId);
    const known = this.progressByProject.get(key);
    if (known || this.abort.signal.aborted || isLoose(projectId)) {
      return known ?? null;
    }
    const last = this.lastPrepared.get(key);
    if (last !== undefined && Date.now() - last < OPEN_MOVE_INTERVAL_MS) {
      return null;
    }
    if (!(await this.allows(userId))) return null;
    this.lastPrepared.set(key, Date.now());
    try {
      const { rows } = await this.work(projectId, userId);
      if (rows.length === 0) return null;
      const progress = { done: 0, total: rows.length };
      this.progressByProject.set(key, progress);
      this.schedule(projectId, userId);
      return progress;
    } catch (error) {
      log.warn("Could not look for assets to move into a project folder", {
        projectId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /** How far the move of the project's assets has come, or null when none runs. */
  progress(projectId: string, userId: string): AssetMoveProgress | null {
    const progress = this.progressByProject.get(targetKey(projectId, userId));
    return progress ? { ...progress } : null;
  }

  private ensureRunning(): void {
    if (this.running) return;
    this.running = this.loop().finally(() => {
      this.running = null;
      // A project scheduled while the loop was ending still gets its pass.
      if (this.pending.size > 0 && !this.abort.signal.aborted) {
        this.ensureRunning();
      }
    });
  }

  /** Resolves once every scheduled project has been worked through. */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  /**
   * Stop for good: the asset being moved finishes its current step and
   * nothing more is started. What was moved stays moved.
   */
  stop(): void {
    this.abort.abort();
    this.pending.clear();
    for (const timer of this.followUps) clearTimeout(timer);
    this.followUps.clear();
  }

  private async loop(): Promise<void> {
    for (;;) {
      const next = this.pending.entries().next();
      if (next.done || this.abort.signal.aborted) return;
      const [key, target] = next.value;
      this.pending.delete(key);
      try {
        await this.run(target.projectId, target.userId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // A folder that is away is reported where the project is shown.
        if (error instanceof ProjectFolderUnavailableError) {
          log.debug("Skipped moving assets into a project folder", {
            reason: message
          });
        } else {
          log.warn("Moving assets into a project folder failed", {
            projectId: target.projectId,
            error: message
          });
        }
      }
    }
  }

  /**
   * The rows of the project this pass moves, and the ones it leaves for a
   * later pass because they changed within the settle time.
   */
  private async work(
    projectId: string,
    userId: string
  ): Promise<{ rows: Asset[]; deferred: Asset[] }> {
    const now = Date.now();
    const settleMs = this.options.settleMs ?? MOVE_SETTLE_MS;
    const rows: Asset[] = [];
    const deferred: Asset[] = [];
    for (const row of await Asset.listAwaitingFolderMove(userId, projectId)) {
      const skip = this.skipped.get(row.id);
      if (skip && skip.updatedAt === row.updated_at && now < skip.until) {
        continue;
      }
      // A move that already started is finished whatever the row's age: its
      // own writes do not count as changes.
      const settled =
        moveTargetOf(row) !== null ||
        (now - Date.parse(row.updated_at) >= settleMs &&
          !isAwaitingClientUpload(row, now));
      (settled ? rows : deferred).push(row);
    }
    return { rows, deferred };
  }

  /**
   * One pass over the project: move every asset that is ready, then delete
   * the legacy folder rows that are empty. Throws
   * `ProjectFolderUnavailableError` when the folder cannot be reached, and
   * nothing is changed then.
   */
  async run(projectId: string, userId: string): Promise<ProjectAssetMoveReport> {
    const key = targetKey(projectId, userId);
    try {
      return await this.pass(projectId, userId, key);
    } finally {
      this.progressByProject.delete(key);
    }
  }

  private async pass(
    projectId: string,
    userId: string,
    key: string
  ): Promise<ProjectAssetMoveReport> {
    const report = emptyReport(projectId);
    if (!(await this.allows(userId))) {
      report.stopped = true;
      return report;
    }
    const folder = await requireProjectFolder(projectId, userId);
    // A loose id resolves to Personal. Its rows are assigned to Personal
    // first, so a row is only ever moved into the folder of its own project.
    if (folder.projectId !== projectId) return report;
    const { workspace } = folder;

    const { rows, deferred } = await this.work(projectId, userId);
    report.deferred = deferred.map((row) => row.id);
    const folders = await Asset.listFolders(userId);
    const resolver = new ProjectDirectoryResolver(
      projectId,
      new Map<string, LegacyFolder>(folders.map((row) => [row.id, row]))
    );
    const progress = { done: 0, total: rows.length };
    if (rows.length > 0) this.progressByProject.set(key, progress);

    const storage = (this.options.storage ?? getAssetAdapter)();
    const names = new DirectoryNames();
    for (const row of rows) {
      // Let requests and timers that queued up run before the next asset.
      await nextTurn();
      if (this.abort.signal.aborted) return report;
      // A paused migration stops here. The asset before this one finished,
      // and the next pass continues with this one.
      if (!(await this.allows(userId))) {
        report.stopped = true;
        return report;
      }
      try {
        const outcome = await moveLegacyAssetIntoFolder(userId, row.id, {
          storage,
          workspace,
          projectId,
          resolver,
          names,
          afterStep: this.options.afterStep
        });
        if (outcome.status === "moved") {
          report.moved.push(row.id);
        } else if (outcome.status === "no_bytes") {
          report.withoutBytes.push(row.id);
          this.skip(row, Number.POSITIVE_INFINITY);
        } else if (outcome.status === "waiting") {
          report.failed.push(row.id);
          report.failureReasons[row.id] = outcome.reason;
          this.skip(row, Date.now() + MOVE_RETRY_MS);
          log.info("An asset stays in the asset store for now", {
            assetId: row.id,
            reason: outcome.reason
          });
        }
      } catch (error) {
        report.failed.push(row.id);
        report.failureReasons[row.id] =
          error instanceof Error ? error.message : String(error);
        this.skip(row, Date.now() + MOVE_RETRY_MS);
        log.warn("Could not move an asset into its project folder", {
          assetId: row.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      progress.done++;
    }
    if (this.abort.signal.aborted) return report;

    report.foldersRemoved = await removeEmptyFolderRows(
      userId,
      projectId,
      workspace,
      resolver,
      folders
    );
    if (report.moved.length > 0) {
      scheduleAssetManifestWrite(projectId, userId);
      scheduleProjectHashing(projectId, userId);
      log.info("Moved assets into a project folder", {
        projectId,
        moved: report.moved.length,
        failed: report.failed.length,
        foldersRemoved: report.foldersRemoved.length
      });
    }
    if (deferred.length > 0) this.scheduleFollowUp(projectId, userId);
    return report;
  }

  private skip(row: Asset, until: number): void {
    this.skipped.set(row.id, { updatedAt: row.updated_at, until });
  }

  /** Give the rows that changed too recently their pass once they settle. */
  private scheduleFollowUp(projectId: string, userId: string): void {
    const timer = setTimeout(() => {
      this.followUps.delete(timer);
      this.schedule(projectId, userId);
    }, this.options.settleMs ?? MOVE_SETTLE_MS);
    // A waiting pass must not hold the process open at shutdown.
    timer.unref?.();
    this.followUps.add(timer);
  }
}

/**
 * Delete the legacy folder rows of the project that no row names as its
 * parent, deepest first, and return their ids. The directory a row stood for
 * is created before the row goes, so an empty folder stays a folder where
 * the folder is a local directory. A folder row that still has a child, such
 * as an external asset or an asset whose bytes did not move, stays.
 */
async function removeEmptyFolderRows(
  userId: string,
  projectId: string,
  workspace: Workspace,
  resolver: ProjectDirectoryResolver,
  folders: readonly Asset[]
): Promise<string[]> {
  // Paths are read before any row goes: a nested path reads its parents.
  // Deepest first, so a child goes before its parent within one round.
  const remaining = new Map(
    folders
      .filter((row) => row.project_id === projectId)
      .map((row) => [row, legacyFolderDirectory(resolver.pathOfFolder(row))] as const)
      .sort(([, a], [, b]) => depthOf(b) - depthOf(a))
  );
  const removed: string[] = [];
  // Each round removes the folders that are empty now. A folder whose child
  // went later in the same round is taken by the next one.
  for (let removedSome = true; removedSome; ) {
    removedSome = false;
    for (const [row, path] of [...remaining]) {
      const gone = await withProjectFolderLock(userId, projectId, async () => {
        if ((await Asset.countChildren(userId, row.id)) > 0) return false;
        try {
          if (path) await workspace.mkdir(workspace.key(path));
        } catch (error) {
          // The row stays while its directory cannot be made.
          log.warn("Could not make the directory of a legacy folder", {
            folderId: row.id,
            error: error instanceof Error ? error.message : String(error)
          });
          return false;
        }
        await row.delete();
        return true;
      });
      if (!gone) continue;
      remaining.delete(row);
      removed.push(row.id);
      removedSome = true;
    }
  }
  return removed;
}

function depthOf(path: string): number {
  return path === "" ? 0 : path.split("/").length;
}

/** The process-wide move job. */
export const projectAssetMoveJob = new ProjectAssetMoveJob();

/**
 * Schedule the move for every project of every user, or of `userId` when
 * given, that has assets outside its folder. Rows in no project are assigned
 * to their user's Personal project first, as `Project.migrateToPersonal` does
 * everywhere else. Runs at startup, after every project has its folder.
 * Returns how many projects were scheduled.
 */
export async function scheduleLegacyAssetMoves(
  job: ProjectAssetMoveJob = projectAssetMoveJob,
  userId?: string
): Promise<number> {
  let waiting = await Asset.listProjectsAwaitingFolderMove(userId);
  const looseOwners = new Set(
    waiting.filter((row) => isLoose(row.projectId)).map((row) => row.userId)
  );
  for (const userId of looseOwners) {
    try {
      await Project.migrateToPersonal(userId);
    } catch (error) {
      log.warn("Could not assign loose assets to the Personal project", {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  if (looseOwners.size > 0) {
    waiting = await Asset.listProjectsAwaitingFolderMove(userId);
  }
  let scheduled = 0;
  for (const { projectId, userId } of waiting) {
    if (isLoose(projectId)) continue;
    job.schedule(projectId, userId);
    scheduled++;
  }
  return scheduled;
}

/**
 * Look for assets of an opened project that still have to move and schedule
 * them. See {@link ProjectAssetMoveJob.prepare}.
 */
export function prepareProjectAssetMove(
  projectId: string,
  userId: string
): Promise<AssetMoveProgress | null> {
  return projectAssetMoveJob.prepare(projectId, userId);
}

/** How far the move of the project's assets has come, or null when none runs. */
export function projectAssetMoveProgress(
  projectId: string,
  userId: string
): AssetMoveProgress | null {
  return projectAssetMoveJob.progress(projectId, userId);
}
