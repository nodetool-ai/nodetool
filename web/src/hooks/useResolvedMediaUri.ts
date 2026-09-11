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
import {
  asResolvedMediaUrl,
  resolveStaticMediaUri
} from "../utils/resolveMediaUri";
import type { ResolvedMediaUrl } from "../utils/resolveMediaUri";
import { isString } from "../utils/typePredicates";

/**
 * How long a resolved asset record stays fresh.
 *
 * An asset row is immutable once written — the bytes never change under an id,
 * and the signed URL the server mints outlives this many times over
 * (`SIGNED_URL_TTL`, a week). Without a stale time every re-mount of every
 * media element re-asks the server for rows it already holds: reopening a
 * twelve-shot storyboard alone refetched twenty-four of them.
 */
const ASSET_STALE_TIME = 5 * 60 * 1000;

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

/**
 * The resolved URL plus the asset's own content type. `useResolvedMediaUri`
 * is this hook's URL half — a caller that only renders needs no MIME type. A
 * locator with no file extension (`asset://<id>`, what `save_asset` used to
 * return) carries nothing a renderer can type the media by, so a saved mp4
 * rendered as a broken image in chat. The asset row is already fetched for the
 * URL; its `content_type` is the answer.
 */
export type ResolvedMedia = {
  url: ResolvedMediaUrl | undefined;
  /**
   * The 512px JPEG the server derived for this asset when it stored it, or
   * `undefined` for a locator that has no asset row behind it (a `data:` URI,
   * an `http` URL, a `package://` path). A grid of stills wants this: the
   * source of a generated keyframe is a 300 KB–1.2 MB still and the card that
   * shows it is a few hundred pixels wide.
   */
  thumbUrl: ResolvedMediaUrl | undefined;
  contentType: string | undefined;
  /**
   * True while the asset lookup is still in flight. A caller that renders
   * nothing without a URL needs this to tell "not yet" from "never": an asset
   * whose row is gone, or whose object cannot be signed, resolves to no URL
   * forever, and silently rendering nothing leaves the reader with an empty
   * gap and no way to reach the media.
   */
  pending: boolean;
};

export function useResolvedMedia(source: MediaLocator): ResolvedMedia {
  const getAsset = useAssetStore((state) => state.get);
  const { uri, assetId } = locatorParts(source);
  // A `*Ref` may carry only `asset_id` — the sketch thumbnails a project
  // summary returns do. With no uri there is nothing to resolve statically,
  // and `resolveStaticMediaUri` answers "" for that, which would end
  // resolution before the asset lookup it needs.
  const staticUrl = uri ? resolveStaticMediaUri(uri) : null;
  // A locator that resolves without the server still needs the asset id path
  // disabled — hooks cannot be called conditionally, so gate the query instead.
  const needsAsset = staticUrl === null && Boolean(assetId);

  const {
    data: asset,
    isPending,
    isError
  } = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => getAsset(assetId as string),
    enabled: needsAsset,
    staleTime: ASSET_STALE_TIME
  });

  if (staticUrl !== null) {
    return {
      url: asResolvedMediaUrl(staticUrl) ?? undefined,
      thumbUrl: undefined,
      contentType: undefined,
      pending: false
    };
  }
  return {
    url: asResolvedMediaUrl(asset?.get_url) ?? undefined,
    thumbUrl: asResolvedMediaUrl(asset?.thumb_url) ?? undefined,
    contentType: asset?.content_type ?? undefined,
    // A disabled query reports `pending` forever, so gate on the id path.
    pending: needsAsset && isPending && !isError
  };
}

export function useResolvedMediaUri(
  source: MediaLocator
): ResolvedMediaUrl | undefined {
  return useResolvedMedia(source).url;
}

/**
 * The thumbnail form: the server's 512px JPEG when the asset has one, the full
 * media URL when it does not (a `data:`/`http` locator, or an asset whose
 * thumbnail was never generated). Use it wherever media is shown at card size —
 * a grid of storyboard stills pulled megabytes per card through the full URL.
 */
export function useResolvedThumbnailUri(
  source: MediaLocator
): ResolvedMediaUrl | undefined {
  const { url, thumbUrl } = useResolvedMedia(source);
  return thumbUrl ?? url;
}

/**
 * The list form: resolves a whole batch of locators in one render, keeping the
 * result positionally aligned with the input.
 */
export function useResolvedMediaUris(
  sources: MediaLocator[]
): (ResolvedMediaUrl | undefined)[] {
  const getAsset = useAssetStore((state) => state.get);
  const parts = sources.map(locatorParts);
  const staticUrls = parts.map(({ uri }) =>
    uri ? resolveStaticMediaUri(uri) : null
  );

  const results = useQueries({
    queries: parts.map(({ assetId }, i) => ({
      queryKey: ["asset", assetId],
      queryFn: () => getAsset(assetId as string),
      enabled: staticUrls[i] === null && Boolean(assetId),
      staleTime: ASSET_STALE_TIME
    }))
  });

  return staticUrls.map((staticUrl, i) =>
    staticUrl !== null
      ? (asResolvedMediaUrl(staticUrl) ?? undefined)
      : (asResolvedMediaUrl(results[i]?.data?.get_url) ?? undefined)
  );
}

export default useResolvedMediaUri;
