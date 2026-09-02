/**
 * canvas2d — the Canvas 2D compositing rules shared by every non-GPU render
 * surface.
 *
 * {@link HeadlessFrameCompositor} is the GPU path; this is the same placement,
 * opacity, blend, wipe and rounded-corner math expressed against a Canvas 2D
 * context, so the browser's WebGPU fallback and the server-side frame preview
 * draw one frame the same way. Written against {@link CompositeContext2D} — the
 * subset of the Canvas 2D API these drawings need — for the reason `draw.ts` is
 * written against `RasterContext2D`: one implementation serves an
 * `OffscreenCanvas`, a DOM canvas and `@napi-rs/canvas`.
 *
 * Effects are the one place this path is an approximation rather than a
 * translation: the color and blur adjustments map onto `ctx.filter`, and the
 * GPU-only effects (chroma key, vignette, sharpen) have no Canvas 2D
 * equivalent. {@link unsupportedEffectTypes} names the ones a given layer set
 * drops, so a caller can say so rather than silently showing a different
 * picture.
 */

import { blendModeToCanvasOp } from "@nodetool-ai/gpu";

import type { AnimationSampleMask, WipeDirection } from "../animation/index.js";
import type { ClipEffect, ClipTransform, TrackEffect } from "../types.js";
import {
  IDENTITY_TRANSFORM,
  buildTransformMatrix,
  clipMatrixToCanvasAffine,
  containBaseScale,
  type CanvasAffine
} from "./transform.js";

/**
 * The Canvas 2D surface a composite draws through. `drawImage` is generic in
 * its source so a host can pass whatever bitmap its canvas accepts — an
 * `HTMLVideoElement`, an `ImageBitmap`, a `@napi-rs/canvas` `Image`.
 */
export interface CompositeContext2D<TSource> {
  globalAlpha: number;
  globalCompositeOperation: string;
  filter: string;
  fillStyle: string | object;
  save(): void;
  restore(): void;
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  moveTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  clip(): void;
  drawImage(source: TSource, x: number, y: number, w: number, h: number): void;
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): CompositeGradient;
}

/** The gradient object `createLinearGradient` vends. */
export interface CompositeGradient {
  addColorStop(offset: number, color: string): void;
}

/** One layer to composite, with its source already decoded or rasterized. */
export interface Canvas2DLayer<TSource> {
  source: TSource;
  /** Source pixel dimensions — the space the transform and mask act in. */
  sourceWidth: number;
  sourceHeight: number;
  opacity: number;
  blendMode: unknown;
  /** Composite order, ascending. */
  zIndex: number;
  transform?: ClipTransform;
  /** The layer's group matrix, from the scene model. Composes as `parent × own`. */
  parentMatrix?: Float32Array;
  /** Rounded-corner radius in source pixels. */
  borderRadius?: number;
  mask?: AnimationSampleMask;
  effects?: ClipEffect[];
  trackEffects?: TrackEffect[];
}

/** Canvas geometry a composite draws into. */
export interface Canvas2DFrameGeometry {
  /** Backing-store size of the destination canvas, in pixels. */
  canvasWidth: number;
  canvasHeight: number;
  /**
   * The sequence's own resolution. A stored `transform.position` is expressed
   * against this, so a DPR-scaled preview canvas places a clip where the
   * export does. Defaults to the canvas size.
   */
  refWidth?: number;
  refHeight?: number;
}

/**
 * An offscreen surface for feathered wipes, supplied by the host because the
 * way to make one differs per environment (`document.createElement`,
 * `OffscreenCanvas`, `createCanvas`). Returning null falls the layer back to a
 * hard-edged wipe.
 */
export type MaskScratchFactory<TSource> = (
  width: number,
  height: number
) => MaskScratch<TSource> | null;

export interface MaskScratch<TSource> {
  ctx: CompositeContext2D<TSource>;
  /** The surface itself, to draw back onto the main context. */
  surface: TSource;
}

/** Effect types this path draws exactly; everything else is dropped. */
const CANVAS_EFFECT_TYPES = new Set([
  "color",
  "blur",
  "colorCorrection",
  "videoBlur"
]);

/**
 * The effect types present on these layers that Canvas 2D cannot draw. A
 * caller reports these rather than letting the frame quietly differ from the
 * GPU render.
 */
export function unsupportedEffectTypes(
  layers: readonly {
    effects?: ClipEffect[];
    trackEffects?: TrackEffect[];
  }[]
): string[] {
  const found = new Set<string>();
  for (const layer of layers) {
    for (const e of layer.effects ?? []) {
      if (e.enabled && !CANVAS_EFFECT_TYPES.has(e.type)) found.add(e.type);
    }
    for (const e of layer.trackEffects ?? []) {
      if (e.enabled && !CANVAS_EFFECT_TYPES.has(e.type)) found.add(e.type);
    }
  }
  return [...found].sort();
}

/**
 * The 2D affine that places a layer of the given source size on the canvas,
 * matching the GPU compositor's placement.
 */
export function layerCanvasAffine(
  transform: ClipTransform | undefined,
  sourceWidth: number,
  sourceHeight: number,
  geometry: Canvas2DFrameGeometry,
  parentMatrix?: Float32Array
): CanvasAffine {
  const { canvasWidth, canvasHeight } = geometry;
  const base = containBaseScale(
    sourceWidth,
    sourceHeight,
    canvasWidth,
    canvasHeight
  );
  const matrix = buildTransformMatrix(
    transform ?? IDENTITY_TRANSFORM,
    base,
    geometry.refWidth || canvasWidth,
    geometry.refHeight || canvasHeight,
    parentMatrix
  );
  return clipMatrixToCanvasAffine(
    matrix,
    sourceWidth,
    sourceHeight,
    canvasWidth,
    canvasHeight
  );
}

/** Reset a context to the state each layer draw assumes. */
function resetContext<TSource>(ctx: CompositeContext2D<TSource>): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
}

/**
 * Composite `layers` onto `ctx`, bottom-up by `zIndex`, over an opaque black
 * ground — the same clear the GPU compositor starts from. The context is left
 * in the reset state. Returns the layers that drew nothing, in composite order.
 */
export function drawTimelineFrame<TSource>(
  ctx: CompositeContext2D<TSource>,
  layers: readonly Canvas2DLayer<TSource>[],
  geometry: Canvas2DFrameGeometry,
  maskScratch?: MaskScratchFactory<TSource>
): Canvas2DLayer<TSource>[] {
  resetContext(ctx);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, geometry.canvasWidth, geometry.canvasHeight);

  const skipped: Canvas2DLayer<TSource>[] = [];
  const ordered = [...layers].sort((a, b) => a.zIndex - b.zIndex);
  for (const layer of ordered) {
    if (!drawTimelineLayer(ctx, layer, geometry, maskScratch)) {
      skipped.push(layer);
    }
  }
  resetContext(ctx);
  return skipped;
}

/**
 * Draw one layer with its transform, opacity, blend mode, effect filter,
 * rounded corners and wipe mask. Assumes the context is in the reset state and
 * leaves it that way.
 *
 * Returns false when the layer contributed nothing — a degenerate source size,
 * or a source the host handed over that turned out not to be drawable (a
 * `<video>` that began seeking between the readiness check and this call).
 * A live preview ignores that and re-draws next frame; a one-shot render
 * reports it, because there a missing layer is a missing layer.
 */
export function drawTimelineLayer<TSource>(
  ctx: CompositeContext2D<TSource>,
  layer: Canvas2DLayer<TSource>,
  geometry: Canvas2DFrameGeometry,
  maskScratch?: MaskScratchFactory<TSource>
): boolean {
  const { sourceWidth: width, sourceHeight: height } = layer;
  if (width <= 0 || height <= 0) return false;

  const t = layerCanvasAffine(
    layer.transform,
    width,
    height,
    geometry,
    layer.parentMatrix
  );

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
  ctx.globalCompositeOperation = blendModeToCanvasOp(layer.blendMode);
  ctx.filter = filterForEffects(layer.effects, layer.trackEffects);
  ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);

  const radiusPx = layer.borderRadius ?? 0;
  if (radiusPx > 0) {
    clipRoundedRect(
      ctx,
      0,
      0,
      width,
      height,
      Math.min(radiusPx, width / 2, height / 2)
    );
  }

  // The wipe lives in the layer's own source-pixel space, so it rotates with
  // the layer exactly as the GPU shader's quad-space mask does. A hard edge is
  // a rect clip; a feathered one pre-masks the source on a scratch surface
  // with a destination-in gradient approximating the shader's smoothstep.
  let source = layer.source;
  const mask = layer.mask;
  if (mask) {
    const scratch =
      mask.softness > 0 && maskScratch
        ? featherWipe(layer.source, width, height, mask, maskScratch)
        : null;
    if (scratch !== null) {
      source = scratch;
    } else {
      // No feather, or no scratch surface to build one on: a hard edge at the
      // same progress is the honest fallback.
      clipWipeRect(ctx, width, height, mask);
    }
  }

  let drawn = true;
  try {
    ctx.drawImage(source, 0, 0, width, height);
  } catch {
    drawn = false;
  }
  ctx.restore();
  resetContext(ctx);
  return drawn;
}

/**
 * Copy `source` onto a scratch surface and knock out the hidden side of the
 * wipe with a `destination-in` linear gradient. The stops sample the same
 * `1 - smoothstep(e - s, e, c)` profile the WebGPU shader evaluates
 * per-fragment, at the same front position `e = progress * (1 + s)`, so both
 * backends show the same visible fraction at the same progress.
 */
function featherWipe<TSource>(
  source: TSource,
  width: number,
  height: number,
  mask: AnimationSampleMask,
  makeScratch: MaskScratchFactory<TSource>
): TSource | null {
  const scratch = makeScratch(width, height);
  if (!scratch) return null;
  const sctx = scratch.ctx;

  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalAlpha = 1;
  sctx.filter = "none";
  sctx.globalCompositeOperation = "source-over";
  sctx.clearRect(0, 0, width, height);
  sctx.drawImage(source, 0, 0, width, height);

  const s = mask.softness;
  const e = mask.progress * (1 + s);
  // The gradient runs along the wipe axis from c = e - s (fully visible) to
  // c = e (fully hidden), where c is the normalized distance from the reveal
  // edge. Regions outside the band clamp to the nearest stop.
  const from = axisPoint(mask.direction, e - s, width, height);
  const to = axisPoint(mask.direction, e, width, height);
  const gradient = sctx.createLinearGradient(from.x, from.y, to.x, to.y);
  for (const f of FEATHER_STOPS) {
    gradient.addColorStop(f, `rgba(0,0,0,${1 - (3 * f * f - 2 * f * f * f)})`);
  }
  sctx.globalCompositeOperation = "destination-in";
  sctx.fillStyle = gradient;
  sctx.fillRect(0, 0, width, height);
  sctx.globalCompositeOperation = "source-over";
  return scratch.surface;
}

/** Five stops approximate the shader's smoothstep feather. */
const FEATHER_STOPS = [0, 0.25, 0.5, 0.75, 1];

/**
 * The source-pixel point at normalized distance `c` from a wipe's reveal edge,
 * along the wipe axis.
 */
export function axisPoint(
  direction: WipeDirection,
  c: number,
  width: number,
  height: number
): { x: number; y: number } {
  switch (direction) {
    case "left":
      return { x: c * width, y: 0 };
    case "right":
      return { x: (1 - c) * width, y: 0 };
    case "up":
      return { x: 0, y: c * height };
    case "down":
      return { x: 0, y: (1 - c) * height };
  }
}

/**
 * Clip to a hard-edged wipe's visible region: the rect within normalized
 * distance `progress` of the reveal edge, in source-pixel space (so it
 * composes with the active layer transform and any rounded-rect clip).
 */
export function clipWipeRect<TSource>(
  ctx: CompositeContext2D<TSource>,
  width: number,
  height: number,
  mask: AnimationSampleMask
): void {
  const p = Math.max(0, Math.min(1, mask.progress));
  ctx.beginPath();
  switch (mask.direction) {
    case "left":
      ctx.rect(0, 0, p * width, height);
      break;
    case "right":
      ctx.rect((1 - p) * width, 0, p * width, height);
      break;
    case "up":
      ctx.rect(0, 0, width, p * height);
      break;
    case "down":
      ctx.rect(0, (1 - p) * height, width, p * height);
      break;
  }
  ctx.clip();
}

/** Clip the current path to a rounded rectangle in the active transform space. */
export function clipRoundedRect<TSource>(
  ctx: CompositeContext2D<TSource>,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.clip();
}

/**
 * Memoize the built filter string per `(clipEffects, trackEffects)` array
 * identity. Both arrays are stable references on the clip/track until edited,
 * so a clip sitting still reuses its string across every frame instead of
 * rebuilding it per layer per frame.
 */
const FILTER_NONE_KEY: readonly never[] = Object.freeze([]);
const filterCache = new WeakMap<object, WeakMap<object, string>>();

export function filterForEffects(
  clipEffects: ClipEffect[] | undefined,
  trackEffects: TrackEffect[] | undefined
): string {
  // Normalize undefined to a shared sentinel so both keys are always objects
  // the WeakMaps can hold.
  const clipKey = (clipEffects ?? FILTER_NONE_KEY) as object;
  const trackKey = (trackEffects ?? FILTER_NONE_KEY) as object;
  let inner = filterCache.get(clipKey);
  if (inner) {
    const hit = inner.get(trackKey);
    if (hit !== undefined) return hit;
  } else {
    inner = new WeakMap<object, string>();
    filterCache.set(clipKey, inner);
  }
  const result = computeFilterForEffects(clipEffects, trackEffects);
  inner.set(trackKey, result);
  return result;
}

/**
 * Approximate the clip + track color/blur effects with a CSS `filter` string.
 * Covers the brightness / contrast / saturation / hue / blur adjustments and
 * ignores the GPU-only effects — see {@link unsupportedEffectTypes}.
 */
function computeFilterForEffects(
  clipEffects: ClipEffect[] | undefined,
  trackEffects: TrackEffect[] | undefined
): string {
  let brightness = 0;
  let contrast = 1;
  let saturation = 1;
  let hue = 0;
  let blur = 0;

  for (const e of clipEffects ?? []) {
    if (!e.enabled) continue;
    if (e.type === "color") {
      brightness += e.brightness ?? 0;
      contrast *= e.contrast ?? 1;
      saturation *= e.saturation ?? 1;
      hue += e.hue ?? 0;
    } else if (e.type === "blur") {
      blur += e.radius;
    }
  }
  for (const e of trackEffects ?? []) {
    if (!e.enabled) continue;
    if (e.type === "colorCorrection") {
      brightness += e.brightness;
      contrast *= e.contrast;
      saturation *= e.saturation;
      hue += e.hue;
    } else if (e.type === "videoBlur") {
      blur += e.radius;
    }
  }

  const parts: string[] = [];
  if (Math.abs(brightness) > 0.001) {
    parts.push(`brightness(${(1 + brightness).toFixed(3)})`);
  }
  if (Math.abs(contrast - 1) > 0.001) {
    parts.push(`contrast(${contrast.toFixed(3)})`);
  }
  if (Math.abs(saturation - 1) > 0.001) {
    parts.push(`saturate(${saturation.toFixed(3)})`);
  }
  if (Math.abs(hue) > 0.001) {
    parts.push(`hue-rotate(${hue.toFixed(2)}deg)`);
  }
  if (blur >= 0.5) {
    parts.push(`blur(${Math.min(40, blur).toFixed(2)}px)`);
  }
  return parts.length > 0 ? parts.join(" ") : "none";
}
