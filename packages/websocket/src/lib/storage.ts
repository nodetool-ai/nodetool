import {
  loadAssetStorageConfig,
  loadTempStorageConfig
} from "@nodetool-ai/config";
import {
  createStorageAdapter,
  FileStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import { lookupExternalAssetPath } from "./external-asset-lookup.js";

let _assetAdapter: StorageAdapter | null = null;
let _tempAdapter: StorageAdapter | null = null;

/**
 * The asset store. On the local file backend it also resolves external
 * assets, whose bytes stay at their original path outside the storage root.
 * Server-built `ProcessingContext`s receive this instance as `assetStorage`.
 */
export function getAssetAdapter(): StorageAdapter {
  if (!_assetAdapter) {
    const config = loadAssetStorageConfig();
    _assetAdapter =
      config.kind === "file"
        ? new FileStorageAdapter(config.rootDir, {
            externalPathLookup: lookupExternalAssetPath
          })
        : createStorageAdapter(config);
  }
  return _assetAdapter;
}

export function getTempAdapter(): StorageAdapter {
  if (!_tempAdapter) _tempAdapter = createStorageAdapter(loadTempStorageConfig());
  return _tempAdapter;
}
