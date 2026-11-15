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
 * | File present, fingerprint differs | Row | Update the fingerprint. Invalidate thumbnail, peaks, and proxy. Keep the ID. |
 * | File absent, exactly one unindexed file has the same fingerprint | Row | Update `workspace_path` to that file. |
 * | File absent, no match or several matches | Row | Mark offline. |
 * | Image, video, audio, or 3D file present | No row | Create a row. Build no thumbnail. |
 * | Other file present | No row | None. |
 *
 * It never deletes a row and never writes, moves or deletes a file. A row is
 * changed with a conditional update, so a row that was deleted or changed
 * while the scan ran is left as it is.
 *
 * The folder is read through its `Workspace`, so a local directory and a
 * storage-backed folder reconcile the same way. Each directory is listed
 * once. Rows are loaded in one query and compared through a path map, and a
 * moved file is found through a map of fingerprints, so the cost is linear in
 * the number of files.
 *
 * Several unindexed files can share a row's partial fingerprint, which covers
 * only the first and last 1 MiB. When the row has the full hash the
 * background job computes (`content_hash`), those files are hashed in full
 * and the one that matches is the row's file. Without it the row goes
 * offline, because nothing tells the files apart.
 *
 * A reconcile can be limited to a set of changed paths. The folder watcher
 * does that: it then looks at those paths only and scans nothing else.
 */
import { createLogger } from "@nodetool-ai/config";
import { Asset, Project, Workspace as WorkspaceRow } from "@nodetool-ai/models";
import {
  WorkspacePathError,
  isReservedWorkspaceKey,
  type Workspace
} from "@nodetool-ai/runtime";
import { normalizeAssetContentType } from "@nodetool-ai/asset-services/asset-paths";
import {
  isProjectAssetPathInFlux,
  withProjectFolderLock
} from "@nodetool-ai/asset-services/project-asset";
import {
  ProjectFolderUnavailableError,
  WORKSPACE_OFFLINE_KEY,
  contentHashOfWorkspaceFile,
  isProjectAssetOffline,
  partialContentHashOfWorkspaceFile,
  requireProjectFolder,
  withWorkspaceFingerprint,
  type WorkspaceFingerprint
} from "@nodetool-ai/asset-services/project-asset-file";
import {
  THUMBNAIL_SOURCE_MAX_BYTES,
  assetHasRasterThumbnail,
  refreshAssetThumbnail
} from "@nodetool-ai/asset-services/thumbnail";
import { DebouncedRuns } from "./debounced-runs.js";
import { projectHashJob, scheduleProjectHashing } from "./project-hash-job.js";
import {
  flushAssetManifestWrites,
  scheduleAssetManifestWrite
} from "./project-manifest.js";

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

/**
 * Whether a change at `path` can never change the index: the path lies in
 * the directory NodeTool reserves or in a directory the scan does not enter.
 */
export function isIgnoredProjectPath(path: string): boolean {
  return isReservedWorkspaceKey(path) || isInSkippedDirectory(path);
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
async function scanFolder(
  workspace: Workspace,
  start = "",
  files = new Map<string, FolderFile>()
): Promise<Map<string, FolderFile>> {
  const directories = [start];
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

/** Create the row of a file that has none. Null when the file is unreadable. */
async function createRow(
  workspace: Workspace,
  userId: string,
  projectId: string,
  file: FolderFile
): Promise<Asset | null> {
  const hash = await hashFile(workspace, file.path);
  if (hash === null) return null;
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

/** A file a missing row is rematched to. */
interface MovedFile {
  file: FolderFile;
  /**
   * Whether the file's full hash was compared with the row's. A match by the
   * partial fingerprint alone leaves the row's full hash to be computed anew.
   */
  verified: boolean;
}

/**
 * Unindexed files by size and then by partial hash. A file is hashed the
 * first time a missing row of its size asks, and only then, so a folder with
 * no missing rows hashes nothing here. A file is read in full only when it
 * shares its partial fingerprint with another candidate of a row that has a
 * full hash.
 */
class MovedFileIndex {
  private readonly bySize = new Map<number, FolderFile[]>();
  private readonly byHash = new Map<number, Map<string, FolderFile[]>>();
  private readonly contentHashes = new Map<string, string | null>();

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

  /**
   * The unindexed files a missing row could have moved to: those of `size`
   * whose partial hash is `hash`. When there are several and the row has a
   * full hash, only those whose full hash equals `contentHash` remain.
   */
  async find(
    size: number,
    hash: string,
    contentHash: string | null
  ): Promise<MovedFile[]> {
    const candidates = await this.withPartialHash(size, hash);
    if (candidates.length < 2 || contentHash === null) {
      return candidates.map((file) => ({ file, verified: false }));
    }
    const matches: MovedFile[] = [];
    for (const file of candidates) {
      if ((await this.contentHashOf(file)) === contentHash) {
        matches.push({ file, verified: true });
      }
    }
    return matches;
  }

  /** The SHA-256 of the whole file, read once per reconcile at most. */
  private async contentHashOf(file: FolderFile): Promise<string | null> {
    const known = this.contentHashes.get(file.path);
    if (known !== undefined) return known;
    let hash: string | null = null;
    try {
      hash = await contentHashOfWorkspaceFile(this.workspace, file.path);
    } catch (error) {
      log.debug("Could not hash a project file in full", {
        path: file.path,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    this.contentHashes.set(file.path, hash);
    return hash;
  }

  private async withPartialHash(
    size: number,
    hash: string
  ): Promise<FolderFile[]> {
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

// ── What a reconcile looks at ───────────────────────────────────────────────

/** The files and rows one reconcile compares. */
interface ReconcileScope {
  /** Files that are there, by path. */
  files: Map<string, FolderFile>;
  /** Rows whose file is one of `files`, or should be among them. */
  rows: Asset[];
}

/** Time a path the folder refused is given before it is looked at again. */
const REFUSED_PATH_RETRY_MS = 50;

/**
 * What is at `path` now: a file, a directory, or nothing. A path the folder
 * refuses counts as nothing. It is asked twice, because a path inside a
 * directory that is being created at that moment can be refused once.
 */
async function probePath(
  workspace: Workspace,
  path: string
): Promise<FolderFile | "directory" | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const info = await workspace.stat(path);
      if (!info) return null;
      return info.isDirectory
        ? "directory"
        : { path, size: info.size, modifiedAt: info.modifiedAt };
    } catch (error) {
      if (!(error instanceof WorkspacePathError) || attempt > 0) return null;
      await new Promise((resolve) => setTimeout(resolve, REFUSED_PATH_RETRY_MS));
    }
  }
}

/** Whether `path` or one of the directories above it is in `directories`. */
function isAtOrUnder(path: string, directories: ReadonlySet<string>): boolean {
  if (directories.has(path)) return true;
  for (let slash = path.lastIndexOf("/"); slash > 0; ) {
    const parent = path.slice(0, slash);
    if (directories.has(parent)) return true;
    slash = parent.lastIndexOf("/");
  }
  return false;
}

/** The whole folder and every row of the project. */
async function wholeFolder(
  workspace: Workspace,
  userId: string,
  projectId: string
): Promise<ReconcileScope> {
  const files = await scanFolder(workspace);
  const rows = await Asset.listProjectFiles(userId, projectId);
  return { files, rows };
}

/**
 * The changed paths only. A path that is a file now is compared with its row.
 * A path that is a directory now stands for every file below it, since a
 * directory that was renamed or moved in reports itself and not its files. A
 * path with nothing at it stands for the rows at and below it, whose files
 * are gone. No other directory is listed and no other file is looked at.
 */
async function changedPaths(
  workspace: Workspace,
  userId: string,
  projectId: string,
  paths: Iterable<string>
): Promise<ReconcileScope> {
  const files = new Map<string, FolderFile>();
  /** Changed paths that are not a file: rows at or below them are in scope. */
  const places = new Set<string>();
  for (const raw of new Set(paths)) {
    let path: string;
    try {
      path = workspace.key(raw);
    } catch {
      // Outside the folder, or in the directory NodeTool reserves.
      continue;
    }
    if (isInSkippedDirectory(path)) continue;
    const found = await probePath(workspace, path);
    if (found === null) {
      places.add(path);
    } else if (found === "directory") {
      if (isSkippedDirectory(fileName(path))) continue;
      places.add(path);
      await scanFolder(workspace, path, files);
    } else {
      files.set(path, found);
    }
  }
  const all = await Asset.listProjectFiles(userId, projectId);
  const rows = all.filter((asset) => {
    const path = asset.workspace_path;
    return (
      path !== null && (files.has(path) || isAtOrUnder(path, places))
    );
  });
  return { files, rows };
}

/**
 * Replace the thumbnail of an asset whose file changed. A storage-backed
 * folder stages the file to read it, so a file too large to hold in memory
 * loses its thumbnail and gets no new one.
 */
async function refreshThumbnail(
  workspace: Workspace,
  asset: Asset,
  file: FolderFile
): Promise<void> {
  if (!assetHasRasterThumbnail(asset.content_type)) return;
  try {
    const readable =
      workspace.localDir !== null || file.size <= THUMBNAIL_SOURCE_MAX_BYTES;
    await refreshAssetThumbnail(
      asset.user_id,
      asset.id,
      asset.content_type,
      readable ? { path: await workspace.materialize(file.path) } : null
    );
  } catch (error) {
    log.warn("Could not refresh the thumbnail of a changed file", {
      assetId: asset.id,
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await workspace.cleanupScratch?.();
  }
}

// ── Changed files ───────────────────────────────────────────────────────────

/** Told about an asset whose file in the project folder has new contents. */
export type ProjectFileChangeListener = (asset: Asset) => void | Promise<void>;

const fileChangeListeners = new Set<ProjectFileChangeListener>();

/**
 * Call `listener` for every asset whose file the reconcile found changed,
 * after the row has its new fingerprint. A host registers what it derives
 * from the file and keeps elsewhere, such as a video proxy. The thumbnail is
 * replaced by the reconcile itself. Returns a function that removes the
 * listener.
 */
export function onProjectFileChanged(
  listener: ProjectFileChangeListener
): () => void {
  fileChangeListeners.add(listener);
  return () => fileChangeListeners.delete(listener);
}

async function notifyFileChanged(assets: readonly Asset[]): Promise<void> {
  for (const asset of assets) {
    for (const listener of fileChangeListeners) {
      try {
        await listener(asset);
      } catch (error) {
        log.warn("A project file change listener failed", {
          assetId: asset.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
}

// ── Reconcile ───────────────────────────────────────────────────────────────

export interface ReconcileOptions {
  /**
   * Project-relative paths that changed. The reconcile then looks at these
   * paths only: it lists no directory but a changed one and marks no row
   * offline whose file is not at or below one of them. Without it the whole
   * folder is scanned.
   */
  paths?: Iterable<string>;
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
  userId: string,
  options: ReconcileOptions = {}
): Promise<ProjectIndexReport> {
  const folder = await requireProjectFolder(projectId, userId);
  const { workspace } = folder;
  const project = folder.projectId;
  /** Rows whose file has new contents, for the change listeners. */
  const changed: Asset[] = [];

  const report = await withProjectFolderLock(userId, project, async () => {
    const report: ProjectIndexReport = {
      projectId: project,
      files: 0,
      unchanged: 0,
      updated: [],
      moved: [],
      offline: [],
      restored: [],
      created: []
    };
    const inFlux = (path: string): boolean =>
      isProjectAssetPathInFlux(userId, project, path);

    const { files, rows } = options.paths
      ? await changedPaths(workspace, userId, project, options.paths)
      : await wholeFolder(workspace, userId, project);
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
      if (unchanged === null) {
        // New contents. The full hash is of the old ones, and so is the
        // thumbnail, which is replaced before the row announces the change:
        // a client that hears of it must not fetch the old picture.
        asset.content_hash = null;
        await refreshThumbnail(workspace, asset, file);
      }
      if (await asset.saveIfMetadataMatches(read)) {
        (wasOffline ? report.restored : report.updated).push(asset.id);
        if (unchanged === null) changed.push(asset);
      }
    }

    // Rows whose file is gone: moved to exactly one unindexed file, or offline.
    if (missing.length > 0) {
      const unindexed = [...files.values()].filter(
        (file) => !indexed.has(file.path) && !inFlux(file.path)
      );
      const movedFiles = new MovedFileIndex(workspace, unindexed);
      // The one file each missing row could have moved to, when it has one.
      const targets = new Map<Asset, MovedFile & { hash: string }>();
      const claims = new Map<string, number>();
      for (const asset of missing) {
        const { size, hash } = recordedFingerprint(asset);
        if (size === null || hash === null) continue;
        const found = await movedFiles.find(size, hash, asset.content_hash);
        const target = found.length === 1 ? found[0] : undefined;
        if (!target) continue;
        targets.set(asset, { ...target, hash });
        claims.set(target.file.path, (claims.get(target.file.path) ?? 0) + 1);
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
          // The partial fingerprint alone does not prove the middle of the
          // file is the same, so the hash job reads the file again.
          if (!target.verified) asset.content_hash = null;
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
    for (const file of files.values()) {
      if (indexed.has(file.path) || inFlux(file.path)) continue;
      if (!INDEXED_MEDIA.test(contentTypeOfFile(file.path))) continue;
      const asset = await createRow(workspace, userId, project, file);
      if (asset) report.created.push(asset.id);
    }

    if (!options.paths) {
      lastReconciled.set(scheduleKey(project, userId), Date.now());
    }
    return report;
  });

  await notifyFileChanged(changed);
  return report;
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
    const asset = await createRow(workspace, userId, project, file);
    if (!asset) throw new Error(`The file ${key} could not be read`);
    return asset;
  });
}

// ── Triggers ────────────────────────────────────────────────────────────────

/** Quiet time after the last folder change before the reconcile runs, in ms. */
export const RECONCILE_DEBOUNCE_MS = 500;
/** Longest a reconcile waits while changes keep arriving, in ms. */
export const RECONCILE_MAX_WAIT_MS = 5_000;
/** A project opened again within this time is not scanned again, in ms. */
export const OPEN_RECONCILE_INTERVAL_MS = 10_000;

const lastReconciled = new Map<string, number>();

function scheduleKey(projectId: string, userId: string): string {
  return `${userId}\u0000${projectId}`;
}

/** Log what stopped a background reconcile. */
export function logReconcileFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  // A folder that is away is reported where the project is shown.
  if (error instanceof ProjectFolderUnavailableError) {
    log.debug("Skipped reconciling a project folder", { reason: message });
  } else {
    log.warn("Reconciling a project folder failed", { error: message });
  }
}

const reconciles = new DebouncedRuns({
  debounceMs: RECONCILE_DEBOUNCE_MS,
  maxWaitMs: RECONCILE_MAX_WAIT_MS,
  onError: logReconcileFailure
});

/**
 * Reconcile as a background trigger does: bring the rows in line, then write
 * the folder's asset manifest and hash the files that have no full hash yet,
 * both in the background.
 */
export async function reconcileInBackground(
  projectId: string,
  userId: string,
  options: ReconcileOptions = {}
): Promise<ProjectIndexReport> {
  const report = await reconcileProjectIndex(projectId, userId, options);
  scheduleAssetManifestWrite(report.projectId, userId);
  scheduleProjectHashing(report.projectId, userId);
  return report;
}

/** Reconcile the project's folder soon, debounced. Never throws. */
export function scheduleProjectReconcile(
  projectId: string,
  userId: string
): void {
  reconciles.schedule(`project\u0000${scheduleKey(projectId, userId)}`, async () => {
    await reconcileInBackground(projectId, userId);
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
  reconciles.schedule(`workspace\u0000${scheduleKey(workspaceId, userId)}`, async () => {
    const row = await WorkspaceRow.find(userId, workspaceId);
    if (!row) return;
    const project = await Project.findOwned(userId, row.project_id);
    if (!project || project.workspace_id !== row.id) return;
    await reconcileInBackground(project.id, userId);
  });
}

/**
 * Run every scheduled reconcile now and wait for it and for the work it
 * starts in the background: the hash job and the manifest writes.
 */
export async function flushProjectReconciles(): Promise<void> {
  await reconciles.flush();
  await projectHashJob.idle();
  await flushAssetManifestWrites();
}

/** The asset index of a project folder. */
export const ProjectIndex = {
  reconcile: reconcileProjectIndex,
  ensureAssetForPath,
  schedule: scheduleProjectReconcile,
  scheduleForWorkspace: scheduleWorkspaceReconcile,
  onProjectOpen: reconcileProjectOnOpen,
  onFileChanged: onProjectFileChanged,
  flush: flushProjectReconciles
} as const;
