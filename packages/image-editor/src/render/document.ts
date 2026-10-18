/**
 * One-shot compositing of a whole sketch document, for hosts without the
 * live editor: the headless renderer behind `render_sketch` and
 * `nodetool sketch render`.
 *
 * It does what the editor does across its hydration hook and Canvas2D
 * runtime, in one pass: each layer's raster is decoded into a surface the
 * size of its stored bounds (an image reference is fitted into it), then the
 * stack is composited with the shared draw rules in `compose.ts`. The result
 * is what the editor's PNG export produces for the same document.
 *
 * Decoding image bytes is the host's job, so this module stays free of any
 * canvas library and of storage access.
 */

import { decodeSketchLayerData } from "@nodetool-ai/protocol/api-schemas/sketch.js";
import {
  computeCompositeOffset,
  drawWithTransform,
  getAncestorGroupOpacityProduct,
  hasEnabledEffects,
  isLayerCompositeVisible,
  layerEffectsFilter,
  fitImageRect
} from "./compose.js";
import { normalizeRenderDocument } from "./normalize.js";
import type {
  RenderBounds,
  RenderDocument,
  RenderImage,
  RenderLayer,
  RenderSurface
} from "./types.js";

/** What the compositor needs from the host canvas implementation. */
export interface SketchRenderHost {
  createSurface(width: number, height: number): RenderSurface;
  /**
   * Decode a layer image source: a data URL, an `asset://` locator, or an
   * http(s) URL. Resolve null, or throw, when it cannot be read; the layer is
   * then reported as skipped and drawn empty.
   */
  loadImage(source: string): Promise<RenderImage>;
  /** Canvas2D `globalCompositeOperation` for a persisted blend mode. */
  compositeOperation(blendMode: string): string;
  /**
   * Whether `ctx.filter` takes CSS filter functions. When false, layer
   * effects are skipped and named in the report instead of drawn wrong.
   */
  supportsFilter: boolean;
  /**
   * Decode an SVG at a given pixel size. A browser image redraws an SVG at
   * whatever size it is drawn, so a browser host leaves this out; a host whose
   * decoded SVG is a fixed raster supplies it, so a vector layer scaled up by
   * its transform stays sharp instead of magnifying its stored size.
   */
  loadVectorImage?(source: string, width: number, height: number): Promise<RenderImage>;
}

export interface SketchRenderOptions {
  /** Output size. One dimension alone keeps the canvas aspect ratio. */
  width?: number;
  height?: number;
  /** CSS color painted under the composite. Omitted: transparent, as the editor exports. */
  background?: string;
  /**
   * Render this one layer instead of the flattened stack: its transform and
   * effects, without its opacity or blend mode, whether or not it is visible.
   * This is what the editor's PSD export and mask export draw per layer.
   */
  layerId?: string;
}

export interface SketchRenderLayerReport {
  id: string;
  name: string;
  type: RenderLayer["type"];
  /** Whether the layer took part in this render. */
  drawn: boolean;
  /** Why a layer with content drew nothing, or drew without its effects. */
  issue?: string;
}

export interface SketchRenderResult {
  surface: RenderSurface;
  width: number;
  height: number;
  /** The document's own canvas size. */
  canvasWidth: number;
  canvasHeight: number;
  document: RenderDocument;
  /** Bottom of the stack first. */
  layers: SketchRenderLayerReport[];
}

interface HydratedLayer {
  surface: RenderSurface;
  bounds: RenderBounds;
  /** The decoded SVG of a vector layer, redrawn instead of the buffer when scaled. */
  vectorSource: RenderImage | null;
}

function roundBounds(bounds: RenderBounds): RenderBounds {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height))
  };
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() || "it failed with no message";
}

function context2d(surface: RenderSurface): NonNullable<ReturnType<RenderSurface["getContext"]>> {
  const ctx = surface.getContext("2d");
  if (!ctx) {
    throw new Error("The host canvas returned no 2D context.");
  }
  return ctx;
}

/**
 * Decode one layer into a surface, the way the editor hydrates it: the
 * layer's own serialized raster wins, else its image reference is fitted
 * into the layer's content bounds.
 */
async function hydrateLayer(
  layer: RenderLayer,
  host: SketchRenderHost
): Promise<{ hydrated: HydratedLayer; issue?: string }> {
  const fallback = roundBounds({
    x: layer.contentBounds.x,
    y: layer.contentBounds.y,
    width: Math.max(1, layer.contentBounds.width),
    height: Math.max(1, layer.contentBounds.height)
  });
  const source = layer.data || layer.imageReference?.uri || null;
  const fit = layer.data ? undefined : layer.imageReference?.objectFit;
  const decoded = decodeSketchLayerData(source, fallback.width, fallback.height);
  const bounds = roundBounds(
    source && source.startsWith("ntlayer:")
      ? decoded.bounds
      : { ...fallback }
  );
  const surface = host.createSurface(bounds.width, bounds.height);
  const empty = { hydrated: { surface, bounds, vectorSource: null } };
  if (!decoded.image) {
    return empty;
  }
  let image: RenderImage;
  try {
    image = await host.loadImage(decoded.image);
  } catch (error) {
    return { ...empty, issue: `its image could not be loaded: ${describeError(error)}` };
  }
  const rect = fitImageRect(image.width, image.height, bounds.width, bounds.height, fit);
  context2d(surface).drawImage(image, rect.x, rect.y, rect.width, rect.height);
  if (layer.type !== "vector" || !decoded.image.startsWith("data:image/svg+xml")) {
    return { hydrated: { surface, bounds, vectorSource: null } };
  }
  const scale = vectorScale(layer);
  if (scale <= 1 || !host.loadVectorImage) {
    return { hydrated: { surface, bounds, vectorSource: image } };
  }
  try {
    const sharp = await host.loadVectorImage(
      decoded.image,
      Math.ceil(bounds.width * scale),
      Math.ceil(bounds.height * scale)
    );
    return { hydrated: { surface, bounds, vectorSource: sharp } };
  } catch {
    // The stored-size image still draws, only softer.
    return { hydrated: { surface, bounds, vectorSource: image } };
  }
}

/** Largest supersampling a vector layer is redrawn at. */
const MAX_VECTOR_SCALE = 8;

/** How much a vector layer's transform magnifies it, capped. */
function vectorScale(layer: RenderLayer): number {
  if (layer.transform.kind !== "affine") {
    return 1;
  }
  const scale = Math.max(Math.abs(layer.transform.scaleX), Math.abs(layer.transform.scaleY));
  return Number.isFinite(scale) ? Math.min(scale, MAX_VECTOR_SCALE) : 1;
}

interface EffectSurface {
  surface: RenderSurface;
  withEffects: boolean;
}

/** The surface a layer is drawn from: its raster, or the raster with its effects applied. */
function effectSurface(
  layer: RenderLayer,
  hydrated: HydratedLayer,
  host: SketchRenderHost
): EffectSurface {
  if (!hasEnabledEffects(layer.effects) || !host.supportsFilter) {
    return { surface: hydrated.surface, withEffects: false };
  }
  const filter = layerEffectsFilter(layer.effects);
  if (!filter) {
    return { surface: hydrated.surface, withEffects: false };
  }
  const { width, height } = hydrated.surface;
  const out = host.createSurface(width, height);
  const ctx = context2d(out);
  ctx.filter = filter;
  ctx.drawImage(hydrated.surface, 0, 0);
  ctx.filter = "none";
  return { surface: out, withEffects: true };
}

function drawLayer(
  ctx: ReturnType<typeof context2d>,
  doc: RenderDocument,
  layer: RenderLayer,
  hydrated: HydratedLayer,
  host: SketchRenderHost,
  withOpacity: boolean
): void {
  const { surface, withEffects } = effectSurface(layer, hydrated, host);
  ctx.save();
  if (withOpacity) {
    ctx.globalAlpha =
      layer.opacity * getAncestorGroupOpacityProduct(doc.layers, layer, null);
    ctx.globalCompositeOperation = host.compositeOperation(layer.blendMode || "normal");
  }
  const offset = computeCompositeOffset(layer.transform, hydrated.bounds);
  // The editor redraws a vector layer from its SVG only while the buffer it
  // draws is the layer's own; an effect result is a plain raster.
  const drawable =
    layer.type === "vector" && !withEffects && hydrated.vectorSource
      ? hydrated.vectorSource
      : surface;
  drawWithTransform(ctx, surface, offset, layer.transform, drawable);
  ctx.restore();
}

interface OutputSize {
  width: number;
  height: number;
}

function outputSize(doc: RenderDocument, options: SketchRenderOptions): OutputSize {
  const cw = Math.max(1, Math.round(doc.canvas.width));
  const ch = Math.max(1, Math.round(doc.canvas.height));
  const w = options.width && options.width > 0 ? options.width : undefined;
  const h = options.height && options.height > 0 ? options.height : undefined;
  if (w && h) {
    return { width: Math.round(w), height: Math.round(h) };
  }
  if (w) {
    return { width: Math.round(w), height: Math.max(1, Math.round((w * ch) / cw)) };
  }
  if (h) {
    return { width: Math.max(1, Math.round((h * cw) / ch)), height: Math.round(h) };
  }
  return { width: cw, height: ch };
}

/**
 * Render a persisted sketch document: the flattened composite by default, or
 * one layer with `options.layerId`. `raw` is `ImageDocumentData` (with its
 * `sketch` key) or the sketch document itself.
 */
export async function renderSketchDocument(
  raw: unknown,
  host: SketchRenderHost,
  options: SketchRenderOptions = {}
): Promise<SketchRenderResult> {
  const doc = normalizeRenderDocument(raw);
  const canvasWidth = Math.max(1, Math.round(doc.canvas.width));
  const canvasHeight = Math.max(1, Math.round(doc.canvas.height));
  const isolated = options.layerId ?? null;
  if (isolated && !doc.layers.some((layer) => layer.id === isolated)) {
    throw new Error(`The sketch has no layer ${isolated}.`);
  }

  const layerMap = new Map(doc.layers.map((layer) => [layer.id, layer]));
  const reports: SketchRenderLayerReport[] = [];
  const toDraw: Array<{ layer: RenderLayer; report: SketchRenderLayerReport }> = [];
  for (const layer of doc.layers) {
    const report: SketchRenderLayerReport = {
      id: layer.id,
      name: layer.name,
      type: layer.type,
      drawn: false
    };
    reports.push(report);
    const included = isolated
      ? layer.id === isolated && layer.type !== "group"
      : layer.type !== "group" &&
        layer.type !== "mask" &&
        isLayerCompositeVisible(doc.layers, layer, null, layerMap);
    if (included) {
      toDraw.push({ layer, report });
    }
  }

  const hydrated = await Promise.all(
    toDraw.map(({ layer }) => hydrateLayer(layer, host))
  );

  const flat = host.createSurface(canvasWidth, canvasHeight);
  const flatCtx = context2d(flat);
  flatCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  toDraw.forEach(({ layer, report }, index) => {
    const entry = hydrated[index];
    if (!entry) {
      return;
    }
    drawLayer(flatCtx, doc, layer, entry.hydrated, host, !isolated);
    report.drawn = entry.issue === undefined;
    if (entry.issue) {
      report.issue = entry.issue;
    } else if (hasEnabledEffects(layer.effects) && !host.supportsFilter) {
      report.issue = "its effects were not applied: this canvas has no filter support";
    }
  });

  const { width, height } = outputSize(doc, options);
  if (width === canvasWidth && height === canvasHeight && !options.background) {
    return { surface: flat, width, height, canvasWidth, canvasHeight, document: doc, layers: reports };
  }
  const out = host.createSurface(width, height);
  const outCtx = context2d(out);
  if (options.background) {
    outCtx.fillStyle = options.background;
    outCtx.fillRect(0, 0, width, height);
  }
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(flat, 0, 0, canvasWidth, canvasHeight, 0, 0, width, height);
  return { surface: out, width, height, canvasWidth, canvasHeight, document: doc, layers: reports };
}
