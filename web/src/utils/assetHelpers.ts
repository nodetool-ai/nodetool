/**
 * Returns the download URL from an asset response object.
 *
 * The `get_url` property is present at runtime but not yet reflected in the
 * TypeScript type because the websocket package dist may be absent during
 * typecheck. This helper centralises the cast so callers stay clean.
 */
export function getAssetUrl(asset: unknown): string | null {
  return (asset as { get_url?: string | null })?.get_url ?? null;
}
