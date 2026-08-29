/**
 * Canonical media locator for a library asset.
 *
 * `asset://<id>` is the id. `/api/storage/<user>/<id>.<ext>` is only the
 * HTTP path the browser uses to fetch bytes.
 */

import { isString } from "./typePredicates";

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
  if (uri == null || !uri.startsWith("asset://")) {
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

/** Anything carrying a media locator: a bare URI or a `*Ref` with `asset_id`. */
export type MediaLocatorSource =
  | string
  | { uri?: string | null; asset_id?: string | null }
  | null
  | undefined;

/** The asset id a locator names, whether it is a bare URI or a `*Ref`. */
export function assetIdOf(source: MediaLocatorSource): string | undefined {
  if (isString(source)) {
    return assetIdFromLocator(source);
  }
  if (!source) {
    return undefined;
  }
  const declared = source.asset_id?.trim();
  return declared || assetIdFromLocator(source.uri);
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
