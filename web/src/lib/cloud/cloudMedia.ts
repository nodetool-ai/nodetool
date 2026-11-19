/**
 * Media of a cloud document in the desktop app (WP1.15). A cloud server
 * answers an asset's `get_url` with a signed HTTPS URL, which loads as it
 * is, or with a path on itself that needs the account's credential. The
 * main process serves those paths through the `nodetool-cloud:` scheme, so
 * an `<img>` or `<video>` loads them without a token in the page.
 */
import { asResolvedMediaUrl, type ResolvedMediaUrl } from "../../utils/resolveMediaUri";

export const CLOUD_MEDIA_SCHEME = "nodetool-cloud";

const MEDIA_PREFIXES = ["/api/assets/", "/api/storage/"];

/** `nodetool-cloud://<host>/<path>` for a file route of the server, or null. */
export function cloudMediaUrl(serverOrigin: string, path: string): ResolvedMediaUrl | null {
  let origin: URL;
  try {
    origin = new URL(serverOrigin);
  } catch {
    return null;
  }
  if (origin.protocol !== "https:" || origin.origin !== serverOrigin) {
    return null;
  }
  const pathname = path.split("?")[0];
  if (!MEDIA_PREFIXES.some((prefix) => pathname.startsWith(prefix) && pathname.length > prefix.length)) {
    return null;
  }
  return asResolvedMediaUrl(`${CLOUD_MEDIA_SCHEME}://${origin.host}${path}`);
}

/**
 * The URL to render for a cloud asset's `get_url`: a signed HTTPS URL as it
 * is, a path or a URL on the server itself through the scheme, and nothing
 * for anything else.
 */
export function cloudAssetUrl(getUrl: string | null | undefined, serverOrigin: string): ResolvedMediaUrl | null {
  if (!getUrl) {
    return null;
  }
  if (getUrl.startsWith("/")) {
    return getUrl.startsWith("//") ? null : cloudMediaUrl(serverOrigin, getUrl);
  }
  let url: URL;
  try {
    url = new URL(getUrl);
  } catch {
    return null;
  }
  if (url.origin === serverOrigin) {
    return cloudMediaUrl(serverOrigin, url.pathname + url.search);
  }
  return url.protocol === "https:" ? asResolvedMediaUrl(url.href) : null;
}
