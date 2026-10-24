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
import { isFullResourceId } from "@nodetool-ai/protocol";
import { assetKeyOwner } from "@nodetool-ai/storage";
import { isAssetIdSharedWithUser } from "./document-access.js";

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
 * Derive the owning asset id from a storage key. Asset files are stored as
 * `<assetId>.<ext>`, `<assetId>_thumb.jpg` and, for a video's preview,
 * `<assetId>_proxy.<ext>`.
 */
export function assetIdFromKey(key: string): string | null {
  const base = path.basename(normalizeKey(key));
  const withoutExt = base.replace(/\.[^.]+$/, "");
  const id = withoutExt.replace(/_(thumb|proxy)$/, "");
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

/**
 * Whether `userId` may read the bytes at `key`.
 *
 * The caller's own owner-prefixed keys (`<userId>/<assetId>.<ext>`) are
 * settled by the prefix alone — no database round trip, and the same rule a
 * Supabase RLS policy or bucket policy applies to the object itself. Another
 * owner's key is readable only when a document shared with the caller shows
 * that asset (see `isSharedStorageKey`). Legacy flat keys, written before
 * the prefixed layout, still need the `assets` lookup.
 *
 * Reads only: nothing may write or delete through a shared grant.
 */
export async function canReadStorageKey(
  userId: string,
  key: string
): Promise<boolean> {
  if (isRuntimeScratchKey(key)) return true;
  const owner = assetKeyOwner(key);
  if (owner === null) return callerOwnsStorageKey(userId, key);
  if (owner === userId) return true;
  return isSharedStorageKey(userId, owner, key);
}

/**
 * Whether `<owner>/<file>` holds the bytes, thumbnail or video proxy of an
 * asset that a document shared with `userId` shows. With the file backend
 * a collaborator loads a shared document's media through `/api/storage`, and
 * the key carries the owner, not the caller. Only the exact two-segment key
 * and a full asset id qualify, and the asset row must still exist. Fails
 * closed.
 */
async function isSharedStorageKey(
  userId: string,
  owner: string,
  key: string
): Promise<boolean> {
  const segments = normalizeKey(key)
    .split("/")
    .filter((segment) => segment && segment !== ".");
  if (segments.length !== 2) return false;
  const assetId = assetIdFromKey(segments[1]);
  if (!assetId || !isFullResourceId(assetId)) return false;
  try {
    if (!(await isAssetIdSharedWithUser(userId, owner, assetId))) return false;
    return (await Asset.find(owner, assetId)) !== null;
  } catch {
    return false;
  }
}
