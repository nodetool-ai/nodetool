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
import {
  assetObjectKey,
  createAssetUrlBuilder,
  type AssetUrlBuilder
} from "@nodetool-ai/storage";
import type { AssetResponse } from "@nodetool-ai/protocol/api-schemas/assets.js";

import { getAssetFileName } from "./asset-paths.js";
import { assetHasRasterThumbnail, thumbnailKey } from "./thumbnail.js";
import {
  externalAssetMtime,
  isExternalAssetOffline
} from "./external-asset-lookup.js";
import { videoProxyState } from "./video-proxy.js";
import { getAssetAdapter } from "./storage.js";
import {
  isProjectAssetOffline,
  projectAssetFile,
  projectAssetMtime
} from "@nodetool-ai/asset-services/project-asset-file";
import { storageKeyForUri } from "@nodetool-ai/asset-services/project-asset-storage";
import {
  directoryFolderId,
  directoryName,
  listsByDirectory,
  parentDirectory
} from "@nodetool-ai/protocol";

let cachedConfig: StorageConfig | null = null;
let cachedBuilder: AssetUrlBuilder | null = null;

/**
 * The URL builder for the configured storage backend, rebuilt when the
 * backend kind changes (a test switching backends mid-process).
 */
function assetUrlBuilder(): AssetUrlBuilder {
  const config = loadAssetStorageConfig();
  if (!cachedBuilder || cachedConfig?.kind !== config.kind) {
    cachedConfig = config;
    cachedBuilder = createAssetUrlBuilder(config);
  }
  return cachedBuilder;
}

/**
 * The storage key `get_url` is built for. It is the asset's id key
 * `<owner>/<assetId>.<ext>`, which the `/api/storage` route resolves through
 * the asset row to a file in the project folder.
 *
 * An object store hands clients a signed URL of one object and has no route
 * that could resolve a row. There, the URL of an asset whose file is in a
 * storage-backed project folder is signed for the file's own object. The
 * asset response stays the one place a client gets the URL from, so
 * references remain the asset's id.
 */
async function assetUrlKey(asset: Asset, fileName: string): Promise<string> {
  const idKey = assetObjectKey(asset.user_id, fileName);
  if (!asset.workspace_path) return idKey;
  const adapter = getAssetAdapter();
  if (!adapter.createDownloadUrl) return idKey;
  const file = await projectAssetFile(asset);
  const fileKey = file
    ? storageKeyForUri(adapter, file.workspace.uri(file.path))
    : null;
  return fileKey ?? idKey;
}

/**
 * The folder an asset lists in. Inside a project, an asset with a file sits
 * in the directory of that file, whatever `parent_id` the row holds, so a
 * client that sends the parent back unchanged never moves the file.
 */
function responseParentId(asset: Asset): string | null {
  if (asset.workspace_path && listsByDirectory(asset.project_id)) {
    return directoryFolderId(
      asset.user_id,
      asset.project_id,
      parentDirectory(asset.workspace_path)
    );
  }
  return asset.parent_id ?? null;
}

export async function toAssetResponse(asset: Asset): Promise<AssetResponse> {
  const isFolder = asset.content_type === "folder";
  const fileName = isFolder
    ? null
    : getAssetFileName(asset.id, asset.content_type);
  // Owner-prefixed keys. Objects written before this layout are flat; the
  // `/api/storage` route falls back to the legacy path on a miss, and cloud
  // backends need `nodetool storage migrate-keys` (see docs/configuration.md).
  // The row's `updated_at` versions the URL: an unchanged asset gets the URL
  // it got last time, so the browser serves the bytes from its cache.
  const version = asset.updated_at;
  const buildUrl = assetUrlBuilder();
  const hasThumbnail = assetHasRasterThumbnail(asset.content_type);
  const [getUrl, thumbKeyUrl] = await Promise.all([
    fileName
      ? assetUrlKey(asset, fileName)
          .then((key) => buildUrl(key, version))
          .catch(() => null)
      : null,
    hasThumbnail
      ? buildUrl(
          assetObjectKey(asset.user_id, thumbnailKey(asset.id)),
          version
        ).catch(() => null)
      : null
  ]);
  // The thumbnail is stored under the asset's id alone. A relink regenerates
  // an external asset's thumbnail under that key, and the reconcile does the
  // same for a project file another app saved over. The file's mtime in the
  // URL keeps a cached thumbnail of the previous file from standing in for
  // the new one. `get_url` stays unversioned (D5).
  const fileMtime = externalAssetMtime(asset) ?? projectAssetMtime(asset);
  const thumbUrl =
    thumbKeyUrl && fileMtime !== null
      ? `${thumbKeyUrl}?v=${Math.trunc(fileMtime)}`
      : thumbKeyUrl;

  const response: AssetResponse = {
    id: asset.id,
    user_id: asset.user_id,
    workflow_id: asset.workflow_id ?? null,
    parent_id: responseParentId(asset),
    name: asset.name,
    content_type: asset.content_type,
    size: asset.size ?? null,
    metadata: asset.metadata ?? null,
    sketch_document_id: asset.sketch_document_id ?? null,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
    get_url: getUrl,
    thumb_url: thumbUrl,
    duration: asset.duration ?? null,
    node_id: asset.node_id ?? null,
    job_id: asset.job_id ?? null,
    timeline_id: asset.timeline_id ?? null,
    project_id: asset.project_id,
    favorite: asset.favorite
  };
  if (asset.workspace_path) response.workspace_path = asset.workspace_path;
  // Only assets that reference a file in place carry the flag, and an asset
  // whose file the reconciler found missing from its project folder.
  if (asset.external_path) {
    response.offline = await isExternalAssetOffline(asset);
    response.linked = true;
  } else if (isProjectAssetOffline(asset)) {
    response.offline = true;
  }
  // Video on a local server: whether the preview may play the proxy. The URL
  // carries the source version, so a remade proxy is never served from cache.
  const proxy = await videoProxyState(asset);
  if (proxy) {
    response.proxy_status = proxy.status;
    response.proxy_url =
      proxy.key !== null
        ? await assetUrlBuilder()(proxy.key)
            .then((url) => `${url}?v=${proxy.version}`)
            .catch(() => null)
        : null;
  }
  return response;
}

/** A directory of a project folder as the folder entry the browser lists. */
export function directoryFolderResponse(
  userId: string,
  projectId: string,
  directory: { path: string; modifiedAt: number | null }
): AssetResponse {
  const created = new Date(directory.modifiedAt ?? 0).toISOString();
  return {
    id: directoryFolderId(userId, projectId, directory.path),
    user_id: userId,
    workflow_id: null,
    parent_id: directoryFolderId(
      userId,
      projectId,
      parentDirectory(directory.path)
    ),
    name: directoryName(directory.path),
    content_type: "folder",
    size: null,
    metadata: null,
    sketch_document_id: null,
    created_at: created,
    updated_at: created,
    get_url: null,
    thumb_url: null,
    duration: null,
    node_id: null,
    job_id: null,
    timeline_id: null,
    project_id: projectId
  };
}
