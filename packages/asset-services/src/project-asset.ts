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

  return withFolderLock(args.userId, projectId, async () => {
    const exactPath = args.path !== undefined ? workspace.key(args.path) : null;
    // A file the caller named may already have its asset. That row is
    // updated, so one file never has two rows that could each delete it.
    const existing = exactPath
      ? await Asset.findByWorkspacePath(args.userId, projectId, exactPath)
      : [];

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

  return withFolderLock(asset.user_id, asset.project_id, async () => {
    const to = await claimFile(
      workspace,
      { userId: asset.user_id, projectId: asset.project_id },
      directory,
      nextStem,
      extension,
      await readFileOf(workspace, from),
      asset.content_type
    );
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
    } else {
      // The asset's own file, replaced in place.
      await workspace.write(to, bytes, asset.content_type);
    }
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

  return withFolderLock(asset.user_id, destination.projectId, async () => {
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
    const info = await destination.workspace.stat(to);
    asset.project_id = destination.projectId;
    asset.workspace_path = to;
    if (info && asset.metadata && "workspace_mtime" in asset.metadata) {
      asset.metadata = { ...asset.metadata, workspace_mtime: info.modifiedAt };
    }
    return {
      commit: () =>
        removeFile(
          source.workspace,
          source.path,
          "Could not remove a moved asset's file from its old project folder"
        ),
      undo: async () => {
        restore();
        await removeFile(
          destination.workspace,
          to,
          "Could not remove the copy of an asset whose move was not saved"
        );
      }
    };
  });
}

// Every change of an asset's project goes through `saveAssetInProject` in
// `@nodetool-ai/models`, which sits below this package and reaches project
// folders through the mover installed here.
setAssetFileMover(moveProjectAssetFile);
