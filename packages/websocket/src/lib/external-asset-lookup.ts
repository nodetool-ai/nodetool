/**
 * Resolve an asset storage key to the file an external asset references in
 * place (see `Asset.external_path`), and decide whether that file is offline.
 *
 * The local `FileStorageAdapter` and the `/api/storage` stream call the lookup
 * after a key misses under the storage root. Every key-based reader then finds
 * an external asset's bytes without knowing about asset rows.
 *
 * A file that is missing, no longer a regular file, or whose size or mtime
 * differs from what import or relink recorded is offline. The lookup answers
 * null for an offline file, so every reader (adapter reads, `localPath`, the
 * `/api/storage` stream) reports it as missing instead of serving bytes the
 * asset never pointed at. Relink records the new file and brings it back.
 */
import { stat } from "node:fs/promises";
import { Asset } from "@nodetool-ai/models";
import { assetKeyOwner, normalizeStorageKey } from "@nodetool-ai/storage";
import { getAssetFileName } from "./asset-paths.js";
import { isRuntimeScratchKey } from "./storage-access.js";
import { isFiniteNumber } from "./wire-values.js";

/** The row fields that describe an in-place file. */
export interface ExternalAssetFields {
  external_path: string | null;
  metadata: Record<string, unknown> | null;
}

/** The metadata keys that fingerprint an external file. Server-owned. */
export const EXTERNAL_FINGERPRINT_KEYS = [
  "external_size",
  "external_mtime"
] as const;

function recordedNumber(
  metadata: Record<string, unknown> | null,
  key: (typeof EXTERNAL_FINGERPRINT_KEYS)[number]
): number | null {
  const value = metadata?.[key];
  return isFiniteNumber(value) ? value : null;
}

/** The recorded mtime of an external asset, or null for a managed one. */
export function externalAssetMtime(asset: ExternalAssetFields): number | null {
  if (!asset.external_path) return null;
  return recordedNumber(asset.metadata, "external_mtime");
}

/**
 * The external file behind `asset` when it is present and unchanged, else
 * null. mtimes compare at millisecond granularity. A row with no recorded
 * size or mtime is checked for presence only.
 */
export async function verifiedExternalPath(
  asset: ExternalAssetFields
): Promise<string | null> {
  const path = asset.external_path;
  if (!path) return null;
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(path);
  } catch {
    return null;
  }
  if (!info.isFile()) return null;
  const size = recordedNumber(asset.metadata, "external_size");
  if (size !== null && size !== info.size) return null;
  const mtime = recordedNumber(asset.metadata, "external_mtime");
  if (mtime !== null && Math.trunc(mtime) !== Math.trunc(info.mtimeMs)) {
    return null;
  }
  return path;
}

/**
 * Whether an external asset's file is missing or changed. Always false for a
 * managed asset. One `stat`, so it is cheap enough for every asset response.
 */
export async function isExternalAssetOffline(
  asset: ExternalAssetFields
): Promise<boolean> {
  if (!asset.external_path) return false;
  return (await verifiedExternalPath(asset)) === null;
}

/**
 * The external path behind `<owner>/<assetId>.<ext>` (or `<owner>/<assetId>`),
 * or null. Only full asset ids resolve, only for the owner the key names, and
 * only when the extension matches the one the row's content type maps to.
 * Legacy flat keys and runtime scratch keys never resolve: external rows are
 * always created under the owner-prefixed layout. An offline file resolves to
 * null.
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
  return verifiedExternalPath(asset);
}
