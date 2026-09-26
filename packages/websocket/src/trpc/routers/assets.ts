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
import { stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { Asset, Project } from "@nodetool-ai/models";
import type { Asset as AssetModel } from "@nodetool-ai/models";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.assets");
import {
  assetKeyCandidates,
  FileStorageAdapter,
  getMaxLocalUploadBytes,
  getMaxUploadBytes
} from "@nodetool-ai/storage";
import {
  getAssetFileName,
  getAssetStorageKey,
  normalizeAssetContentType,
  assetFileNameCandidates
} from "../../lib/asset-paths.js";
import { getAssetAdapter } from "../../lib/storage.js";
import { toAssetResponse } from "../../lib/asset-response.js";
import { probeAssetDurationSeconds } from "../../lib/asset-duration.js";
import {
  externalAssetsAvailable,
  getExternalAssetThresholdBytes
} from "../../lib/external-assets.js";
import { EXTERNAL_FINGERPRINT_KEYS } from "../../lib/external-asset-lookup.js";
import {
  localPathDenialMessage,
  resolveLocalPath
} from "../../lib/local-file-access.js";
import {
  generateThumbnailForStoredAsset,
  storeAssetWithThumbnail,
  thumbnailKey
} from "../../lib/thumbnail.js";
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
  finalizeUploadInput,
  finalizeUploadOutput,
  deleteInput,
  deleteOutput,
  recursiveInput,
  recursiveOutput,
  searchInput,
  searchOutput
} from "@nodetool-ai/protocol/api-schemas/assets.js";

/**
 * Remove an asset's stored bytes and its thumbnail.
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
  // An external asset's bytes are the user's own file, outside the storage
  // root. Only its thumbnail is ours to remove.
  const fileNames = asset.external_path
    ? [thumbnailKey(asset.id)]
    : [
        ...assetFileNameCandidates(asset.id, asset.content_type),
        thumbnailKey(asset.id)
      ];
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

/** Delete an asset row together with the bytes it points at. */
async function deleteAssetWithObjects(asset: AssetModel): Promise<void> {
  await deleteAssetObjects(asset);
  await asset.delete();
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
async function assertValidParent(
  userId: string,
  asset: AssetModel,
  parentId: string
): Promise<void> {
  const problem = await Asset.validateParent(userId, asset, parentId);
  if (problem) {
    throwApiError(ApiErrorCode.INVALID_INPUT, problem);
  }
}

/**
 * Refuse a write to a shipped system entity — a seeded style preset.
 *
 * The rule is `Asset.systemEntityRefusal`, shared with the sandbox's entity
 * capability so both write surfaces answer the same way; this wrapper only
 * turns it into an HTTP error.
 */
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

export const assetsRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ ctx, input }) => {
      // Default to the user's home folder when no filters at all are set.
      const effectiveParentId =
        input.parent_id === undefined &&
        !input.content_type &&
        !input.workflow_id &&
        !input.node_id &&
        !input.job_id &&
        !input.timeline_id &&
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

      const asset = await Asset.find(ctx.userId, input.id);
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

      // The adapter resolves the new row to its in-place file, so ffmpeg or
      // sharp reads it by path and a file of any size gets a thumbnail.
      await generateThumbnailForStoredAsset(
        asset.user_id,
        asset.id,
        asset.content_type
      );

      return toAssetResponse(asset);
    }),

  /**
   * Point an in-place asset at another file: a moved, renamed, or remounted
   * original, or the same path after the file changed. The id and `get_url`
   * stay the same (D5). The path is validated again (R5), and the new size,
   * mtime, and duration are recorded before the thumbnail is regenerated.
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
      if (!asset.external_path) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          "Only an asset that references a file in place can be relinked"
        );
      }
      const file = await resolveExternalFile(input.path);

      // The URL's extension comes from the content type, so it stays. A file
      // of another media kind (audio for a video clip) is refused. A name
      // with no known type is accepted.
      const kind = (type: string) => type.split("/")[0];
      const offered = normalizeAssetContentType("", basename(file.path));
      if (
        offered !== "application/octet-stream" &&
        kind(offered) !== kind(asset.content_type)
      ) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          `The new file is ${offered}, but this asset is ${asset.content_type}`
        );
      }

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

      return toAssetResponse(asset);
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(assetResponse)
    .mutation(async ({ ctx, input }) => {
      const asset = await Asset.find(ctx.userId, input.id);
      if (!asset) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Asset not found");
      }
      assertWritable(asset);
      const isExternal = Boolean(asset.external_path);
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
      if (input.parent_id !== undefined) {
        await assertValidParent(ctx.userId, asset, input.parent_id);
        asset.parent_id = input.parent_id;
      }
      if (input.metadata !== undefined) {
        asset.metadata = isExternal
          ? withExternalFingerprint(input.metadata, asset.metadata)
          : input.metadata;
      }
      if (input.sketch_document_id !== undefined) {
        asset.sketch_document_id = input.sketch_document_id;
      }
      if (input.timeline_id !== undefined) {
        asset.timeline_id = input.timeline_id;
      }
      // An external asset's size is its file's, recorded by import or relink.
      if (input.size !== undefined && !isExternal) asset.size = input.size;

      if (input.expected_metadata !== undefined && input.data != null) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          "Conditional metadata updates cannot replace asset data"
        );
      }

      if (input.data != null) {
        const buf =
          input.data_encoding === "base64"
            ? Buffer.from(input.data, "base64")
            : Buffer.from(input.data, "utf-8");
        asset.size = buf.byteLength;
        const fileName = getAssetFileName(asset.id, asset.content_type);
        log.info("asset upload (update)", {
          assetId: asset.id,
          fileName,
          contentType: asset.content_type,
          bytes: buf.byteLength
        });
        await storeAssetWithThumbnail(
          asset.user_id,
          asset.id,
          fileName,
          new Uint8Array(buf),
          asset.content_type
        );
      }

      const saved =
        input.expected_metadata !== undefined
          ? await asset.saveIfMetadataMatches(input.expected_metadata)
          : await asset.save();
      if (saved === false) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Asset metadata changed. Reload it and try again."
        );
      }
      return toAssetResponse(asset);
    }),

  delete: protectedProcedure
    .input(deleteInput)
    .output(deleteOutput)
    .mutation(async ({ ctx, input }) => {
      const asset = await Asset.find(ctx.userId, input.id);
      if (!asset) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Asset not found");
      }
      assertWritable(asset);

      let deletedAssetIds: string[];
      if (asset.content_type === "folder") {
        deletedAssetIds = await deleteFolderRecursive(ctx.userId, input.id);
      } else {
        await deleteAssetWithObjects(asset);
        deletedAssetIds = [input.id];
      }
      return { deleted_asset_ids: deletedAssetIds };
    }),

  recursive: protectedProcedure
    .input(recursiveInput)
    .output(recursiveOutput)
    .query(async ({ ctx, input }) => {
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
