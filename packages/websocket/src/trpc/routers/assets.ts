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
import { Asset } from "@nodetool-ai/models";
import type { Asset as AssetModel } from "@nodetool-ai/models";
import {
  createLogger,
  loadAssetStorageConfig,
  type StorageConfig
} from "@nodetool-ai/config";

const log = createLogger("nodetool.assets");
import {
  assetKeyCandidates,
  assetObjectKey,
  createAssetUrlBuilder,
  getMaxUploadBytes
} from "@nodetool-ai/storage";
import {
  getAssetFileName,
  getAssetStorageKey,
  normalizeAssetContentType,
  assetFileNameCandidates
} from "../../lib/asset-paths.js";
import { getAssetAdapter } from "../../lib/storage.js";
import {
  assetHasRasterThumbnail,
  generateThumbnailForStoredAsset,
  storeAssetWithThumbnail,
  thumbnailKey,
  THUMBNAIL_SOURCE_MAX_BYTES
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

// Lazily initialized URL builder based on the configured storage backend.
let _storageConfig: StorageConfig | null = null;
let _urlBuilder: ((key: string) => Promise<string>) | null = null;

function getUrlBuilder(): (key: string) => Promise<string> {
  const config = loadAssetStorageConfig();
  // Recreate if the config kind changed (e.g. test env switching backends).
  if (!_urlBuilder || _storageConfig?.kind !== config.kind) {
    _storageConfig = config;
    _urlBuilder = createAssetUrlBuilder(config);
  }
  return _urlBuilder;
}

async function toAssetResponse(asset: AssetModel): Promise<AssetResponse> {
  const isFolder = asset.content_type === "folder";
  const fileName = isFolder
    ? null
    : getAssetFileName(asset.id, asset.content_type);
  // Owner-prefixed keys. Objects written before this layout are flat; the
  // `/api/storage` route falls back to the legacy path on a miss, and cloud
  // backends need `nodetool storage migrate-keys` (see docs/configuration.md).
  const getUrl = fileName
    ? await getUrlBuilder()(assetObjectKey(asset.user_id, fileName)).catch(
        () => null
      )
    : null;

  const hasThumbnail = assetHasRasterThumbnail(asset.content_type);
  const thumbUrl = hasThumbnail
    ? await getUrlBuilder()(
        assetObjectKey(asset.user_id, thumbnailKey(asset.id))
      ).catch(() => null)
    : null;

  return {
    id: asset.id,
    user_id: asset.user_id,
    workflow_id: asset.workflow_id ?? null,
    parent_id: asset.parent_id ?? null,
    name: asset.name,
    content_type: asset.content_type,
    size: asset.size ?? null,
    metadata: asset.metadata ?? null,
    sketch_document_id: asset.sketch_document_id ?? null,
    created_at: asset.created_at,
    get_url: getUrl,
    thumb_url: thumbUrl,
    duration: asset.duration ?? null,
    node_id: asset.node_id ?? null,
    job_id: asset.job_id ?? null,
    timeline_id: asset.timeline_id ?? null
  };
}

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
  const fileNames = [
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

  const deletedIds: string[] = [];
  const children = await Asset.getChildren(userId, folderId, 10000);
  for (const child of children) {
    if (child.content_type === "folder") {
      const subDeleted = await deleteFolderRecursive(userId, child.id, visited);
      deletedIds.push(...subDeleted);
    } else {
      await deleteAssetWithObjects(child);
      deletedIds.push(child.id);
    }
  }
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
  visited: Set<string> = new Set()
): Promise<AssetModel[]> {
  if (visited.has(folderId)) return [];
  visited.add(folderId);

  const collected: AssetModel[] = [];
  const children = await Asset.getChildren(userId, folderId, 10000);
  for (const child of children) {
    collected.push(child);
    if (child.content_type === "folder") {
      const subAssets = await getAllAssetsRecursive(userId, child.id, visited);
      collected.push(...subAssets);
    }
  }
  return collected;
}

/**
 * Reject a `parent_id` that would corrupt the folder tree: a missing parent,
 * a non-folder parent, the asset itself, or any of its own descendants. A
 * cycle can't be walked out of later — every recursive helper would loop —
 * so it has to be refused at write time.
 */
async function assertValidParent(
  userId: string,
  asset: AssetModel,
  parentId: string
): Promise<void> {
  // The synthetic "Home" folder is the user id itself and has no row.
  if (parentId === userId) return;

  if (parentId === asset.id) {
    throwApiError(
      ApiErrorCode.INVALID_INPUT,
      "An asset cannot be its own parent"
    );
  }

  const parent = await Asset.find(userId, parentId);
  if (!parent) {
    throwApiError(ApiErrorCode.INVALID_INPUT, "Parent folder not found");
  }
  if (parent.content_type !== "folder") {
    throwApiError(ApiErrorCode.INVALID_INPUT, "Parent must be a folder");
  }

  // Walk up from the new parent: reaching the asset means the move would put
  // it under one of its own descendants.
  const seen = new Set<string>([parentId]);
  let currentId: string | null = parent.parent_id ?? null;
  while (currentId && currentId !== userId) {
    if (currentId === asset.id) {
      throwApiError(
        ApiErrorCode.INVALID_INPUT,
        "Cannot move an asset into one of its own descendants"
      );
    }
    if (seen.has(currentId)) break; // pre-existing cycle; nothing more to learn
    seen.add(currentId);
    const ancestor: AssetModel | null = await Asset.find(userId, currentId);
    if (!ancestor) break;
    currentId = ancestor.parent_id ?? null;
  }
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
        !input.timeline_id
          ? ctx.userId
          : input.parent_id;

      const [assets, cursor] = await Asset.paginate(ctx.userId, {
        parentId: effectiveParentId,
        contentType: input.content_type,
        workflowId: input.workflow_id,
        nodeId: input.node_id,
        jobId: input.job_id,
        timelineId: input.timeline_id,
        limit: input.page_size
      });
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
      const max = getMaxUploadBytes();
      if (input.size > max) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          `Upload exceeds maximum size: ${input.size} > ${max} bytes`
        );
      }

      const adapter = getAssetAdapter();
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
        // Recorded on finalize from what actually landed, not from the claim.
        size: null
      })) as AssetModel;

      const key = getAssetStorageKey(
        ctx.userId,
        asset.id,
        asset.content_type
      );
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
      // back into this process. Worth it for ordinary media, not for a
      // multi-gigabyte video — those simply go without.
      if (stat.size <= THUMBNAIL_SOURCE_MAX_BYTES) {
        await generateThumbnailForStoredAsset(
          asset.user_id,
          asset.id,
          asset.content_type
        );
      }

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
      if (input.metadata !== undefined) asset.metadata = input.metadata;
      if (input.sketch_document_id !== undefined) {
        asset.sketch_document_id = input.sketch_document_id;
      }
      if (input.timeline_id !== undefined) {
        asset.timeline_id = input.timeline_id;
      }
      if (input.size !== undefined) asset.size = input.size;

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

      await asset.save();
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
      const assets = await getAllAssetsRecursive(ctx.userId, input.id);
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
      const [matched, nextCursor] = await Asset.searchAssetsGlobal(
        ctx.userId,
        input.query,
        {
          ...(input.content_type ? { contentType: input.content_type } : {}),
          ...(input.cursor ? { cursor: input.cursor } : {}),
          limit: input.page_size
        }
      );
      return {
        assets: await Promise.all(matched.map((a) => toAssetResponse(a))),
        next_cursor: nextCursor || null,
        total_count: matched.length,
        is_global_search: input.workflow_id === undefined
      };
    })
});
