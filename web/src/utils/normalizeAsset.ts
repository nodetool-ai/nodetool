import { withApiBase } from "../stores/BASE_URL";

type AssetLike = {
  get_url?: string | null;
  thumb_url?: string | null;
};

/**
 * Prefix `get_url` and `thumb_url` with `BASE_URL` when set, so asset URLs
 * returned from the API as relative paths (e.g. `/api/storage/...`) point
 * at the configured backend rather than the page origin.
 */
export const normalizeAssetUrls = <T extends AssetLike>(asset: T): T => {
  if (!asset) return asset;
  return {
    ...asset,
    get_url: withApiBase(asset.get_url),
    thumb_url: withApiBase(asset.thumb_url)
  };
};

export const normalizeAssetList = <T extends AssetLike>(assets: T[]): T[] =>
  assets.map(normalizeAssetUrls);
