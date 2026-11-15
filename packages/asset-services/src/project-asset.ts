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
import { Asset } from "@nodetool-ai/models";
import { getAssetFileName } from "@nodetool-ai/protocol";
import type { Workspace } from "@nodetool-ai/runtime";
import { probeAssetDurationSeconds } from "./asset-duration.js";
import { normalizeAssetContentType } from "./asset-paths.js";
import {
  partialContentHash,
  partialContentHashOfFile,
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
   * `userId`, and `path` must not name a file another row already has.
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
 * the other. This serializes them within the process.
 */
function withFolderLock<T>(
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
 * A path in `directory` for `stem` that no file and no asset row uses:
 * `stem.ext`, then `stem-2.ext`, `stem-3.ext` and so on.
 *
 * The directory is listed once and names compare without case, because
 * macOS and Windows folders ignore it. A name is also skipped when an asset
 * row still records it although its file is gone, so a new asset never takes
 * over the path of one that is missing.
 */
async function freeFilePath(
  workspace: Workspace,
  userId: string,
  projectId: string,
  directory: string,
  stem: string,
  extension: string
): Promise<string> {
  const taken = new Set(
    (await workspace.list(directory)).map((entry) => entry.name.toLowerCase())
  );
  const suffix = extension ? `.${extension}` : "";
  for (let n = 1; n <= MAX_FILE_SUFFIX; n++) {
    const fileName = `${n === 1 ? stem : `${stem}-${n}`}${suffix}`;
    if (taken.has(fileName.toLowerCase())) continue;
    const path = workspace.key(joinPath(directory, fileName));
    if (await workspace.exists(path)) continue;
    const rows = await Asset.findByWorkspacePath(userId, projectId, path);
    if (rows.length > 0) continue;
    return path;
  }
  throw new Error(
    `No free file name for "${stem}${suffix}" in ${directory || "the project folder"}`
  );
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

  return withFolderLock(args.userId, projectId, async () => {
    const exactPath = args.path !== undefined ? workspace.key(args.path) : null;
    const directory = (args.directory ?? GENERATED_DIRECTORY).trim();
    const path =
      exactPath ??
      (await freeFilePath(
        workspace,
        args.userId,
        projectId,
        directory ? workspace.key(directory) : "",
        projectAssetFileStem(args.name, contentType),
        assetFileExtension(contentType)
      ));
    // A file the caller named may already have its asset. That row is
    // updated, so one file never has two rows that could each delete it.
    const atPath = exactPath
      ? await Asset.findByWorkspacePath(args.userId, projectId, exactPath)
      : [];
    if (args.asset) {
      if (args.asset.user_id !== args.userId) {
        throw new Error("The asset belongs to another user");
      }
      if (atPath.some((row) => row.id !== args.asset?.id)) {
        throw new Error(`Another asset already has the file ${exactPath}`);
      }
    }
    const existing = args.asset ? [args.asset] : atPath;

    if ("bytes" in source) {
      await workspace.write(path, source.bytes, contentType);
    } else {
      await workspace.absorb(source.path, path);
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
 * The file is copied to its new name first and the old one is removed on
 * `commit`, so the row never names a file that is not there. Throws when the
 * project folder cannot be reached or the file is missing.
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

  return withFolderLock(asset.user_id, asset.project_id, async () => {
    const to = await freeFilePath(
      workspace,
      asset.user_id,
      asset.project_id,
      directory,
      nextStem,
      extension
    );
    await workspace.copy(from, to);
    const info = await workspace.stat(to);
    const previous = { path: asset.workspace_path, metadata: asset.metadata };
    asset.workspace_path = to;
    if (info && asset.metadata && "workspace_mtime" in asset.metadata) {
      asset.metadata = { ...asset.metadata, workspace_mtime: info.modifiedAt };
    }
    return {
      commit: () =>
        removeFile(workspace, from, "Could not remove a renamed asset's old file"),
      undo: async () => {
        asset.workspace_path = previous.path;
        asset.metadata = previous.metadata;
        await removeFile(
          workspace,
          to,
          "Could not remove the copy of an asset whose rename was not saved"
        );
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

  return withFolderLock(asset.user_id, asset.project_id, async () => {
    const moves = extension.toLowerCase() !== wanted;
    const to = moves
      ? await freeFilePath(
          workspace,
          asset.user_id,
          asset.project_id,
          directory,
          stem,
          wanted
        )
      : from;
    await workspace.write(to, bytes, asset.content_type);
    const previous = {
      path: asset.workspace_path,
      metadata: asset.metadata,
      size: asset.size
    };
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
    return {
      commit: async () => {
        if (moves) {
          await removeFile(
            workspace,
            from,
            "Could not remove an asset's file of the previous type"
          );
        }
      },
      undo: async () => {
        asset.workspace_path = previous.path;
        asset.metadata = previous.metadata;
        asset.size = previous.size;
        // Bytes written over the file in place cannot be taken back.
        if (moves) {
          await removeFile(
            workspace,
            to,
            "Could not remove the new file of an asset whose update was not saved"
          );
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
  return withFolderLock(asset.user_id, asset.project_id, () =>
    file.workspace.delete(file.path)
  );
}
