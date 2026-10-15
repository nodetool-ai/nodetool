/**
 * The storage this install's project files read from and write to. The HTTP
 * routes and the `nodetool projects` CLI commands share it, so a file
 * exported by one imports through the other.
 */
import { getAssetFileName, getAssetStorageKey, getAssetThumbnailKey } from "./asset-paths.js";
import type { OpenWorkspace } from "./project-archive.js";
import { getAssetAdapter } from "./storage.js";
import { storeAssetWithThumbnail } from "./thumbnail.js";
import { workspaceFromRow } from "./workflow-workspace.js";

export function projectArchiveHost(): {
  storage: ReturnType<typeof getAssetAdapter>;
  openWorkspace: OpenWorkspace;
  removeAssetBytes: (userId: string, assetId: string, contentType: string) => Promise<void>;
  storeAssetBytes: (args: {
    userId: string;
    assetId: string;
    contentType: string;
    bytes: Uint8Array;
  }) => Promise<void>;
} {
  return {
    storage: getAssetAdapter(),
    openWorkspace: workspaceFromRow,
    removeAssetBytes: async (userId, assetId, contentType) => {
      const storage = getAssetAdapter();
      await Promise.all([
        storage.delete(storage.uriForKey(getAssetStorageKey(userId, assetId, contentType))),
        storage.delete(storage.uriForKey(getAssetThumbnailKey(userId, assetId)))
      ]);
    },
    storeAssetBytes: ({ userId, assetId, contentType, bytes }) =>
      storeAssetWithThumbnail(
        userId,
        assetId,
        getAssetFileName(assetId, contentType),
        bytes,
        contentType
      )
  };
}
