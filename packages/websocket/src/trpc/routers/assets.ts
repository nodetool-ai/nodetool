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
import { createAssetUrlBuilder } from "@nodetool-ai/storage";
import { getAssetFileName } from "../../lib/asset-paths.js";
import {
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
  createInput,
  updateInput,
  deleteInput,
  deleteOutput,
  childrenInput,
  childrenOutput,
  recursiveInput,
  recursiveOutput,
  searchInput,
  searchOutput,
  byFilenameInput,
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
  const getUrl = fileName
    ? await getUrlBuilder()(fileName).catch(() => null)
    : null;

  const hasThumbnail =
    asset.content_type.startsWith("image/") ||
    asset.content_type.startsWith("video/") ||
    asset.content_type.startsWith("audio/") ||
    asset.content_type === "application/pdf";
  const thumbUrl = hasThumbnail
    ? await getUrlBuilder()(thumbnailKey(asset.id)).catch(() => null)
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

/** Recursively delete a folder and collect all deleted asset ids. */
async function deleteFolderRecursive(
  userId: string,
  folderId: string
): Promise<string[]> {
  const deletedIds: string[] = [];
  const children = await Asset.getChildren(userId, folderId, 10000);
  for (const child of children) {
    if (child.content_type === "folder") {
      const subDeleted = await deleteFolderRecursive(userId, child.id);
      deletedIds.push(...subDeleted);
    } else {
      await child.delete();
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
  folderId: string
): Promise<AssetModel[]> {
  const collected: AssetModel[] = [];
  const children = await Asset.getChildren(userId, folderId, 10000);
  for (const child of children) {
    collected.push(child);
    if (child.content_type === "folder") {
      const subAssets = await getAllAssetsRecursive(userId, child.id);
      collected.push(...subAssets);
    }
  }
  return collected;
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

  create: protectedProcedure
    .input(createInput)
    .output(assetResponse)
    .mutation(async ({ ctx, input }) => {
      const asset = (await Asset.create({
        user_id: ctx.userId,
        name: input.name,
        content_type: input.content_type,
        parent_id: input.parent_id,
        workflow_id: input.workflow_id ?? null,
        node_id: input.node_id ?? null,
        job_id: input.job_id ?? null,
        timeline_id: input.timeline_id ?? null,
        metadata: input.metadata ?? null,
        sketch_document_id: input.sketch_document_id ?? null,
        size: input.size ?? null
      })) as unknown as AssetModel;
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
      if (input.parent_id !== undefined) asset.parent_id = input.parent_id;
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
        await asset.delete();
        deletedAssetIds = [input.id];
      }
      return { deleted_asset_ids: deletedAssetIds };
    }),

  children: protectedProcedure
    .input(childrenInput)
    .output(childrenOutput)
    .query(async ({ ctx, input }) => {
      const [assets] = await Asset.paginate(ctx.userId, {
        parentId: input.id,
        limit: input.limit
      });
      return {
        assets: assets.map((a) => ({
          id: a.id,
          name: a.name,
          content_type: a.content_type
        })),
        // Legacy returned `null` here; pagination isn't wired through for children.
        next: null
      };
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
    }),

  byFilename: protectedProcedure
    .input(byFilenameInput)
    .output(assetResponse)
    .query(async ({ ctx, input }) => {
      const [assets] = await Asset.paginate(ctx.userId, { limit: 10000 });
      const asset = assets.find((a) => a.name === input.filename) ?? null;
      if (!asset) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Asset not found");
      }
      return toAssetResponse(asset);
    })
});
