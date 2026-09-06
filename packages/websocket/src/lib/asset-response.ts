/**
 * The wire shape of one asset row, shared by the REST asset routes and the
 * tRPC `assets.*` procedures.
 *
 * Both surfaces answer the same JSON, so both mint it here: the same field
 * list, the same owner-prefixed storage keys, and the same lazily-built URL
 * builder. A field added on one path used to have to be added on the other.
 */

import type { Asset } from "@nodetool-ai/models";
import { loadAssetStorageConfig, type StorageConfig } from "@nodetool-ai/config";
import { assetObjectKey, createAssetUrlBuilder } from "@nodetool-ai/storage";
import type { AssetResponse } from "@nodetool-ai/protocol/api-schemas/assets.js";

import { getAssetFileName } from "./asset-paths.js";
import { assetHasRasterThumbnail, thumbnailKey } from "./thumbnail.js";

let cachedConfig: StorageConfig | null = null;
let cachedBuilder: ((key: string) => Promise<string>) | null = null;

/**
 * The URL builder for the configured storage backend, rebuilt when the
 * backend kind changes (a test switching backends mid-process).
 */
function assetUrlBuilder(): (key: string) => Promise<string> {
  const config = loadAssetStorageConfig();
  if (!cachedBuilder || cachedConfig?.kind !== config.kind) {
    cachedConfig = config;
    cachedBuilder = createAssetUrlBuilder(config);
  }
  return cachedBuilder;
}

export async function toAssetResponse(asset: Asset): Promise<AssetResponse> {
  const isFolder = asset.content_type === "folder";
  const fileName = isFolder
    ? null
    : getAssetFileName(asset.id, asset.content_type);
  // Owner-prefixed keys. Objects written before this layout are flat; the
  // `/api/storage` route falls back to the legacy path on a miss, and cloud
  // backends need `nodetool storage migrate-keys` (see docs/configuration.md).
  const getUrl = fileName
    ? await assetUrlBuilder()(assetObjectKey(asset.user_id, fileName)).catch(
        () => null
      )
    : null;

  const hasThumbnail = assetHasRasterThumbnail(asset.content_type);
  const thumbUrl = hasThumbnail
    ? await assetUrlBuilder()(
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
