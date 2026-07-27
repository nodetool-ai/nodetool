/**
 * Ownership rules for `/api/storage/<key>`.
 *
 * The local storage backend is a single shared directory with no per-user
 * prefix: an asset's bytes live at `<assetId>.<ext>` (thumbnail:
 * `<assetId>_thumb.jpg`), whoever created it. The only thing that ties a key
 * to a user is the `assets` row, so every read has to go through it — without
 * that check any authenticated caller could read (and, when PUT was open,
 * overwrite) another tenant's asset bytes by id alone.
 *
 * The tRPC `storage.signUrl` procedure already gated on this; these helpers
 * are the shared implementation so REST and tRPC can't drift apart again.
 */
import path from "node:path";
import { Asset } from "@nodetool-ai/models";

/**
 * Key prefixes the runtime writes to directly, with no `assets` row behind
 * them: `temp/<uuid>.<ext>` (temp_url asset outputs) and `assets/<uuid>.<ext>`
 * (storage_url outputs, binary tool results). They are capability keys — a
 * random v4 UUID minted per run and handed only to the caller who triggered
 * it — so they stay readable without an ownership record. Nothing can
 * overwrite them: `/api/storage` no longer accepts writes at all.
 */
const RUNTIME_SCRATCH_PREFIXES = ["temp/", "assets/"];

function normalizeKey(key: string): string {
  return key.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function isRuntimeScratchKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return RUNTIME_SCRATCH_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix)
  );
}

/**
 * Derive the owning asset id from a storage key. Asset files are stored flat
 * as `<assetId>.<ext>` and `<assetId>_thumb.jpg`.
 */
export function assetIdFromKey(key: string): string | null {
  const base = path.basename(normalizeKey(key));
  const withoutExt = base.replace(/\.[^.]+$/, "");
  const id = withoutExt.replace(/_thumb$/, "");
  return id || null;
}

/**
 * Whether `userId` owns the asset a key refers to. Fails closed: a key that
 * maps to no asset row, or a lookup that throws, is not owned.
 */
export async function callerOwnsStorageKey(
  userId: string,
  key: string
): Promise<boolean> {
  const assetId = assetIdFromKey(key);
  if (!assetId) return false;
  try {
    return (await Asset.find(userId, assetId)) !== null;
  } catch {
    return false;
  }
}

/** Whether `userId` may read the bytes at `key`. */
export async function canReadStorageKey(
  userId: string,
  key: string
): Promise<boolean> {
  if (isRuntimeScratchKey(key)) return true;
  return callerOwnsStorageKey(userId, key);
}
