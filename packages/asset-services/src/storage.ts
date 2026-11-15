import {
  loadAssetStorageConfig,
  loadTempStorageConfig
} from "@nodetool-ai/config";
import {
  createStorageAdapter,
  FileStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import {
  installAssetFolderLookup,
  lookupExternalAssetPath
} from "./external-asset-lookup.js";
import { ProjectAssetStorageAdapter } from "./project-asset-storage.js";

let _assetAdapter: StorageAdapter | null = null;
let _tempAdapter: StorageAdapter | null = null;

/**
 * The asset store. A key with no object under it is resolved through the
 * asset row: to the asset's file in its project folder, then to a file it
 * references in place. The local file backend resolves to a path, and an
 * object store reads the project file through its workspace.
 * Server-built `ProcessingContext`s receive this instance as `assetStorage`.
 */
export function getAssetAdapter(): StorageAdapter {
  if (!_assetAdapter) {
    const config = loadAssetStorageConfig();
    // Adapters other code builds over the same folder resolve the same way.
    if (config.kind === "file") installAssetFolderLookup();
    _assetAdapter =
      config.kind === "file"
        ? new FileStorageAdapter(config.rootDir, {
            externalPathLookup: lookupExternalAssetPath
          })
        : new ProjectAssetStorageAdapter(createStorageAdapter(config));
  }
  return _assetAdapter;
}

export function getTempAdapter(): StorageAdapter {
  if (!_tempAdapter) _tempAdapter = createStorageAdapter(loadTempStorageConfig());
  return _tempAdapter;
}
