/**
 * The server's side of a receive from a cloud project: the storage it reads
 * files from, the access rules it checks and the reference sets that decide
 * which files a reader gets (`@nodetool-ai/project-services/cloud-receive`).
 */
import { Asset } from "@nodetool-ai/models";
import { refsOf } from "@nodetool-ai/protocol";
import type { ReceiveHost } from "@nodetool-ai/project-services/cloud-receive";
import { effectiveAccess } from "./document-access.js";
import { readableFilesOf } from "./document-refs.js";
import { getAssetAdapter } from "./storage.js";

export function receiveHost(): ReceiveHost {
  return {
    storage: getAssetAdapter(),
    async documentRole(userId, kind, id) {
      return (await effectiveAccess(userId, kind, id))?.role ?? null;
    },
    async readableFiles(userId, kind, id, content) {
      const access = await effectiveAccess(userId, kind, id);
      if (!access) return [];
      const files = await readableFilesOf(kind, id, access, [...new Set(refsOf(kind, content))]);
      const out = [];
      for (const assetId of files) {
        const asset = await Asset.get<Asset>(assetId);
        out.push({
          assetId,
          hash: asset?.content_hash ?? null,
          size: Number(asset?.size ?? 0),
          name: asset?.name ?? assetId,
          contentType: asset?.content_type ?? "application/octet-stream",
          path: asset?.workspace_path ?? null
        });
      }
      return out;
    }
  };
}
