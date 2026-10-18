/**
 * Load-boundary normalization of the layer fields that decide pixels.
 *
 * The web editor's `normalizeSketchDocument` calls `normalizeLayerTransform`
 * and `normalizeLayerEffects` from here, and the headless renderer calls
 * {@link normalizeRenderDocument}, which applies the same per-layer defaults.
 * One set of migration rules means a legacy document renders the same in both.
 */

import type {
  RenderDocument,
  RenderImageFit,
  RenderImageReference,
  RenderLayer,
  RenderLayerEffect,
  RenderLayerTransform,
  RenderLayerType,
  RenderQuad,
  RenderQuadMode
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && !Number.isNaN(value);

const isString = (value: unknown): value is string => typeof value === "string";

function num(value: unknown, fallback: number): number {
  return isNumber(value) && Number.isFinite(value) ? value : fallback;
}

const QUAD_MODES: ReadonlySet<string> = new Set<RenderQuadMode>([
  "distort",
  "skew",
  "perspective",
  "mesh-warp"
]);

/** Map legacy quad-mode tags onto the current set; null when unknown. */
function migrateLegacyQuadMode(raw: string): RenderQuadMode | null {
  if (QUAD_MODES.has(raw)) {
    // SAFETY: QUAD_MODES holds only RenderQuadMode values and has() just matched raw.
    return raw as RenderQuadMode;
  }
  if (raw === "warp") {
    return "distort";
  }
  if (raw === "perspective-distort" || raw === "perspective-dual") {
    return "perspective";
  }
  return null;
}

function isQuadShape(value: unknown): value is RenderQuad {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(
      (point) =>
        isRecord(point) &&
        Number.isFinite(point["x"]) &&
        Number.isFinite(point["y"])
    )
  );
}

function quadTransform(
  mode: RenderQuadMode,
  quad: RenderQuad
): RenderLayerTransform {
  return {
    kind: "quad",
    mode,
    quad: [
      { x: quad[0].x, y: quad[0].y },
      { x: quad[1].x, y: quad[1].y },
      { x: quad[2].x, y: quad[2].y },
      { x: quad[3].x, y: quad[3].y }
    ]
  };
}

/**
 * Convert any legacy or unknown transform payload into the canonical union.
 *
 * - Canonical affine or quad payloads are cloned.
 * - Legacy dual-quad payloads keep only their primary quad, as a perspective.
 * - A known quad mode with a valid quad becomes a quad transform.
 * - Anything else becomes an affine transform from whatever TRS fields are
 *   present, else identity. Matrix-only payloads are not recovered.
 */
export function normalizeLayerTransform(raw: unknown): RenderLayerTransform {
  const t = isRecord(raw) ? raw : {};
  const affine = (): RenderLayerTransform => ({
    kind: "affine",
    x: num(t["x"], 0),
    y: num(t["y"], 0),
    scaleX: num(t["scaleX"], 1),
    scaleY: num(t["scaleY"], 1),
    rotation: num(t["rotation"], 0)
  });
  if (t["kind"] === "affine") {
    return affine();
  }
  const quad = t["quad"];
  const mode = t["mode"];
  if ((t["kind"] === "dual-quad" || mode === "perspective-dual") && isQuadShape(quad)) {
    return quadTransform("perspective", quad);
  }
  if (isString(mode) && isQuadShape(quad)) {
    const migrated = migrateLegacyQuadMode(mode);
    if (migrated) {
      return quadTransform(migrated, quad);
    }
  }
  return affine();
}

/**
 * Migrate legacy effect param names and drop unknown effect types, so every
 * layer carries a valid `effects` array.
 */
export function normalizeLayerEffects(raw: unknown): RenderLayerEffect[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: RenderLayerEffect[] = [];
  for (const item of raw) {
    if (!isRecord(item) || !isString(item["type"])) {
      continue;
    }
    const enabled = item["enabled"] === true;
    const params: UnknownRecord = isRecord(item["params"]) ? item["params"] : {};
    const param = (key: string, legacy?: string): number => {
      const value = params[key];
      if (isNumber(value)) {
        return value;
      }
      const old = legacy ? params[legacy] : undefined;
      return isNumber(old) ? old : 0;
    };
    switch (item["type"]) {
      case "brightness_contrast":
        result.push({
          type: "brightness_contrast",
          enabled,
          params: {
            brightness: param("brightness"),
            contrast: param("contrast")
          }
        });
        break;
      case "hue_saturation":
        result.push({
          type: "hue_saturation",
          enabled,
          params: {
            hueDegrees: param("hueDegrees", "hue"),
            saturation: param("saturation"),
            lightness: param("lightness")
          }
        });
        break;
      case "exposure":
        result.push({
          type: "exposure",
          enabled,
          params: { exposureStops: param("exposureStops", "exposure") }
        });
        break;
      default:
        break;
    }
  }
  return result;
}

const LAYER_TYPES: ReadonlySet<string> = new Set<RenderLayerType>([
  "raster",
  "mask",
  "group",
  "vector"
]);

const IMAGE_FITS: ReadonlySet<string> = new Set<RenderImageFit>([
  "fill",
  "contain",
  "cover"
]);

function normalizeImageReference(raw: unknown): RenderImageReference | null {
  if (!isRecord(raw) || !isString(raw["uri"]) || !raw["uri"]) {
    return null;
  }
  const fit = raw["objectFit"];
  // SAFETY: IMAGE_FITS holds only RenderImageFit values and has() just matched fit.
  return isString(fit) && IMAGE_FITS.has(fit)
    ? { uri: raw["uri"], objectFit: fit as RenderImageFit }
    : { uri: raw["uri"] };
}

/** Canvas size the editor falls back to when a document carries none. */
const DEFAULT_CANVAS_SIZE = 512;

/**
 * Normalize a persisted sketch document (`ImageDocumentData.sketch`, or the
 * `ImageDocumentData` wrapper itself) into the shape the compositor reads,
 * with the per-layer defaults the editor's `normalizeSketchDocument` applies.
 */
export function normalizeRenderDocument(raw: unknown): RenderDocument {
  const root = isRecord(raw) && isRecord(raw["sketch"]) ? raw["sketch"] : raw;
  const doc = isRecord(root) ? root : {};
  const canvas = isRecord(doc["canvas"]) ? doc["canvas"] : {};
  const width = num(canvas["width"], DEFAULT_CANVAS_SIZE);
  const height = num(canvas["height"], DEFAULT_CANVAS_SIZE);
  const rawLayers = Array.isArray(doc["layers"]) ? doc["layers"] : [];

  const layers: RenderLayer[] = [];
  rawLayers.forEach((entry, index) => {
    if (!isRecord(entry)) {
      return;
    }
    const type = entry["type"];
    const bounds = isRecord(entry["contentBounds"]) ? entry["contentBounds"] : {};
    const data = entry["data"];
    const parentId = entry["parentId"];
    // SAFETY: LAYER_TYPES holds only RenderLayerType values and has() matches type first.
    layers.push({
      id: isString(entry["id"]) ? entry["id"] : `layer-${index}`,
      name: isString(entry["name"]) ? entry["name"] : "",
      type: isString(type) && LAYER_TYPES.has(type) ? (type as RenderLayerType) : "raster",
      visible: entry["visible"] !== false,
      opacity: num(entry["opacity"], 1),
      blendMode: isString(entry["blendMode"]) ? entry["blendMode"] : "normal",
      alphaLock: entry["alphaLock"] === true,
      collapsed: entry["collapsed"] === true,
      data: isString(data) && data ? data : null,
      imageReference: normalizeImageReference(entry["imageReference"]),
      transform: normalizeLayerTransform(entry["transform"]),
      contentBounds: {
        x: num(bounds["x"], 0),
        y: num(bounds["y"], 0),
        width: num(bounds["width"], width),
        height: num(bounds["height"], height)
      },
      parentId: isString(parentId) && parentId ? parentId : null,
      effects: normalizeLayerEffects(entry["effects"])
    });
  });

  const maskLayerId = doc["maskLayerId"];
  const background = canvas["backgroundColor"];
  const renderCanvas: RenderDocument["canvas"] = { width, height };
  if (isString(background)) {
    renderCanvas.backgroundColor = background;
  }
  return {
    canvas: renderCanvas,
    layers,
    maskLayerId:
      isString(maskLayerId) && layers.some((layer) => layer.id === maskLayerId)
        ? maskLayerId
        : null
  };
}
