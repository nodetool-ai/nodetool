import {
  loadAssetStorageConfig,
  loadTempStorageConfig
} from "@nodetool-ai/config";
import { createStorageAdapter, type StorageAdapter } from "@nodetool-ai/storage";

let _assetAdapter: StorageAdapter | null = null;
let _tempAdapter: StorageAdapter | null = null;

export function getAssetAdapter(): StorageAdapter {
  if (!_assetAdapter) _assetAdapter = createStorageAdapter(loadAssetStorageConfig());
  return _assetAdapter;
}

export function getTempAdapter(): StorageAdapter {
  if (!_tempAdapter) _tempAdapter = createStorageAdapter(loadTempStorageConfig());
  return _tempAdapter;
}
