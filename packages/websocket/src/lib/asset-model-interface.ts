/**
 * The server's asset model interfaces: `createAsset` persists bytes through
 * the storage layer (with a thumbnail) and saves the Asset row;
 * `updateAssetBytes` overwrites an existing asset's bytes in place. One
 * implementation each for every ProcessingContext the server hands out — chat
 * turns, MCP sessions, and workflow runs — so an artifact persists identically
 * no matter which surface produced it.
 */
import { Asset } from "@nodetool-ai/models";
import type { AssetInfoEntry } from "@nodetool-ai/runtime";
import { storeAssetWithThumbnail } from "./thumbnail.js";
import {
  getAssetFileName,
  normalizeAssetContentType
} from "./asset-paths.js";

export interface CreateAssetArgs {
  userId: string;
  workflowId?: string | null;
  jobId?: string | null;
  nodeId?: string | null;
  name: string;
  contentType: string;
  content?: Uint8Array | null;
  parentId?: string | null;
  /** Stored on the row; the generation seam stamps `generation_id`. */
  metadata?: Record<string, unknown> | null;
}

export async function createAssetModelInterface(
  args: CreateAssetArgs
): Promise<Asset> {
  const asset = new Asset({
    user_id: args.userId,
    workflow_id: args.workflowId ?? null,
    node_id: args.nodeId ?? null,
    job_id: args.jobId ?? null,
    name: args.name,
    content_type: normalizeAssetContentType(args.contentType, args.name),
    // No explicit parent means the user's home folder — the same default the
    // upload path uses. `null` orphaned generated assets from every
    // folder-scoped listing while global search still found them.
    parent_id: args.parentId ?? args.userId
  });
  if (args.metadata && Object.keys(args.metadata).length > 0) {
    asset.metadata = { ...args.metadata };
  }
  if (args.content) {
    const key = getAssetFileName(asset.id, asset.content_type);
    await storeAssetWithThumbnail(
      asset.user_id,
      asset.id,
      key,
      args.content,
      asset.content_type
    );
    asset.size = args.content.length;
  }
  await asset.save();
  return asset;
}

export interface UpdateAssetBytesArgs {
  userId: string;
  assetId: string;
  content: Uint8Array;
  contentType?: string;
  name?: string;
}

/**
 * The server's `updateAssetBytes` model interface: overwrite an owned asset's
 * bytes in place, the same write `assets.update` performs when the editor
 * saves. Returns null when the asset is missing or belongs to someone else.
 *
 * Changing the content type to one with a different extension without new
 * bytes would orphan the object, so the bytes are always required here.
 */
export async function updateAssetBytesModelInterface(
  args: UpdateAssetBytesArgs
): Promise<AssetInfoEntry | null> {
  const asset = await Asset.find(args.userId, args.assetId);
  if (!asset) {
    return null;
  }
  if (args.contentType) {
    asset.content_type = normalizeAssetContentType(args.contentType, asset.name);
  }
  if (args.name) {
    asset.name = args.name;
  }
  const key = getAssetFileName(asset.id, asset.content_type);
  await storeAssetWithThumbnail(
    asset.user_id,
    asset.id,
    key,
    args.content,
    asset.content_type
  );
  asset.size = args.content.length;
  await asset.save();
  return {
    id: asset.id,
    content_type: asset.content_type,
    name: asset.name,
    metadata: asset.metadata ?? null
  };
}
