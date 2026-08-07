/**
 * The server's `createAsset` model interface: persist bytes through the
 * storage layer (with a thumbnail) and save the Asset row. One implementation
 * for every ProcessingContext the server hands out — chat turns, MCP
 * sessions, and workflow runs — so an artifact persists identically no matter
 * which surface produced it.
 */
import { Asset } from "@nodetool-ai/models";
import { storeAssetWithThumbnail } from "./thumbnail.js";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/html": "html",
  "model/gltf-binary": "glb"
};

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
    content_type: args.contentType,
    // No explicit parent means the user's home folder — the same default the
    // upload path uses. `null` orphaned generated assets from every
    // folder-scoped listing while global search still found them.
    parent_id: args.parentId ?? args.userId
  });
  if (args.content) {
    const ext = MIME_TO_EXT[args.contentType] ?? "bin";
    const key = `${asset.id}.${ext}`;
    await storeAssetWithThumbnail(
      asset.user_id,
      asset.id,
      key,
      args.content,
      args.contentType
    );
    asset.size = args.content.length;
  }
  await asset.save();
  return asset;
}
