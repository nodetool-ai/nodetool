/**
 * `@nodetool-ai/sandbox-fabric` — Fabric.js, on the host.
 *
 * Fabric.js requires a canvas implementation and DOM utilities which are not
 * present in the QuickJS guest WebAssembly sandbox. This host module executes
 * scene graph construction and rasterization/SVG generation on the host.
 */

import { importOptionalModule } from "@nodetool-ai/config";

import { toGuestBytes, type GuestBytes } from "../sandbox-bytes.js";
import {
  importOptionalLibrary,
  optionsOf,
  requireText,
  unwrapLibrary
} from "./limits.js";
import {
  isFunction,
  isNumber,
  isString
} from "../utils/type-guards.js";

/** Max canvas dimensions to prevent excessive resource consumption. */
export const MAX_FABRIC_DIMENSION = 8192;

/**
 * Max pixels in one rasterized output, after the multiplier. Encoding runs
 * synchronously on the host's main thread, so this bounds how long one call
 * can hold it: an 8192 x 8192 canvas at multiplier 4 took over 30 seconds.
 */
export const MAX_FABRIC_OUTPUT_PIXELS = 4096 * 4096;

/** Scene keys whose value Fabric loads as an image or pattern source. */
const RESOURCE_KEYS = new Set(["src", "href", "xlink:href", "source", "url"]);

/** Inline raster images, the only resource a scene may name. */
const INLINE_RASTER_IMAGE = /^data:image\/(png|jpe?g|gif|webp|bmp|avif);/i;

const MAX_SCENE_DEPTH = 64;

/**
 * Refuse a scene that names an external resource.
 *
 * Fabric's Node build loads `src` through a jsdom whose resource loader reads
 * `file://` paths and requests any host, outside the sandbox's workspace
 * containment and SSRF guard. Only inline raster `data:` images pass. An SVG
 * `data:` image is refused too, since its own references would load the same
 * way. Fetch remote images with `fetch` and pass their bytes as a data URI.
 *
 * A resource key must hold a string. Fabric assigns the value to an image's
 * `src` as is, and an array or other value stringifies to whatever URL it
 * holds, so a check on strings alone let `src: ["file:///..."]` through.
 */
export function assertNoExternalResources(where: string, value: unknown, depth = 0): void {
  if (depth > MAX_SCENE_DEPTH) {
    throw new Error(`${where}: scene is nested deeper than ${MAX_SCENE_DEPTH} levels`);
  }
  if (Array.isArray(value)) {
    for (const item of value) assertNoExternalResources(where, item, depth + 1);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (RESOURCE_KEYS.has(key) && child !== null && child !== undefined && !isString(child)) {
      throw new Error(`${where}: ${key} must be a string`);
    }
    if (RESOURCE_KEYS.has(key) && isString(child) && child.trim() !== "" &&
      !INLINE_RASTER_IMAGE.test(child.trim())) {
      throw new Error(
        `${where}: ${key} must be an inline data:image URI (png, jpeg, gif, webp, bmp or avif). Fetch the image and pass its bytes inline.`
      );
    }
    assertNoExternalResources(where, child, depth + 1);
  }
}

/** Attribute and CSS references an SVG document can load. */
const SVG_REFERENCE = /(?:\b(?:href|src)\s*=\s*["']([^"']*)["'])|(?:url\(\s*["']?([^"')]*))/gi;

/**
 * Refuse an SVG document that loads anything external. Fragment references
 * (`#id`, `url(#gradient)`) and inline raster images pass. `@import`, entity
 * declarations and anything else that names a URL do not.
 */
export function assertSvgHasNoExternalResources(where: string, svg: string): void {
  if (/@import/i.test(svg)) {
    throw new Error(`${where}: SVG stylesheets may not @import`);
  }
  if (/<!ENTITY/i.test(svg)) {
    throw new Error(`${where}: SVG may not declare entities`);
  }
  for (const match of svg.matchAll(SVG_REFERENCE)) {
    const target = (match[1] ?? match[2] ?? "").trim();
    if (target === "" || target.startsWith("#") || INLINE_RASTER_IMAGE.test(target)) continue;
    throw new Error(
      `${where}: SVG references an external resource (${target.slice(0, 80)}). Only #fragment references and inline data:image URIs are allowed.`
    );
  }
}

/** The rasterization multiplier: positive, at most 4, default 1. */
function multiplierOf(opts: Record<string, unknown>): number {
  return isNumber(opts.multiplier) && opts.multiplier > 0
    ? Math.min(opts.multiplier, 4)
    : 1;
}

function assertOutputPixels(where: string, width: number, height: number, multiplier: number): void {
  if (width * height * multiplier * multiplier > MAX_FABRIC_OUTPUT_PIXELS) {
    throw new Error(
      `${where}: width x height x multiplier\u00b2 must be at most ${MAX_FABRIC_OUTPUT_PIXELS} pixels`
    );
  }
}

/** Max Fabric objects in one scene, nested groups and clip paths included. */
export const MAX_FABRIC_OBJECTS = 2000;

/** Max shadow blur radius, in scene pixels. */
export const MAX_FABRIC_SHADOW_BLUR = 100;

/**
 * Max output pixels summed over every shadow and image filter in a scene.
 *
 * Each shadow or filter costs roughly one full pass over the area it covers,
 * on the host's main thread, and the pixel cap alone does not bound that: 20
 * full-canvas shadows with a large blur on a 4096 x 4096 canvas took over
 * three minutes. Counting every effect at the full output size is an upper
 * bound. It allows two effects at the largest output and more on a smaller
 * canvas, up to {@link MAX_FABRIC_EFFECTS}.
 */
export const MAX_FABRIC_EFFECT_PIXELS = 2 * MAX_FABRIC_OUTPUT_PIXELS;

/**
 * Max shadows and image filters in one scene, whatever its size. Each effect
 * also has a fixed cost: 256 blurred shadows on a 512 x 512 canvas took 13
 * seconds.
 */
export const MAX_FABRIC_EFFECTS = 32;

/** The blur radius of a Fabric shadow, given as an object or a CSS-like string. */
function shadowBlur(shadow: unknown): number {
  if (isString(shadow)) {
    const numbers = (shadow.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    return numbers.length >= 3 ? Math.abs(numbers[numbers.length - 1] ?? 0) : 0;
  }
  if (shadow !== null && typeof shadow === "object") {
    const blur = Number((shadow as Record<string, unknown>).blur ?? 0);
    return Number.isFinite(blur) ? Math.abs(blur) : Infinity;
  }
  return 0;
}

/**
 * Refuse a scene whose render would hold the host thread too long: too many
 * objects, a shadow blur over the limit, or more shadows and image filters
 * than the output size allows. Fabric renders and encodes synchronously, and
 * host modules run on the server's main thread.
 */
export function assertRenderBudget(
  where: string,
  scene: unknown,
  outputPixels: number
): void {
  let objects = 0;
  let effects = 0;
  const visit = (value: unknown, depth: number): void => {
    if (depth > MAX_SCENE_DEPTH) {
      throw new Error(`${where}: scene is nested deeper than ${MAX_SCENE_DEPTH} levels`);
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (isString(record.type)) {
      objects += 1;
      if (record.shadow !== null && record.shadow !== undefined) {
        if (shadowBlur(record.shadow) > MAX_FABRIC_SHADOW_BLUR) {
          throw new Error(`${where}: shadow blur must be at most ${MAX_FABRIC_SHADOW_BLUR}`);
        }
        effects += 1;
      }
      if (Array.isArray(record.filters)) {
        effects += record.filters.filter((f) => f !== null && f !== undefined).length;
      }
      if (record.resizeFilter !== null && record.resizeFilter !== undefined) {
        effects += 1;
      }
    }
    for (const child of Object.values(record)) visit(child, depth + 1);
  };
  visit(scene, 0);
  if (objects > MAX_FABRIC_OBJECTS) {
    throw new Error(`${where}: a scene may hold at most ${MAX_FABRIC_OBJECTS} objects`);
  }
  if (effects > MAX_FABRIC_EFFECTS || effects * outputPixels > MAX_FABRIC_EFFECT_PIXELS) {
    throw new Error(
      `${where}: too many shadows and image filters for this output size (at most ${MAX_FABRIC_EFFECTS}, and shadows and filters x width x height x multiplier\u00b2 at most ${MAX_FABRIC_EFFECT_PIXELS} pixels)`
    );
  }
}

interface FabricSceneSpec {
  width?: number;
  height?: number;
  backgroundColor?: string;
  objects?: unknown[];
  [key: string]: unknown;
}

interface FabricStaticCanvas {
  width?: number;
  height?: number;
  backgroundColor?: unknown;
  loadFromJSON: (json: unknown) => Promise<FabricStaticCanvas>;
  renderAll: () => void;
  toDataURL: (options?: {
    format?: string;
    quality?: number;
    multiplier?: number;
  }) => string;
  toSVG: (options?: unknown) => string;
  dispose?: () => void;
}

interface FabricLike {
  StaticCanvas: new (
    element: unknown,
    options?: Record<string, unknown>
  ) => FabricStaticCanvas;
  loadSVGFromString?: (
    svg: string
  ) => Promise<{ objects: unknown[]; options: unknown }>;
  util?: {
    loadSVGFromString?: (
      svg: string
    ) => Promise<{ objects: unknown[]; options: unknown }>;
  };
}

/** Canvas options, with a background only when the scene names one. */
type CanvasOptions = {
  width: number;
  height: number;
  backgroundColor?: string;
};

function canvasOptions(
  width: number,
  height: number,
  scene: { backgroundColor?: string }
): CanvasOptions {
  const options: CanvasOptions = { width, height };
  if (scene.backgroundColor) options.backgroundColor = scene.backgroundColor;
  return options;
}

async function loadFabric(where: string): Promise<FabricLike> {
  // Fabric's default entry is its *browser* build: constructing a canvas there
  // reaches for `document`, so on Node every call failed with "document is not
  // defined". The package ships `fabric/node`, which wires a real canvas
  // backend. In a browser — where this host module is the page — that subpath
  // does not resolve and the default entry is the right one, so try the Node
  // build first and fall back rather than branching on a runtime flag.
  const node = await importOptionalModule<Record<string, unknown>>(
    "fabric/node"
  ).catch(() => undefined);
  const mod =
    node ??
    (await importOptionalLibrary<Record<string, unknown>>(
      where,
      "fabric",
      "fabric"
    ));
  return unwrapLibrary<FabricLike>(
    mod,
    where,
    "fabric",
    (v) => isFunction((v as FabricLike | undefined)?.StaticCanvas)
  );
}

function parseSceneSpec(where: string, spec: unknown): FabricSceneSpec {
  if (isString(spec)) {
    try {
      spec = JSON.parse(spec);
    } catch (e) {
      throw new Error(
        `${where}: scene JSON could not be parsed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
  const scene = optionsOf(spec);
  assertNoExternalResources(where, scene);
  return scene;
}

function normalizeDimension(
  where: string,
  value: unknown,
  name: string,
  defaultValue = 800
): number {
  const num = Number(value ?? defaultValue);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_FABRIC_DIMENSION) {
    throw new Error(
      `${where}: ${name} must be a positive number up to ${MAX_FABRIC_DIMENSION}`
    );
  }
  return Math.round(num);
}

/**
 * Render a Fabric.js scene specification or JSON export to image bytes (PNG / JPEG).
 *
 * ```js
 * import { render } from "@nodetool-ai/sandbox-fabric";
 *
 * const imageBytes = await render({
 *   width: 800,
 *   height: 600,
 *   backgroundColor: "#ffffff",
 *   objects: [
 *     { type: "rect", left: 100, top: 100, width: 200, height: 100, fill: "red" }
 *   ]
 * });
 * ```
 */
export async function render(
  spec: unknown,
  options?: unknown
): Promise<GuestBytes> {
  const where = "fabric.render";
  const scene = parseSceneSpec(where, spec);
  const opts = optionsOf(options);

  const width = normalizeDimension(
    where,
    scene.width ?? opts.width,
    "width",
    800
  );
  const height = normalizeDimension(
    where,
    scene.height ?? opts.height,
    "height",
    600
  );
  assertOutputPixels(where, width, height, multiplierOf(opts));
  assertRenderBudget(where, scene, width * height * multiplierOf(opts) ** 2);

  const fabricLib = await loadFabric(where);
  const canvas = new fabricLib.StaticCanvas(
    null,
    canvasOptions(width, height, scene)
  );

  try {
    if (scene.objects || Object.keys(scene).length > 0) {
      await canvas.loadFromJSON(scene);
    }
    canvas.renderAll();

    const format = String(opts.format ?? "png").toLowerCase();
    const multiplier = multiplierOf(opts);
    const quality =
      isNumber(opts.quality) && opts.quality >= 0 && opts.quality <= 1
        ? opts.quality
        : 1;

    const dataUrl = canvas.toDataURL({
      format: format === "jpeg" || format === "jpg" ? "jpeg" : "png",
      multiplier,
      quality
    });

    const base64Index = dataUrl.indexOf(",");
    const base64 = base64Index >= 0 ? dataUrl.slice(base64Index + 1) : dataUrl;
    const buffer = Buffer.from(base64, "base64");
    return toGuestBytes(buffer);
  } finally {
    if (isFunction(canvas.dispose)) {
      canvas.dispose();
    }
  }
}

/**
 * Render a Fabric scene specification to an SVG string.
 */
export async function renderSVG(
  spec: unknown,
  options?: unknown
): Promise<string> {
  const where = "fabric.renderSVG";
  const scene = parseSceneSpec(where, spec);
  const opts = optionsOf(options);

  const width = normalizeDimension(
    where,
    scene.width ?? opts.width,
    "width",
    800
  );
  const height = normalizeDimension(
    where,
    scene.height ?? opts.height,
    "height",
    600
  );
  assertOutputPixels(where, width, height, 1);
  assertRenderBudget(where, scene, width * height);

  const fabricLib = await loadFabric(where);
  const canvas = new fabricLib.StaticCanvas(
    null,
    canvasOptions(width, height, scene)
  );

  try {
    if (scene.objects || Object.keys(scene).length > 0) {
      await canvas.loadFromJSON(scene);
    }
    canvas.renderAll();
    return canvas.toSVG(opts);
  } finally {
    if (isFunction(canvas.dispose)) {
      canvas.dispose();
    }
  }
}

/**
 * Render a Fabric scene specification and return its data URL.
 */
export async function toDataURL(
  spec: unknown,
  options?: unknown
): Promise<string> {
  const where = "fabric.toDataURL";
  const scene = parseSceneSpec(where, spec);
  const opts = optionsOf(options);

  const width = normalizeDimension(
    where,
    scene.width ?? opts.width,
    "width",
    800
  );
  const height = normalizeDimension(
    where,
    scene.height ?? opts.height,
    "height",
    600
  );
  assertOutputPixels(where, width, height, multiplierOf(opts));
  assertRenderBudget(where, scene, width * height * multiplierOf(opts) ** 2);

  const fabricLib = await loadFabric(where);
  const canvas = new fabricLib.StaticCanvas(
    null,
    canvasOptions(width, height, scene)
  );

  try {
    if (scene.objects || Object.keys(scene).length > 0) {
      await canvas.loadFromJSON(scene);
    }
    canvas.renderAll();

    const format = String(opts.format ?? "png").toLowerCase();
    const multiplier = multiplierOf(opts);
    const quality =
      isNumber(opts.quality) && opts.quality >= 0 && opts.quality <= 1
        ? opts.quality
        : 1;

    return canvas.toDataURL({
      format: format === "jpeg" || format === "jpg" ? "jpeg" : "png",
      multiplier,
      quality
    });
  } finally {
    if (isFunction(canvas.dispose)) {
      canvas.dispose();
    }
  }
}

/** Fabric's own parse of an SVG document: its objects and canvas options. */
interface FabricSvgScene {
  objects: unknown[];
  options: unknown;
}

/**
 * Parse an SVG string into Fabric objects and canvas options.
 */
export async function loadSVG(svg: unknown): Promise<FabricSvgScene> {
  const where = "fabric.loadSVG";
  const svgText = requireText(where, svg, "svg");
  assertSvgHasNoExternalResources(where, svgText);
  const fabricLib = await loadFabric(where);

  const parseFn =
    fabricLib.loadSVGFromString ?? fabricLib.util?.loadSVGFromString;
  if (!isFunction(parseFn)) {
    throw new Error(
      `${where}: SVG parsing is not supported by this Fabric version`
    );
  }

  const result = await parseFn(svgText);
  // Fabric returns class instances (and null for elements it skips). Those
  // cannot cross the worker boundary, so hand back their plain JSON, the same
  // shape `render` and `loadFromJSON` take.
  return {
    objects: result.objects
      .filter((object) => object !== null && object !== undefined)
      .map((object) => {
        const toObject = (object as { toObject?: unknown }).toObject;
        return isFunction(toObject)
          ? (toObject as () => unknown).call(object)
          : object;
      }),
    options: result.options
  };
}
