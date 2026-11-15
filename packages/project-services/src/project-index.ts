/**
 * The asset index of a project folder (PRD T4, D4, D9).
 *
 * An asset in a project is a file in the project's folder plus a row that
 * names the file by its project-relative path. Files change outside NodeTool:
 * another app saves over one, the user moves, renames or deletes one, or
 * copies new media in. `reconcileProjectIndex` compares the folder with the
 * rows and brings the rows in line:
 *
 * | Disk | Index | Action |
 * | --- | --- | --- |
 * | File present, fingerprint equal | Row | None. |
 * | File present, fingerprint differs | Row | Update the fingerprint. Keep the ID. |
 * | File absent, exactly one unindexed file has the same fingerprint | Row | Update `workspace_path` to that file. |
 * | File absent, no match or several matches | Row | Mark offline. |
 * | Image, video, audio, or 3D file present | No row | Create a row. Build no thumbnail. |
 * | Other file present | No row | None. |
 *
 * It never deletes a row and never writes, moves or deletes a file. A row is
 * changed with a conditional update, so a row that was deleted or changed
 * while the scan ran is left as it is.
 *
 * A move is often a copy followed by a delete: `Workspace.move` works that
 * way and so do some sync clients. A scan between the two steps sees the
 * asset's file and a second media file with the same content. Giving that
 * second file a row would leave two assets on one file once the delete lands,
 * and removing either could delete the file. So a media file whose size and
 * partial hash equal those of a row whose file is present gets no row yet.
 * The row's path is looked at again: when its file is gone the row is pointed
 * at the new file, and otherwise the new file waits {@link COPY_GRACE_MS} for
 * a follow-up reconcile. A copy that is still a copy then gets its own row.
 *
 * The folder is read through its `Workspace`, so a local directory and a
 * storage-backed folder reconcile the same way. Each directory is listed
 * once. Rows are loaded in one query and compared through a path map, and a
 * moved file is found through a map of fingerprints, so the cost is linear in
 * the number of files.
 */
import { createLogger } from "@nodetool-ai/config";
import { Asset, Project, Workspace as WorkspaceRow } from "@nodetool-ai/models";
import { WorkspacePathError, type Workspace } from "@nodetool-ai/runtime";
import { normalizeAssetContentType } from "@nodetool-ai/asset-services/asset-paths";
import {
  isProjectAssetPathInFlux,
  withProjectFolderLock
} from "@nodetool-ai/asset-services/project-asset";
import {
  ProjectFolderUnavailableError,
  WORKSPACE_OFFLINE_KEY,
  isProjectAssetOffline,
  partialContentHashOfWorkspaceFile,
  requireProjectFolder,
  withWorkspaceFingerprint,
  type WorkspaceFingerprint
} from "@nodetool-ai/asset-services/project-asset-file";

const log = createLogger("nodetool.project-services.project-index");

/** Directory names the scan never enters, besides every dot-directory. */
const SKIPPED_DIRECTORIES = new Set(["node_modules"]);

/** Content type families that get a row as soon as the file is seen (D9). */
const INDEXED_MEDIA = /^(image|video|audio|model)\//;

/**
 * Content types of files that get a row on first use, by extension. Each has
 * its own extension in the asset key, so the row's URL ends the way the file
 * does. Any other file is `application/octet-stream`.
 */
const DOCUMENT_TYPES: Record<string, string> = {
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  json: "application/json",
  pdf: "application/pdf",
  zip: "application/zip"
};

/** One file the scan found. `path` is relative to the project folder. */
interface FolderFile {
  path: string;
  size: number;
  modifiedAt: number;
}

/** What one reconcile changed. Every list holds asset ids. */
export interface ProjectIndexReport {
  projectId: string;
  /** Files the scan compared. */
  files: number;
  /** Rows whose file is where the row says, with an equal fingerprint. */
  unchanged: number;
  /** Rows whose file changed and whose fingerprint was recorded anew. */
  updated: string[];
  /** Rows pointed at the one file their bytes moved to. */
  moved: string[];
  /** Rows marked offline: the file is gone and no single file matches. */
  offline: string[];
  /** Rows whose file came back at the path the row names. */
  restored: string[];
  /** Rows created for media files that had none. */
  created: string[];
  /**
   * Paths of media files that got no row yet, because their content is that
   * of an indexed file and the move they may be part of has not finished.
   */
  deferred: string[];
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Whether the scan skips the directory called `name`. */
function isSkippedDirectory(name: string): boolean {
  return name.startsWith(".") || SKIPPED_DIRECTORIES.has(name);
}

/** Whether `path` lies in a directory the scan does not enter. */
function isInSkippedDirectory(path: string): boolean {
  return path.split("/").slice(0, -1).some(isSkippedDirectory);
}

/** The content type a file in a project folder gets from its name. */
function contentTypeOfFile(path: string): string {
  const name = fileName(path);
  const inferred = normalizeAssetContentType("", name);
  if (inferred !== "application/octet-stream") return inferred;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return DOCUMENT_TYPES[extension] ?? inferred;
}

/**
 * Every file in the folder, by path. Each directory is listed once.
 * `Workspace.list` leaves out `.nodetool/` and symbolic links, and a
 * directory whose real location is outside the folder is refused with a
 * `WorkspacePathError` and skipped. Any other listing failure ends the scan,
 * so a directory that could not be read never makes its files look deleted.
 */
async function scanFolder(workspace: Workspace): Promise<Map<string, FolderFile>> {
  const files = new Map<string, FolderFile>();
  const directories = [""];
  for (let next = directories.pop(); next !== undefined; next = directories.pop()) {
    let entries: Awaited<ReturnType<Workspace["list"]>>;
    try {
      entries = await workspace.list(next);
    } catch (error) {
      if (error instanceof WorkspacePathError) continue;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isDirectory) {
        if (!isSkippedDirectory(entry.name)) directories.push(entry.path);
      } else {
        files.set(entry.path, {
          path: entry.path,
          size: entry.size,
          modifiedAt: entry.modifiedAt
        });
      }
    }
  }
  return files;
}

/** The file at `path`, read on its own. Null when it is not a file there. */
async function statFile(
  workspace: Workspace,
  path: string
): Promise<FolderFile | null> {
  try {
    const info = await workspace.stat(path);
    return info && !info.isDirectory
      ? { path, size: info.size, modifiedAt: info.modifiedAt }
      : null;
  } catch {
    // A path the folder refuses is a file the row cannot be read from.
    return null;
  }
}

/** The partial content hash of a file, or null when it cannot be read. */
async function hashFile(
  workspace: Workspace,
  path: string
): Promise<string | null> {
  try {
    return await partialContentHashOfWorkspaceFile(workspace, path);
  } catch (error) {
    log.debug("Could not hash a project file", {
      path,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/** The fingerprint a row recorded, with null for each part it lacks. */
function recordedFingerprint(asset: Asset): {
  size: number | null;
  mtime: number | null;
  hash: string | null;
} {
  const metadata = asset.metadata ?? {};
  const size = metadata["workspace_size"];
  const mtime = metadata["workspace_mtime"];
  const hash = metadata["workspace_hash"];
  return {
    size: typeof size === "number" ? size : null,
    mtime: typeof mtime === "number" ? mtime : null,
    hash: typeof hash === "string" ? hash : null
  };
}

/**
 * The row's recorded hash when its recorded size and mtime are the file's,
 * else null. mtimes compare at millisecond granularity. An unchanged file is
 * recognized without reading it.
 */
function unchangedHash(asset: Asset, file: FolderFile): string | null {
  const recorded = recordedFingerprint(asset);
  const same =
    recorded.size === file.size &&
    recorded.mtime !== null &&
    Math.trunc(recorded.mtime) === Math.trunc(file.modifiedAt);
  return same ? recorded.hash : null;
}

function fingerprintOf(file: FolderFile, hash: string): WorkspaceFingerprint {
  return {
    workspace_size: file.size,
    workspace_mtime: file.modifiedAt,
    workspace_hash: hash
  };
}

/** Create the row of a file that has none. `hash` is its partial hash. */
function createRow(
  userId: string,
  projectId: string,
  file: FolderFile,
  hash: string
): Promise<Asset> {
  return Asset.create<Asset>({
    user_id: userId,
    project_id: projectId,
    // The user's home folder, where an asset with no folder of its own lists.
    parent_id: userId,
    name: fileName(file.path),
    content_type: contentTypeOfFile(file.path),
    workspace_path: file.path,
    size: file.size,
    metadata: fingerprintOf(file, hash)
  });
}

/**
 * Unindexed files by size and then by partial hash. A file is hashed the
 * first time a missing row of its size asks, and only then, so a folder with
 * no missing rows hashes nothing here.
 */
class MovedFileIndex {
  private readonly bySize = new Map<number, FolderFile[]>();
  private readonly byHash = new Map<number, Map<string, FolderFile[]>>();

  constructor(
    private readonly workspace: Workspace,
    unindexed: Iterable<FolderFile>
  ) {
    for (const file of unindexed) {
      const bucket = this.bySize.get(file.size);
      if (bucket) bucket.push(file);
      else this.bySize.set(file.size, [file]);
    }
  }

  /** The unindexed files of `size` whose partial hash is `hash`. */
  async find(size: number, hash: string): Promise<FolderFile[]> {
    let hashed = this.byHash.get(size);
    if (!hashed) {
      hashed = new Map();
      for (const file of this.bySize.get(size) ?? []) {
        const fileHash = await hashFile(this.workspace, file.path);
        if (fileHash === null) continue;
        const bucket = hashed.get(fileHash);
        if (bucket) bucket.push(file);
        else hashed.set(fileHash, [file]);
      }
      this.byHash.set(size, hashed);
    }
    return hashed.get(hash) ?? [];
  }
}

/**
 * The rows whose file is present, by fingerprint, for telling whether a media
 * file with no row has the content of an indexed file. Each row's path is
 * looked at again at most once per fingerprint, so the cost stays linear.
 */
class CopiedFiles {
  private byFingerprint: Map<string, Asset[]> | null = null;
  private readonly checked = new Map<string, { gone: Asset[] }>();

  constructor(
    private readonly workspace: Workspace,
    private readonly rows: readonly Asset[],
    private readonly indexed: ReadonlySet<string>
  ) {}

  /**
   * The rows whose present file has the size and partial hash of `file`, as
   * the ones whose file has gone since the folder was listed. Null when no
   * row has that fingerprint.
   */
  async originalsOf(
    file: FolderFile,
    hash: string
  ): Promise<{ gone: Asset[] } | null> {
    if (!this.byFingerprint) {
      this.byFingerprint = new Map();
      for (const asset of this.rows) {
        const path = asset.workspace_path;
        if (!path || !this.indexed.has(path)) continue;
        const recorded = recordedFingerprint(asset);
        if (recorded.size === null || recorded.hash === null) continue;
        const key = `${recorded.size}:${recorded.hash}`;
        const bucket = this.byFingerprint.get(key);
        if (bucket) bucket.push(asset);
        else this.byFingerprint.set(key, [asset]);
      }
    }
    const key = `${file.size}:${hash}`;
    const same = this.byFingerprint.get(key);
    if (!same) return null;
    let checked = this.checked.get(key);
    if (!checked) {
      const gone: Asset[] = [];
      for (const asset of same) {
        const path = asset.workspace_path;
        if (path && !(await statFile(this.workspace, path))) gone.push(asset);
      }
      checked = { gone };
      this.checked.set(key, checked);
    }
    return checked;
  }
}

/**
 * Compare the folder of `projectId` with its asset rows and apply the table
 * at the top of this module. A missing or loose project id names Personal.
 *
 * Throws `ProjectFolderUnavailableError` when the folder cannot be reached,
 * and rethrows a listing failure. In both cases no row is changed: a folder
 * that cannot be read is never taken for a folder whose files were deleted.
 */
export async function reconcileProjectIndex(
  projectId: string | null | undefined,
  userId: string
): Promise<ProjectIndexReport> {
  const folder = await requireProjectFolder(projectId, userId);
  const { workspace } = folder;
  const project = folder.projectId;

  return withProjectFolderLock(userId, project, async () => {
    const report: ProjectIndexReport = {
      projectId: project,
      files: 0,
      unchanged: 0,
      updated: [],
      moved: [],
      offline: [],
      restored: [],
      created: [],
      deferred: []
    };
    const inFlux = (path: string): boolean =>
      isProjectAssetPathInFlux(userId, project, path);

    const files = await scanFolder(workspace);
    const rows = await Asset.listProjectFiles(userId, project);
    report.files = files.size;

    // Rows whose file is where they say.
    const indexed = new Set<string>();
    const missing: Asset[] = [];
    for (const asset of rows) {
      const path = asset.workspace_path;
      if (!path || inFlux(path)) continue;
      // The scan does not enter every directory. A row may still name a file
      // in one, and that file is looked at on its own.
      const file =
        files.get(path) ??
        (isInSkippedDirectory(path) ? await statFile(workspace, path) : null);
      if (!file) {
        missing.push(asset);
        continue;
      }
      // Two rows for one file is an integrity error. The first keeps the
      // file and the second is left untouched for a person to resolve.
      if (indexed.has(path)) continue;
      indexed.add(path);

      // Rows are saved only while their stored metadata is still what was
      // read here. A row deleted or changed during the scan is left alone,
      // and an update never inserts, so a deleted row stays deleted.
      const read = asset.metadata;
      const wasOffline = isProjectAssetOffline(asset);
      const unchanged = unchangedHash(asset, file);
      if (unchanged !== null && !wasOffline) {
        report.unchanged++;
        continue;
      }
      const hash = unchanged ?? (await hashFile(workspace, path));
      if (hash === null) continue;
      asset.size = file.size;
      asset.metadata = withWorkspaceFingerprint(read, fingerprintOf(file, hash));
      if (await asset.saveIfMetadataMatches(read)) {
        (wasOffline ? report.restored : report.updated).push(asset.id);
      }
    }

    // Rows whose file is gone: moved to exactly one unindexed file, or offline.
    if (missing.length > 0) {
      const unindexed = [...files.values()].filter(
        (file) => !indexed.has(file.path) && !inFlux(file.path)
      );
      const movedFiles = new MovedFileIndex(workspace, unindexed);
      // The one file each missing row could have moved to, when it has one.
      const targets = new Map<Asset, { file: FolderFile; hash: string }>();
      const claims = new Map<string, number>();
      for (const asset of missing) {
        const { size, hash } = recordedFingerprint(asset);
        if (size === null || hash === null) continue;
        const found = await movedFiles.find(size, hash);
        const file = found.length === 1 ? found[0] : undefined;
        if (!file) continue;
        targets.set(asset, { file, hash });
        claims.set(file.path, (claims.get(file.path) ?? 0) + 1);
      }
      for (const asset of missing) {
        const target = targets.get(asset);
        const read = asset.metadata;
        // A file two missing rows could both have moved to goes to neither.
        if (target && claims.get(target.file.path) === 1) {
          asset.workspace_path = target.file.path;
          asset.metadata = withWorkspaceFingerprint(
            read,
            fingerprintOf(target.file, target.hash)
          );
          indexed.add(target.file.path);
          if (await asset.saveIfMetadataMatches(read)) {
            report.moved.push(asset.id);
          }
          continue;
        }
        if (isProjectAssetOffline(asset)) continue;
        asset.metadata = { ...read, [WORKSPACE_OFFLINE_KEY]: true };
        if (await asset.saveIfMetadataMatches(read)) {
          report.offline.push(asset.id);
        }
      }
    }

    // Media files with no row get one. Other files wait for first use.
    const copies = new CopiedFiles(workspace, rows, indexed);
    const projectKey = scheduleKey(project, userId);
    const waitingSince = waitingCopies.get(projectKey);
    const stillWaiting = new Map<string, number>();
    for (const file of files.values()) {
      if (indexed.has(file.path) || inFlux(file.path)) continue;
      if (!INDEXED_MEDIA.test(contentTypeOfFile(file.path))) continue;
      const hash = await hashFile(workspace, file.path);
      if (hash === null) continue;

      // The file may be the copy half of a move that is not finished.
      const originals = await copies.originalsOf(file, hash);
      if (originals) {
        const [moved] = originals.gone;
        if (moved && originals.gone.length === 1) {
          const read = moved.metadata;
          moved.workspace_path = file.path;
          moved.metadata = withWorkspaceFingerprint(
            read,
            fingerprintOf(file, hash)
          );
          indexed.add(file.path);
          originals.gone.length = 0;
          if (await moved.saveIfMetadataMatches(read)) {
            report.moved.push(moved.id);
          }
          continue;
        }
        const waitKey = `${file.path}\u0000${hash}`;
        const since = waitingSince?.get(waitKey) ?? Date.now();
        // Several rows lost their file at once: the next pass sorts them
        // out by the rule for missing files. Otherwise the copy waits.
        if (originals.gone.length > 1 || Date.now() - since < COPY_GRACE_MS) {
          stillWaiting.set(waitKey, since);
          report.deferred.push(file.path);
          continue;
        }
      }
      const asset = await createRow(userId, project, file, hash);
      indexed.add(file.path);
      report.created.push(asset.id);
    }
    if (stillWaiting.size > 0) {
      waitingCopies.set(projectKey, stillWaiting);
      scheduleFollowUp(project, userId);
    } else {
      waitingCopies.delete(projectKey);
    }

    lastReconciled.set(projectKey, Date.now());
    return report;
  });
}

/**
 * The asset row of the file at `path` in the project folder, created when
 * the file has none. Media files get their row from the reconcile. Any other
 * file gets it here, the first time a tool or a document refers to it (D9).
 *
 * Throws when there is no file at `path`, or the folder cannot be reached.
 */
export async function ensureAssetForPath(
  projectId: string | null | undefined,
  userId: string,
  path: string
): Promise<Asset> {
  const folder = await requireProjectFolder(projectId, userId);
  const { workspace } = folder;
  const project = folder.projectId;
  const key = workspace.key(path);

  return withProjectFolderLock(userId, project, async () => {
    const existing = await Asset.findByWorkspacePath(userId, project, key);
    if (existing[0]) return existing[0];
    const file = await statFile(workspace, key);
    if (!file) throw new Error(`No file at ${key} in the project folder`);
    const hash = await hashFile(workspace, key);
    if (hash === null) throw new Error(`The file ${key} could not be read`);
    return createRow(userId, project, file, hash);
  });
}

// ── Triggers ────────────────────────────────────────────────────────────────

/** Quiet time after the last folder change before the reconcile runs, in ms. */
export const RECONCILE_DEBOUNCE_MS = 500;
/** Longest a reconcile waits while changes keep arriving, in ms. */
export const RECONCILE_MAX_WAIT_MS = 5_000;
/** A project opened again within this time is not scanned again, in ms. */
export const OPEN_RECONCILE_INTERVAL_MS = 10_000;
/**
 * How long a media file with the content of an indexed file waits for its
 * row, in ms. A move seen half done finishes within this time, and the row of
 * the file that moved then follows it.
 */
export const COPY_GRACE_MS = 10_000;

interface Scheduled {
  timer: NodeJS.Timeout;
  firstAt: number;
  run: () => Promise<void>;
}

const scheduled = new Map<string, Scheduled>();
const running = new Set<Promise<void>>();
const lastReconciled = new Map<string, number>();
/** Per project: when each waiting copy (`path`, NUL, hash) was first seen. */
const waitingCopies = new Map<string, Map<string, number>>();

function scheduleKey(projectId: string, userId: string): string {
  return `${userId}\u0000${projectId}`;
}

function start(key: string): void {
  const entry = scheduled.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  scheduled.delete(key);
  const done = entry.run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // A folder that is away is reported where the project is shown.
    if (error instanceof ProjectFolderUnavailableError) {
      log.debug("Skipped reconciling a project folder", { reason: message });
    } else {
      log.warn("Reconciling a project folder failed", { error: message });
    }
  });
  running.add(done);
  void done.then(() => running.delete(done));
}

/**
 * Run `run` once the calls under `key` have been quiet for
 * {@link RECONCILE_DEBOUNCE_MS}, and no later than
 * {@link RECONCILE_MAX_WAIT_MS} after the first of them.
 */
function schedule(key: string, run: () => Promise<void>): void {
  const now = Date.now();
  const pending = scheduled.get(key);
  if (pending) clearTimeout(pending.timer);
  const firstAt = pending?.firstAt ?? now;
  const wait = Math.max(
    0,
    Math.min(RECONCILE_DEBOUNCE_MS, firstAt + RECONCILE_MAX_WAIT_MS - now)
  );
  const timer = setTimeout(() => start(key), wait);
  // A pending reconcile must not hold the process open at shutdown.
  timer.unref?.();
  scheduled.set(key, { timer, firstAt, run });
}

/** Reconcile the project's folder soon, debounced. Never throws. */
export function scheduleProjectReconcile(
  projectId: string,
  userId: string
): void {
  schedule(`project\u0000${scheduleKey(projectId, userId)}`, async () => {
    await reconcileProjectIndex(projectId, userId);
  });
}

/**
 * Reconcile the project again once {@link COPY_GRACE_MS} has passed, unless a
 * reconcile is already scheduled. That one schedules the next when files are
 * still waiting.
 */
function scheduleFollowUp(projectId: string, userId: string): void {
  const key = `project\u0000${scheduleKey(projectId, userId)}`;
  if (scheduled.has(key)) return;
  const timer = setTimeout(() => start(key), COPY_GRACE_MS);
  timer.unref?.();
  scheduled.set(key, {
    timer,
    firstAt: Date.now(),
    run: async () => {
      await reconcileProjectIndex(projectId, userId);
    }
  });
}

/**
 * Reconcile on project open. A project opened again shortly after a
 * reconcile finished is not scanned again.
 */
export function reconcileProjectOnOpen(projectId: string, userId: string): void {
  const last = lastReconciled.get(scheduleKey(projectId, userId));
  if (last !== undefined && Date.now() - last < OPEN_RECONCILE_INTERVAL_MS) {
    return;
  }
  scheduleProjectReconcile(projectId, userId);
}

/**
 * Reconcile after NodeTool wrote in the workspace `workspaceId`, debounced.
 * Nothing happens unless that workspace is the folder of one of the user's
 * projects. Never throws.
 */
export function scheduleWorkspaceReconcile(
  workspaceId: string,
  userId: string
): void {
  schedule(`workspace\u0000${scheduleKey(workspaceId, userId)}`, async () => {
    const row = await WorkspaceRow.find(userId, workspaceId);
    if (!row) return;
    const project = await Project.findOwned(userId, row.project_id);
    if (!project || project.workspace_id !== row.id) return;
    await reconcileProjectIndex(project.id, userId);
  });
}

/** Run every scheduled reconcile now and wait for all of them to finish. */
export async function flushProjectReconciles(): Promise<void> {
  for (const key of [...scheduled.keys()]) start(key);
  while (running.size > 0) await Promise.all([...running]);
}

/** Drop every scheduled reconcile without running it. */
export function cancelProjectReconciles(): void {
  for (const entry of scheduled.values()) clearTimeout(entry.timer);
  scheduled.clear();
}

/** The asset index of a project folder. */
export const ProjectIndex = {
  reconcile: reconcileProjectIndex,
  ensureAssetForPath,
  schedule: scheduleProjectReconcile,
  scheduleForWorkspace: scheduleWorkspaceReconcile,
  onProjectOpen: reconcileProjectOnOpen,
  flush: flushProjectReconciles,
  cancel: cancelProjectReconciles
} as const;
