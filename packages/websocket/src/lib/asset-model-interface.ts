/**
 * The server's `createAsset` model interface: persist bytes through the
 * storage layer (with a thumbnail) and save the Asset row. One implementation
 * for every ProcessingContext the server hands out — chat turns, MCP
 * sessions, and workflow runs — so an artifact persists identically no matter
 * which surface produced it.
 */
import { Asset } from "@nodetool-ai/models";
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
