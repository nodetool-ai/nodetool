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

import {
  asResolvedMediaUrl,
  resolveStaticMediaUri as realResolveStaticMediaUri
} from "../../utils/resolveMediaUri";
import type { ResolvedMediaUrl } from "../../utils/resolveMediaUri";

export type MediaLocator =
  | string
  | { uri?: string | null; asset_id?: string | null }
  | null
  | undefined;

/** The URL an `asset://<id>` locator resolves to under test. */
export const mockAssetUrl = (assetId: string): ResolvedMediaUrl =>
  `https://assets.test/${assetId}` as ResolvedMediaUrl;

/**
 * The asset's thumbnail URL under test. Distinct from {@link mockAssetUrl} so a
 * suite can tell which of the two a surface renders — a grid of stills is
 * supposed to show this one.
 */
export const mockAssetThumbUrl = (assetId: string): ResolvedMediaUrl =>
  `https://assets.test/${assetId}_thumb.jpg` as ResolvedMediaUrl;

/** Asset ids a test wants to have no thumbnail, as an SVG or a video has none. */
export const mockAssetsWithoutThumbnail = new Set<string>();

export const mockAssetWithoutThumbnail = (assetId: string): void => {
  mockAssetsWithoutThumbnail.add(assetId);
};

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

const resolve = (source: MediaLocator): ResolvedMediaUrl | undefined => {
  const uri = typeof source === "string" ? source : (source?.uri ?? undefined);
  const declared = typeof source === "object" ? source?.asset_id : undefined;
  if (declared) {
    return mockMissingAssets.has(declared) ? undefined : mockAssetUrl(declared);
  }
  // Everything but an asset locator resolves exactly as it does in the app.
  const staticUrl = realResolveStaticMediaUri(uri);
  if (staticUrl !== null) {
    return asResolvedMediaUrl(staticUrl) ?? undefined;
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
  mockAssetsWithoutThumbnail.clear();
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
  url: ResolvedMediaUrl | undefined;
  thumbUrl: ResolvedMediaUrl | undefined;
  contentType: string | undefined;
  pending: boolean;
} => {
  const uri = locatorUri(source);
  const id = assetIdOf(source);
  const pending = isPendingAsset(source);
  const url = pending ? undefined : resolve(source);
  // Only an asset has a thumbnail: a data/http/package locator resolves
  // statically and carries nothing but itself, as in the app.
  const hasThumb =
    url !== undefined &&
    id !== undefined &&
    !mockAssetsWithoutThumbnail.has(id) &&
    (uri === undefined || uri.startsWith("asset://"));
  return {
    url,
    thumbUrl: hasThumb ? mockAssetThumbUrl(id) : undefined,
    pending,
    contentType:
      (uri ? contentTypeByLocator.get(uri) : undefined) ??
      (id ? mockAssetContentTypes.get(id) : undefined)
  };
};

export const useResolvedMediaUri = (
  source: MediaLocator
): ResolvedMediaUrl | undefined => useResolvedMedia(source).url;

export const useResolvedThumbnailUri = (
  source: MediaLocator
): ResolvedMediaUrl | undefined => {
  const { url, thumbUrl } = useResolvedMedia(source);
  return thumbUrl ?? url;
};

export const useResolvedMediaUris = (
  sources: MediaLocator[]
): (ResolvedMediaUrl | undefined)[] => sources.map(resolve);

export default useResolvedMediaUri;
