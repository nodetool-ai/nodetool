/**
 * useResolvedMediaUri
 *
 * Turns a media locator into a URL a browser can actually fetch.
 *
 * `asset://<id>` is an identifier, not a path: the bytes live under
 * `<user_id>/<asset_id>.<ext>` and, on the cloud backends (S3/Supabase), behind
 * a signed URL that only the server can mint. Handing the raw locator to an
 * `<img>`/`<video>` renders nothing anywhere, and the old
 * `${BASE_URL}/api/storage/<id>` rewrite 404s on any deploy whose storage keys
 * carry the owner prefix. The only correct resolution is the asset's own
 * `get_url`, so this hook fetches the asset record (shared react-query cache
 * with `useAsset`) and returns that.
 *
 * Returns `undefined` while the lookup is in flight — deliberately, so a caller
 * renders nothing rather than a URL known to fail.
 */

import { useQueries, useQuery } from "@tanstack/react-query";

import { useAssetStore } from "../stores/AssetStore";
import { assetIdFromLocator } from "../utils/mediaRef";
import { resolveStaticMediaUri } from "../utils/resolveMediaUri";
import { isString } from "../utils/typePredicates";

/** Anything carrying a media locator: a bare URI or a `*Ref` with `asset_id`. */
export type MediaLocator =
  | string
  | { uri?: string | null; asset_id?: string | null }
  | null
  | undefined;

const locatorParts = (
  source: MediaLocator
) => {
  if (isString(source)) {
    return { uri: source || undefined, assetId: assetIdFromLocator(source) };
  }
  if (!source) {
    return {};
  }
  const uri = source.uri || undefined;
  const declared =
    source.asset_id != null && source.asset_id.trim() !== ""
      ? source.asset_id.trim()
      : undefined;
  return { uri, assetId: declared ?? assetIdFromLocator(uri) };
};

export function useResolvedMediaUri(source: MediaLocator): string | undefined {
  const getAsset = useAssetStore((state) => state.get);
  const { uri, assetId } = locatorParts(source);

  const staticUrl = resolveStaticMediaUri(uri);
  // A locator that resolves without the server still needs the asset id path
  // disabled — hooks cannot be called conditionally, so gate the query instead.
  const needsAsset = staticUrl === null && Boolean(assetId);

  const { data: asset } = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => getAsset(assetId as string),
    enabled: needsAsset
  });

  if (staticUrl !== null) {
    return staticUrl || undefined;
  }
  return asset?.get_url ?? undefined;
}

/**
 * The list form: resolves a whole batch of locators in one render, keeping the
 * result positionally aligned with the input.
 */
export function useResolvedMediaUris(
  sources: MediaLocator[]
): (string | undefined)[] {
  const getAsset = useAssetStore((state) => state.get);
  const parts = sources.map(locatorParts);
  const staticUrls = parts.map(({ uri }) => resolveStaticMediaUri(uri));

  const results = useQueries({
    queries: parts.map(({ assetId }, i) => ({
      queryKey: ["asset", assetId],
      queryFn: () => getAsset(assetId as string),
      enabled: staticUrls[i] === null && Boolean(assetId)
    }))
  });

  return staticUrls.map((staticUrl, i) =>
    staticUrl !== null
      ? staticUrl || undefined
      : (results[i]?.data?.get_url ?? undefined)
  );
}

export default useResolvedMediaUri;
