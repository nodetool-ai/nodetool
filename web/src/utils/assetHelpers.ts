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

/**
 * Whether the server is still making the asset's preview proxy. The timeline
 * preview checks again later and switches to the proxy once it is ready.
 */
export function isVideoProxyPending(asset: unknown): boolean {
  if (!isObjectLike(asset)) return false;
  const status = asset["proxy_status"];
  return status === "queued" || status === "running";
}

/**
 * The URL the timeline preview decodes a clip from: the asset's all-intra
 * preview proxy when the server reports it ready, else the media URL. A proxy
 * keeps the source's frame timestamps, so clip times need no mapping. Only
 * the live preview uses this. Export, filmstrips, and duration probes read
 * the original through `getAssetUrl` or `getAssetMediaUrl`.
 */
export function getAssetPreviewUrl(asset: unknown): string | null {
  if (isObjectLike(asset) && asset["proxy_status"] === "ready") {
    const proxy = asset["proxy_url"];
    if (isString(proxy) && proxy.length > 0) return proxy;
  }
  return getAssetMediaUrl(asset);
}
