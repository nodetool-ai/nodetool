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
 * | File absent, exactly one unindexed file has the same fingerprint | Row | Update `workspace_path` to that file and the name to its file name. |
 * | File absent, no match or several matches | Row | Mark offline. |
 * | Image, video, audio, or 3D file present | No row | Create a row, after the thumbnail of an image, video or audio file. |
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
 * storage-backed folder reconcile the same way. Each local directory is
 * listed once, and a folder in object storage with one flat listing. Rows are loaded in one query and compared through a path map, and a
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
 * and NodeTool's own writes do that: it then looks at those paths only and
 * scans nothing else.
 *
 * A file that is still being written for an asset is in flux and gets no
 * row: a rename or a change of file type waiting for its row, the copy of an
 * asset moving in from the asset store, and the file a collect reserved for
 * a linked asset. The last two are recorded on the row, so they hold after a
 * crash too.
 */
import { createLogger } from "@nodetool-ai/config";
import {
  Asset,
  Project,
  Workspace as WorkspaceRow,
  moveTargetOf
} from "@nodetool-ai/models";
import type { Workspace } from "@nodetool-ai/runtime";
import { normalizeAssetContentType } from "@nodetool-ai/asset-services/asset-paths";
import {
  isProjectAssetPathInFlux,
  pendingCollectReservations,
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
  refreshAssetThumbnail,
  storeAssetThumbnail
} from "@nodetool-ai/asset-services/thumbnail";
import { DebouncedRuns } from "./debounced-runs.js";
import { reconcileDocumentFiles } from "./document-file-sync.js";
import {
  COPY_GRACE_MS,
  NestedFolders,
  isAtOrUnder,
  isInSkippedDirectory,
  scanChangedPaths,
  scanFolder,
  type FolderFile,
  type ReconcileOptions,
  type ScannedFolder
} from "./project-folder-scan.js";
import { projectHashJob, scheduleProjectHashing } from "./project-hash-job.js";
import {
  flushAssetManifestWrites,
  scheduleAssetManifestWrite
} from "./project-manifest.js";
import { storyboardFileAdapter } from "./storyboard-file.js";
import { scriptFileAdapter } from "./script-file.js";
import { timelineFileAdapter } from "./timeline-file.js";
import { workflowFileAdapter } from "./workflow-file.js";

// How the folder is read lives in `project-folder-scan.ts`, which the
// document file sync reads it through as well. The names stay available here.
export {
  COPY_GRACE_MS,
  NestedFolders,
  isAtOrUnder,
  isIgnoredProjectPath,
  probePath,
  scanChangedPaths,
  scanFolder,
  type FolderFile,
  type ReconcileOptions,
  type ScannedFolder
} from "./project-folder-scan.js";

const log = createLogger("nodetool.project-services.project-index");

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

/** The content type a file in a project folder gets from its name. */
export function contentTypeOfFile(path: string): string {
  const name = fileName(path);
  const inferred = normalizeAssetContentType("", name);
  if (inferred !== "application/octet-stream") return inferred;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return DOCUMENT_TYPES[extension] ?? inferred;
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

/**
 * Create the row of a file that has none. `hash` is its partial hash. A file
 * that gets a thumbnail when it is saved through NodeTool gets one here as
 * well, stored before the row exists: a client that hears of the new row
 * finds its picture.
 */
async function createRow(
  workspace: Workspace,
  userId: string,
  projectId: string,
  file: FolderFile,
  hash: string
): Promise<Asset> {
  const asset = new Asset({
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
  await storeThumbnail(workspace, asset, file);
  return Asset.create<Asset>(asset.toRow());
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
  /** The project's other rows, which this reconcile does not compare. */
  others: Asset[];
  /**
   * The changed paths that are not a file: what was at or below them is
   * gone, or they are directories. Null when the whole folder was scanned.
   */
  places: ReadonlySet<string> | null;
}

/** The whole folder and every row of the project. */
async function wholeFolder(
  workspace: Workspace,
  userId: string,
  projectId: string
): Promise<ReconcileScope> {
  const files = await scanFolder(workspace);
  const rows = await Asset.listProjectFiles(userId, projectId);
  return { files, rows, others: [], places: null };
}

/**
 * The changed paths only, as {@link scanChangedPaths} reads them. A file is
 * compared with its row, and the rows at and below a path that is not a file
 * are in scope.
 *
 * A row marked offline is compared wherever its file was. The file a changed
 * path names may be the one that row lost, in an earlier set of changes or
 * while the project was closed, and the row must get it back under its id.
 */
async function changedPaths(
  workspace: Workspace,
  userId: string,
  projectId: string,
  paths: Iterable<string>
): Promise<ReconcileScope> {
  const { files, places } = await scanChangedPaths(workspace, paths);
  const rows: Asset[] = [];
  const others: Asset[] = [];
  for (const asset of await Asset.listProjectFiles(userId, projectId)) {
    const path = asset.workspace_path;
    const inScope =
      path !== null &&
      (files.has(path) ||
        isAtOrUnder(path, places) ||
        isProjectAssetOffline(asset));
    (inScope ? rows : others).push(asset);
  }
  return { files, rows, others, places };
}

/**
 * Where a thumbnail of `file` is made from. A storage-backed folder stages
 * the file to read it, so a file too large to hold in memory has none.
 */
async function thumbnailSource(
  workspace: Workspace,
  file: FolderFile
): Promise<{ path: string } | null> {
  const readable =
    workspace.localDir !== null || file.size <= THUMBNAIL_SOURCE_MAX_BYTES;
  return readable ? { path: await workspace.materialize(file.path) } : null;
}

/**
 * Replace the thumbnail of an asset whose file changed. A file too large to
 * stage loses its thumbnail and gets no new one.
 */
async function refreshThumbnail(
  workspace: Workspace,
  asset: Asset,
  file: FolderFile
): Promise<void> {
  if (!assetHasRasterThumbnail(asset.content_type)) return;
  try {
    await refreshAssetThumbnail(
      asset.user_id,
      asset.id,
      asset.content_type,
      await thumbnailSource(workspace, file)
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

/** Store the first thumbnail of an asset whose row is about to be created. */
async function storeThumbnail(
  workspace: Workspace,
  asset: Asset,
  file: FolderFile
): Promise<void> {
  if (!assetHasRasterThumbnail(asset.content_type)) return;
  try {
    const source = await thumbnailSource(workspace, file);
    if (source) {
      await storeAssetThumbnail(asset.user_id, asset.id, asset.content_type, source);
    }
  } catch (error) {
    log.warn("Could not make the thumbnail of a new file", {
      path: file.path,
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

// ── Changed folders ─────────────────────────────────────────────────────────

/** Told that the files of a project folder changed, or the rows naming them. */
export type ProjectFolderChangeListener = (change: {
  projectId: string;
  userId: string;
}) => void;

const folderChangeListeners = new Set<ProjectFolderChangeListener>();

/**
 * Call `listener` when a reconcile changed rows of a project folder, and when
 * the folder watcher saw another app change files in it. A host pushes this
 * to the clients showing the folder's files, which NodeTool's own writes
 * already reach. Returns a function that removes the listener.
 */
export function onProjectFolderChanged(
  listener: ProjectFolderChangeListener
): () => void {
  folderChangeListeners.add(listener);
  return () => folderChangeListeners.delete(listener);
}

/** Tell every {@link onProjectFolderChanged} listener. Never throws. */
export function notifyProjectFolderChanged(projectId: string, userId: string): void {
  for (const listener of folderChangeListeners) {
    try {
      listener({ projectId, userId });
    } catch (error) {
      log.warn("A project folder change listener failed", {
        projectId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

/** Whether a reconcile changed, created or marked any row. */
export function reportChangedRows(report: ProjectIndexReport): boolean {
  return (
    report.updated.length > 0 ||
    report.moved.length > 0 ||
    report.offline.length > 0 ||
    report.restored.length > 0 ||
    report.created.length > 0
  );
}

// ── Reconcile ───────────────────────────────────────────────────────────────

/**
 * The rows whose file is present, by fingerprint, for telling whether a media
 * file with no row has the content of an indexed file. Each row's path is
 * looked at again at most once per fingerprint, so the cost stays linear.
 */
class CopiedFiles {
  private byFingerprint: Map<string, Asset[]> | null = null;
  private readonly checked = new Map<string, { gone: Asset[] }>();

  /** `isPresent` says whether the file at a row's path was there. */
  constructor(
    private readonly workspace: Workspace,
    private readonly rows: readonly Asset[],
    private readonly isPresent: (path: string) => boolean
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
        if (!path || !this.isPresent(path)) continue;
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
  userId: string,
  options: ReconcileOptions = {}
): Promise<ProjectIndexReport> {
  return (await reconcileAndScan(projectId, userId, options)).report;
}

/** {@link reconcileProjectIndex}, with what it found in the folder. */
async function reconcileAndScan(
  projectId: string | null | undefined,
  userId: string,
  options: ReconcileOptions
): Promise<{ report: ProjectIndexReport; scanned: ScannedFolder }> {
  const folder = await requireProjectFolder(projectId, userId);
  const { workspace } = folder;
  const project = folder.projectId;
  /** Rows whose file has new contents, for the change listeners. */
  const changed: Asset[] = [];
  let scanned: ScannedFolder = { files: new Map(), places: null, workspace };

  const report = await withProjectFolderLock(userId, project, async () => {
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
    // The copy of an asset whose bytes are moving in from the asset store
    // has no row until the move names it. After a restart that copy can be
    // in the folder with the move unfinished, and it must not become a
    // second asset, so its path is left alone like a path in flux.
    const moving = new Set(
      (await Asset.findMovingTo(userId, project)).map(moveTargetOf)
    );
    // The file a collect reserved for a linked asset is that asset's until
    // the copy is verified. A collect that crashed during the copy leaves it
    // behind, partly written, and the next collect writes it again.
    const collecting = await pendingCollectReservations(userId, project);
    const inFlux = (path: string): boolean =>
      isProjectAssetPathInFlux(userId, project, path) ||
      moving.has(path) ||
      collecting.has(path);

    const projectKey = scheduleKey(project, userId);
    const waitingSince = waitingCopies.get(projectKey);
    // A file waiting for its row is looked at with every set of changed
    // paths: the delete that ends its move names only the file that went.
    const { files, rows, others, places } = options.paths
      ? await changedPaths(workspace, userId, project, [
          ...options.paths,
          ...[...(waitingSince?.keys() ?? [])].map(waitingPath)
        ])
      : await wholeFolder(workspace, userId, project);
    report.files = files.size;
    scanned = { files, places, workspace };

    // Rows whose file is where they say.
    const indexed = new Set<string>();
    const missing: Asset[] = [];
    const nested = new NestedFolders(workspace);
    for (const asset of rows) {
      const path = asset.workspace_path;
      if (!path || inFlux(path)) continue;
      // The scan does not enter every directory. A row may still name a file
      // in one, and that file is looked at on its own. A file in the folder
      // of another project is that project's: the row counts as having lost
      // its file, and the file is not read.
      const file =
        files.get(path) ??
        (isInSkippedDirectory(path) && !(await nested.holds(path))
          ? await statFile(workspace, path)
          : null);
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
          // The file on disk is the truth: a renamed file renames its asset.
          asset.name = fileName(target.file.path);
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
    // A row this reconcile did not compare counts as present unless it is
    // marked offline. Its path is looked at before a file is taken for a copy.
    const otherPaths = new Set<string>();
    for (const asset of others) {
      const path = asset.workspace_path;
      if (path && !isProjectAssetOffline(asset)) otherPaths.add(path);
    }
    const copies = new CopiedFiles(
      workspace,
      [...rows, ...others],
      (path) => indexed.has(path) || otherPaths.has(path)
    );
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
          moved.name = fileName(file.path);
          moved.metadata = withWorkspaceFingerprint(
            read,
            fingerprintOf(file, hash)
          );
          // Matched by the partial fingerprint: the hash job reads it again.
          moved.content_hash = null;
          indexed.add(file.path);
          originals.gone.length = 0;
          if (await moved.saveIfMetadataMatches(read)) {
            report.moved.push(moved.id);
          }
          continue;
        }
        const waitKey = waitingKey(file.path, hash);
        const since = waitingSince?.get(waitKey) ?? Date.now();
        // Several rows lost their file at once: the next pass sorts them
        // out by the rule for missing files. Otherwise the copy waits.
        if (originals.gone.length > 1 || Date.now() - since < COPY_GRACE_MS) {
          stillWaiting.set(waitKey, since);
          report.deferred.push(file.path);
          continue;
        }
      }
      const asset = await createRow(workspace, userId, project, file, hash);
      indexed.add(file.path);
      report.created.push(asset.id);
    }
    if (stillWaiting.size > 0) {
      waitingCopies.set(projectKey, stillWaiting);
      scheduleFollowUp(project, userId);
    } else {
      waitingCopies.delete(projectKey);
    }

    if (!options.paths) lastReconciled.set(projectKey, Date.now());
    return report;
  });

  await notifyFileChanged(changed);
  return { report, scanned };
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
    if (await new NestedFolders(workspace).holds(key)) {
      throw new Error(
        `The file ${key} is in the folder of another project and gets no asset in this one`
      );
    }
    const existing = await Asset.findByWorkspacePath(userId, project, key);
    if (existing[0]) return existing[0];
    // A file that is the unfinished copy of an asset moving in from the
    // asset store is that asset's. A second row would take its name.
    const [moving] = await Asset.findMovingTo(userId, project, key);
    if (moving) return moving;
    // The same for a file a collect reserved for a linked asset.
    const collecting = (await pendingCollectReservations(userId, project)).get(key);
    if (collecting) return collecting;
    const file = await statFile(workspace, key);
    if (!file) throw new Error(`No file at ${key} in the project folder`);
    const hash = await hashFile(workspace, key);
    if (hash === null) throw new Error(`The file ${key} could not be read`);
    return createRow(workspace, userId, project, file, hash);
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
/** Per project: when each waiting copy (`path`, NUL, hash) was first seen. */
const waitingCopies = new Map<string, Map<string, number>>();

function waitingKey(path: string, hash: string): string {
  return `${path}\u0000${hash}`;
}

/** The path of a waiting copy, from its key. */
function waitingPath(key: string): string {
  return key.slice(0, key.indexOf("\u0000"));
}

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
 * both in the background. The documents that are files in the folder are
 * reconciled with their files in the same pass.
 */
export async function reconcileInBackground(
  projectId: string,
  userId: string,
  options: ReconcileOptions = {}
): Promise<ProjectIndexReport> {
  const { report, scanned } = await reconcileAndScan(projectId, userId, options);
  if (reportChangedRows(report)) notifyProjectFolderChanged(report.projectId, userId);
  scheduleAssetManifestWrite(report.projectId, userId);
  scheduleProjectHashing(report.projectId, userId);
  // The documents that are files in the folder follow the same triggers, and
  // are compared with the files this reconcile found. A failure there leaves
  // the asset index as it was reconciled.
  try {
    await reconcileDocumentFiles(
      [workflowFileAdapter, timelineFileAdapter, storyboardFileAdapter,
        scriptFileAdapter
      ],
      report.projectId,
      userId,
      {
        scanned,
        // A copy of a document file waits to be told apart from a move.
        onDeferred: () => scheduleFollowUp(report.projectId, userId)
      }
    );
  } catch (error) {
    logReconcileFailure(error);
  }
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
 * Reconcile the project again once {@link COPY_GRACE_MS} has passed, unless a
 * reconcile is already scheduled. That one schedules the next when files are
 * still waiting.
 */
function scheduleFollowUp(projectId: string, userId: string): void {
  reconciles.scheduleUnlessPending(
    `project\u0000${scheduleKey(projectId, userId)}`,
    COPY_GRACE_MS,
    async () => {
      await reconcileInBackground(projectId, userId);
    }
  );
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

/** More written paths than this are reconciled as one scan of the folder. */
export const WRITE_MAX_PATHS = 2_000;

/**
 * Per workspace: the paths NodeTool wrote since the last reconcile, or null
 * when there were too many or one was not named, and the folder is scanned.
 */
const writtenPaths = new Map<string, Set<string> | null>();

/**
 * Reconcile after NodeTool wrote in the workspace `workspaceId`, debounced.
 * Nothing happens unless that workspace is the folder of one of the user's
 * projects. Never throws.
 *
 * `path` is the workspace-relative path written, created, moved to or
 * removed. The reconcile then looks at the written paths only, as the folder
 * watcher's does. Without one the whole folder is scanned.
 */
export function scheduleWorkspaceReconcile(
  workspaceId: string,
  userId: string,
  path?: string
): void {
  const key = `workspace\u0000${scheduleKey(workspaceId, userId)}`;
  const paths = writtenPaths.has(key) ? writtenPaths.get(key) ?? null : new Set<string>();
  if (paths !== null && path !== undefined && paths.size < WRITE_MAX_PATHS) {
    paths.add(path);
    writtenPaths.set(key, paths);
  } else {
    writtenPaths.set(key, null);
  }
  reconciles.schedule(key, async () => {
    const written = writtenPaths.get(key) ?? null;
    writtenPaths.delete(key);
    const row = await WorkspaceRow.find(userId, workspaceId);
    if (!row) return;
    const project = await Project.findOwned(userId, row.project_id);
    if (!project || project.workspace_id !== row.id) return;
    await reconcileInBackground(project.id, userId, written ? { paths: written } : {});
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

/** Drop every scheduled reconcile without running it. */
export function cancelProjectReconciles(): void {
  reconciles.cancelAll();
  writtenPaths.clear();
}

/** The asset index of a project folder. */
export const ProjectIndex = {
  reconcile: reconcileProjectIndex,
  ensureAssetForPath,
  schedule: scheduleProjectReconcile,
  scheduleForWorkspace: scheduleWorkspaceReconcile,
  onProjectOpen: reconcileProjectOnOpen,
  onFileChanged: onProjectFileChanged,
  flush: flushProjectReconciles,
  cancel: cancelProjectReconciles
} as const;
