/**
 * Assets router — migrated from REST `/api/assets*` (JSON operations only).
 *
 * Multipart uploads and binary responses (thumbnails, package asset file
 * downloads) stay on REST in the shrunken `routes/assets.ts` plugin.
 *
 * Ported verbatim from the legacy http-api.ts handlers. Cascading folder
 * delete is preserved; home-folder default for `list` with no filters is
 * preserved; recursive folder listing is preserved.
 */

import { Buffer } from "node:buffer";
import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, sep } from "node:path";
import { Asset, Project } from "@nodetool-ai/models";
import type { Asset as AssetModel } from "@nodetool-ai/models";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.assets");
import {
  assetKeyCandidates,
  FileStorageAdapter,
  getMaxLocalUploadBytes,
  getMaxUploadBytes,
  UploadTooLargeError
} from "@nodetool-ai/storage";
import {
  getAssetFileName,
  getAssetStorageKey,
  normalizeAssetContentType,
  assetFileNameCandidates
} from "../../lib/asset-paths.js";
import { getAssetAdapter } from "../../lib/storage.js";
import {
  directoryFolderResponse,
  toAssetResponse
} from "../../lib/asset-response.js";
import { probeAssetDurationSeconds } from "../../lib/asset-duration.js";
import {
  externalAssetsAvailable,
  getExternalAssetThresholdBytes
} from "../../lib/external-assets.js";
import { EXTERNAL_FINGERPRINT_KEYS } from "../../lib/external-asset-lookup.js";
import {
  ProjectDirectoryError,
  listProjectDirectories,
  listProjectDirectory,
  listProjectDirectoryTree,
  loadProjectDirectoryIndex,
  moveProjectDirectory,
  removeEmptyProjectDirectory,
  type ProjectDirectoryIndex
} from "@nodetool-ai/asset-services/project-asset-directories";
import {
  ProjectDirectoryResolver,
  directoryFolderId,
  directoryName,
  folderNameAsDirectory,
  isWithinDirectory,
  joinDirectory,
  listsByDirectory,
  parentDirectory,
  parseProjectDirectoryId,
  type ProjectDirectoryRef
} from "@nodetool-ai/protocol";
import {
  ProjectAssetRelinkError,
  deleteProjectAssetFile,
  moveProjectAssetToDirectory,
  relinkProjectAsset,
  renameProjectAssetFile,
  replaceProjectAssetBytes,
  storeLegacyAssetBytes,
  type ProjectAssetFileChange,
  type ProjectAssetRelinkSource
} from "@nodetool-ai/asset-services/project-asset";
import {
  ProjectFolderUnavailableError,
  WORKSPACE_SERVER_KEYS,
  keepFingerprint,
  requireProjectFolder
} from "@nodetool-ai/asset-services/project-asset-file";
import {
  WorkspacePathError,
  WorkspaceReservedPathError
} from "@nodetool-ai/runtime";
import {
  localPathDenialMessage,
  resolveLocalPath
} from "../../lib/local-file-access.js";
import {
  generateThumbnailForStoredAsset,
  storeAssetWithThumbnail,
  thumbnailKey
} from "../../lib/thumbnail.js";
import {
  discardVideoProxy,
  scheduleVideoProxy,
  videoProxiesAvailable,
  videoProxyFileNames,
  videoProxyQueue,
  videoProxyState
} from "../../lib/video-proxy.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  listInput,
  listOutput,
  getInput,
  assetResponse,
  updateInput,
  createUploadInput,
  createUploadOutput,
  createExternalInput,
  createExternalOutput,
  relinkExternalInput,
  relinkExternalOutput,
  externalImportConfigOutput,
  ensureProxyInput,
  ensureProxyOutput,
  finalizeUploadInput,
  finalizeUploadOutput,
  deleteInput,
  deleteOutput,
  recursiveInput,
  recursiveOutput,
  searchInput,
  searchOutput,
  type AssetResponse
} from "@nodetool-ai/protocol/api-schemas/assets.js";
import { isAssetSharedWithUser } from "../../lib/document-access.js";
import { isFullResourceId } from "@nodetool-ai/protocol";

/**
 * Remove an asset's stored bytes, its thumbnail, and its preview proxy.
 *
 * Best-effort per object: the row is the source of truth, so a storage
 * failure is logged rather than thrown — one unreachable object must not
 * abort a recursive folder delete and strand everything after it. Both key
 * shapes are tried, since objects written before the owner-prefixed layout
 * are still flat.
 */
async function deleteAssetObjects(asset: AssetModel): Promise<void> {
  if (asset.content_type === "folder") return;
  const adapter = getAssetAdapter();
  // A proxy still encoding would land after the delete.
  videoProxyQueue.cancel(asset.id);
  // An external asset's bytes are the user's own file, outside the storage
  // root. Only its thumbnail and proxy are ours to remove.
  const derived = [thumbnailKey(asset.id), ...videoProxyFileNames(asset.id)];
  const fileNames = asset.external_path
    ? derived
    : [...assetFileNameCandidates(asset.id, asset.content_type), ...derived];
  for (const fileName of fileNames) {
    for (const key of assetKeyCandidates(asset.user_id, fileName)) {
      try {
        const uri = adapter.uriForKey(key);
        if (await adapter.exists(uri)) {
          await adapter.delete(uri);
        }
      } catch (err) {
        log.warn("asset object delete failed", {
          assetId: asset.id,
          key,
          error: String(err)
        });
      }
    }
  }
}

/**
 * Delete an asset row together with the bytes it points at.
 *
 * An asset that is a file in its project folder loses that file first. When
 * the folder cannot be reached this throws and the row stays, so the asset
 * shows as missing instead of a file being left without its row.
 */
async function deleteAssetWithObjects(asset: AssetModel): Promise<void> {
  await deleteProjectAssetFile(asset);
  await deleteAssetObjects(asset);
  await asset.delete();
}

/** Report an unreachable project folder with its reason. Other errors pass. */
function rethrowFolderError(error: unknown): never {
  if (error instanceof ProjectFolderUnavailableError) {
    throwApiError(
      ApiErrorCode.SERVICE_UNAVAILABLE,
      error.message,
      "PRECONDITION_FAILED"
    );
  }
  throw error;
}

/**
 * Recursively delete a folder and collect all deleted asset ids.
 *
 * `visited` breaks parent cycles. better-sqlite3 is synchronous, so a cycle
 * here is an unbroken microtask chain that starves the event loop and wedges
 * the process rather than merely overflowing the stack.
 */
async function deleteFolderRecursive(
  userId: string,
  folderId: string,
  visited: Set<string> = new Set()
): Promise<string[]> {
  if (visited.has(folderId)) return [];
  visited.add(folderId);

  const children = await Asset.getChildren(userId, folderId, 10000);
  const deletedIdsArrays = await Promise.all(
    children.map(async (child) => {
      if (child.content_type === "folder") {
        return deleteFolderRecursive(userId, child.id, visited);
      } else {
        await deleteAssetWithObjects(child);
        return [child.id];
      }
    })
  );
  const deletedIds = deletedIdsArrays.flat();
  const folder = await Asset.find(userId, folderId);
  if (folder) {
    await folder.delete();
    deletedIds.push(folderId);
  }
  return deletedIds;
}

/** Flat list of every asset under a folder (including nested sub-folders). */
async function getAllAssetsRecursive(
  userId: string,
  folderId: string,
  projectId?: string,
  visited: Set<string> = new Set()
): Promise<AssetModel[]> {
  if (visited.has(folderId)) return [];
  visited.add(folderId);

  if (projectId !== undefined && folderId !== userId) {
    const folder = await Asset.find(userId, folderId);
    if (!folder || folder.project_id !== projectId) return [];
  }

  const collected: AssetModel[] = [];
  const children = await Asset.getChildren(userId, folderId, 10000, projectId);
  for (const child of children) {
    collected.push(child);
    if (child.content_type === "folder") {
      const subAssets = await getAllAssetsRecursive(
        userId,
        child.id,
        projectId,
        visited
      );
      collected.push(...subAssets);
    }
  }
  return collected;
}

/**
 * Refuse a parent that would break the asset tree.
 *
 * The rule itself lives on the model, shared with the sandbox's
 * `update_asset` capability, so the two surfaces cannot disagree about what a
 * legal move is. This wrapper only turns the answer into an HTTP error.
 */
/**
 * Validate a move and return the parent's full id. `Asset.find` accepts a
 * 12-character prefix, and storing the prefix would leave the asset in no
 * folder listing, since listings match `parent_id` exactly.
 */
async function resolveValidParent(
  userId: string,
  asset: AssetModel,
  parentId: string
): Promise<string> {
  const problem = await Asset.validateParent(userId, asset, parentId);
  if (problem) {
    throwApiError(ApiErrorCode.INVALID_INPUT, problem);
  }
  if (parentId === userId) return userId;
  const parent = await Asset.find(userId, parentId);
  if (!parent) {
    throwApiError(ApiErrorCode.INVALID_INPUT, "Parent folder not found");
  }
  return parent.id;
}

/**
 * Refuse a write to a shipped system entity — a seeded style preset.
 *
 * The rule is `Asset.systemEntityRefusal`, shared with the sandbox's entity
 * capability so both write surfaces answer the same way; this wrapper only
 * turns it into an HTTP error.
 */
const BYTES_PER_MB = 1024 * 1024;

/** What the editor shows when storage refuses a file for its size. */
export function uploadTooLargeMessage(error: UploadTooLargeError): string {
  const size = (error.byteLength / BYTES_PER_MB).toFixed(1);
  const limit =
    error.maxBytes === null
      ? "the storage limit"
      : `the ${(error.maxBytes / BYTES_PER_MB).toFixed(0)} MB limit`;
  return `This file is ${size} MB, which is over ${limit}, so it was not saved.`;
}

function assertWritable(asset: AssetModel): void {
  const problem = Asset.systemEntityRefusal(asset);
  if (problem) {
    throwApiError(ApiErrorCode.FORBIDDEN, problem);
  }
}

const EXTERNAL_ASSETS_UNAVAILABLE =
  "External asset references need the local file store and are disabled in production";

/**
 * Validate a path offered for an in-place reference (R5): absolute, inside
 * the local file roots, and a regular file. Returns the resolved path and its
 * stat. Used by `createExternal` and `relinkExternal`, the only two ways a
 * path reaches a row.
 */
async function resolveExternalFile(
  path: string
): Promise<{ path: string; size: number; mtimeMs: number }> {
  if (!externalAssetsAvailable()) {
    throwApiError(ApiErrorCode.FORBIDDEN, EXTERNAL_ASSETS_UNAVAILABLE);
  }
  if (!isAbsolute(path)) {
    throwApiError(ApiErrorCode.INVALID_INPUT, "Path must be absolute");
  }
  const resolved = await resolveLocalPath(path);
  if (!resolved.ok) {
    throwApiError(ApiErrorCode.FORBIDDEN, localPathDenialMessage(resolved.reason));
  }
  const fileStat = await stat(resolved.path).catch(() => null);
  if (!fileStat) {
    throwApiError(ApiErrorCode.NOT_FOUND, "File not found");
  }
  if (!fileStat.isFile()) {
    throwApiError(ApiErrorCode.INVALID_INPUT, "Path is not a file");
  }
  return {
    path: resolved.path,
    size: fileStat.size,
    mtimeMs: fileStat.mtimeMs
  };
}

/**
 * Refuse a replacement file of another media kind (audio for a video clip).
 * The asset's URL takes its extension from the content type, which stays. A
 * name with no known type is accepted.
 */
function assertSameMediaKind(asset: AssetModel, fileName: string): void {
  const kind = (type: string) => type.split("/")[0];
  const offered = normalizeAssetContentType("", fileName);
  if (
    offered !== "application/octet-stream" &&
    kind(offered) !== kind(asset.content_type)
  ) {
    throwApiError(
      ApiErrorCode.INVALID_INPUT,
      `The new file is ${offered}, but this asset is ${asset.content_type}`
    );
  }
}

/**
 * The file a relink of an asset in a project folder names. A relative path is
 * a file in the folder. An absolute path is a file on this host, validated
 * like any in-place reference (R5). When that file already lies in the
 * folder it is used where it is, and otherwise it is copied in.
 */
async function projectRelinkSource(
  asset: AssetModel,
  path: string
): Promise<ProjectAssetRelinkSource> {
  if (!isAbsolute(path)) return { path };
  const file = await resolveExternalFile(path);
  const { workspace } = await requireProjectFolder(
    asset.project_id,
    asset.user_id
  );
  // The folder's directory is read only to spell a picked file's path
  // relative to the folder. The file is then reached through the workspace.
  const folderDir = workspace.localDir
    ? await realpath(workspace.localDir).catch(() => null)
    : null;
  const inFolder = folderDir ? relative(folderDir, file.path) : "";
  if (inFolder && !inFolder.startsWith("..") && !isAbsolute(inFolder)) {
    return { path: inFolder.split(sep).join("/") };
  }
  return { localPath: file.path };
}

/** Point an asset in a project folder at another file. Keeps its id. */
async function relinkProjectFile(
  asset: AssetModel,
  path: string
): Promise<void> {
  try {
    const source = await projectRelinkSource(asset, path);
    assertSameMediaKind(
      asset,
      basename("path" in source ? source.path : source.localPath)
    );
    await relinkProjectAsset(asset, source);
  } catch (error) {
    if (
      error instanceof ProjectAssetRelinkError ||
      error instanceof WorkspacePathError ||
      error instanceof WorkspaceReservedPathError
    ) {
      throwApiError(ApiErrorCode.INVALID_INPUT, error.message);
    }
    rethrowFolderError(error);
  }
}

/**
 * `next` with the external file fingerprint (`external_size`,
 * `external_mtime`) taken from `current`. Offline detection compares the file
 * against these, so only import and relink may write them.
 */
function withExternalFingerprint(
  next: Record<string, unknown>,
  current: Record<string, unknown> | null
): Record<string, unknown> {
  const owned = new Set<string>(EXTERNAL_FINGERPRINT_KEYS);
  const merged = Object.fromEntries(
    Object.entries(next).filter(([key]) => !owned.has(key))
  );
  for (const key of EXTERNAL_FINGERPRINT_KEYS) {
    if (current && key in current) {
      merged[key] = current[key];
    }
  }
  return merged;
}

/**
 * Another user's asset that a document shared with the caller shows. Full
 * generated ids only: a short prefix would resolve across every user's
 * library, and the document match reads full ids out of the stored row.
 */
async function findSharedAsset(
  userId: string,
  id: string
): Promise<Asset | null> {
  if (!isFullResourceId(id)) return null;
  const asset = (await Asset.get(id)) as Asset | null;
  if (!asset || asset.id !== id) return null;
  return (await isAssetSharedWithUser(userId, asset)) ? asset : null;
}

// ── Directories of a project folder ─────────────────────────────

/** Whether the project a directory id names is the caller's. */
async function isOwnProject(userId: string, projectId: string): Promise<boolean> {
  if (projectId === `personal:${userId}`) return true;
  return (await Project.findOwned(userId, projectId)) !== null;
}

/** The directory a directory id names, when its project is the caller's. */
async function requireOwnDirectory(
  userId: string,
  ref: ProjectDirectoryRef
): Promise<ProjectDirectoryRef> {
  if (!(await isOwnProject(userId, ref.projectId))) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Folder not found");
  }
  return ref;
}

/**
 * The directory a move names as the new parent, inside a project that lists
 * by directory: the home folder is the root, a directory id names its path,
 * and a legacy folder row names the path its chain spells. Null when the
 * parent is none of those, so the move keeps its folder-row rules.
 */
async function directoryOfNewParent(
  userId: string,
  projectId: string,
  parentId: string
): Promise<string | null> {
  if (parentId === userId) return "";
  const ref = parseProjectDirectoryId(parentId);
  if (ref) {
    if (ref.projectId !== projectId) {
      throwApiError(
        ApiErrorCode.INVALID_INPUT,
        "That folder belongs to another project"
      );
    }
    return ref.path;
  }
  const folder = await Asset.find(userId, parentId);
  if (!folder || folder.content_type !== "folder") return null;
  const folders = await Asset.listFolders(userId);
  return new ProjectDirectoryResolver(
    projectId,
    new Map(folders.map((row) => [row.id, row]))
  ).pathOfFolder(folder);
}

/** Report a folder operation the project folder refuses, with its reason. */
function rethrowDirectoryError(error: unknown): never {
  if (
    error instanceof ProjectDirectoryError ||
    error instanceof WorkspacePathError ||
    error instanceof WorkspaceReservedPathError
  ) {
    throwApiError(ApiErrorCode.INVALID_INPUT, error.message);
  }
  rethrowFolderError(error);
}

/** The assets and subfolders of one directory, as `list` answers. */
async function listDirectoryResponses(
  userId: string,
  index: ProjectDirectoryIndex,
  path: string,
  limit: number
): Promise<AssetResponse[]> {
  const contents = await listProjectDirectory(index, path);
  const assets = [...contents.assets]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
  return [
    ...contents.directories.map((dir) =>
      directoryFolderResponse(userId, index.projectId, dir)
    ),
    ...(await Promise.all(assets.map((a) => toAssetResponse(a))))
  ];
}

/**
 * Rename or move a directory of a project folder. A new `name` renames it
 * in place and a new `parent_id` moves it, together with every asset under
 * it, in one call.
 */
async function updateProjectDirectory(
  userId: string,
  ref: ProjectDirectoryRef,
  input: { name?: string | undefined; parent_id?: string | undefined }
): Promise<AssetResponse> {
  await requireOwnDirectory(userId, ref);
  const { projectId, path } = ref;
  try {
    const parent =
      input.parent_id !== undefined
        ? await directoryOfNewParent(userId, projectId, input.parent_id)
        : parentDirectory(path);
    if (parent === null) {
      throwApiError(ApiErrorCode.INVALID_INPUT, "Parent folder not found");
    }
    const name =
      input.name !== undefined
        ? folderNameAsDirectory(input.name)
        : directoryName(path);
    const target = joinDirectory(parent, name);
    const moved =
      target === path
        ? { to: path }
        : await moveProjectDirectory(userId, projectId, path, target);
    return directoryFolderResponse(userId, projectId, {
      path: moved.to,
      modifiedAt: null
    });
  } catch (error) {
    rethrowDirectoryError(error);
  }
}

/**
 * Delete a directory of a project folder: every asset under it with its
 * file, the legacy folder rows that spelled it, and the directory itself
 * when nothing else is left in it.
 */
async function deleteProjectDirectory(
  userId: string,
  ref: ProjectDirectoryRef
): Promise<string[]> {
  const index = await loadProjectDirectoryIndex(userId, ref.projectId);
  const { assets } = await listProjectDirectoryTree(index, ref.path);
  for (const asset of assets) assertWritable(asset);
  const deleted: string[] = [];
  for (const asset of assets) {
    await deleteAssetWithObjects(asset);
    deleted.push(asset.id);
  }
  for (const { row, path } of index.folders) {
    if (!isWithinDirectory(path, ref.path)) continue;
    await row.delete();
    deleted.push(row.id);
  }
  if (index.workspace) {
    await removeEmptyProjectDirectory(userId, ref.projectId, ref.path);
  }
  return deleted;
}

export const assetsRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ ctx, input }) => {
      // Inside a project the folders are the directories of its folder.
      const crossFolder =
        input.workflow_id ||
        input.node_id ||
        input.job_id ||
        input.timeline_id ||
        input.favorite ||
        (input.content_type && input.content_type !== "folder");
      if (listsByDirectory(input.project_id) && !crossFolder) {
        const index = await loadProjectDirectoryIndex(
          ctx.userId,
          input.project_id
        );
        if (input.content_type === "folder") {
          const directories = await listProjectDirectories(index);
          return {
            assets: directories.map((dir) =>
              directoryFolderResponse(ctx.userId, index.projectId, dir)
            ),
            next: null
          };
        }
        const path = index.resolver.directoryOfParent(input.parent_id);
        return {
          assets: await listDirectoryResponses(
            ctx.userId,
            index,
            path,
            input.page_size
          ),
          next: null
        };
      }

      // Default to the user's home folder when no filters at all are set.
      const effectiveParentId =
        input.parent_id === undefined &&
        !input.content_type &&
        !input.workflow_id &&
        !input.node_id &&
        !input.job_id &&
        !input.timeline_id &&
        !input.favorite &&
        input.project_id === undefined
          ? ctx.userId
          : input.parent_id;

      const paginateOptions: Parameters<typeof Asset.paginate>[1] = {
        parentId: effectiveParentId,
        contentType: input.content_type,
        workflowId: input.workflow_id,
        nodeId: input.node_id,
        jobId: input.job_id,
        timelineId: input.timeline_id,
        favorite: input.favorite,
        limit: input.page_size
      };
      if (input.project_id !== undefined) {
        paginateOptions.projectId = input.project_id;
      }
      const [assets, cursor] = await Asset.paginate(
        ctx.userId,
        paginateOptions
      );
      return {
        assets: await Promise.all(assets.map((a) => toAssetResponse(a))),
        next: cursor || null
      };
    }),

  get: protectedProcedure
    .input(getInput)
    .output(assetResponse)
    .query(async ({ ctx, input }) => {
      // Special case: synthetic "Home" folder for the user.
      if (input.id === ctx.userId) {
        return {
          id: ctx.userId,
          user_id: ctx.userId,
          workflow_id: null,
          parent_id: "",
          name: "Home",
          content_type: "folder",
          size: null,
          metadata: null,
          sketch_document_id: null,
          created_at: "",
          get_url: null,
          thumb_url: null,
          duration: null,
          node_id: null,
          job_id: null,
          timeline_id: null
        };
      }

      const directory = parseProjectDirectoryId(input.id);
      if (directory) {
        if (
          input.project_id !== undefined &&
          input.project_id !== directory.projectId
        ) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Folder not found");
        }
        await requireOwnDirectory(ctx.userId, directory);
        return directoryFolderResponse(ctx.userId, directory.projectId, {
          path: directory.path,
          modifiedAt: null
        });
      }

      const asset =
        (await Asset.find(ctx.userId, input.id)) ??
        (await findSharedAsset(ctx.userId, input.id));
      if (!asset) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Asset not found");
      }
      if (
        input.project_id !== undefined &&
        asset.project_id !== input.project_id
      ) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Asset not found");
      }
      return toAssetResponse(asset);
    }),

  /**
   * Step 1 of a client-direct upload: create the row, pick the key, and mint
   * a short-lived target scoped to that key. The client never chooses where
   * it writes, so a stolen or replayed target can only overwrite the one
   * pending object it was issued for — inside its own owner's prefix.
   *
   * `upload` comes back null on backends with no direct-upload concept (the
   * local file store); the client then falls back to `POST /api/assets`.
   */
  createUpload: protectedProcedure
    .input(createUploadInput)
    .output(createUploadOutput)
    .mutation(async ({ ctx, input }) => {
      if (input.project_id && input.project_id !== "default") {
        if (!(await Project.findOwned(ctx.userId, input.project_id))) {
          throwApiError(ApiErrorCode.INVALID_INPUT, "Project not found");
        }
      }
      const adapter = getAssetAdapter();
      const max = adapter instanceof FileStorageAdapter
        ? getMaxLocalUploadBytes()
        : getMaxUploadBytes();
      if (input.size > max) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          `Upload exceeds maximum size: ${input.size} > ${max} bytes`
        );
      }

      // Local file store has no signed upload URL. The client falls back to
      // POST /api/assets. Do not create a pending row that would stay empty.
      if (!adapter.createUploadUrl) {
        return { asset_id: "", key: "", upload: null };
      }

      const contentType = normalizeAssetContentType(
        input.content_type,
        input.name
      );

      const asset = (await Asset.create({
        user_id: ctx.userId,
        name: input.name,
        content_type: contentType,
        parent_id: input.parent_id || ctx.userId,
        workflow_id: input.workflow_id ?? null,
        node_id: input.node_id ?? null,
        job_id: input.job_id ?? null,
        timeline_id: input.timeline_id ?? null,
        metadata: input.metadata ?? null,
        project_id: input.project_id ?? "default",
        // Recorded on finalize from what actually landed, not from the claim.
        size: null
      }));

      const key = getAssetStorageKey(ctx.userId, asset.id, asset.content_type);
      const target = await adapter.createUploadUrl(key, {
        contentType
      });

      return {
        asset_id: asset.id,
        key,
        upload: target
          ? {
              url: target.url,
              method: target.method,
              headers: target.headers,
              expires_at: target.expiresAt
            }
          : null
      };
    }),

  /**
   * Step 2: confirm what actually landed. The signed target bounds *where* a
   * client can write but not *what* — so the size is read back off the object
   * rather than trusted from the client, and an over-cap or absent upload is
   * rejected and the pending row removed.
   */
  finalizeUpload: protectedProcedure
    .input(finalizeUploadInput)
    .output(finalizeUploadOutput)
    .mutation(async ({ ctx, input }) => {
      const asset = await Asset.find(ctx.userId, input.asset_id);
      if (!asset) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Asset not found");
      }

      const adapter = getAssetAdapter();
      const key = getAssetStorageKey(
        asset.user_id,
        asset.id,
        asset.content_type
      );
      const stat = await adapter.stat(adapter.uriForKey(key));
      if (!stat || stat.size === 0) {
        await asset.delete();
        throwApiError(ApiErrorCode.INVALID_INPUT, "No uploaded object found");
      }

      const max = getMaxUploadBytes();
      if (stat.size > max) {
        await adapter.delete(adapter.uriForKey(key));
        await asset.delete();
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          `Upload exceeds maximum size: ${stat.size} > ${max} bytes`
        );
      }

      asset.size = stat.size;
      await asset.save();

      // The bytes are already in the bucket, so a thumbnail costs one download
      // back into this process. The generator skips objects above
      // THUMBNAIL_SOURCE_MAX_BYTES, so a multi-gigabyte video goes without.
      await generateThumbnailForStoredAsset(
        asset.user_id,
        asset.id,
        asset.content_type
      );

      return toAssetResponse(asset);
    }),

  /**
   * Whether the desktop app should reference large files in place, and from
   * what size. Plain browsers have no disk path and always upload.
   */
  externalImportConfig: protectedProcedure
    .output(externalImportConfigOutput)
    .query(async () => ({
      enabled: externalAssetsAvailable(),
      threshold_bytes: await getExternalAssetThresholdBytes()
    })),

  /**
   * Create an asset that references a local file in place. No bytes are
   * copied: reads resolve the key to `external_path` (see
   * `lib/external-asset-lookup.ts`), and deleting the asset leaves the file.
   * The path is validated once, here, against the local file roots.
   */
  createExternal: protectedProcedure
    .input(createExternalInput)
    .output(createExternalOutput)
    .mutation(async ({ ctx, input }) => {
      const file = await resolveExternalFile(input.path);
      const projectId = input.project_id ?? "default";
      if (projectId !== "default") {
        if (!(await Project.findOwned(ctx.userId, projectId))) {
          throwApiError(ApiErrorCode.INVALID_INPUT, "Project not found");
        }
      }

      // A second import of the same, unchanged file into the same project
      // returns the row the first one made (R4). A row whose file changed
      // since is offline, so it is not reused.
      for (const existing of await Asset.findByExternalPath(
        ctx.userId,
        file.path
      )) {
        const meta = existing.metadata ?? {};
        if (
          existing.project_id === projectId &&
          meta["external_size"] === file.size &&
          meta["external_mtime"] === file.mtimeMs
        ) {
          log.info("external asset reused", { assetId: existing.id });
          return toAssetResponse(existing);
        }
      }

      const name = input.name ?? basename(file.path);
      const contentType = normalizeAssetContentType(
        input.content_type ?? "",
        name
      );
      const duration = await probeAssetDurationSeconds(contentType, {
        path: file.path
      });

      const asset = await Asset.create({
        user_id: ctx.userId,
        name,
        content_type: contentType,
        parent_id: input.parent_id || ctx.userId,
        workflow_id: input.workflow_id ?? null,
        project_id: projectId,
        size: file.size,
        duration,
        external_path: file.path,
        // Recorded to detect a file changed or replaced after import.
        metadata: {
          external_size: file.size,
          external_mtime: file.mtimeMs
        }
      });
      log.info("external asset created", {
        assetId: asset.id,
        contentType,
        bytes: file.size
      });

      // The adapter resolves the new row to its in-place file, so libav or
      // sharp reads it by path and a file of any size gets a thumbnail.
      await generateThumbnailForStoredAsset(
        asset.user_id,
        asset.id,
        asset.content_type
      );
      scheduleVideoProxy(asset);

      return toAssetResponse(asset);
    }),

  /**
   * Point an in-place asset at another file: a moved, renamed, or remounted
   * original, or the same path after the file changed. The id and `get_url`
   * stay the same (D5). The path is validated again (R5), and the new size,
   * mtime, and duration are recorded before the thumbnail is regenerated.
   *
   * An asset whose file is in its project folder is relinked the same way:
   * to a file in the folder, or to a file outside it, which is copied in.
   */
  relinkExternal: protectedProcedure
    .input(relinkExternalInput)
    .output(relinkExternalOutput)
    .mutation(async ({ ctx, input }) => {
      const asset = await Asset.find(ctx.userId, input.id);
      if (!asset) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Asset not found");
      }
      assertWritable(asset);
      if (asset.workspace_path) {
        await relinkProjectFile(asset, input.path);
        log.info("project asset relinked", {
          assetId: asset.id,
          bytes: asset.size
        });
      } else if (!asset.external_path) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          "Only an asset that references a file in place can be relinked"
        );
      } else {
        const file = await resolveExternalFile(input.path);
        assertSameMediaKind(asset, basename(file.path));

        asset.external_path = file.path;
        asset.size = file.size;
        asset.duration = await probeAssetDurationSeconds(asset.content_type, {
          path: file.path
        });
        asset.metadata = {
          ...asset.metadata,
          external_size: file.size,
          external_mtime: file.mtimeMs
        };
        await asset.save();
        log.info("external asset relinked", {
          assetId: asset.id,
          bytes: file.size
        });
      }

      // Drop the previous file's thumbnail first, so a new file that yields
      // none does not keep showing the old one.
      const adapter = getAssetAdapter();
      for (const key of assetKeyCandidates(
        asset.user_id,
        thumbnailKey(asset.id)
      )) {
        const uri = adapter.uriForKey(key);
        if (await adapter.exists(uri)) {
          await adapter.delete(uri);
        }
      }
      await generateThumbnailForStoredAsset(
        asset.user_id,
        asset.id,
        asset.content_type
      );
      // The previous file's proxy no longer matches; make one for this file.
      await discardVideoProxy(asset);
      scheduleVideoProxy(asset);

      return toAssetResponse(asset);
    }),

  /**
   * Queue an all-intra preview proxy for a video asset, at any size, and
   * answer its state. The timeline preview plays the proxy once the asset
   * response says it is ready. A failed proxy is tried again. Refused off
   * the local file store.
   */
  ensureProxy: protectedProcedure
    .input(ensureProxyInput)
    .output(ensureProxyOutput)
    .mutation(async ({ ctx, input }) => {
      const asset = await Asset.find(ctx.userId, input.id);
      if (!asset) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Asset not found");
      }
      if (!asset.content_type.startsWith("video/")) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Asset is not a video");
      }
      if (!videoProxiesAvailable()) {
        throwApiError(
          ApiErrorCode.FORBIDDEN,
          "Video proxies need the local file store and are disabled in production"
        );
      }
      const before = await videoProxyState(asset);
      if (before?.status !== "ready") {
        videoProxyQueue.clearFailure(asset.id);
        videoProxyQueue.enqueue({
          assetId: asset.id,
          userId: asset.user_id,
          force: true
        });
      }
      const response = await toAssetResponse(asset);
      return {
        status: response.proxy_status ?? "none",
        proxy_url: response.proxy_url ?? null
      };
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(assetResponse)
    .mutation(async ({ ctx, input }) => {
      const directory = parseProjectDirectoryId(input.id);
      if (directory) {
        return updateProjectDirectory(ctx.userId, directory, input);
      }
      const asset = await Asset.find(ctx.userId, input.id);
      if (!asset) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Asset not found");
      }
      assertWritable(asset);
      const isExternal = Boolean(asset.external_path);
      // The asset is a file in its project folder: a rename renames the
      // file and new data is written to it.
      const hasProjectFile = Boolean(asset.workspace_path);
      if (isExternal && input.data != null) {
        // New bytes would land under the storage root and shadow the
        // referenced file, which the user still sees on disk.
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          "This asset references a file in place. Relink it to another file instead of replacing its data"
        );
      }

      if (input.name !== undefined) asset.name = input.name;
      if (input.content_type !== undefined) {
        // The stored file name (and get_url) is derived from content_type. If
        // the new content_type maps to a different file extension and no new
        // bytes accompany the change, get_url would point at a file that was
        // never written while the real bytes are orphaned under the old name.
        // Reject rather than silently break the asset link.
        const changesExtension =
          getAssetFileName(asset.id, input.content_type) !==
          getAssetFileName(asset.id, asset.content_type);
        if (changesExtension && input.data == null) {
          throwApiError(
            ApiErrorCode.INVALID_INPUT,
            "Changing content_type to a different file type requires re-uploading the asset data"
          );
        }
        asset.content_type = input.content_type;
      }
      // Inside a project, a move names a directory. An asset with a file
      // there moves its file. Any other asset is filed under the directory
      // until its bytes move into the folder.
      let targetDirectory: string | null = null;
      if (input.parent_id !== undefined) {
        targetDirectory = listsByDirectory(asset.project_id)
          ? await directoryOfNewParent(
              ctx.userId,
              asset.project_id,
              input.parent_id
            )
          : null;
        if (targetDirectory === null) {
          asset.parent_id = await resolveValidParent(
            ctx.userId,
            asset,
            input.parent_id
          );
        } else if (!hasProjectFile) {
          asset.parent_id = directoryFolderId(
            ctx.userId,
            asset.project_id,
            targetDirectory
          );
        } else {
          // The file's directory places the asset. A legacy folder row stays
          // its parent, so the view across every project still finds it.
          asset.parent_id = parseProjectDirectoryId(input.parent_id)
            ? ctx.userId
            : await resolveValidParent(ctx.userId, asset, input.parent_id);
        }
      }
      if (input.metadata !== undefined) {
        asset.metadata = isExternal
          ? withExternalFingerprint(input.metadata, asset.metadata)
          : hasProjectFile
            ? keepFingerprint(
                input.metadata,
                asset.metadata,
                WORKSPACE_SERVER_KEYS
              )
            : input.metadata;
      }
      if (input.sketch_document_id !== undefined) {
        asset.sketch_document_id = input.sketch_document_id;
      }
      if (input.timeline_id !== undefined) {
        asset.timeline_id = input.timeline_id;
      }
      if (input.favorite !== undefined) asset.favorite = input.favorite;
      // An external asset's size is its file's, recorded by import or relink.
      // A project file's size is recorded when the file is written.
      if (input.size !== undefined && !isExternal && !hasProjectFile) {
        asset.size = input.size;
      }

      if (input.expected_metadata !== undefined && input.data != null) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          "Conditional metadata updates cannot replace asset data"
        );
      }

      // File changes wait for the row. Each is undone when the row is not
      // saved, and what it replaced is removed only after the save.
      const fileChanges: ProjectAssetFileChange[] = [];
      // The row of an asset with no file in its project folder is saved with
      // its bytes, under the folder lock.
      let savedWithBytes = false;
      try {
        if (input.data != null) {
          const buf =
            input.data_encoding === "base64"
              ? Buffer.from(input.data, "base64")
              : Buffer.from(input.data, "utf-8");
          const fileName = getAssetFileName(asset.id, asset.content_type);
          log.info("asset upload (update)", {
            assetId: asset.id,
            fileName,
            contentType: asset.content_type,
            bytes: buf.byteLength
          });
          try {
            let replaced = await replaceProjectAssetBytes(
              asset,
              new Uint8Array(buf)
            );
            if (!replaced) {
              // The bytes go under the storage key and the row is saved with
              // them, unless the asset's bytes were moved into the folder
              // while this request waited for that move.
              const stored = await storeLegacyAssetBytes(asset, async () => {
                asset.size = buf.byteLength;
                await storeAssetWithThumbnail(
                  asset.user_id,
                  asset.id,
                  fileName,
                  new Uint8Array(buf),
                  asset.content_type
                );
                await asset.save();
              });
              savedWithBytes = stored === "stored";
              if (stored === "moved") {
                replaced = await replaceProjectAssetBytes(
                  asset,
                  new Uint8Array(buf)
                );
              }
            }
            if (replaced) fileChanges.push(replaced);
          } catch (error) {
            if (error instanceof UploadTooLargeError) {
              throwApiError(
                ApiErrorCode.ASSET_UPLOAD_FAILED,
                uploadTooLargeMessage(error),
                "PAYLOAD_TOO_LARGE"
              );
            }
            throw error;
          }
        }

        if (targetDirectory !== null && hasProjectFile) {
          const moved = await moveProjectAssetToDirectory(
            asset,
            targetDirectory
          );
          if (moved) fileChanges.push(moved);
        }
        if (input.name !== undefined) {
          const renamed = await renameProjectAssetFile(asset, input.name);
          if (renamed) fileChanges.push(renamed);
        }

        const saved = savedWithBytes
          ? undefined
          : input.expected_metadata !== undefined
            ? await asset.saveIfMetadataMatches(input.expected_metadata)
            : await asset.save();
        if (saved === false) {
          throwApiError(
            ApiErrorCode.ALREADY_EXISTS,
            "Asset metadata changed. Reload it and try again."
          );
        }
      } catch (error) {
        for (const change of fileChanges.reverse()) await change.undo();
        rethrowFolderError(error);
      }
      for (const change of fileChanges) await change.commit();
      return toAssetResponse(asset);
    }),

  delete: protectedProcedure
    .input(deleteInput)
    .output(deleteOutput)
    .mutation(async ({ ctx, input }) => {
      const directory = parseProjectDirectoryId(input.id);
      if (directory) {
        await requireOwnDirectory(ctx.userId, directory);
        try {
          const deleted = await deleteProjectDirectory(ctx.userId, directory);
          return { deleted_asset_ids: [...deleted, input.id] };
        } catch (error) {
          rethrowFolderError(error);
        }
      }
      const asset = await Asset.find(ctx.userId, input.id);
      if (!asset) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Asset not found");
      }
      assertWritable(asset);

      let deletedAssetIds: string[];
      try {
        if (asset.content_type === "folder" && listsByDirectory(asset.project_id)) {
          // Inside a project a legacy folder row stands for the directory its
          // chain spells, which also holds the files moved into it.
          const folders = await Asset.listFolders(ctx.userId);
          const path = new ProjectDirectoryResolver(
            asset.project_id,
            new Map(folders.map((row) => [row.id, row]))
          ).pathOfFolder(asset);
          deletedAssetIds = await deleteProjectDirectory(ctx.userId, {
            projectId: asset.project_id,
            path
          });
        } else if (asset.content_type === "folder") {
          deletedAssetIds = await deleteFolderRecursive(ctx.userId, asset.id);
        } else {
          await deleteAssetWithObjects(asset);
          deletedAssetIds = [asset.id];
        }
      } catch (error) {
        rethrowFolderError(error);
      }
      return { deleted_asset_ids: deletedAssetIds };
    }),

  recursive: protectedProcedure
    .input(recursiveInput)
    .output(recursiveOutput)
    .query(async ({ ctx, input }) => {
      const directory = parseProjectDirectoryId(input.id);
      const projectId = directory?.projectId ?? input.project_id;
      if (listsByDirectory(projectId)) {
        if (directory) await requireOwnDirectory(ctx.userId, directory);
        const index = await loadProjectDirectoryIndex(ctx.userId, projectId);
        const tree = await listProjectDirectoryTree(
          index,
          index.resolver.directoryOfParent(input.id)
        );
        return {
          assets: [
            ...tree.directories.map((dir) =>
              directoryFolderResponse(ctx.userId, projectId, dir)
            ),
            ...(await Promise.all(tree.assets.map((a) => toAssetResponse(a))))
          ]
        };
      }
      const assets = await getAllAssetsRecursive(
        ctx.userId,
        input.id,
        input.project_id
      );
      return {
        assets: await Promise.all(assets.map((a) => toAssetResponse(a)))
      };
    }),

  search: protectedProcedure
    .input(searchInput)
    .output(searchOutput)
    .query(async ({ ctx, input }) => {
      // Filter by name at the DB level across ALL of the user's assets. The
      // previous implementation paginated the first `page_size` assets and then
      // filtered those in memory, so anything past the first page (e.g. a "Cat"
      // asset in a 500-item library) was never found.
      const searchOptions: Parameters<typeof Asset.searchAssetsGlobal>[2] = {
        limit: input.page_size
      };
      if (input.content_type) {
        searchOptions.contentType = input.content_type;
      }
      if (input.project_id !== undefined) {
        searchOptions.projectId = input.project_id;
      }
      if (input.cursor) {
        searchOptions.cursor = input.cursor;
      }
      const [matched, nextCursor] = await Asset.searchAssetsGlobal(
        ctx.userId,
        input.query,
        searchOptions
      );
      return {
        assets: await Promise.all(matched.map((a) => toAssetResponse(a))),
        next_cursor: nextCursor || null,
        total_count: matched.length,
        is_global_search: input.workflow_id === undefined
      };
    })
});
