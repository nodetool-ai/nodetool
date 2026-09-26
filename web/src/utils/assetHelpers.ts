import {
  isBoolean,
  isFiniteNumber,
  isObjectLike,
  isString
} from "./typePredicates";
/**
 * Returns the download URL from an asset response object.
 *
 * The `get_url` property is present at runtime but not yet reflected in the
 * TypeScript type because the websocket package dist may be absent during
 * typecheck. This helper centralises the cast so callers stay clean.
 */
export function getAssetUrl(asset: unknown): string | null {
  if (!isObjectLike(asset)) return null;
  const url = (asset as Record<string, unknown>)["get_url"];
  return isString(url) ? url : null;
}

/**
 * Whether the asset references a local file in place and that file is
 * missing or changed. The server sets `offline` only on such assets.
 */
export function isAssetOffline(asset: unknown): boolean {
  return isObjectLike(asset) && asset["offline"] === true;
}

/**
 * The asset URL to fetch media from and to key media caches by (decoded
 * peaks, filmstrip frames, the browser's HTTP cache).
 *
 * An asset that references a local file in place keeps one `get_url` across
 * relinks, so its URL here carries the file's recorded mtime: after a relink
 * every cache keyed by this URL misses instead of showing the previous file.
 * The server ignores the query. Every other asset gets `get_url` unchanged.
 */
export function getAssetMediaUrl(asset: unknown): string | null {
  const url = getAssetUrl(asset);
  if (!url || !isObjectLike(asset) || !isBoolean(asset["offline"])) {
    return url;
  }
  const metadata = asset["metadata"];
  const mtime = isObjectLike(metadata) ? metadata["external_mtime"] : null;
  if (!isFiniteNumber(mtime)) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${Math.trunc(mtime)}`;
}
