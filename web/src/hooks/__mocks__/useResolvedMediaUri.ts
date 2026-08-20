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

/**
 * Asset ids a test wants to resolve to nothing — the shape of an asset whose
 * row is gone or whose object cannot be signed.
 */
export const mockMissingAssets = new Set<string>();

export const mockMissingAsset = (assetId: string): void => {
  mockMissingAssets.add(assetId);
};

/** Asset ids whose lookup a test wants to leave in flight. */
export const mockPendingAssets = new Set<string>();

export const mockPendingAsset = (assetId: string): void => {
  mockPendingAssets.add(assetId);
};

const isPendingAsset = (source: MediaLocator): boolean => {
  const id = assetIdOf(source);
  return id !== undefined && mockPendingAssets.has(id);
};

const resolve = (source: MediaLocator): string | undefined => {
  const uri = typeof source === "string" ? source : (source?.uri ?? undefined);
  const declared = typeof source === "object" ? source?.asset_id : undefined;
  if (declared) {
    return mockMissingAssets.has(declared) ? undefined : mockAssetUrl(declared);
  }
  // Everything but an asset locator resolves exactly as it does in the app.
  const staticUrl = realResolveStaticMediaUri(uri);
  if (staticUrl !== null) {
    return staticUrl || undefined;
  }
  const id = (uri as string).slice("asset://".length);
  const bareId = id.replace(/\.[^.]+$/, "");
  return mockMissingAssets.has(id) || mockMissingAssets.has(bareId)
    ? undefined
    : mockAssetUrl(id);
};

export const resolveStaticMediaUri = realResolveStaticMediaUri;

/** Content type pinned for a whole `asset://…` locator in tests. */
const contentTypeByLocator = new Map<string, string>();

/**
 * Content type a test wants an asset id to resolve to, so a suite can exercise
 * the extension-less `asset://<id>` path. Unset ids resolve to `undefined`,
 * the way an asset row that has not loaded yet does.
 */
export const mockAssetContentTypes = new Map<string, string>();

/** Pin a content type for an `asset://` locator in tests. */
export const mockAssetContentType = (locator: string, mime: string): void => {
  contentTypeByLocator.set(locator, mime);
};

export const resetMockAssetContentTypes = (): void => {
  contentTypeByLocator.clear();
  mockAssetContentTypes.clear();
  mockMissingAssets.clear();
  mockPendingAssets.clear();
};

const locatorUri = (source: MediaLocator): string | undefined =>
  typeof source === "string" ? source : (source?.uri ?? undefined);

const assetIdOf = (source: MediaLocator): string | undefined => {
  const uri = locatorUri(source);
  const declared = typeof source === "object" ? source?.asset_id : undefined;
  if (declared) return declared;
  if (!uri?.startsWith("asset://")) return undefined;
  return uri.slice("asset://".length).replace(/\.[^.]+$/, "");
};

export const useResolvedMedia = (
  source: MediaLocator
): {
  url: string | undefined;
  contentType: string | undefined;
  pending: boolean;
} => {
  const uri = locatorUri(source);
  const id = assetIdOf(source);
  const pending = isPendingAsset(source);
  return {
    url: pending ? undefined : resolve(source),
    pending,
    contentType:
      (uri ? contentTypeByLocator.get(uri) : undefined) ??
      (id ? mockAssetContentTypes.get(id) : undefined)
  };
};

export const useResolvedMediaUri = (source: MediaLocator): string | undefined =>
  useResolvedMedia(source).url;

export const useResolvedMediaUris = (
  sources: MediaLocator[]
): (string | undefined)[] => sources.map(resolve);

export default useResolvedMediaUri;
