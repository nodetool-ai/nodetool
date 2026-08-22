/**
 * Media locator resolution, outside React.
 *
 * `asset://<id>` is an identifier, not a path: the bytes live under
 * `<user_id>/<asset_id>.<ext>` and, on the cloud backends (S3/Supabase), behind
 * a signed URL only the server can mint. The one correct resolution is the
 * asset's own `get_url`, which needs a lookup — hence the async form.
 *
 * React components should use `useResolvedMediaUri`, which is built on these.
 */

import { packageAssetHttpPath } from "@nodetool-ai/protocol";

import { useAssetStore } from "../stores/AssetStore";
import { BASE_URL } from "../stores/BASE_URL";
import { fileUriToHttpUrl } from "./localFile";
import { assetIdFromLocator } from "./mediaRef";

declare const resolvedMediaUrlBrand: unique symbol;

/**
 * A URL that has been through media resolution and is safe to hand to a
 * browser as `src`. The brand is the rendering boundary: a raw `asset://`
 * locator is a valid stored identifier but fetches nowhere, so anything that
 * sets `src` takes this type and only the resolvers below can mint it.
 *
 * Only a non-empty URL is branded. "Nothing to render" stays `""`, `null`, or
 * `undefined` so a caller cannot mistake an unresolvable locator for a URL.
 */
export type ResolvedMediaUrl = string & {
  readonly [resolvedMediaUrlBrand]: true;
};

/**
 * Brand a URL that resolution has already produced. Returns `null` for an
 * empty or missing one — there is no such thing as a branded empty URL.
 */
export const asResolvedMediaUrl = (
  url: string | null | undefined
): ResolvedMediaUrl | null =>
  url ? (url as ResolvedMediaUrl) : null;

/**
 * Resolve everything that needs no server round trip. Returns `null` for an
 * `asset://` locator, which only `get_url` can resolve.
 */
export const resolveStaticMediaUri = (
  uri: string | null | undefined
): ResolvedMediaUrl | "" | null => {
  if (!uri) {
    return "";
  }
  if (uri.startsWith("asset://")) {
    return null;
  }
  const fileHttpUrl = fileUriToHttpUrl(uri);
  if (fileHttpUrl !== null) {
    return asResolvedMediaUrl(fileHttpUrl) ?? "";
  }
  const pkgPath = packageAssetHttpPath(uri);
  if (pkgPath) {
    return `${BASE_URL}${pkgPath}` as ResolvedMediaUrl;
  }
  if (uri.startsWith("/api/")) {
    return `${BASE_URL}${uri}` as ResolvedMediaUrl;
  }
  return uri as ResolvedMediaUrl;
};

/**
 * Resolve any media locator to a fetchable URL, looking the asset up when the
 * locator is an `asset://` reference. Returns "" when it cannot be resolved.
 */
export const resolveMediaUri = async (
  uri: string | null | undefined
): Promise<ResolvedMediaUrl | ""> => {
  const staticUrl = resolveStaticMediaUri(uri);
  if (staticUrl !== null) {
    return staticUrl;
  }
  const assetId = assetIdFromLocator(uri);
  if (!assetId) {
    return "";
  }
  try {
    const asset = await useAssetStore.getState().get(assetId);
    return asResolvedMediaUrl(asset?.get_url) ?? "";
  } catch (error) {
    // Callers render or download whatever comes back; an unresolvable asset is
    // an empty URL, reported here rather than as an unhandled rejection.
    console.error(`[resolveMediaUri] could not resolve ${uri}`, error);
    return "";
  }
};

/**
 * Resolve an inline media source — the shape the streaming and preview paths
 * hand a renderer: either bytes, which are already local, or a locator string.
 *
 * Bytes pass through untouched. A string goes through static resolution, so a
 * `data:`, `blob:`, `file://`, `package://` or `/api/` source comes back
 * branded. An `asset://` locator comes back `undefined`: it needs the asset
 * lookup (`useResolvedMediaUri` / `resolveMediaUri`), and handing the raw
 * locator to an element is the defect this boundary exists to stop — better a
 * missing image than a broken one nobody traces back.
 */
export const resolveInlineMediaSource = (
  source: string | Uint8Array | null | undefined
): ResolvedMediaUrl | "" | Uint8Array | undefined => {
  if (source == null || source instanceof Uint8Array) {
    return source ?? undefined;
  }
  return resolveStaticMediaUri(source) ?? undefined;
};
