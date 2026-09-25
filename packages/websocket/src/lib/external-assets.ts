/**
 * When an import references a local file in place instead of copying it.
 *
 * Only the local desktop/dev server does this: the asset store must be the
 * local file backend, and `NODETOOL_ENV=production` refuses it the same way
 * it refuses the local file browser. A stored path is a read capability on
 * the host, so it is never offered where the host is shared.
 */
import { loadAssetStorageConfig } from "@nodetool-ai/config";
import { FileStorageAdapter } from "@nodetool-ai/storage";
import { getSetting } from "../settings-registry.js";
import { getAssetAdapter } from "./storage.js";

/** Setting (and env var) holding the size, in bytes, at which imports stay in place. */
export const EXTERNAL_ASSET_THRESHOLD_SETTING =
  "NODETOOL_EXTERNAL_ASSET_THRESHOLD_BYTES";

/** Default threshold: 1 GiB. */
export const DEFAULT_EXTERNAL_ASSET_THRESHOLD_BYTES = 1024 * 1024 * 1024;

/** Whether this server may create external asset references. */
export function externalAssetsAvailable(): boolean {
  if (process.env["NODETOOL_ENV"] === "production") return false;
  if (loadAssetStorageConfig().kind !== "file") return false;
  return getAssetAdapter() instanceof FileStorageAdapter;
}

/**
 * The import size at or above which the desktop app references a file in
 * place. Read from the settings table, then the environment. A missing,
 * non-numeric, or non-positive value falls back to the default.
 */
export async function getExternalAssetThresholdBytes(): Promise<number> {
  let raw: string | null;
  try {
    raw = await getSetting(EXTERNAL_ASSET_THRESHOLD_SETTING);
  } catch {
    raw = process.env[EXTERNAL_ASSET_THRESHOLD_SETTING] ?? null;
  }
  if (raw === null || raw.trim() === "") {
    return DEFAULT_EXTERNAL_ASSET_THRESHOLD_BYTES;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_EXTERNAL_ASSET_THRESHOLD_BYTES;
}
