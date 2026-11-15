/**
 * Assets as files in a project folder (PRD T3).
 *
 * `saveProjectAsset` is the one function that creates such an asset: it
 * writes the file once through the project's `Workspace`, then creates the
 * index row with `project_id` and `workspace_path`. The other functions keep
 * the file and the row together when the asset is renamed, its bytes are
 * replaced, or it is deleted.
 *
 * Every step is ordered so that a failure never loses a file and never
 * leaves a row pointing at nothing: a new file is written before the row
 * that names it, and an old file is removed only after the row has moved on.
 */
import { createLogger } from "@nodetool-ai/config";
import { Asset, setAssetFileMover } from "@nodetool-ai/models";
import { readFile } from "node:fs/promises";
import { getAssetFileName, isNonEmptyString } from "@nodetool-ai/protocol";
import type { Workspace } from "@nodetool-ai/runtime";
import { probeAssetDurationSeconds } from "./asset-duration.js";
import { normalizeAssetContentType } from "./asset-paths.js";
import {
  EXTERNAL_FINGERPRINT_KEYS,
  verifiedExternalPath
} from "./external-asset-lookup.js";
import {
  localProjectAssetPath,
  partialContentHash,
  partialContentHashOfFile,
  partialContentHashOfWorkspaceFile,
  requireProjectAssetFile,
  requireProjectFolder,
  withWorkspaceFingerprint,
  type WorkspaceFingerprint
} from "./project-asset-file.js";
import { storeAssetThumbnail, type ThumbnailSource } from "./thumbnail.js";

const log = createLogger("nodetool.asset-services.project-asset");

/** Where workflow and agent outputs go. The directory stays flat. */
export const GENERATED_DIRECTORY = "Generated";
/** Where imported files go. */
export const IMPORTED_DIRECTORY = "Imported";

/**
 * The directory an uploaded file is saved in: the directory it was dropped on
 * in the Files tree, relative to the project folder, with `.` naming the
 * folder itself. An upload that names none goes to {@link IMPORTED_DIRECTORY}.
 */
export function uploadDirectory(dropped: string | null | undefined): string {
  if (dropped === null || dropped === undefined) return IMPORTED_DIRECTORY;
  const trimmed = dropped.trim();
  return trimmed === "." || trimmed === "/" ? "" : trimmed || IMPORTED_DIRECTORY;
}

/** File name used when an asset name has no character a file can carry. */
const UNNAMED_FILE = "asset";
/** Longest file name stem, in characters, before the collision suffix. */
const MAX_FILE_STEM = 100;
/** Highest collision suffix tried before giving up. */
const MAX_FILE_SUFFIX = 100_000;

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** What made the asset. Stored on the row. */
export interface AssetProvenance {
  workflow_id?: string | null;
  node_id?: string | null;
  job_id?: string | null;
  timeline_id?: string | null;
}

export type SaveProjectAssetArgs = {
  /** The project whose folder gets the file. Null names Personal. */
  projectId: string | null | undefined;
  userId: string;
  /** The asset's name. The file name is derived from it. */
  name: string;
  contentType: string;
  /**
   * Directory in the project folder, used when `path` is absent. Defaults to
   * {@link GENERATED_DIRECTORY}. An import passes {@link IMPORTED_DIRECTORY}.
   */
  directory?: string;
  /**
   * Exact project-relative path, when the caller chose one. The file there is
   * replaced, and an asset that already names it is updated instead of a
   * second row being created for one file.
   */
  path?: string;
  provenance?: AssetProvenance;
  /** Asset folder row the asset is listed under. */
  parentId?: string | null;
  /** Stored on the row next to the file fingerprint. */
  metadata?: Record<string, unknown> | null;
  /**
   * A row that already exists and gets this file, instead of a new row: an
   * upload whose row was created before its bytes arrived. It must belong to
   * `userId` and have no file yet, and `path` must not name a file another
   * row already has.
   */
  asset?: Asset;
} & ({ bytes: Uint8Array } | { localPath: string });

/** The extension an asset of `contentType` is stored with. */
export function assetFileExtension(contentType: string): string {
  const fileName = getAssetFileName("x", contentType);
  return fileName.slice(fileName.lastIndexOf(".") + 1);
}

/**
 * A readable file name stem for an asset name, valid on every desktop OS.
 *
 * Path separators, characters Windows refuses and control characters are
 * dropped, and each run of whitespace becomes one dash: `fox in snow` is
 * `fox-in-snow`. An extension the name already carries for the same content
 * type is removed so it is not doubled. Leading dots (a hidden file) and
 * trailing dots (refused by Windows) are dropped. A Windows device name gets
 * a suffix.
 */
export function projectAssetFileStem(name: string, contentType: string): string {
  const extension = assetFileExtension(contentType);
  let cleaned = name
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex -- control characters are the point
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
    .trim();
  const dot = cleaned.lastIndexOf(".");
  if (dot > 0) {
    const carried = cleaned.slice(dot + 1).toLowerCase();
    const carriedType = normalizeAssetContentType("", cleaned);
    if (
      carried === extension ||
      (carriedType !== "application/octet-stream" &&
        assetFileExtension(carriedType) === extension)
    ) {
      cleaned = cleaned.slice(0, dot);
    }
  }
  const stem = Array.from(
    cleaned.replace(/\s+/g, "-").replace(/^[.-]+/, "")
  )
    .slice(0, MAX_FILE_STEM)
    .join("")
    .replace(/[.-]+$/, "");
  if (!stem) return UNNAMED_FILE;
  return WINDOWS_RESERVED.test(stem) ? `${stem}-file` : stem;
}

// ── One writer per folder ───────────────────────────────────────────────────

const folderQueues = new Map<string, Promise<unknown>>();

/**
 * Run `task` after every earlier task for the same project folder. Choosing a
 * free file name and writing the file are two steps, and two saves of the
 * same name that interleave would pick the same name and write one file over
 * the other. This serializes them within the process. The reconciler runs
 * under the same lock, so it never sees a file whose row is still being made.
 */
export function withProjectFolderLock<T>(
  userId: string,
  projectId: string,
  task: () => Promise<T>
): Promise<T> {
  const key = `${userId}\u0000${projectId}`;
  const previous = folderQueues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  const settled = next.catch(() => undefined);
  folderQueues.set(key, settled);
  void settled.then(() => {
    if (folderQueues.get(key) === settled) folderQueues.delete(key);
  });
  return next;
}

// ── Paths in flux ───────────────────────────────────────────────────────────

const pathsInFlux = new Map<string, number>();

function fluxKey(userId: string, projectId: string, path: string): string {
  return `${userId}\u0000${projectId}\u0000${path}`;
}

/**
 * Mark `paths` as in flux until the returned function is called. A rename or
 * a change of file type writes the new file under the folder lock, but its
 * row is saved and the old file removed after the lock is released. Until
 * then the folder holds a file with no row. The reconciler leaves a path in
 * flux alone, so it never indexes that file as a second asset.
 */
function holdPaths(
  userId: string,
  projectId: string,
  paths: readonly string[]
): () => void {
  const keys = paths.map((path) => fluxKey(userId, projectId, path));
  for (const key of keys) pathsInFlux.set(key, (pathsInFlux.get(key) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const key of keys) {
      const held = (pathsInFlux.get(key) ?? 1) - 1;
      if (held > 0) pathsInFlux.set(key, held);
      else pathsInFlux.delete(key);
    }
  };
}

/** Whether a NodeTool change to the file at `path` is waiting for its row. */
export function isProjectAssetPathInFlux(
  userId: string,
  projectId: string,
  path: string
): boolean {
  return pathsInFlux.has(fluxKey(userId, projectId, path));
}

// ── Paths ───────────────────────────────────────────────────────────────────

function splitPath(path: string): {
  directory: string;
  stem: string;
  extension: string;
} {
  const slash = path.lastIndexOf("/");
  const directory = slash >= 0 ? path.slice(0, slash) : "";
  const fileName = path.slice(slash + 1);
  const dot = fileName.lastIndexOf(".");
  return dot > 0
    ? {
        directory,
        stem: fileName.slice(0, dot),
        extension: fileName.slice(dot + 1)
      }
    : { directory, stem: fileName, extension: "" };
}

function joinPath(directory: string, fileName: string): string {
  return directory ? `${directory}/${fileName}` : fileName;
}

/**
 * Write `bytes` to a new file in `directory` named after `stem`, and return
 * its path: `stem.ext`, or `stem-2.ext`, `stem-3.ext` and so on when the name
 * is in use. An existing file is never replaced.
 *
 * Each candidate is written with `Workspace.writeNew`, an exclusive create.
 * When another writer, in this process or another one sharing the database,
 * took the name first, the create fails and the next name is tried, so two
 * saves of one name always end as two files.
 *
 * The directory is listed once to skip names already taken, and names
 * compare without case, because macOS and Windows folders ignore it. A name
 * is also skipped when an asset row still records it although its file is
 * gone, so a new asset never takes over the path of one that is missing.
 */
async function claimFile(
  workspace: Workspace,
  owner: { userId: string; projectId: string },
  directory: string,
  stem: string,
  extension: string,
  bytes: Uint8Array,
  contentType: string
): Promise<string> {
  const taken = new Set(
    (await workspace.list(directory)).map((entry) => entry.name.toLowerCase())
  );
  const suffix = extension ? `.${extension}` : "";
  for (let n = 1; n <= MAX_FILE_SUFFIX; n++) {
    const fileName = `${n === 1 ? stem : `${stem}-${n}`}${suffix}`;
    if (taken.has(fileName.toLowerCase())) continue;
    const path = workspace.key(joinPath(directory, fileName));
    const rows = await Asset.findByWorkspacePath(
      owner.userId,
      owner.projectId,
      path
    );
    if (rows.length > 0) continue;
    if (await workspace.writeNew(path, bytes, contentType)) return path;
  }
  throw new Error(
    `No free file name for "${stem}${suffix}" in ${directory || "the project folder"}`
  );
}

/** The bytes of a file an asset row names. Throws when the file is gone. */
async function readFileOf(
  workspace: Workspace,
  path: string
): Promise<Uint8Array> {
  const bytes = await workspace.read(path);
  if (bytes === null) {
    throw new Error(`The file ${path} is not in the project folder`);
  }
  return bytes;
}

async function fingerprintOf(
  workspace: Workspace,
  path: string,
  hash: string
): Promise<WorkspaceFingerprint> {
  const info = await workspace.stat(path);
  if (!info || info.isDirectory) {
    throw new Error(`The file ${path} is not in the project folder after it was written`);
  }
  return {
    workspace_size: info.size,
    workspace_mtime: info.modifiedAt,
    workspace_hash: hash
  };
}

async function removeFile(
  workspace: Workspace,
  path: string,
  why: string
): Promise<void> {
  try {
    await workspace.delete(path);
  } catch (error) {
    log.warn(why, {
      path,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// ── Create ──────────────────────────────────────────────────────────────────

/**
 * Create an asset as one file in its project's folder plus an index row.
 *
 * The file name comes from `name`, sanitized, with the extension of the
 * content type, and a name already in use gets a numeric suffix. The row
 * records the file's size, mtime and partial content hash in `metadata`.
 * Nothing is written under the legacy asset storage key.
 *
 * Throws when the project folder is missing or unreachable. The bytes are
 * never written anywhere else.
 */
export async function saveProjectAsset(
  args: SaveProjectAssetArgs
): Promise<Asset> {
  const folder = await requireProjectFolder(args.projectId, args.userId);
  const { workspace, projectId } = folder;
  const contentType = normalizeAssetContentType(args.contentType, args.name);
  const source: ThumbnailSource =
    "bytes" in args ? { bytes: args.bytes } : { path: args.localPath };

  return withProjectFolderLock(args.userId, projectId, async () => {
    const exactPath = args.path !== undefined ? workspace.key(args.path) : null;
    // A file the caller named may already have its asset. That row is
    // updated, so one file never has two rows that could each delete it.
    const atPath = exactPath
      ? await Asset.findByWorkspacePath(args.userId, projectId, exactPath)
      : [];
    if (args.asset) {
      if (args.asset.user_id !== args.userId) {
        throw new Error("The asset belongs to another user");
      }
      // Its file would be left in the folder with no row naming it.
      if (args.asset.workspace_path) {
        throw new Error(
          `The asset already has the file ${args.asset.workspace_path}`
        );
      }
      if (atPath.some((row) => row.id !== args.asset?.id)) {
        throw new Error(`Another asset already has the file ${exactPath}`);
      }
    }
    const existing = args.asset ? [args.asset] : atPath;

    let path: string;
    if (exactPath) {
      // The caller chose this file, so it is replaced.
      path = exactPath;
      if ("bytes" in source) {
        await workspace.write(path, source.bytes, contentType);
      } else {
        await workspace.absorb(source.path, path);
      }
    } else {
      const directory = (args.directory ?? GENERATED_DIRECTORY).trim();
      path = await claimFile(
        workspace,
        { userId: args.userId, projectId },
        directory ? workspace.key(directory) : "",
        projectAssetFileStem(args.name, contentType),
        assetFileExtension(contentType),
        "bytes" in source
          ? source.bytes
          : new Uint8Array(await readFile(source.path)),
        contentType
      );
    }

    try {
      const fingerprint = await fingerprintOf(
        workspace,
        path,
        "bytes" in source
          ? partialContentHash(source.bytes)
          : await partialContentHashOfFile(source.path)
      );
      const asset =
        existing[0] ??
        new Asset({
          user_id: args.userId,
          project_id: projectId,
          parent_id: args.parentId ?? null
        });
      asset.name = args.name;
      asset.content_type = contentType;
      asset.workspace_path = path;
      asset.size = fingerprint.workspace_size;
      asset.duration = await probeAssetDurationSeconds(contentType, source);
      asset.metadata = withWorkspaceFingerprint(
        { ...(existing[0]?.metadata ?? {}), ...(args.metadata ?? {}) },
        fingerprint
      );
      const provenance = args.provenance ?? {};
      if (!existing[0] || provenance.workflow_id !== undefined) {
        asset.workflow_id = provenance.workflow_id ?? null;
      }
      if (!existing[0] || provenance.node_id !== undefined) {
        asset.node_id = provenance.node_id ?? null;
      }
      if (!existing[0] || provenance.job_id !== undefined) {
        asset.job_id = provenance.job_id ?? null;
      }
      if (!existing[0] || provenance.timeline_id !== undefined) {
        asset.timeline_id = provenance.timeline_id ?? null;
      }
      asset.project_id = projectId;
      await storeAssetThumbnail(asset.user_id, asset.id, contentType, source);
      await asset.save();
      return asset;
    } catch (error) {
      // No row names the file. A file this call named itself is removed. A
      // path the caller chose is left alone: it is the caller's file.
      if (!exactPath) {
        await removeFile(
          workspace,
          path,
          "Could not remove the file of an asset that was not saved"
        );
      }
      throw error;
    }
  });
}

// ── Change ──────────────────────────────────────────────────────────────────

/**
 * A change to an asset's file that is waiting for its row. The asset already
 * carries the new `workspace_path` and fingerprint. Save the row, then call
 * `commit`. Call `undo` when the row was not saved.
 */
export interface ProjectAssetFileChange {
  /** Remove what the change replaced. Call after the row is saved. */
  commit(): Promise<void>;
  /** Remove what the change wrote and restore the asset's fields. */
  undo(): Promise<void>;
}

/**
 * Rename the file of `asset` to match `name`, keeping its directory and
 * extension. Null when the asset keeps no file in a project folder or the
 * file name does not change.
 *
 * The file is copied to its new name first, with an exclusive create that
 * never replaces a file, and the old one is removed on `commit`, so the row
 * never names a file that is not there. Throws when the project folder
 * cannot be reached or the file is missing.
 */
export async function renameProjectAssetFile(
  asset: Asset,
  name: string
): Promise<ProjectAssetFileChange | null> {
  const file = await requireProjectAssetFile(asset);
  if (!file) return null;
  const { workspace } = file;
  const from = file.path;
  const { directory, stem, extension } = splitPath(from);
  // The stem is derived as it was on creation, then freed of the extension
  // the file already has, which need not be the content type's.
  let nextStem = projectAssetFileStem(name, asset.content_type);
  if (extension && nextStem.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) {
    nextStem = nextStem.slice(0, -(extension.length + 1)) || nextStem;
  }
  if (nextStem === stem) return null;

  return withProjectFolderLock(asset.user_id, asset.project_id, async () => {
    const to = await claimFile(
      workspace,
      { userId: asset.user_id, projectId: asset.project_id },
      directory,
      nextStem,
      extension,
      await readFileOf(workspace, from),
      asset.content_type
    );
    // Both names exist until the row is saved and the old file removed.
    const release = holdPaths(asset.user_id, asset.project_id, [from, to]);
    let info: Awaited<ReturnType<Workspace["stat"]>>;
    try {
      info = await workspace.stat(to);
    } catch (error) {
      release();
      throw error;
    }
    const previous = { path: asset.workspace_path, metadata: asset.metadata };
    asset.workspace_path = to;
    if (info && asset.metadata && "workspace_mtime" in asset.metadata) {
      asset.metadata = { ...asset.metadata, workspace_mtime: info.modifiedAt };
    }
    return {
      commit: async () => {
        try {
          await removeFile(
            workspace,
            from,
            "Could not remove a renamed asset's old file"
          );
        } finally {
          release();
        }
      },
      undo: async () => {
        asset.workspace_path = previous.path;
        asset.metadata = previous.metadata;
        try {
          await removeFile(
            workspace,
            to,
            "Could not remove the copy of an asset whose rename was not saved"
          );
        } finally {
          release();
        }
      }
    };
  });
}

/**
 * Write new bytes to the file of `asset`. Null when the asset keeps no file
 * in a project folder, and the caller then stores the bytes under the asset
 * key as before.
 *
 * `asset.content_type` is the type of the new bytes. When its extension is
 * the file's, the file is overwritten in place. Otherwise the bytes go to a
 * new file with the right extension and the old file is removed on `commit`.
 * The asset's size, path and fingerprint are updated either way, and its
 * thumbnail is regenerated.
 */
export async function replaceProjectAssetBytes(
  asset: Asset,
  bytes: Uint8Array
): Promise<ProjectAssetFileChange | null> {
  const file = await requireProjectAssetFile(asset);
  if (!file) return null;
  const { workspace } = file;
  const from = file.path;
  const { directory, stem, extension } = splitPath(from);
  const wanted = assetFileExtension(asset.content_type);

  return withProjectFolderLock(asset.user_id, asset.project_id, async () => {
    const moves = extension.toLowerCase() !== wanted;
    let to = from;
    if (moves) {
      to = await claimFile(
        workspace,
        { userId: asset.user_id, projectId: asset.project_id },
        directory,
        stem,
        wanted,
        bytes,
        asset.content_type
      );
    }
    const release = holdPaths(
      asset.user_id,
      asset.project_id,
      moves ? [from, to] : []
    );
    const previous = {
      path: asset.workspace_path,
      metadata: asset.metadata,
      size: asset.size
    };
    try {
      // The asset's own file, replaced in place.
      if (!moves) await workspace.write(to, bytes, asset.content_type);
      const fingerprint = await fingerprintOf(
        workspace,
        to,
        partialContentHash(bytes)
      );
      asset.workspace_path = to;
      asset.size = fingerprint.workspace_size;
      asset.metadata = withWorkspaceFingerprint(asset.metadata, fingerprint);
      await storeAssetThumbnail(asset.user_id, asset.id, asset.content_type, {
        bytes
      });
    } catch (error) {
      release();
      throw error;
    }
    return {
      commit: async () => {
        try {
          if (moves) {
            await removeFile(
              workspace,
              from,
              "Could not remove an asset's file of the previous type"
            );
          }
        } finally {
          release();
        }
      },
      undo: async () => {
        asset.workspace_path = previous.path;
        asset.metadata = previous.metadata;
        asset.size = previous.size;
        // Bytes written over the file in place cannot be taken back.
        try {
          if (moves) {
            await removeFile(
              workspace,
              to,
              "Could not remove the new file of an asset whose update was not saved"
            );
          }
        } finally {
          release();
        }
      }
    };
  });
}

/**
 * Delete the file of `asset` from its project folder. False when the asset
 * keeps no file there or the file was already gone. Call it before deleting
 * the row: a failure then leaves a row that shows its file as missing, never
 * a file without a row.
 *
 * Throws when the project folder cannot be reached, so an unplugged drive
 * does not turn into rows deleted around files that still exist.
 */
export async function deleteProjectAssetFile(asset: Asset): Promise<boolean> {
  const file = await requireProjectAssetFile(asset);
  if (!file) return false;
  return withProjectFolderLock(asset.user_id, asset.project_id, () =>
    file.workspace.delete(file.path)
  );
}

// ── Relink ──────────────────────────────────────────────────────────────────

/** The file an asset in a project folder is pointed at. */
export type ProjectAssetRelinkSource =
  /** A file already in the project folder, by its project-relative path. */
  | { path: string }
  /** A file on this host outside the folder. It is copied into the folder. */
  | { localPath: string };

/** Thrown when a relink names a file the asset cannot be pointed at. */
export class ProjectAssetRelinkError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ProjectAssetRelinkError";
  }
}

/** The last segment of a path written with either separator. */
function baseName(path: string): string {
  return path.replaceAll("\\", "/").split("/").pop() ?? "";
}

/**
 * Point `asset` at another file and save its row. The asset keeps its id, so
 * every reference to it resolves to the new file. False when the asset keeps
 * no file in a project folder.
 *
 * A file in the folder is used where it is. It must not be the file of
 * another asset. A file outside the folder is copied in next to where the
 * asset's file was, under its own name, with a numeric suffix when that name
 * is taken. The file the asset pointed at before is never removed.
 *
 * Throws {@link ProjectAssetRelinkError} for a file that cannot be used, and
 * `ProjectFolderUnavailableError` when the project folder cannot be reached.
 */
export async function relinkProjectAsset(
  asset: Asset,
  source: ProjectAssetRelinkSource
): Promise<boolean> {
  const file = await requireProjectAssetFile(asset);
  if (!file) return false;
  const { workspace } = file;

  return withProjectFolderLock(asset.user_id, asset.project_id, async () => {
    let to: string;
    if ("path" in source) {
      to = workspace.key(source.path);
      const info = await workspace.stat(to);
      if (!info || info.isDirectory) {
        throw new ProjectAssetRelinkError(
          `No file at ${to} in the project folder`
        );
      }
      const owners = await Asset.findByWorkspacePath(
        asset.user_id,
        asset.project_id,
        to
      );
      if (owners.some((owner) => owner.id !== asset.id)) {
        throw new ProjectAssetRelinkError(
          `The file ${to} already belongs to another asset`
        );
      }
    } else {
      const { directory } = splitPath(file.path);
      const fileName = baseName(source.localPath);
      const { stem, extension } = splitPath(fileName);
      const sameName = workspace.key(joinPath(directory, fileName));
      const bytes = new Uint8Array(await readFile(source.localPath));
      // The asset's own missing file leaves its name free for the copy. No
      // file is ever replaced: each name is taken with an exclusive create.
      to =
        sameName === file.path &&
        (await workspace.writeNew(sameName, bytes, asset.content_type))
          ? sameName
          : await claimFile(
              workspace,
              { userId: asset.user_id, projectId: asset.project_id },
              directory,
              stem,
              extension,
              bytes,
              asset.content_type
            );
    }

    const previous = {
      path: asset.workspace_path,
      metadata: asset.metadata,
      size: asset.size,
      duration: asset.duration
    };
    try {
      const fingerprint = await fingerprintOf(
        workspace,
        to,
        "localPath" in source
          ? await partialContentHashOfFile(source.localPath)
          : await partialContentHashOfWorkspaceFile(workspace, to)
      );
      asset.workspace_path = to;
      asset.size = fingerprint.workspace_size;
      asset.duration = await probeAssetDurationSeconds(asset.content_type, {
        path:
          "localPath" in source
            ? source.localPath
            : await workspace.materialize(to)
      });
      asset.metadata = withWorkspaceFingerprint(asset.metadata, fingerprint);
      await asset.save();
    } catch (error) {
      asset.workspace_path = previous.path;
      asset.metadata = previous.metadata;
      asset.size = previous.size;
      asset.duration = previous.duration;
      // Only a copy this call made is removed. A file in the folder stays.
      if ("localPath" in source) {
        await removeFile(
          workspace,
          to,
          "Could not remove the copy of a file whose relink was not saved"
        );
      }
      throw error;
    } finally {
      await workspace.cleanupScratch?.();
    }
    return true;
  });
}

// ── Move between projects ───────────────────────────────────────────────────

/**
 * Move the file of `asset` into the folder of `projectId`, and set the
 * asset's `project_id` and `workspace_path` to match. Save the row, then call
 * `commit`. Call `undo` when the row was not saved.
 *
 * `workspace_path` is relative to the folder of `project_id`, so the two
 * change together or not at all. The file is copied into the same directory
 * of the new folder with an exclusive create: a file already there under
 * that name is never replaced, and the copy takes a suffixed name instead.
 * The old file is removed on `commit`, after the row names the new one.
 *
 * `project_id` becomes the id of the project that owns the destination
 * folder. For a loose or missing project id that is Personal, so a row with a
 * file always names the project whose folder holds it.
 *
 * Throws when either folder cannot be reached or the file is missing. The
 * asset then keeps its project and its file.
 */
export async function moveProjectAssetFile(
  asset: Asset,
  projectId: string
): Promise<ProjectAssetFileChange> {
  const previous = {
    projectId: asset.project_id,
    path: asset.workspace_path,
    metadata: asset.metadata
  };
  const restore = (): void => {
    asset.project_id = previous.projectId;
    asset.workspace_path = previous.path;
    asset.metadata = previous.metadata;
  };
  const source = await requireProjectAssetFile(asset);
  const destination = await requireProjectFolder(projectId, asset.user_id);
  if (!source) {
    asset.project_id = projectId;
    return { commit: async () => {}, undo: async () => restore() };
  }
  const current = await requireProjectFolder(asset.project_id, asset.user_id);
  if (current.projectId === destination.projectId) {
    // Both ids name one folder, such as the loose id and Personal's.
    asset.project_id = destination.projectId;
    return { commit: async () => {}, undo: async () => restore() };
  }

  return withProjectFolderLock(asset.user_id, destination.projectId, async () => {
    const { directory, stem, extension } = splitPath(source.path);
    const to = await claimFile(
      destination.workspace,
      { userId: asset.user_id, projectId: destination.projectId },
      directory,
      stem,
      extension,
      await readFileOf(source.workspace, source.path),
      asset.content_type
    );
    // The copy has no row in its folder until the row is saved, and the old
    // file has none in its folder from then until it is removed. Neither
    // folder's reconcile may index its file as a second asset meanwhile.
    const releaseCopy = holdPaths(asset.user_id, destination.projectId, [to]);
    const releaseOld = holdPaths(asset.user_id, current.projectId, [
      source.path
    ]);
    const release = (): void => {
      releaseCopy();
      releaseOld();
    };
    let info: Awaited<ReturnType<Workspace["stat"]>>;
    try {
      info = await destination.workspace.stat(to);
    } catch (error) {
      release();
      throw error;
    }
    asset.project_id = destination.projectId;
    asset.workspace_path = to;
    if (info && asset.metadata && "workspace_mtime" in asset.metadata) {
      asset.metadata = { ...asset.metadata, workspace_mtime: info.modifiedAt };
    }
    return {
      commit: async () => {
        try {
          await removeFile(
            source.workspace,
            source.path,
            "Could not remove a moved asset's file from its old project folder"
          );
        } finally {
          release();
        }
      },
      undo: async () => {
        restore();
        try {
          await removeFile(
            destination.workspace,
            to,
            "Could not remove the copy of an asset whose move was not saved"
          );
        } finally {
          release();
        }
      }
    };
  });
}

// ── Collect linked files ────────────────────────────────────────────────────

/**
 * Metadata key naming the file a collect reserved for a linked asset before
 * it copied the bytes. A collect interrupted during the copy finds it on the
 * next run and copies into that file again instead of reserving a second
 * one. Server-owned, like the fingerprints: a client metadata update never
 * writes it, so it can never point a collect at a file the creator owns.
 */
export const COLLECT_PATH_KEY = "collect_path";

/** A linked asset whose file is now in the project folder. */
export interface CollectedAsset {
  id: string;
  name: string;
  /** Where the copy is, relative to the project folder. */
  workspace_path: string;
}

/** A linked asset that is still linked, and why. */
export interface UncollectedAsset {
  id: string;
  name: string;
  reason: string;
}

export interface CollectLinkedAssetsResult {
  copied: CollectedAsset[];
  /** Linked files that are missing or changed since they were linked. */
  skipped: UncollectedAsset[];
  /** Linked files whose copy could not be written or verified. */
  failed: UncollectedAsset[];
  /** True when `signal` stopped the run before every asset was tried. */
  interrupted: boolean;
}

export interface CollectLinkedAssetsArgs {
  /** The project whose linked files are copied. Null names Personal. */
  projectId: string | null | undefined;
  userId: string;
  /** Checked before each asset. An asset already being copied finishes. */
  signal?: AbortSignal;
}

type CollectOutcome =
  | { kind: "copied"; asset: CollectedAsset }
  | { kind: "skipped" | "failed"; asset: UncollectedAsset };

const LINK_KEYS: readonly string[] = [
  ...EXTERNAL_FINGERPRINT_KEYS,
  COLLECT_PATH_KEY
];

function withoutLinkKeys(
  metadata: Record<string, unknown> | null
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).filter(([key]) => !LINK_KEYS.includes(key))
  );
}

/** The file a collect reserved for `asset` earlier, when it can be reused. */
async function pendingCollectPath(
  workspace: Workspace,
  asset: Asset,
  projectId: string
): Promise<string | null> {
  const pending = asset.metadata?.[COLLECT_PATH_KEY];
  if (!isNonEmptyString(pending)) return null;
  let path: string;
  try {
    path = workspace.key(pending);
  } catch {
    return null;
  }
  if (!(await workspace.exists(path))) return null;
  // A file another row names was taken over since. It is never written.
  const rows = await Asset.findByWorkspacePath(asset.user_id, projectId, path);
  return rows.length === 0 ? path : null;
}

async function setCollectPath(asset: Asset, path: string | null): Promise<void> {
  const current = asset.metadata?.[COLLECT_PATH_KEY];
  if ((current ?? null) === path) return;
  const metadata = { ...asset.metadata };
  if (path === null) delete metadata[COLLECT_PATH_KEY];
  else metadata[COLLECT_PATH_KEY] = path;
  asset.metadata = metadata;
  await asset.save();
}

/** The partial content hash of a file in the project folder. */
async function partialHashInFolder(
  workspace: Workspace,
  path: string
): Promise<string> {
  const local = await localProjectAssetPath({ workspace, path });
  return local
    ? partialContentHashOfFile(local)
    : partialContentHash(await readFileOf(workspace, path));
}

/**
 * Copy one linked asset's file into `Imported/`, verify the copy, then point
 * the row at it. The steps are ordered so an interruption at any point
 * leaves the asset readable: the row keeps `external_path` until the copy is
 * verified, and the reserved file is recorded on the row so the next run
 * reuses it.
 */
async function collectOne(
  asset: Asset,
  folder: { projectId: string; workspace: Workspace }
): Promise<CollectOutcome> {
  const { workspace, projectId } = folder;
  const label = { id: asset.id, name: asset.name };
  const source = await verifiedExternalPath(asset);
  if (!source) {
    return {
      kind: "skipped",
      asset: {
        ...label,
        reason: "The linked file is missing or changed since it was linked"
      }
    };
  }

  let path: string | null = null;
  try {
    const sourceHash = await partialContentHashOfFile(source);
    path = await withFolderLock(asset.user_id, projectId, async () => {
      const pending = await pendingCollectPath(workspace, asset, projectId);
      if (pending) return pending;
      // An empty file reserves the name. The bytes are copied outside the
      // lock, so a long copy does not hold up other saves to this folder.
      return claimFile(
        workspace,
        { userId: asset.user_id, projectId },
        workspace.key(IMPORTED_DIRECTORY),
        projectAssetFileStem(asset.name, asset.content_type),
        assetFileExtension(asset.content_type),
        new Uint8Array(0),
        asset.content_type
      );
    });
    await setCollectPath(asset, path);

    await workspace.absorb(source, path);
    const copyHash = await partialHashInFolder(workspace, path);
    if (copyHash !== sourceHash) {
      throw new Error("The copy does not match the linked file");
    }
    if ((await verifiedExternalPath(asset)) !== source) {
      throw new Error("The linked file changed while it was copied");
    }
    const fingerprint = await fingerprintOf(workspace, path, copyHash);

    // The row is read again, so a relink or delete made during the copy is
    // never overwritten.
    const current = await Asset.find(asset.user_id, asset.id);
    if (!current || current.external_path !== asset.external_path) {
      throw new Error("The asset was relinked or deleted while it was copied");
    }
    current.workspace_path = path;
    current.external_path = null;
    current.project_id = projectId;
    current.size = fingerprint.workspace_size;
    current.metadata = withWorkspaceFingerprint(
      withoutLinkKeys(current.metadata),
      fingerprint
    );
    await current.save();
    return { kind: "copied", asset: { ...label, workspace_path: path } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn("Could not collect a linked asset", { assetId: asset.id, reason });
    if (path) {
      // The file is the reservation this collect made. No row names it.
      await removeFile(workspace, path, "Could not remove a failed collect copy");
      try {
        await setCollectPath(asset, null);
      } catch (saveError) {
        log.warn("Could not clear a failed collect from its asset", {
          assetId: asset.id,
          error: saveError instanceof Error ? saveError.message : String(saveError)
        });
      }
    }
    return { kind: "failed", asset: { ...label, reason } };
  }
}

/**
 * Copy every linked file of a project into its `Imported/` directory (PRD
 * T6). Each asset keeps its id: its row gets `workspace_path`, and
 * `external_path` is cleared once the copy matches the linked file by size
 * and partial content hash. The linked file itself is never changed.
 *
 * Works one asset at a time, so a run that stops leaves every asset either
 * collected or still linked, and running it again finishes the rest without
 * copying a collected one twice. A linked file that is offline is skipped
 * and reported.
 *
 * Throws {@link ProjectFolderUnavailableError} when the project folder
 * cannot be reached.
 */
export async function collectLinkedAssets(
  args: CollectLinkedAssetsArgs
): Promise<CollectLinkedAssetsResult> {
  const folder = await requireProjectFolder(args.projectId, args.userId);
  const projectIds = new Set([folder.projectId, args.projectId ?? "default"]);
  const linked: Asset[] = [];
  for (const id of projectIds) {
    for (const asset of await Asset.listByProject(args.userId, id)) {
      if (asset.external_path && asset.content_type !== "folder") {
        linked.push(asset);
      }
    }
  }
  linked.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const result: CollectLinkedAssetsResult = {
    copied: [],
    skipped: [],
    failed: [],
    interrupted: false
  };
  for (const asset of linked) {
    if (args.signal?.aborted) {
      result.interrupted = true;
      break;
    }
    // Read again: a long copy before this one leaves the listed row stale,
    // and another run may have collected it meanwhile.
    const fresh = await Asset.find(args.userId, asset.id);
    if (!fresh?.external_path) continue;
    const outcome = await collectOne(fresh, folder);
    if (outcome.kind === "copied") result.copied.push(outcome.asset);
    else result[outcome.kind].push(outcome.asset);
  }
  log.info("Collected linked files", {
    projectId: folder.projectId,
    copied: result.copied.length,
    skipped: result.skipped.length,
    failed: result.failed.length,
    interrupted: result.interrupted
  });
  return result;
}

// Every change of an asset's project goes through `saveAssetInProject` in
// `@nodetool-ai/models`, which sits below this package and reaches project
// folders through the mover installed here.
setAssetFileMover(moveProjectAssetFile);
