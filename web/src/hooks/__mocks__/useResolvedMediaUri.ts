/**
 * Manual mock for `useResolvedMediaUri`.
 *
 * The real hook resolves an `asset://` locator through TanStack Query, so a
 * component that renders media needs a `QueryClientProvider`. Suites that only
 * exercise other behavior mock this module instead of standing one up. The
 * resolution itself is covered by `hooks/__tests__/useResolvedMediaUri.test.tsx`.
 *
 * Non-asset locators pass through, so assertions on data/blob/http sources read
 * exactly as they do in the app; an `asset://` locator resolves to a stand-in
 * URL a test can assert on.
 */

import { resolveStaticMediaUri as realResolveStaticMediaUri } from "../../utils/resolveMediaUri";

export type MediaLocator =
  | string
  | { uri?: string | null; asset_id?: string | null }
  | null
  | undefined;

/** The URL an `asset://<id>` locator resolves to under test. */
export const mockAssetUrl = (assetId: string): string =>
  `https://assets.test/${assetId}`;

const resolve = (source: MediaLocator): string | undefined => {
  const uri = typeof source === "string" ? source : (source?.uri ?? undefined);
  const declared = typeof source === "object" ? source?.asset_id : undefined;
  if (declared) {
    return mockAssetUrl(declared);
  }
  // Everything but an asset locator resolves exactly as it does in the app.
  const staticUrl = realResolveStaticMediaUri(uri);
  if (staticUrl !== null) {
    return staticUrl || undefined;
  }
  return mockAssetUrl((uri as string).slice("asset://".length));
};

export const resolveStaticMediaUri = realResolveStaticMediaUri;

const contentTypeByLocator = new Map<string, string>();

/** Pin a content type for an `asset://` locator in tests. */
export const mockAssetContentType = (locator: string, mime: string): void => {
  contentTypeByLocator.set(locator, mime);
};

export const resetMockAssetContentTypes = (): void => {
  contentTypeByLocator.clear();
};

const locatorUri = (source: MediaLocator): string | undefined =>
  typeof source === "string" ? source : (source?.uri ?? undefined);

export const useResolvedMedia = (
  source: MediaLocator
): { url: string | undefined; contentType: string | undefined } => {
  const uri = locatorUri(source);
  return {
    url: resolve(source),
    contentType: uri ? contentTypeByLocator.get(uri) : undefined
  };
};

export const useResolvedMediaUri = (source: MediaLocator): string | undefined =>
  useResolvedMedia(source).url;

export const useResolvedMediaUris = (
  sources: MediaLocator[]
): (string | undefined)[] => sources.map(resolve);

export default useResolvedMediaUri;
