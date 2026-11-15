/**
 * Resolve an asset storage key to the file its row points at, and decide
 * whether an external file is offline.
 *
 * A reader builds the key `<owner>/<assetId>.<ext>` and never reads the asset
 * row. The local `FileStorageAdapter` and the `/api/storage` stream call the
 * lookup after that key misses under the storage root, so every key-based
 * reader finds the bytes of an asset that keeps none there. The row is tried
 * in this order:
 *
 * 1. `workspace_path`: the asset's file in its project's folder.
 * 2. `external_path`: a file referenced in place (local mode only).
 *
 * The legacy storage key is what missed before the lookup ran, so an asset
 * created before project folders is served from it without reaching here.
 *
 * An external file that is missing, no longer a regular file, or whose size
 * or mtime differs from what import or relink recorded is offline. The lookup
 * answers null for an offline file, so every reader (adapter reads,
 * `localPath`, the `/api/storage` stream) reports it as missing instead of
 * serving bytes the asset never pointed at. Relink records the new file and
 * brings it back. A project file carries no such gate: editing it in another
 * app is how its asset changes.
 */
import { stat } from "node:fs/promises";
import { Asset } from "@nodetool-ai/models";
import { assetKeyOwner, normalizeStorageKey } from "@nodetool-ai/storage";
import { getAssetFileName } from "./asset-paths.js";
import { isRuntimeScratchKey } from "./scratch-keys.js";
import { isFiniteNumber } from "@nodetool-ai/protocol";
import {
  localProjectAssetPath,
  projectAssetFile,
  type ProjectAssetFile
} from "./project-asset-file.js";

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

/** An asset row found for a storage key, and how the key named it. */
interface KeyedAsset {
  asset: Asset;
  /** The key carried the full asset id, not its 12-character short form. */
  fullId: boolean;
}

/**
 * The asset row behind `<owner>/<assetId>.<ext>` (or `<owner>/<assetId>`), or
 * null. It resolves only for the owner the key names, and only when the
 * extension matches the one the row's content type maps to. The id is the
 * full asset id or the exact 12-character short form an agent holds, which
 * `Asset.find` resolves when it has one match among the owner's assets.
 * Legacy flat keys and runtime scratch keys never resolve: rows that keep
 * their bytes outside the storage root are always created under the
 * owner-prefixed layout.
 */
async function assetForStorageKey(key: string): Promise<KeyedAsset | null> {
  if (isRuntimeScratchKey(key)) return null;
  const owner = assetKeyOwner(key);
  if (!owner) return null;
  const fileName = normalizeStorageKey(key).slice(owner.length + 1);
  if (!fileName || fileName.includes("/")) return null;
  const dot = fileName.lastIndexOf(".");
  const assetId = dot > 0 ? fileName.slice(0, dot) : fileName;
  let asset: Asset | null;
  try {
    asset = await Asset.find(owner, assetId);
  } catch {
    // A short id with more than one match names no asset.
    return null;
  }
  if (!asset) return null;
  if (dot > 0 && fileName !== getAssetFileName(assetId, asset.content_type)) {
    return null;
  }
  return { asset, fullId: asset.id === assetId };
}

/**
 * The project folder file behind an asset storage key, or null when the key's
 * asset keeps no file in a project folder or the folder cannot be reached.
 * The file is read through its `Workspace`, so this serves a storage-backed
 * folder as well as a local one.
 *
 * The short id an agent tool returns resolves here. An asset under the legacy
 * key is found for a short id by listing the store, and a project file has no
 * object there to list.
 */
export async function lookupProjectAssetFile(
  key: string
): Promise<ProjectAssetFile | null> {
  const found = await assetForStorageKey(key);
  return found ? projectAssetFile(found.asset) : null;
}

/**
 * The file on this host behind an asset storage key that has no object under
 * the storage root: the asset's file in a local project folder, else the file
 * it references in place. Null when the row has neither, the project file is
 * not on this host, or the external file is offline. An external file
 * resolves for the full asset id only.
 */
export async function lookupExternalAssetPath(
  key: string
): Promise<string | null> {
  const found = await assetForStorageKey(key);
  if (!found) return null;
  const { asset } = found;
  const file = await projectAssetFile(asset);
  if (file) {
    const local = await localProjectAssetPath(file);
    if (local) return local;
  }
  return found.fullId && asset.external_path
    ? verifiedExternalPath(asset)
    : null;
}
