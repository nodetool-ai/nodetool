/**
 * Canonical media locator for a library asset.
 *
 * `asset://<id>` is the id. `/api/storage/<user>/<id>.<ext>` is only the
 * HTTP path the browser uses to fetch bytes.
 */

export type MediaRefFromAsset<T extends string = string> = {
  type: T;
  uri: string;
  asset_id: string;
};

export function assetLocator(assetId: string): string {
  return `asset://${assetId}`;
}

/** The asset id inside `asset://<id>` or `asset://<id>.<ext>`. */
export function assetIdFromLocator(
  uri: string | undefined | null
): string | undefined {
  if (typeof uri !== "string" || !uri.startsWith("asset://")) {
    return undefined;
  }
  const rest = uri.slice("asset://".length).split(/[?#]/)[0];
  if (rest === "") {
    return undefined;
  }
  const last = rest.includes("/") ? rest.slice(rest.lastIndexOf("/") + 1) : rest;
  const withoutExt = last.replace(/\.[^.]+$/, "");
  return withoutExt || last;
}

export function mediaRefFromAsset<T extends string>(
  asset: { id: string },
  type: T
): MediaRefFromAsset<T> {
  return {
    type,
    uri: assetLocator(asset.id),
    asset_id: asset.id
  };
}
