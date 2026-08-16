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

/** Max canvas dimensions to prevent excessive resource consumption. */
export const MAX_FABRIC_DIMENSION = 8192;

export interface FabricSceneSpec {
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
    (await importOptionalLibrary<Record<string, unknown>>(where, "fabric"));
  return unwrapLibrary<FabricLike>(
    mod,
    where,
    "fabric",
    (v) => typeof (v as FabricLike | undefined)?.StaticCanvas === "function"
  );
}

function parseSceneSpec(where: string, spec: unknown): FabricSceneSpec {
  if (typeof spec === "string") {
    try {
      spec = JSON.parse(spec);
    } catch (e) {
      throw new Error(
        `${where}: scene JSON could not be parsed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
  return optionsOf(spec);
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
    const multiplier =
      typeof opts.multiplier === "number" && opts.multiplier > 0
        ? Math.min(opts.multiplier, 4)
        : 1;
    const quality =
      typeof opts.quality === "number" && opts.quality >= 0 && opts.quality <= 1
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
    if (typeof canvas.dispose === "function") {
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
    if (typeof canvas.dispose === "function") {
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
    const multiplier =
      typeof opts.multiplier === "number" && opts.multiplier > 0
        ? Math.min(opts.multiplier, 4)
        : 1;
    const quality =
      typeof opts.quality === "number" && opts.quality >= 0 && opts.quality <= 1
        ? opts.quality
        : 1;

    return canvas.toDataURL({
      format: format === "jpeg" || format === "jpg" ? "jpeg" : "png",
      multiplier,
      quality
    });
  } finally {
    if (typeof canvas.dispose === "function") {
      canvas.dispose();
    }
  }
}

/** Fabric's own parse of an SVG document: its objects and canvas options. */
export interface FabricSvgScene {
  objects: unknown[];
  options: unknown;
}

/**
 * Parse an SVG string into Fabric objects and canvas options.
 */
export async function loadSVG(svg: unknown): Promise<FabricSvgScene> {
  const where = "fabric.loadSVG";
  const svgText = requireText(where, svg, "svg");
  const fabricLib = await loadFabric(where);

  const parseFn =
    fabricLib.loadSVGFromString ?? fabricLib.util?.loadSVGFromString;
  if (typeof parseFn !== "function") {
    throw new Error(
      `${where}: SVG parsing is not supported by this Fabric version`
    );
  }

  const result = await parseFn(svgText);
  return {
    objects: result.objects,
    options: result.options
  };
}
