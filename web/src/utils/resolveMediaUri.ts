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

/**
 * Resolve everything that needs no server round trip. Returns `null` for an
 * `asset://` locator, which only `get_url` can resolve.
 */
export const resolveStaticMediaUri = (
  uri: string | null | undefined
): string | null => {
  if (!uri) {
    return "";
  }
  if (uri.startsWith("asset://")) {
    return null;
  }
  const fileHttpUrl = fileUriToHttpUrl(uri);
  if (fileHttpUrl !== null) {
    return fileHttpUrl;
  }
  const pkgPath = packageAssetHttpPath(uri);
  if (pkgPath) {
    return `${BASE_URL}${pkgPath}`;
  }
  if (uri.startsWith("/api/")) {
    return `${BASE_URL}${uri}`;
  }
  return uri;
};

/**
 * Resolve any media locator to a fetchable URL, looking the asset up when the
 * locator is an `asset://` reference. Returns "" when it cannot be resolved.
 */
export const resolveMediaUri = async (
  uri: string | null | undefined
): Promise<string> => {
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
    return asset?.get_url ?? "";
  } catch (error) {
    // Callers render or download whatever comes back; an unresolvable asset is
    // an empty URL, reported here rather than as an unhandled rejection.
    console.error(`[resolveMediaUri] could not resolve ${uri}`, error);
    return "";
  }
};
