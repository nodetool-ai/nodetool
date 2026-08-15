/**
 * useResolvedMediaUri
 *
 * Turns a media locator into a URL React Native's loaders can actually fetch.
 *
 * `asset://<id>` is an identifier, not a path: the bytes live under
 * `<user_id>/<asset_id>.<ext>` and, on the cloud backends (S3/Supabase), behind
 * a signed URL only the server can mint. Rewriting it to
 * `<host>/api/storage/<id>` 404s on any such deploy, so the only correct
 * resolution is the asset's own `get_url` — the same `assets.get` +
 * `resolveUrl` path the asset viewer and the sketch renderer already use.
 *
 * Returns `null` while the lookup is in flight, so a caller renders its
 * placeholder rather than a URL known to fail.
 */

import { apiService } from '../services/api';
import { trpc } from '../trpc/client';

/** The asset id inside `asset://<id>` or `asset://<id>.<ext>`. */
export function assetIdFromLocator(
  uri: string | null | undefined
): string | null {
  if (typeof uri !== 'string' || !uri.startsWith('asset://')) {
    return null;
  }
  const rest = uri.slice('asset://'.length).split(/[?#]/)[0];
  if (!rest) {
    return null;
  }
  const last = rest.includes('/') ? rest.slice(rest.lastIndexOf('/') + 1) : rest;
  return last.replace(/\.[^.]+$/, '') || last;
}

export type MediaLocator =
  | string
  | { uri?: string | null; asset_id?: string | null }
  | null
  | undefined;

const locatorUri = (source: MediaLocator): string | null => {
  if (typeof source === 'string') {
    return source || null;
  }
  return source?.uri ?? null;
};

const locatorAssetId = (source: MediaLocator): string | null => {
  if (source && typeof source === 'object' && source.asset_id) {
    return source.asset_id;
  }
  return assetIdFromLocator(locatorUri(source));
};

export function useResolvedMediaUri(source: MediaLocator): string | null {
  const uri = locatorUri(source);
  const assetId = locatorAssetId(source);
  // `resolveUrl` handles every scheme but `asset://`, for which it returns
  // null — that is the case the lookup below covers.
  const directUrl = apiService.resolveUrl(uri);

  const assetQuery = trpc.assets.get.useQuery(
    { id: assetId ?? '' },
    { enabled: directUrl === null && Boolean(assetId) }
  );

  if (directUrl !== null) {
    return directUrl;
  }
  return apiService.resolveUrl(assetQuery.data?.get_url ?? null);
}

/**
 * The list form: resolves a whole batch of locators in one render, keeping the
 * result positionally aligned with the input.
 */
export function useResolvedMediaUris(
  sources: MediaLocator[]
): (string | null)[] {
  const directUrls = sources.map((source) =>
    apiService.resolveUrl(locatorUri(source))
  );
  const assetIds = sources.map(locatorAssetId);

  const results = trpc.useQueries((t) =>
    assetIds.map((assetId, i) =>
      t.assets.get(
        { id: assetId ?? '' },
        { enabled: directUrls[i] === null && Boolean(assetId) }
      )
    )
  );

  return directUrls.map(
    (directUrl, i) =>
      directUrl ?? apiService.resolveUrl(results[i]?.data?.get_url ?? null)
  );
}

export default useResolvedMediaUri;
