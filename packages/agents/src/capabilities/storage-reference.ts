/**
 * The ownership rule for a caller-supplied storage reference.
 *
 * `loadMediaRefBytes` hands a `supabase://`, `s3://` or `memory://` URI, and a
 * `/api/storage/` key, straight to the storage adapter, which reads any key in
 * its bucket. On an MCP session that adapter is the asset store, so a
 * reference to another user's object read their bytes. `view_image` already
 * applies this rule. Every other capability that takes a reference from the
 * model runs it through {@link ownedStorageReference} first.
 */

import { isFullResourceId, isShortResourceId } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/** Schemes whose URI names a key in a storage bucket. */
const STORAGE_SCHEME = /^(?:memory|s3|supabase):\/\//i;
const STORAGE_ROUTE = "/api/storage/";
const RELATIVE_STORAGE_ROUTE = "api/storage/";

/** Keys `storeOrInline` writes when a run has no asset store: unguessable. */
const SANDBOX_KEY = /^sandbox\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9]{1,8}$/;

/**
 * The storage-route path of an http(s) URL, or null. The file storage adapter
 * reads the key from such a URL whatever its host, and `loadMediaRefBytes`
 * asks storage before it fetches, so this form reads a bucket key too. The
 * URL is parsed rather than matched, because the adapter reads the parsed
 * pathname, where `/x/../api/storage/` is already `/api/storage/`.
 */
export function storageRoutePathOfUrl(value: string): string | null {
  if (!/^https?:/i.test(value)) return null;
  let pathname: string;
  try {
    pathname = new URL(value).pathname;
  } catch {
    return null;
  }
  return pathname.startsWith(STORAGE_ROUTE) ? pathname : null;
}

/** Whether a reference reads a storage key directly rather than an asset row. */
export function isStorageReference(value: string): boolean {
  return (
    value.startsWith(STORAGE_ROUTE) ||
    value.startsWith(RELATIVE_STORAGE_ROUTE) ||
    STORAGE_SCHEME.test(value) ||
    storageRoutePathOfUrl(value) !== null
  );
}

/** The storage key a reference names, without query or fragment. */
function storageKeyOf(value: string): string {
  if (value.startsWith(RELATIVE_STORAGE_ROUTE)) {
    return value.slice(RELATIVE_STORAGE_ROUTE.length).split(/[?#]/)[0] ?? "";
  }
  const routePath = value.startsWith(STORAGE_ROUTE)
    ? value
    : storageRoutePathOfUrl(value);
  const path = routePath
    ? routePath.slice(STORAGE_ROUTE.length)
    : value.slice(value.indexOf("://") + 3);
  return path.split(/[?#]/)[0] ?? "";
}

/** The asset id a stored file name carries: `<id>.<ext>`, `<id>_thumb.<ext>`. */
function assetIdOfKey(key: string): string | null {
  const base = key.slice(key.lastIndexOf("/") + 1);
  const id = base.replace(/_thumb(?=\.[^.]+$)/, "").replace(/\.[^.]+$/, "");
  return id || null;
}

/**
 * `asset://<id>` for a bare asset id, full or 12-character short, and the
 * value unchanged otherwise. Without the scheme a bare id reads as a relative
 * filesystem path, and the owner-checked `asset://` resolution never runs.
 */
export function assetUriForBareId(value: string): string {
  return isFullResourceId(value) || isShortResourceId(value)
    ? `asset://${value}`
    : value;
}

export type StorageReferenceDecision =
  | { ok: true; ref: string }
  | { ok: false; error: string };

/**
 * Decide whether the run may read `value`, and what to read instead.
 *
 * Anything that is not a storage reference passes unchanged: `asset://` reads
 * are owner-checked by `loadMediaRefBytes` itself. A storage reference passes
 * when its key is under the run's project (`projects/<projectId>/`, where
 * `view_image` stores its crops) or is a sandbox key. Otherwise it must name
 * an asset this user owns, and the read is rewritten to that asset, so a key
 * in another user's folder that reuses the id reads nothing.
 */
export async function ownedStorageReference(
  context: ProcessingContext,
  value: string,
  projectId?: string | null
): Promise<StorageReferenceDecision> {
  if (!isStorageReference(value)) return { ok: true, ref: value };
  const notFound = {
    ok: false as const,
    error: `${value} was not found among this user's assets.`
  };
  let key = storageKeyOf(value);
  try {
    key = decodeURIComponent(key);
  } catch {
    return notFound;
  }
  const segments = key.split(/[\\/]/);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return notFound;
  }
  if (projectId && key.startsWith(`projects/${projectId}/`)) {
    return { ok: true, ref: value };
  }
  if (SANDBOX_KEY.test(key)) return { ok: true, ref: value };
  // A host with no asset row lookup (the single-user CLI) has no tenant
  // boundary to keep. Every server entrance (MCP, chat, inference) has one.
  if (!context.hasModelInterface("getAssetInfo")) {
    return { ok: true, ref: value };
  }
  const assetId = assetIdOfKey(key);
  if (!assetId) return notFound;
  const asset = await context.getAssetInfo(assetId);
  return asset ? { ok: true, ref: `asset://${asset.id}` } : notFound;
}
