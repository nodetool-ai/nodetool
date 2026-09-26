import { withApiBase } from "../stores/BASE_URL";

type AssetLike = {
  get_url?: string | null;
  thumb_url?: string | null;
  proxy_url?: string | null;
};

/**
 * Prefix `get_url`, `thumb_url`, and `proxy_url` with `BASE_URL` when set, so asset URLs
 * returned from the API as relative paths (e.g. `/api/storage/...`) point
 * at the configured backend rather than the page origin.
 */
export const normalizeAssetUrls = <T extends AssetLike>(asset: T): T => {
  if (!asset) return asset;
  const normalized = {
    ...asset,
    get_url: withApiBase(asset.get_url),
    thumb_url: withApiBase(asset.thumb_url)
  };
  // Only video assets on a local server carry a proxy URL.
  if (asset.proxy_url !== undefined) {
    normalized.proxy_url = withApiBase(asset.proxy_url);
  }
  return normalized;
};

export const normalizeAssetList = <T extends AssetLike>(assets: T[]): T[] =>
  assets.map(normalizeAssetUrls);
