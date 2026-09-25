/**
 * Resolve an asset storage key to the file an external asset references in
 * place (see `Asset.external_path`).
 *
 * The local `FileStorageAdapter` and the `/api/storage` stream call this after
 * a key misses under the storage root. Every key-based reader then finds an
 * external asset's bytes without knowing about asset rows.
 */
import { Asset } from "@nodetool-ai/models";
import { assetKeyOwner, normalizeStorageKey } from "@nodetool-ai/storage";
import { getAssetFileName } from "./asset-paths.js";
import { isRuntimeScratchKey } from "./storage-access.js";

/**
 * The external path behind `<owner>/<assetId>.<ext>` (or `<owner>/<assetId>`),
 * or null. Only full asset ids resolve, only for the owner the key names, and
 * only when the extension matches the one the row's content type maps to.
 * Legacy flat keys and runtime scratch keys never resolve: external rows are
 * always created under the owner-prefixed layout.
 */
export async function lookupExternalAssetPath(
  key: string
): Promise<string | null> {
  if (isRuntimeScratchKey(key)) return null;
  const owner = assetKeyOwner(key);
  if (!owner) return null;
  const fileName = normalizeStorageKey(key).slice(owner.length + 1);
  if (!fileName || fileName.includes("/")) return null;
  const dot = fileName.lastIndexOf(".");
  const assetId = dot > 0 ? fileName.slice(0, dot) : fileName;
  const asset = await Asset.find(owner, assetId);
  if (!asset?.external_path || asset.id !== assetId) return null;
  if (dot > 0 && fileName !== getAssetFileName(asset.id, asset.content_type)) {
    return null;
  }
  return asset.external_path;
}
