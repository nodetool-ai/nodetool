/**
 * resolveAssetUri
 *
 * Centralized `asset://` URI resolution. All code that converts `asset://`
 * scheme URIs to `/api/storage/` paths should use this helper instead of
 * duplicating the conversion logic.
 *
 * @param uri - The URI to resolve. If it starts with `asset://`, the scheme
 *   is stripped and the remainder is used as the path under `/api/storage/`.
 *   All other URIs (http(s), data:, relative, etc.) are returned unchanged.
 *   Returns `null` for falsy inputs.
 */
export function resolveAssetUri(uri: string | null | undefined): string | null {
  if (!uri) {
    return null;
  }
  if (uri.startsWith("asset://")) {
    return `/api/storage/${uri.slice("asset://".length)}`;
  }
  return uri;
}

/**
 * Returns true if the URI uses the `asset://` scheme.
 */
export function isAssetUri(uri: string | null | undefined): boolean {
  return typeof uri === "string" && uri.startsWith("asset://");
}
