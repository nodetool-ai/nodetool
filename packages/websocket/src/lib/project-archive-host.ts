/**
 * The storage this install's project files read from and write to. The HTTP
 * routes and the `nodetool projects` CLI commands share it, so a file
 * exported by one imports through the other.
 */
import { getAssetFileName } from "./asset-paths.js";
import type { OpenWorkspace } from "./project-archive.js";
import { getAssetAdapter } from "./storage.js";
import { storeAssetWithThumbnail } from "./thumbnail.js";
import { workspaceFromRow } from "./workflow-workspace.js";

export function projectArchiveHost(): {
  storage: ReturnType<typeof getAssetAdapter>;
  openWorkspace: OpenWorkspace;
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
