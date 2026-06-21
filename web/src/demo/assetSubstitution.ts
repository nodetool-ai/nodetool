/**
 * Asset reference rewriting for casts.
 *
 * Recorded protocol messages carry host-specific media URLs (e.g.
 * `asset://<id>` or `http://localhost:7777/api/storage/<id>`). To make a cast
 * portable and backend-free we:
 *
 *  - at RECORD time, replace every such URL with a stable `cast-asset://<key>`
 *    reference and emit a manifest entry (so the bytes can be downloaded once
 *    and pinned next to the cast), and
 *  - at LOAD time, replace each `cast-asset://<key>` with whatever URL the host
 *    serves the pinned file from (Vite public dir, Remotion `staticFile`, …).
 *
 * Both directions are a structural deep-clone with a per-string replacer, so
 * nested asset objects (`{ type: "image", uri, asset_id }`), arrays of chunks,
 * and bare string values are all handled uniformly.
 */
import { CAST_ASSET_SCHEME, type CastAsset, type CastEvent } from "./castTypes";

/** Matches the nodetool storage URL for an asset, capturing the asset id. */
const STORAGE_URL_RE = /\/api\/storage\/([A-Za-z0-9._-]+)/;

/** Deep-clone `value`, passing every string through `replace`. */
function mapStrings(value: unknown, replace: (s: string) => string): unknown {
  if (typeof value === "string") return replace(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, replace));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = mapStrings(v, replace);
    }
    return out;
  }
  return value;
}

/** True for a string that points at a generated/stored asset we should pin. */
function isAssetUrl(s: string): boolean {
  return s.startsWith("asset://") || STORAGE_URL_RE.test(s);
}

/** Derive a stable, filesystem-safe key for an asset URL. */
function keyForAssetUrl(s: string): string {
  if (s.startsWith("asset://")) {
    return s.slice("asset://".length).replace(/[^A-Za-z0-9._-]/g, "_");
  }
  const m = STORAGE_URL_RE.exec(s);
  if (m) return m[1].replace(/[^A-Za-z0-9._-]/g, "_");
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
}

/** Guess a file extension from a content type, defaulting to `bin`. */
function extForContentType(contentType: string | undefined): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/ogg":
      return "ogg";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "application/json":
      return "json";
    default:
      return "bin";
  }
}

export interface CollectedAssets {
  events: CastEvent[];
  assets: CastAsset[];
}

/**
 * RECORD direction. Walk every event, replacing asset URLs with
 * `cast-asset://<key>` and accumulating a de-duplicated manifest.
 *
 * `contentTypeHint` lets the recorder pass the asset object's declared media
 * type (`image`/`audio`/`video`) so the pinned file gets a sensible extension
 * before the byte download confirms it.
 */
export function collectAndRewriteAssets(
  events: CastEvent[],
  contentTypeHint?: (originalUri: string) => string | undefined
): CollectedAssets {
  const byKey = new Map<string, CastAsset>();

  const rewrite = (s: string): string => {
    if (!isAssetUrl(s)) return s;
    const key = keyForAssetUrl(s);
    if (!byKey.has(key)) {
      const contentType = contentTypeHint?.(s);
      byKey.set(key, {
        key,
        file: `${key}.${extForContentType(contentType)}`,
        contentType: contentType ?? "application/octet-stream",
        originalUri: s,
      });
    }
    return `${CAST_ASSET_SCHEME}${key}`;
  };

  const rewritten = events.map((e) => ({
    t: e.t,
    message: mapStrings(e.message, rewrite) as CastEvent["message"],
  }));

  return { events: rewritten, assets: Array.from(byKey.values()) };
}

/**
 * LOAD direction. Replace every `cast-asset://<key>` with the host URL for the
 * pinned file, via `resolveAssetUrl(file)`. Unknown keys are left untouched so
 * a missing asset surfaces as a broken ref rather than a silent blank.
 */
export function resolveAssetUrls(
  events: CastEvent[],
  assets: CastAsset[],
  resolveAssetUrl: (file: string) => string
): CastEvent[] {
  const fileByKey = new Map(assets.map((a) => [a.key, a.file]));

  const replace = (s: string): string => {
    if (!s.startsWith(CAST_ASSET_SCHEME)) return s;
    const key = s.slice(CAST_ASSET_SCHEME.length);
    const file = fileByKey.get(key);
    return file ? resolveAssetUrl(file) : s;
  };

  return events.map((e) => ({
    t: e.t,
    message: mapStrings(e.message, replace) as CastEvent["message"],
  }));
}
