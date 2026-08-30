/**
 * Asset reference rewriting for casts.
 *
 * A cast's protocol messages reference media as `cast-asset://<key>` so they
 * carry no host-specific URLs. At load time each reference is replaced with
 * whatever URL the host serves the pinned file from (Vite public dir, Remotion
 * `staticFile`, …).
 *
 * The rewrite is a structural deep-clone with a per-string replacer, so nested
 * asset objects (`{ type: "image", uri, asset_id }`), arrays of chunks, and
 * bare string values are all handled uniformly.
 */
import { CAST_ASSET_SCHEME, type CastAsset, type CastEvent } from "./castTypes";
import { isObjectLike, isString } from "../utils/typePredicates";

/** Deep-clone `value`, passing every string through `replace`. */
function mapStrings(value: unknown, replace: (s: string) => string): unknown {
  if (isString(value)) return replace(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, replace));
  if (value && isObjectLike(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = mapStrings(v, replace);
    }
    return out;
  }
  return value;
}

/** The `cast-asset://<key>` → host URL replacer for one asset manifest. */
function replacerFor(
  assets: CastAsset[],
  resolveAssetUrl: (file: string) => string
): (s: string) => string {
  const fileByKey = new Map(assets.map((a) => [a.key, a.file]));
  return (s) => {
    if (!s.startsWith(CAST_ASSET_SCHEME)) return s;
    const key = s.slice(CAST_ASSET_SCHEME.length);
    const file = fileByKey.get(key);
    return file ? resolveAssetUrl(file) : s;
  };
}

/**
 * Replace every `cast-asset://<key>` with the host URL for the pinned file, via
 * `resolveAssetUrl(file)`. Unknown keys are left untouched so a missing asset
 * surfaces as a broken ref rather than a silent blank.
 */
export function resolveAssetUrls(
  events: CastEvent[],
  assets: CastAsset[],
  resolveAssetUrl: (file: string) => string
): CastEvent[] {
  const replace = replacerFor(assets, resolveAssetUrl);
  return events.map((e) => ({
    t: e.t,
    message: mapStrings(e.message, replace) as CastEvent["message"],
  }));
}

/**
 * The same rewrite over an arbitrary value rather than a message timeline —
 * a document cast's folded document, whose media refs (`{ type: "video", uri }`)
 * sit anywhere in the tree. Returns `value` untouched when there is nothing to
 * resolve, so a cast with no pinned media pays no clone.
 */
export function resolveAssetUrlsIn<T>(
  value: T,
  assets: CastAsset[] | undefined,
  resolveAssetUrl: ((file: string) => string) | undefined
): T {
  if (!assets?.length || !resolveAssetUrl) return value;
  return mapStrings(value, replacerFor(assets, resolveAssetUrl)) as T;
}
