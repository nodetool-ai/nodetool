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
 * Pixel effects run on a scratch surface shared by browser and Node hosts.
 * If a host cannot provide that surface, the frame reports the degradation.
 *
 * A group carrying effects, a blend mode, or a transition composites its
 * children onto an intermediate surface first, so the effect chain and cut
 * run on the composed picture and the blend meets the frame once. The host vends that surface through
 * {@link CompositeSurfaceFactory}, because there is no way to make one that
 * exists in both a browser and Node.
 *
 * An adjustment reuses that machinery from the other end: at its own z it
 * copies the surface it sits on, runs its chain on the copy, and mixes the copy
 * back into the untreated composite by its coverage — so it treats everything
 * drawn below it and nothing above, and replaces what it covers rather than
 * lying over it.
 */

import { blendModeToCanvasOp } from "@nodetool-ai/gpu";

import type { AnimationSampleMask, WipeDirection } from "../animation/index.js";
import { cropRectPx, hasCrop } from "../crop.js";
import type {
  ClipCrop,
  ClipDropShadowEffect,
  ClipEffect,
  ClipMask,
  ClipTransform,
  TrackEffect
} from "../types.js";
import {
  isClipBlurEffect,
  isClipChromaKeyEffect,
  isClipColorEffect,
  isClipDropShadowEffect,
  isClipSharpenEffect,
  isClipVignetteEffect
} from "../types.js";
import { clipMask, drawMask, maskIsHard, type MaskContext2D } from "./draw.js";
import { applyCpuDropShadows, applyCpuIris, applyCpuVisualEffects, isCpuVisualEffect } from "./cpuVisualEffects.js";
import { alphaBounds, applyCpuColorGrade, applyCpuGaussianBlur, applyCpuLegacyEffects, isCpuLegacyEffect } from "./cpuLegacyEffects.js";
import { aggregateBlurRadius } from "./effects.js";
import type { MatteMode } from "./sceneModel.js";
import { trackEffectsAsClipEffects } from "./trackEffects.js";
import {
  IDENTITY_TRANSFORM,
  buildTransformMatrix,
  clipMatrixToCanvasAffine,
  containBaseScale,
  type CanvasAffine
} from "./transform.js";
import {
  transitionTransform,
  type ResolvedTransition
} from "./transition.js";

/**
 * The Canvas 2D surface a composite draws through. `drawImage` is generic in
 * its source so a host can pass whatever bitmap its canvas accepts — an
 * `HTMLVideoElement`, an `ImageBitmap`, a `@napi-rs/canvas` `Image`.
 */
export interface CompositeContext2D<TSource> extends MaskContext2D {
  globalAlpha: number;
  /**
   * The one clip effect this path draws rather than approximates. Canvas 2D
   * casts a shadow from whatever is drawn next, which is the same silhouette
   * `mixer.dropShadow@1` blurs on the GPU path.
   */
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  drawImage(source: TSource, x: number, y: number, w: number, h: number): void;
  /**
   * Read back the surface's pixels. A luma matte is the one rule here that no
   * composite operation expresses: `destination-in` multiplies alpha by alpha,
   * and moving a matte's luminance into its alpha needs the bytes.
   */
  getImageData(x: number, y: number, w: number, h: number): ImagePixels;
  putImageData(pixels: ImagePixels, x: number, y: number): void;
}

/** The pixels `getImageData` vends, as both canvas implementations shape them. */
export interface ImagePixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}


/** One layer to composite, with its source already decoded or rasterized. */
export interface Canvas2DLayer<TSource> {
  /**
   * The clip this layer draws, when the host knows it. Only a
   * {@link Canvas2DDegradation} reads it — a report naming no clip is a report
   * an agent cannot act on.
   */
  clipId?: string;
  source: TSource;
  /** Source pixel dimensions — the space the transform and mask act in. */
  sourceWidth: number;
  sourceHeight: number;
  opacity: number;
  blendMode: unknown;
  /** Composite order, ascending. */
  zIndex: number;
  /** Order among clips and group surfaces with the same zIndex. */
  stackOrder?: number;
  transform?: ClipTransform;
  /** The layer's group matrix, from the scene model. Composes as `parent × own`. */
  parentMatrix?: Float32Array;
  /**
   * The precomposite this layer draws into instead of the main stack, from the
   * scene model. Absent on every layer of a document with no precompositing
   * group, which is the path that allocates no surface.
   */
  precomposeGroupId?: string;
  /** Rounded-corner radius in source pixels. */
  borderRadius?: number;
  /**
   * The part of the source this layer draws, taken before anything else reads
   * it: the contain fit, the transform, the border radius and the masks all see
   * the cropped rectangle as the layer's whole picture. Needs `cropSurface` to
   * copy through, or the layer draws uncropped and reports `crop_skipped`.
   */
  crop?: ClipCrop;
  mask?: AnimationSampleMask;
  /**
   * The clip's shape mask, in this layer's own source-pixel space so it turns
   * with the layer. A hard edge is a path clip and costs nothing; a feathered
   * one rasterizes its coverage on `maskSurface` and multiplies it in.
   */
  shapeMask?: ClipMask;
  /**
   * The track matte driving this layer's alpha. `layer` is the matte source
   * resolved as an ordinary layer — it is composited to its own surface and
   * read, never drawn onto the frame.
   */
  matte?: Canvas2DMatte<TSource>;
  effects?: ClipEffect[];
  trackEffects?: TrackEffect[];
  /**
   * The cut this layer is part of, from the scene model. Its opacity is
   * already in `opacity`; the offset, scale, reveal mask and dip solid it
   * names are drawn here.
   */
  transition?: ResolvedTransition;
}

/** A track matte with its source layer's pixels already in hand. */
export interface Canvas2DMatte<TSource> {
  mode: MatteMode;
  invert: boolean;
  layer: Canvas2DLayer<TSource>;
  /** Multiplies the matte's alpha. Absent means 1. */
  strength?: number;
  /**
   * Softened edge, in pixels. This path has no separable blur to run on a
   * keyhole surface, so it draws the edge hard and reports
   * `generated_matte_feather_ignored`.
   */
  featherPx?: number;
}

/**
 * A group that composites its children onto an intermediate surface, runs its
 * effect chain on the composed picture, and blends the result once.
 *
 * Mirrors `PrecompositeLayer` from the scene model with `trackIndex` already
 * resolved to a `zIndex`, the way {@link Canvas2DLayer} mirrors `ActiveLayer`.
 */
export interface Canvas2DPrecomposite {
  /** The group clip's id — what a layer names in `precomposeGroupId`. */
  id: string;
  /** Composite order of the blended result, ascending. */
  zIndex: number;
  /** Order among clips and group surfaces with the same zIndex. */
  stackOrder?: number;
  opacity: number;
  blendMode: unknown;
  /** Run once on the composed surface, not once per child. */
  effects?: ClipEffect[];
  /** Applied to the composed surface, not separately to its children. */
  transition?: ResolvedTransition;
  /** Set when a precompositing group holds this one: the surface it draws into. */
  precomposeGroupId?: string;
}

/**
 * An adjustment clip's treatment of the surface beneath it.
 *
 * Mirrors `AdjustmentLayer` from the scene model with `trackIndex` already
 * resolved to a `zIndex`, the way {@link Canvas2DLayer} mirrors `ActiveLayer`.
 * It draws nothing of its own: at its `zIndex` the composite so far is copied
 * to a surface, {@link effects} run on the copy, and the copy is mixed back
 * into the original at {@link opacity} — a replacement at full coverage, not a
 * second picture over the first.
 */
export interface Canvas2DAdjustment {
  /** The clip this treatment came from, for a {@link Canvas2DDegradation}. */
  clipId?: string;
  /** Where in the composite order the treatment runs, ascending. */
  zIndex: number;
  /** How much of the treated copy is kept. 1 is fully treated, 0 a no-op. */
  opacity: number;
  effects?: ClipEffect[];
  /** Where the treatment lands, in the treated surface's own pixel space. */
  mask?: ClipMask;
  /** An animated wipe limiting the treatment, as it limits a layer. */
  wipe?: AnimationSampleMask;
  /** The precomposite surface this treats instead of the frame. */
  precomposeGroupId?: string;
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
 * An offscreen surface this module draws on and then draws back: the scratch a
 * feathered wipe pre-masks its source on, and the intermediate a precompositing
 * group composes its children into.
 *
 * A surface is a context plus whatever the host's `drawImage` accepts as a
 * source, never a canvas class (I6): the browser hands over an `OffscreenCanvas`
 * and the server an `@napi-rs/canvas` one, and only their 2D contexts have a
 * shape both satisfy.
 */
export interface CompositeSurface<TSource> {
  ctx: CompositeContext2D<TSource>;
  /** The surface itself, to draw back onto the main context. */
  surface: TSource;
}

/**
 * How a host makes a {@link CompositeSurface} — `document.createElement`,
 * `new OffscreenCanvas`, `createCanvas` — since none of those exists
 * everywhere. Returning null means the host could not, and the caller says what
 * it does instead.
 */
export type CompositeSurfaceFactory<TSource> = (
  width: number,
  height: number
) => CompositeSurface<TSource> | null;

/** @deprecated Use {@link CompositeSurface}. */
export type MaskScratch<TSource> = CompositeSurface<TSource>;
/** @deprecated Use {@link CompositeSurfaceFactory}. */
export type MaskScratchFactory<TSource> = CompositeSurfaceFactory<TSource>;

/** The optional halves of a frame draw: the surfaces, and the group stack. */
export interface DrawTimelineFrameOptions<TSource> {
  /** Scratch for procedural and spatial effects before placement. */
  effectSurface?: CompositeSurfaceFactory<TSource>;
  /** Scratch for filtering and masking a source before its perspective warp. */
  projectiveSurface?: CompositeSurfaceFactory<TSource>;
  /**
   * Scratch for feathered wipes. One reused surface is enough — a wipe draws it
   * back before the next layer asks for it.
   */
  maskScratch?: CompositeSurfaceFactory<TSource>;
  /** The groups to composite separately, innermost first (scene-model order). */
  precomposites?: readonly Canvas2DPrecomposite[];
  /**
   * The adjustments to run, in any order — each one runs at its own `zIndex`,
   * on the surface it names. Omitted, the frame draws exactly as it did before
   * adjustments existed and no surface is asked for.
   */
  adjustments?: readonly Canvas2DAdjustment[];
  /**
   * A frame-sized surface for one adjustment's treated copy. Consumed within a
   * single treatment — the copy is drawn back before the next layer draws — so
   * one reused surface is enough. Without it the treatment is skipped and the
   * untreated composite stands.
   */
  adjustmentSurface?: CompositeSurfaceFactory<TSource>;
  /**
   * Frame-sized intermediates for those groups. Each call must answer with a
   * surface no other precomposite in this frame is still using — nested groups
   * hold theirs until the group above has drawn it — so this cannot be the same
   * pooled surface `maskScratch` vends. Returning null draws the group's
   * children onto the stack beneath instead, without its effects or blend mode.
   */
  precompositeSurface?: CompositeSurfaceFactory<TSource>;
  /**
   * Coverage scratch for a feathered shape mask, distinct from `maskScratch`:
   * the mask is rasterized here and then multiplied into the copy of the layer
   * that `maskScratch` holds, so both are live at once. One reused surface is
   * enough — it is consumed within a single layer's draw. Without it a
   * feathered mask falls back to its hard edge.
   */
  maskSurface?: CompositeSurfaceFactory<TSource>;
  /**
   * Frame-sized surfaces for a matted layer: one holds the layer, one holds its
   * matte source, and both are live at once, so each call must answer with a
   * surface the other is not using. Without it a matted layer draws unmatted.
   */
  matteSurface?: CompositeSurfaceFactory<TSource>;
  /**
   * Holds a cropped layer's picture at the crop's own size. Distinct from
   * `maskScratch` and `maskSurface`: it stays live for the whole of one layer's
   * draw, and both of those read from it while it does. Without it a cropped
   * layer draws uncropped and reports `crop_skipped`.
   */
  cropSurface?: CompositeSurfaceFactory<TSource>;
  /**
   * Seed the frame fully transparent instead of opaque black — an alpha export.
   * Off by default, so a preview keeps the ground it has.
   */
  alpha?: boolean;
}

/**
 * A way this path draws a frame the GPU compositor would draw differently,
 * where the difference is not an effect type {@link unsupportedEffectTypes}
 * could name (I7).
 *
 * Most are host shortfalls: the drawing exists, but the surface it needs is
 * unavailable. Extra drop shadows and near-plane fallback are approximations
 * of GPU behavior even when the host provides every surface.
 */
export type Canvas2DDegradationReason =
  | "effect_surface_missing"
  /** A feathered shape mask drawn as its hard edge. */
  | "mask_hard_edge"
  /** A feathered wipe drawn as a hard edge. */
  | "wipe_hard_edge"
  /** A track matte skipped: the layer drew unmatted. */
  | "matte_skipped"
  /** A generated matte's feathered edge drawn hard. */
  | "generated_matte_feather_ignored"
  /** A precompositing group's blend mode and effects lost. */
  | "group_blend_lost"
  /** An adjustment did not run: the untreated composite stands. */
  | "adjustment_skipped"
  /** Drop shadows past the first in the chain, not cast. */
  | "drop_shadow_extra_ignored"
  /** A tilted layer rendered without its requested shadow. */
  | "drop_shadow_skipped"
  | "perspective_skipped"
  /** Near-plane crossing uses tessellation rather than pixel sampling. */
  | "perspective_near_plane_fallback"
  /** Brightness applied as a CSS multiply instead of the GPU's addition. */
  | "brightness_multiplicative"
  /** A crop skipped: the layer drew its whole source, at its whole-source fit. */
  | "crop_skipped";

/** One degradation, and the clip it happened to. */
export interface Canvas2DDegradation {
  /** The clip, when the host set {@link Canvas2DLayer.clipId}. */
  clipId?: string;
  reason: Canvas2DDegradationReason;
}

/** What a frame draw left behind besides pixels. */
export interface Canvas2DFrameReport<TSource> {
  /** Layers that drew nothing, in composite order. */
  skipped: Canvas2DLayer<TSource>[];
  /** Every way this frame differs from the GPU render, in draw order. */
  degraded: Canvas2DDegradation[];
}

/**
 * Effect types handled by the Canvas pixel path or a native draw operation.
 */
const CANVAS_EFFECT_TYPES = new Set(["color", "blur", "dropShadow", "glow", "vignette", "sharpen", "chromaKey", "curves", "levels", "liftGammaGain", "grain", "pixelate", "posterize", "directionalBlur", "lensDistortion", "stylize", "generator", "lut"]);

function applyCpuEffectChain(pixels: ImagePixels, clipEffects: readonly ClipEffect[], trackEffects: readonly ClipEffect[] = []): void {
  const trackKey = trackEffects.find((effect) => effect.enabled && isClipChromaKeyEffect(effect) && effect.tolerance > 0.001);
  if (trackKey) applyCpuLegacyEffects(pixels, [trackKey]);
  for (const effect of clipEffects) {
    if (!effect.enabled) continue;
    if (isClipDropShadowEffect(effect)) applyCpuDropShadows(pixels, [effect]);
    else if (isCpuVisualEffect(effect)) applyCpuVisualEffects(pixels, [effect]);
    else if (isCpuLegacyEffect(effect)) applyCpuLegacyEffects(pixels, [effect]);
  }
  const combinedEffects = [...clipEffects, ...trackEffects];
  const blurRadius = aggregateBlurRadius(clipEffects.filter((effect) => effect.enabled), trackEffects.filter((effect) => effect.enabled));
  const sharedBounds = blurRadius >= 0.5 && combinedEffects.some((effect) => effect.enabled && isClipColorEffect(effect))
    && pixels.data.length === pixels.width * pixels.height * 4
    ? alphaBounds(pixels)
    : undefined;
  applyCpuColorGrade(pixels, combinedEffects, sharedBounds);
  applyCpuGaussianBlur(pixels, blurRadius, sharedBounds);
  const trackSharpen = trackEffects.find((effect) => effect.enabled && isClipSharpenEffect(effect) && effect.amount > 0.001);
  const trackVignette = trackEffects.find((effect) => effect.enabled && isClipVignetteEffect(effect) && effect.amount > 0.001);
  if (trackSharpen) applyCpuLegacyEffects(pixels, [trackSharpen]);
  if (trackVignette) applyCpuLegacyEffects(pixels, [trackVignette]);
}

/**
 * The effect types present on these layers that Canvas 2D cannot draw. A
 * caller reports these rather than letting the frame quietly differ from the
 * GPU render (I7).
 *
 * A group's effects run on its composed surface, not on any one layer, so a
 * caller with precomposites passes them in too — `Canvas2DPrecomposite` carries
 * `effects` for exactly that. An adjustment is the same case: its chain runs on
 * the composite beneath it and belongs to no layer, so a caller passes its
 * adjustments in as well. Leaving either out is how a group blur, or a keyed
 * adjustment, that this path never applied would go unreported.
 *
 * A missing scratch surface is reported by the frame draw, because support
 * depends on the host rather than the effect document.
 */
export function unsupportedEffectTypes(
  layers: readonly {
    effects?: ClipEffect[];
    trackEffects?: TrackEffect[];
  }[]
): string[] {
  const found = new Set<string>();
  const scan = (effects: readonly ClipEffect[]): void => {
    for (const e of effects) {
      if (!e.enabled) continue;
      if (!CANVAS_EFFECT_TYPES.has(e.type)) found.add(e.type);
    }
  };
  for (const layer of layers) {
    scan(layer.effects ?? []);
    scan(trackEffectsAsClipEffects(layer.trackEffects));
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

interface ProjectivePoint { x: number; y: number }

/** Project a source pixel through the same matrix the GPU compositor reads. */
export function projectSourcePoint(
  matrix: Float32Array,
  x: number,
  y: number,
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number
): ProjectivePoint {
  const u = 2 * x / sourceWidth - 1;
  const v = 1 - 2 * y / sourceHeight;
  const w = matrix[3] * u + matrix[7] * v + matrix[15];
  return {
    x: canvasWidth * ((matrix[0] * u + matrix[4] * v + matrix[12]) / w + 1) / 2,
    y: canvasHeight * (1 - (matrix[1] * u + matrix[5] * v + matrix[13]) / w) / 2
  };
}

function drawProjectiveTriangle<TSource>(
  ctx: CompositeContext2D<TSource>,
  source: TSource,
  sourceWidth: number,
  sourceHeight: number,
  sourcePoints: readonly [ProjectivePoint, ProjectivePoint, ProjectivePoint],
  destPoints: readonly [ProjectivePoint, ProjectivePoint, ProjectivePoint]
): void {
  const [p0, p1, p2] = sourcePoints;
  const [q0, q1, q2] = destPoints;
  const dx1 = p1.x - p0.x;
  const dy1 = p1.y - p0.y;
  const dx2 = p2.x - p0.x;
  const dy2 = p2.y - p0.y;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-9) return;
  const a = ((q1.x - q0.x) * dy2 - (q2.x - q0.x) * dy1) / det;
  const c = ((q2.x - q0.x) * dx1 - (q1.x - q0.x) * dx2) / det;
  const b = ((q1.y - q0.y) * dy2 - (q2.y - q0.y) * dy1) / det;
  const d = ((q2.y - q0.y) * dx1 - (q1.y - q0.y) * dx2) / det;
  // Canvas antialiases each independently clipped triangle. Adjacent clips
  // can both leave subpixel coverage at their shared edge, exposing a dark
  // diagonal through a projected card. Two pixels of overlap cover that edge
  // even with a skewed clip; the affine image mapping stays put. The caller
  // assembles these overlaps with copy, preserving the source's own alpha.
  const centroidX = (q0.x + q1.x + q2.x) / 3;
  const centroidY = (q0.y + q1.y + q2.y) / 3;
  const clipPoint = (point: ProjectivePoint): ProjectivePoint => {
    const dx = point.x - centroidX;
    const dy = point.y - centroidY;
    const length = Math.hypot(dx, dy) || 1;
    return { x: point.x + 2 * dx / length, y: point.y + 2 * dy / length };
  };
  const c0 = clipPoint(q0);
  const c1 = clipPoint(q1);
  const c2 = clipPoint(q2);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.moveTo(c0.x, c0.y);
  ctx.lineTo(c1.x, c1.y);
  ctx.lineTo(c2.x, c2.y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, q0.x - a * p0.x - c * p0.y, q0.y - b * p0.x - d * p0.y);
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight);
  ctx.restore();
}

function drawProjectiveImage<TSource>(
  ctx: CompositeContext2D<TSource>,
  source: TSource,
  sourceWidth: number,
  sourceHeight: number,
  matrix: Float32Array,
  geometry: Canvas2DFrameGeometry
): void {
  const columns = Math.ceil(sourceWidth / 120);
  const rows = Math.ceil(sourceHeight / 120);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const x0 = col * sourceWidth / columns;
      const x1 = (col + 1) * sourceWidth / columns;
      const y0 = row * sourceHeight / rows;
      const y1 = (row + 1) * sourceHeight / rows;
      const sourceCorners: [ProjectivePoint, ProjectivePoint, ProjectivePoint, ProjectivePoint] = [
        { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }
      ];
      const destCorners = sourceCorners.map((point) => projectSourcePoint(
        matrix, point.x, point.y, sourceWidth, sourceHeight,
        geometry.canvasWidth, geometry.canvasHeight
      ));
      drawProjectiveTriangle(ctx, source, sourceWidth, sourceHeight,
        [sourceCorners[0], sourceCorners[1], sourceCorners[2]],
        [destCorners[0], destCorners[1], destCorners[2]]);
      drawProjectiveTriangle(ctx, source, sourceWidth, sourceHeight,
        [sourceCorners[0], sourceCorners[2], sourceCorners[3]],
        [destCorners[0], destCorners[2], destCorners[3]]);
    }
  }
}

type ProjectiveRasterResult = "drawn" | "unreadable" | "near_plane";

/** Sample the prepared source once per destination pixel, without tile clips. */
function rasterizeProjectiveImage<TSource>(
  sourceCtx: CompositeContext2D<TSource>,
  destinationCtx: CompositeContext2D<TSource>,
  sourceWidth: number,
  sourceHeight: number,
  matrix: Float32Array,
  geometry: Canvas2DFrameGeometry
): ProjectiveRasterResult {
  let sourcePixels: ImagePixels;
  try {
    sourcePixels = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight);
  } catch {
    // A cross-origin canvas may still draw, but it cannot be read back.
    return "unreadable";
  }
  const source = sourcePixels.data;
  let left = sourceWidth;
  let top = sourceHeight;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      if (source[(y * sourceWidth + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return "drawn";

  // A rational projection is unbounded when its homogeneous denominator
  // changes sign across the visible source rectangle. Four corners cannot
  // bound that image, so use the tessellated near-plane fallback.
  const g = matrix[3], h = matrix[7], i = matrix[15];
  const u0 = 2 * left / sourceWidth - 1;
  const u1 = 2 * (right + 1) / sourceWidth - 1;
  const v0 = 1 - 2 * top / sourceHeight;
  const v1 = 1 - 2 * (bottom + 1) / sourceHeight;
  const cornerW = [i + g * u0 + h * v0, i + g * u1 + h * v0,
    i + g * u1 + h * v1, i + g * u0 + h * v1];
  if (Math.min(...cornerW) <= 1e-5 && Math.max(...cornerW) >= -1e-5) {
    return "near_plane";
  }

  const corners = [
    projectSourcePoint(matrix, left, top, sourceWidth, sourceHeight, geometry.canvasWidth, geometry.canvasHeight),
    projectSourcePoint(matrix, right + 1, top, sourceWidth, sourceHeight, geometry.canvasWidth, geometry.canvasHeight),
    projectSourcePoint(matrix, right + 1, bottom + 1, sourceWidth, sourceHeight, geometry.canvasWidth, geometry.canvasHeight),
    projectSourcePoint(matrix, left, bottom + 1, sourceWidth, sourceHeight, geometry.canvasWidth, geometry.canvasHeight)
  ];
  if (corners.some((corner) => !Number.isFinite(corner.x) || !Number.isFinite(corner.y))) return "unreadable";
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((corner) => corner.x))) - 1);
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((corner) => corner.y))) - 1);
  const x1 = Math.min(geometry.canvasWidth, Math.ceil(Math.max(...corners.map((corner) => corner.x))) + 1);
  const y1 = Math.min(geometry.canvasHeight, Math.ceil(Math.max(...corners.map((corner) => corner.y))) + 1);
  if (x1 <= x0 || y1 <= y0) return "drawn";

  const pixels = destinationCtx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const output = pixels.data;
  const a = matrix[0], b = matrix[4], c = matrix[12];
  const d = matrix[1], e = matrix[5], f = matrix[13];
  for (let y = y0; y < y1; y++) {
    const normalizedY = 1 - 2 * (y + 0.5) / geometry.canvasHeight;
    for (let x = x0; x < x1; x++) {
      const normalizedX = 2 * (x + 0.5) / geometry.canvasWidth - 1;
      const aa = a - normalizedX * g;
      const bb = b - normalizedX * h;
      const dd = d - normalizedY * g;
      const ee = e - normalizedY * h;
      const determinant = aa * ee - bb * dd;
      if (Math.abs(determinant) < 1e-12) continue;
      const cc = normalizedX * i - c;
      const ff = normalizedY * i - f;
      const u = (cc * ee - bb * ff) / determinant;
      const v = (aa * ff - cc * dd) / determinant;
      const sourceX = (u + 1) * sourceWidth / 2 - 0.5;
      const sourceY = (1 - v) * sourceHeight / 2 - 0.5;
      const sampleX = Math.floor(sourceX);
      const sampleY = Math.floor(sourceY);
      const fractionX = sourceX - sampleX;
      const fractionY = sourceY - sampleY;
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let row = 0; row < 2; row++) {
        const sy = sampleY + row;
        if (sy < 0 || sy >= sourceHeight) continue;
        for (let col = 0; col < 2; col++) {
          const sx = sampleX + col;
          if (sx < 0 || sx >= sourceWidth) continue;
          const weight = (col ? fractionX : 1 - fractionX) * (row ? fractionY : 1 - fractionY);
          const sourceOffset = (sy * sourceWidth + sx) * 4;
          const weightedAlpha = source[sourceOffset + 3] * weight;
          alpha += weightedAlpha;
          red += source[sourceOffset] * weightedAlpha;
          green += source[sourceOffset + 1] * weightedAlpha;
          blue += source[sourceOffset + 2] * weightedAlpha;
        }
      }
      if (alpha <= 0) continue;
      const offset = ((y - y0) * pixels.width + x - x0) * 4;
      output[offset] = red / alpha;
      output[offset + 1] = green / alpha;
      output[offset + 2] = blue / alpha;
      output[offset + 3] = alpha;
    }
  }
  destinationCtx.putImageData(pixels, x0, y0);
  return "drawn";
}

/** Reset a context to the state each layer draw assumes. */
function resetContext<TSource>(ctx: CompositeContext2D<TSource>): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  clearShadow(ctx);
}

/** Turn the shadow off. A left-on shadow follows every later draw. */
function clearShadow<TSource>(ctx: CompositeContext2D<TSource>): void {
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Composite `layers` onto `ctx`, bottom-up by `zIndex`, over an opaque black
 * ground — the same clear the GPU compositor starts from, and with
 * `options.alpha` the same transparent one. The context is left in the reset
 * state. Returns the layers that drew nothing and every way this frame differs
 * from the GPU render, both in composite order.
 *
 * A layer naming a precomposite in `options.precomposites` draws onto that
 * group's own surface first, and the surface blends once at the group's z. With
 * no precomposites the layers go straight onto `ctx` and no surface is asked
 * for at all.
 *
 * An adjustment in `options.adjustments` runs at its own z on the surface it
 * names — the frame, or the group's — treating what is already on it.
 */
export function drawTimelineFrame<TSource>(
  ctx: CompositeContext2D<TSource>,
  layers: readonly Canvas2DLayer<TSource>[],
  geometry: Canvas2DFrameGeometry,
  options: DrawTimelineFrameOptions<TSource> = {}
): Canvas2DFrameReport<TSource> {
  // A projective layer needs its prepared source and its warped result at the
  // same time, but the next layer does not. Reuse that pair for every layer of
  // the same size instead of retaining two full-frame surfaces per card.
  const projectiveFactory = options.projectiveSurface;
  const projectivePool = new Map<string, CompositeSurface<TSource>[]>();
  const projectiveUses = new Map<string, number>();
  const frameOptions: DrawTimelineFrameOptions<TSource> = projectiveFactory
    ? {
        ...options,
        projectiveSurface: (width, height) => {
          const key = `${width}x${height}`;
          const slot = (projectiveUses.get(key) ?? 0) % 2;
          projectiveUses.set(key, slot + 1);
          const pair = projectivePool.get(key) ?? [];
          const existing = pair[slot];
          if (existing) return existing;
          const surface = projectiveFactory(width, height);
          if (surface) {
            pair[slot] = surface;
            projectivePool.set(key, pair);
          }
          return surface;
        }
      }
    : options;
  resetContext(ctx);
  if (options.alpha === true) {
    ctx.clearRect(0, 0, geometry.canvasWidth, geometry.canvasHeight);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, geometry.canvasWidth, geometry.canvasHeight);
  }

  const skipped: Canvas2DLayer<TSource>[] = [];
  const degraded: Canvas2DDegradation[] = [];
  const onFrame: Canvas2DAdjustment[] = [];
  const groupIds = new Set((options.precomposites ?? []).map((g) => g.id));
  for (const adjustment of options.adjustments ?? []) {
    const groupId = adjustment.precomposeGroupId;
    if (!groupId) {
      onFrame.push(adjustment);
    } else if (!groupIds.has(groupId)) {
      // Scoped to a surface this frame does not build. Running it on the frame
      // instead would treat layers outside the group it belongs to.
      degraded.push({ clipId: adjustment.clipId, reason: "adjustment_skipped" });
    }
  }
  const stack = composePrecomposites(
    layers,
    geometry,
    frameOptions,
    skipped,
    degraded
  );
  drawStack(ctx, stack, onFrame, geometry, frameOptions, skipped, degraded);
  resetContext(ctx);
  return { skipped, degraded };
}

/**
 * Draw one surface's contents bottom-up: its layers and the adjustments that
 * treat it, interleaved by `zIndex`.
 *
 * An adjustment at the same z as a layer runs *after* it — the layer is beneath
 * it in draw order, so it is part of the composite the treatment reads. That
 * falls out of a stable sort over layers-then-adjustments, which is why the two
 * are concatenated in that order and not merged some other way.
 */
function drawStack<TSource>(
  ctx: CompositeContext2D<TSource>,
  layers: readonly Canvas2DLayer<TSource>[],
  adjustments: readonly Canvas2DAdjustment[],
  geometry: Canvas2DFrameGeometry,
  options: DrawTimelineFrameOptions<TSource>,
  skipped: Canvas2DLayer<TSource>[],
  degraded: Canvas2DDegradation[]
): void {
  type Item =
    | { adjustment?: undefined; layer: Canvas2DLayer<TSource>; zIndex: number }
    | { adjustment: Canvas2DAdjustment; layer?: undefined; zIndex: number };
  const items: Item[] = layers.map((layer) => ({
    layer,
    zIndex: layer.zIndex
  }));
  for (const adjustment of adjustments) {
    items.push({ adjustment, zIndex: adjustment.zIndex });
  }
  for (const item of items.sort((a, b) => {
    const z = a.zIndex - b.zIndex;
    if (z !== 0) return z;
    const first = a.layer?.stackOrder;
    const second = b.layer?.stackOrder;
    if (first === second) return 0;
    return (first ?? Number.POSITIVE_INFINITY) - (second ?? Number.POSITIVE_INFINITY);
  })) {
    if (item.adjustment) {
      applyAdjustment(ctx, item.adjustment, geometry, options, degraded);
      continue;
    }
    if (!drawTimelineLayer(ctx, item.layer, geometry, options, degraded)) {
      skipped.push(item.layer);
    }
  }
}

/**
 * Run one adjustment on `ctx`: copy the composite so far, treat the copy, and
 * mix the treated picture back into the untreated one by the adjustment's
 * coverage (T24).
 *
 * The copy goes through `getImageData`/`putImageData` rather than a
 * `drawImage`: a host hands over a context, not a drawable handle on the
 * surface behind it, so the pixels are the only way to reach what has been
 * drawn. Brightness is added on the copy for the reason it is added on a
 * layer's scratch — the GPU grade adds where CSS `brightness()` multiplies —
 * and the rest of the chain rides the filter of the draw back.
 *
 * **A treatment replaces the composite, it does not lie on top of it.** With
 * `c` the coverage — the adjustment's opacity times its mask times its wipe —
 * every premultiplied channel, alpha included, ends at
 * `original * (1 - c) + treated * c`. The copy carries the accumulation's own
 * alpha, so drawing it back `source-over` added that alpha to itself: a
 * 50%-opaque pixel under a fully applied neutral chain came back at 75%, which
 * thickened every softened edge inside a group surface and every alpha export
 * (F3). So the composite is cleared where the treatment lands and the treated
 * copy drawn onto the cleared ground, which replaces rather than adds; anything
 * short of full coverage is then mixed back into the snapshot by
 * {@link mixTreatment}. Full coverage skips the mix, and over an opaque frame
 * that case is byte-for-byte the draw it was.
 *
 * Both draws are `source-over`, and the coverage is arithmetic rather than a
 * `destination-out` + `lighter` pair, because `@napi-rs/canvas` applies both a
 * source's alpha and `ctx.filter` twice under any other composite operation —
 * `destination-out` at 0.5 erases a quarter, and `copy` with `contrast(2)`
 * lands a 40% grey on white. A coverage or a grade carried by a composite
 * operation would render differently on the server than in a browser.
 *
 * The clip is what keeps a hard mask or wipe out of both draws, and the mix
 * needs no second opinion about it: outside the clip the surface still holds
 * the snapshot, and mixing a pixel with itself returns it unchanged.
 */
function applyAdjustment<TSource>(
  ctx: CompositeContext2D<TSource>,
  adjustment: Canvas2DAdjustment,
  geometry: Canvas2DFrameGeometry,
  surfaces: DrawTimelineFrameOptions<TSource>,
  degraded: Canvas2DDegradation[]
): void {
  const { canvasWidth: w, canvasHeight: h } = geometry;
  const scratch = surfaces.adjustmentSurface?.(w, h);
  if (!scratch) {
    degraded.push({ clipId: adjustment.clipId, reason: "adjustment_skipped" });
    return;
  }

  const original = ctx.getImageData(0, 0, w, h);
  const sctx = scratch.ctx;
  resetContext(sctx);
  sctx.clearRect(0, 0, w, h);
  sctx.putImageData(original, 0, 0);

  const pixelEffects = (adjustment.effects ?? []).filter((effect) => effect.enabled);
  if (pixelEffects.length > 0) {
    const pixels = sctx.getImageData(0, 0, w, h);
    applyCpuEffectChain(pixels, pixelEffects);
    sctx.putImageData(pixels, 0, 0);
  }

  // A soft mask and a feathered wipe rasterize their coverage together on one
  // surface, because the mix needs `mask * wipe` as one number per pixel. A
  // hard edge is a path clip on the draws instead, which costs nothing. Same
  // split as a layer's.
  const shape = adjustment.mask;
  const wipe = adjustment.wipe;
  const softShape = shape !== undefined && !maskIsHard(shape);
  const softWipe = wipe !== undefined && wipe.softness > 0;
  let coverage: ImagePixels | null = null;
  if (softShape || softWipe) {
    const surface = surfaces.maskSurface?.(w, h);
    if (surface && surface.surface !== scratch.surface) {
      const cctx = surface.ctx;
      resetContext(cctx);
      cctx.clearRect(0, 0, w, h);
      let painted = true;
      if (softShape) {
        painted = drawMask(cctx, shape, w, h);
      } else {
        cctx.fillStyle = "#fff";
        cctx.fillRect(0, 0, w, h);
      }
      if (painted) {
        if (softWipe) applyWipeGradient(cctx, w, h, wipe);
        coverage = cctx.getImageData(0, 0, w, h);
      }
    }
    if (!coverage) {
      // Both feathers fall back to the hard edge the clip draws, and both are
      // reported: a caller cannot see which one it lost otherwise.
      if (softShape) {
        degraded.push({ clipId: adjustment.clipId, reason: "mask_hard_edge" });
      }
      if (softWipe) {
        degraded.push({ clipId: adjustment.clipId, reason: "wipe_hard_edge" });
      }
    }
  }
  const maskRasterized = coverage !== null && softShape;
  const wipeRasterized = coverage !== null && softWipe;

  const opacity = Math.max(0, Math.min(1, adjustment.opacity));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (shape && !maskRasterized) clipMask(ctx, shape, w, h);
  if (wipe && !wipeRasterized) clipWipeRect(ctx, w, h, wipe);

  ctx.globalCompositeOperation = "source-over";
  let treated = true;
  try {
    // Cleared first: over transparency a source-over draw *is* the source, so
    // what lands is the treated picture and not the treated picture over the
    // one it was copied from. The chain is armed after the clear, so no host
    // can read it as something to run on one.
    ctx.clearRect(0, 0, w, h);
    ctx.filter = "none";
    ctx.drawImage(scratch.surface, 0, 0, w, h);
  } catch {
    // The host's surface refused to draw. The snapshot the copy was made from
    // puts the untreated composite back, which is the same outcome as vending
    // no surface at all.
    treated = false;
  }

  if (treated && (opacity < 1 || coverage)) {
    const mixed = ctx.getImageData(0, 0, w, h);
    mixTreatment(original, mixed, coverage, opacity);
    ctx.putImageData(mixed, 0, 0);
  }

  ctx.restore();
  resetContext(ctx);
  if (!treated) {
    ctx.putImageData(original, 0, 0);
    degraded.push({ clipId: adjustment.clipId, reason: "adjustment_skipped" });
  }
}

/**
 * Mix the treated picture into the original by the treatment's coverage, in
 * place in `treated`: `out = original * (1 - c) + treated * c` on every
 * premultiplied channel, alpha included, where `c` is `opacity` times the
 * coverage raster's alpha.
 *
 * Premultiplied, because that is the space a composite is a linear mix in —
 * mixing straight colours would let a nearly transparent original drag the
 * treated colour toward whatever it happens to carry under its zero alpha.
 * `ImagePixels` is straight alpha at both ends, so the multiply in and the
 * divide out are here.
 *
 * The two ends are byte-exact: `c >= 1` keeps the treated pixel and `c <= 0`
 * restores the original one, rather than rounding through the arithmetic.
 */
function mixTreatment(
  original: ImagePixels,
  treated: ImagePixels,
  coverage: ImagePixels | null,
  opacity: number
): void {
  const src = original.data;
  const out = treated.data;
  const cov = coverage?.data;
  for (let i = 0; i < out.length; i += 4) {
    const c = cov ? (opacity * cov[i + 3]!) / 255 : opacity;
    if (c >= 1) continue;
    if (c <= 0) {
      out[i] = src[i]!;
      out[i + 1] = src[i + 1]!;
      out[i + 2] = src[i + 2]!;
      out[i + 3] = src[i + 3]!;
      continue;
    }
    const oa = src[i + 3]! / 255;
    const ta = out[i + 3]! / 255;
    const keep = oa * (1 - c);
    const take = ta * c;
    const alpha = keep + take;
    if (alpha <= 0) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }
    for (let k = 0; k < 3; k++) {
      out[i + k] = Math.round((src[i + k]! * keep + out[i + k]! * take) / alpha);
    }
    out[i + 3] = Math.round(alpha * 255);
  }
}

/**
 * Draw each precompositing group onto its own surface and return the main
 * stack: the layers that belong to no group, plus one layer per group whose
 * surface blends onto the frame.
 *
 * `options.precomposites` arrives innermost first, so a nested group has
 * already handed its composed surface to the group above by the time that one
 * draws. With no groups this hands the layers straight back and never calls the
 * surface factory — the whole point of gating the intermediate on a group
 * actually carrying effects or a blend mode.
 */
function composePrecomposites<TSource>(
  layers: readonly Canvas2DLayer<TSource>[],
  geometry: Canvas2DFrameGeometry,
  options: DrawTimelineFrameOptions<TSource>,
  skipped: Canvas2DLayer<TSource>[],
  degraded: Canvas2DDegradation[]
): Canvas2DLayer<TSource>[] {
  const groups = options.precomposites ?? [];
  if (groups.length === 0) return [...layers];

  const stack: Canvas2DLayer<TSource>[] = [];
  const byGroup = new Map<string, Canvas2DLayer<TSource>[]>();
  const assign = (
    groupId: string | undefined,
    layer: Canvas2DLayer<TSource>
  ): void => {
    if (!groupId) {
      stack.push(layer);
      return;
    }
    const bucket = byGroup.get(groupId);
    if (bucket) bucket.push(layer);
    else byGroup.set(groupId, [layer]);
  };

  for (const layer of layers) assign(layer.precomposeGroupId, layer);

  // An adjustment inside a group treats that group's own surface, so it runs
  // with the group's children and reaches nothing outside them.
  const adjustmentsByGroup = new Map<string, Canvas2DAdjustment[]>();
  for (const adjustment of options.adjustments ?? []) {
    const groupId = adjustment.precomposeGroupId;
    if (!groupId) continue;
    const bucket = adjustmentsByGroup.get(groupId);
    if (bucket) bucket.push(adjustment);
    else adjustmentsByGroup.set(groupId, [adjustment]);
  }

  for (const group of groups) {
    const children = byGroup.get(group.id) ?? [];
    const treatments = adjustmentsByGroup.get(group.id) ?? [];
    const surface =
      children.length > 0
        ? (options.precompositeSurface?.(
            geometry.canvasWidth,
            geometry.canvasHeight
          ) ?? null)
        : null;
    if (!surface) {
      // Nothing to compose, or no surface to compose it on. Either way the
      // children draw where they would have without the group: the picture
      // survives and the group's effects and blend mode do not. A group with
      // nothing on screen lost nothing, so only the second case is reported.
      if (children.length > 0) {
        degraded.push({ clipId: group.id, reason: "group_blend_lost" });
      }
      // The treatments go with the surface they were scoped to. Running them on
      // the stack beneath would treat layers outside the group.
      for (const treatment of treatments) {
        degraded.push({
          clipId: treatment.clipId,
          reason: "adjustment_skipped"
        });
      }
      for (const child of children) assign(group.precomposeGroupId, child);
      continue;
    }

    const sctx = surface.ctx;
    resetContext(sctx);
    sctx.clearRect(0, 0, geometry.canvasWidth, geometry.canvasHeight);
    drawStack(
      sctx,
      children,
      treatments,
      geometry,
      options,
      skipped,
      degraded
    );

    // The surface is frame-sized, so it composites untransformed: the group's
    // own matrix already rode into each child through `parentMatrix`.
    assign(group.precomposeGroupId, {
      source: surface.surface,
      sourceWidth: geometry.canvasWidth,
      sourceHeight: geometry.canvasHeight,
      opacity: group.opacity,
      blendMode: group.blendMode,
      zIndex: group.zIndex,
      stackOrder: group.stackOrder,
      effects: group.effects,
      transition: group.transition
    });
  }
  return stack;
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
  surfaces: DrawTimelineFrameOptions<TSource> = {},
  degraded: Canvas2DDegradation[] = []
): boolean {
  const cropped = cropLayerSource(layer, surfaces, degraded);
  let { source: layerSource } = cropped;
  const { width, height } = cropped;
  if (width <= 0 || height <= 0) return false;

  const clipEffects = [
    ...(layer.effects ?? []),
    ...(layer.transition?.effect ? [layer.transition.effect] : [])
  ].filter((effect) => effect.enabled);
  const trackEffects = trackEffectsAsClipEffects(layer.trackEffects).filter((effect) => effect.enabled);
  const shadows = (layer.effects ?? []).filter(
    (effect): effect is ClipDropShadowEffect => effect.enabled && isClipDropShadowEffect(effect)
  );
  let stackedShadows = false;
  let cpuTreated = false;
  const iris = layer.transition?.iris;
  if (clipEffects.some((effect) => !isClipDropShadowEffect(effect)) || trackEffects.length > 0 || iris || shadows.length > 1) {
    const surface = surfaces.effectSurface?.(width, height);
    if (surface) {
      const ectx = surface.ctx;
      resetContext(ectx);
      ectx.clearRect(0, 0, width, height);
      ectx.drawImage(layerSource, 0, 0, width, height);
      const pixels = ectx.getImageData(0, 0, width, height);
      applyCpuEffectChain(pixels, clipEffects, trackEffects);
      stackedShadows = shadows.length > 0;
      if (iris) applyCpuIris(pixels, iris.progress, iris.softness);
      ectx.putImageData(pixels, 0, 0);
      layerSource = surface.surface;
      cpuTreated = true;
    } else {
      degraded.push({ clipId: layer.clipId, reason: "effect_surface_missing" });
    }
  }

  if (layer.matte) {
    const matted = drawMattedLayer(
      ctx,
      layer,
      layer.matte,
      geometry,
      surfaces,
      degraded
    );
    // Null means the host vended no surfaces to compose the matte on; the
    // layer then draws unmatted rather than not at all.
    if (matted !== null) return matted;
    degraded.push({ clipId: layer.clipId, reason: "matte_skipped" });
  }

  const transition = layer.transition;
  const resolvedTransform = transitionTransform(
      layer.transform,
      transition,
      geometry.refWidth || geometry.canvasWidth,
      geometry.refHeight || geometry.canvasHeight
    );
  const placement = buildTransformMatrix(
    resolvedTransform ?? IDENTITY_TRANSFORM,
    containBaseScale(width, height, geometry.canvasWidth, geometry.canvasHeight),
    geometry.refWidth || geometry.canvasWidth,
    geometry.refHeight || geometry.canvasHeight,
    layer.parentMatrix
  );
  const projective = placement[3] !== 0 || placement[7] !== 0;
  const t = clipMatrixToCanvasAffine(
    placement,
    width,
    height,
    geometry.canvasWidth,
    geometry.canvasHeight
  );

  // A dip goes through the colour, so the solid covers the whole frame rather
  // than the layer — drawn here, immediately under the incoming clip, so the
  // outgoing clip beneath is what it hides.
  const solid = transition?.solid;
  if (solid && solid.opacity > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.min(1, solid.opacity);
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    ctx.fillStyle = solid.color;
    ctx.fillRect(0, 0, geometry.canvasWidth, geometry.canvasHeight);
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
  ctx.globalCompositeOperation = blendModeToCanvasOp(layer.blendMode);
  if (!projective) ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);

  const radiusPx = layer.borderRadius ?? 0;
  if (radiusPx > 0 && !projective) {
    clipRoundedRect(
      ctx,
      0,
      0,
      width,
      height,
      Math.min(radiusPx, width / 2, height / 2)
    );
  }

  // Both masks live in the layer's own source-pixel space, so they rotate with
  // the layer exactly as the GPU shader's quad-space mask does. Hard edges are
  // path clips and cost nothing; soft ones pre-mask the source on a scratch
  // surface with `destination-in`, which is also what lets a shape mask and a
  // wipe compose without a second copy.
  let source = layerSource;
  // An animated wipe on the clip and a wipe transition both reduce to one
  // reveal; the clip's own wins, because it is the motion the author put there.
  const wipe = layer.mask ?? transition?.mask;
  const shape = layer.shapeMask;
  const softWipe = wipe !== undefined && wipe.softness > 0;
  const softShape = shape !== undefined && !maskIsHard(shape);
  const brightness = cpuTreated ? 0 : brightnessForEffects(layer.effects, layer.trackEffects);
  const lifts = Math.abs(brightness) > 0.001;
  let applied = { shape: false, wipe: false, brightness: false };
  if (softWipe || softShape || lifts) {
    const prepared = prepareSource(
      layerSource,
      width,
      height,
      wipe,
      shape,
      lifts ? brightness : 0,
      surfaces
    );
    if (prepared) {
      source = prepared.surface;
      applied = prepared;
    }
  }
  if (projective) {
    const target = surfaces.projectiveSurface?.(width, height);
    if (target) {
      const pctx = target.ctx;
      pctx.save();
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      pctx.clearRect(0, 0, width, height);
      if (radiusPx > 0) clipRoundedRect(pctx, 0, 0, width, height, Math.min(radiusPx, width / 2, height / 2));
      if (shape && !applied.shape) clipMask(pctx, shape, width, height);
      if (wipe && !applied.wipe) clipWipeRect(pctx, width, height, wipe);
      pctx.filter = cpuTreated ? "none" : filterForEffects(layer.effects, layer.trackEffects, applied.brightness);
      pctx.drawImage(source, 0, 0, width, height);
      pctx.restore();
      if (countDropShadows(layer.effects) > 0 && !stackedShadows) {
        const shadowSurface = surfaces.projectiveSurface?.(geometry.canvasWidth, geometry.canvasHeight);
        if (shadowSurface) {
          const sctx = shadowSurface.ctx;
          sctx.save();
          sctx.setTransform(1, 0, 0, 1, 0, 0);
          sctx.clearRect(0, 0, geometry.canvasWidth, geometry.canvasHeight);
          sctx.filter = "none";
          sctx.globalAlpha = 1;
          const rasterResult = rasterizeProjectiveImage(pctx, sctx, width, height, placement, geometry);
          if (rasterResult !== "drawn") {
            drawProjectiveImage(sctx, target.surface, width, height, placement, geometry);
            if (rasterResult === "near_plane") {
              degraded.push({ clipId: layer.clipId, reason: "perspective_near_plane_fallback" });
            }
          }
          sctx.restore();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.filter = "none";
          applyDropShadow(ctx, layer.effects, t);
          ctx.drawImage(shadowSurface.surface, 0, 0, geometry.canvasWidth, geometry.canvasHeight);
          if (countDropShadows(layer.effects) > 1) degraded.push({ clipId: layer.clipId, reason: "drop_shadow_extra_ignored" });
        } else {
          drawProjectiveImage(ctx, target.surface, width, height, placement, geometry);
          degraded.push({ clipId: layer.clipId, reason: "drop_shadow_skipped" });
        }
      } else {
        // Assemble the perspective image at full opacity, then blend it once
        // at the layer's opacity. Canvas triangle clips leave seams in some
        // browsers even when their paths overlap, so sample the inverse
        // projective mapping directly when the prepared source is readable.
        const projected = surfaces.projectiveSurface?.(geometry.canvasWidth, geometry.canvasHeight);
        if (projected) {
          const projectedCtx = projected.ctx;
          projectedCtx.save();
          projectedCtx.setTransform(1, 0, 0, 1, 0, 0);
          projectedCtx.clearRect(0, 0, geometry.canvasWidth, geometry.canvasHeight);
          projectedCtx.filter = "none";
          projectedCtx.globalAlpha = 1;
          const rasterResult = rasterizeProjectiveImage(pctx, projectedCtx, width, height, placement, geometry);
          if (rasterResult !== "drawn") {
            drawProjectiveImage(projectedCtx, target.surface, width, height, placement, geometry);
            if (rasterResult === "near_plane") {
              degraded.push({ clipId: layer.clipId, reason: "perspective_near_plane_fallback" });
            }
          }
          projectedCtx.restore();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(projected.surface, 0, 0, geometry.canvasWidth, geometry.canvasHeight);
        } else {
          drawProjectiveImage(ctx, target.surface, width, height, placement, geometry);
        }
      }
      ctx.restore();
      resetContext(ctx);
      return true;
    }
    degraded.push({ clipId: layer.clipId, reason: "perspective_skipped" });
    ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
    if (radiusPx > 0) clipRoundedRect(ctx, 0, 0, width, height, Math.min(radiusPx, width / 2, height / 2));
  }
  // Whatever the scratch pass did not take is drawn as a hard edge at the same
  // geometry, which is the honest fallback when the host vends no surface.
  if (shape && !applied.shape) clipMask(ctx, shape, width, height);
  if (wipe && !applied.wipe) clipWipeRect(ctx, width, height, wipe);
  if (softShape && !applied.shape) {
    degraded.push({ clipId: layer.clipId, reason: "mask_hard_edge" });
  }
  if (softWipe && !applied.wipe) {
    degraded.push({ clipId: layer.clipId, reason: "wipe_hard_edge" });
  }
  if (lifts && !applied.brightness) {
    degraded.push({ clipId: layer.clipId, reason: "brightness_multiplicative" });
  }

  ctx.filter = cpuTreated ? "none" : filterForEffects(layer.effects, layer.trackEffects, applied.brightness);
  if (!stackedShadows) applyDropShadow(ctx, layer.effects, t);
  if (countDropShadows(layer.effects) > 1 && !stackedShadows) {
    degraded.push({
      clipId: layer.clipId,
      reason: "drop_shadow_extra_ignored"
    });
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
 * The picture a layer actually draws, and its size: the crop rectangle copied
 * onto its own surface, or the layer's own source when there is nothing to crop.
 *
 * The copy is what makes a crop reframe rather than knock out — every caller
 * downstream treats the returned size as the layer's source size, so the
 * contain fit, the transform, the border radius and the masks all act on the
 * cropped frame. Drawing the whole source at a negative offset onto a surface
 * the size of the crop is the 5-argument `drawImage` spelling of a sub-rectangle
 * blit, which is all {@link CompositeContext2D} vends.
 *
 * A host that vends no `cropSurface` gets the uncropped layer and a
 * `crop_skipped` report, the same call {@link drawMattedLayer} makes: the
 * picture is wrong in a way the caller is told about, rather than absent.
 */
function cropLayerSource<TSource>(
  layer: Canvas2DLayer<TSource>,
  surfaces: DrawTimelineFrameOptions<TSource>,
  degraded: Canvas2DDegradation[]
): { source: TSource; width: number; height: number } {
  const { source, sourceWidth: width, sourceHeight: height } = layer;
  if (!hasCrop(layer.crop) || width <= 0 || height <= 0) {
    return { source, width, height };
  }

  const rect = cropRectPx(layer.crop, width, height);
  const surface = surfaces.cropSurface?.(rect.width, rect.height);
  if (!surface) {
    degraded.push({ clipId: layer.clipId, reason: "crop_skipped" });
    return { source, width, height };
  }

  const cctx = surface.ctx;
  cctx.setTransform(1, 0, 0, 1, 0, 0);
  cctx.globalAlpha = 1;
  cctx.filter = "none";
  cctx.globalCompositeOperation = "source-over";
  cctx.clearRect(0, 0, rect.width, rect.height);
  try {
    cctx.drawImage(source, -rect.x, -rect.y, width, height);
  } catch {
    degraded.push({ clipId: layer.clipId, reason: "crop_skipped" });
    return { source, width, height };
  }
  return { source: surface.surface, width: rect.width, height: rect.height };
}

/**
 * Copy `source` onto a scratch surface, add the grade's brightness to it, and
 * multiply the soft masks into its alpha — all in the layer's own source-pixel
 * space. Null when the host vended no scratch; the three flags say what
 * actually landed, so the caller can clip the masks hard and put the brightness
 * back in the CSS filter.
 *
 * Both masks reduce to a `destination-in` on one copy, which is why they share
 * a surface: a shape mask needs its coverage rasterized separately (it is a
 * ring of disjoint fills, and `destination-in` would intersect them), but the
 * wipe is a single gradient and multiplies straight in.
 */
function prepareSource<TSource>(
  source: TSource,
  width: number,
  height: number,
  wipe: AnimationSampleMask | undefined,
  shape: ClipMask | undefined,
  brightness: number,
  surfaces: DrawTimelineFrameOptions<TSource>
): {
  surface: TSource;
  shape: boolean;
  wipe: boolean;
  brightness: boolean;
} | null {
  const scratch = surfaces.maskScratch?.(width, height);
  if (!scratch) return null;
  const sctx = scratch.ctx;

  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalAlpha = 1;
  sctx.filter = "none";
  sctx.globalCompositeOperation = "source-over";
  sctx.clearRect(0, 0, width, height);
  sctx.drawImage(source, 0, 0, width, height);

  // Brightness runs first, as it does in `colorGradeV1`, and before the masks
  // so it never reads back a pixel a mask has already knocked out.
  let brightnessApplied = false;
  if (Math.abs(brightness) > 0.001) {
    addBrightness(sctx, width, height, brightness);
    brightnessApplied = true;
  }

  let shapeApplied = false;
  if (shape && !maskIsHard(shape)) {
    const coverage = surfaces.maskSurface?.(width, height);
    if (coverage && coverage.surface !== scratch.surface) {
      shapeApplied = drawMask(coverage.ctx, shape, width, height);
      if (shapeApplied) {
        sctx.globalCompositeOperation = "destination-in";
        sctx.drawImage(coverage.surface, 0, 0, width, height);
        sctx.globalCompositeOperation = "source-over";
      }
    }
  }

  let wipeApplied = false;
  if (wipe && wipe.softness > 0) {
    applyWipeGradient(sctx, width, height, wipe);
    wipeApplied = true;
  }
  if (!shapeApplied && !wipeApplied && !brightnessApplied) return null;
  return {
    surface: scratch.surface,
    shape: shapeApplied,
    wipe: wipeApplied,
    brightness: brightnessApplied
  };
}

/**
 * Add `amount` to every channel of the surface, which is what the GPU grade
 * does (`rgb + brightness` in `color/grade/v1`) and what CSS `brightness()`
 * does not — that one multiplies, so a +0.25 lift lands on 160 rather than 192
 * from mid-grey.
 *
 * Shipped as a per-pixel pass rather than a `lighter` white draw keyed back to
 * the layer's alpha: the composite version is exact only for a positive
 * `amount`, needs a second surface to restrict the white to the layer's own
 * coverage, and would still need this pass for the negative half. One read and
 * one write on the scratch copy covers both signs at the same cost.
 *
 * Straight (un-premultiplied) alpha is what a canvas stores, so the channels
 * move and the coverage does not — the same pixels the shader reads.
 */
function addBrightness<TSource>(
  ctx: CompositeContext2D<TSource>,
  width: number,
  height: number,
  amount: number
): void {
  const pixels = ctx.getImageData(0, 0, width, height);
  const data = pixels.data;
  const delta = Math.round(amount * 255);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i]! + delta;
    data[i + 1] = data[i + 1]! + delta;
    data[i + 2] = data[i + 2]! + delta;
  }
  ctx.putImageData(pixels, 0, 0);
}

/** How many drop shadows the chain asks for; `ctx.shadow*` casts one (D7). */
function countDropShadows(effects: ClipEffect[] | undefined): number {
  let n = 0;
  for (const e of effects ?? []) {
    if (e.enabled && isClipDropShadowEffect(e)) n += 1;
  }
  return n;
}

/**
 * Knock out the hidden side of a wipe with a `destination-in` linear gradient.
 * The stops sample the same `1 - smoothstep(e - s, e, c)` profile the WebGPU
 * shader evaluates per-fragment, at the same front position
 * `e = progress * (1 + s)`, so both backends show the same visible fraction at
 * the same progress.
 */
function applyWipeGradient<TSource>(
  sctx: CompositeContext2D<TSource>,
  width: number,
  height: number,
  mask: AnimationSampleMask
): void {
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
}

/**
 * Draw a matted layer: compose it on one frame-sized surface, compose its matte
 * source on another, multiply the matte into the first surface's alpha, and
 * blend that once (D6).
 *
 * Frame-sized rather than source-sized because a matte is positioned by its own
 * clip: the source's transform decides where its keyhole falls on the frame,
 * which is only expressible once both layers are placed.
 *
 * Null when the host vended no usable pair of surfaces — the caller then draws
 * the layer unmatted, which is a visible difference and not a lost layer.
 */
function drawMattedLayer<TSource>(
  ctx: CompositeContext2D<TSource>,
  layer: Canvas2DLayer<TSource>,
  matte: Canvas2DMatte<TSource>,
  geometry: Canvas2DFrameGeometry,
  surfaces: DrawTimelineFrameOptions<TSource>,
  degraded: Canvas2DDegradation[]
): boolean | null {
  const make = surfaces.matteSurface;
  if (!make) return null;
  const { canvasWidth: w, canvasHeight: h } = geometry;
  const composed = make(w, h);
  const keyhole = make(w, h);
  if (!composed || !keyhole || composed.surface === keyhole.surface) return null;

  // The layer's own blend mode meets the frame once, when the composed surface
  // is drawn back — on the surface it is an ordinary source-over draw over
  // transparency. Its opacity rides along in the surface's alpha.
  // A dip's solid covers the whole frame, so it belongs on the main stack
  // beside the layer, the way the GPU compositor pushes it. Left on the inner
  // draw, `destination-in` would key it by the keyhole and the frame would dip
  // only where the matte lets it through.
  const transition = layer.transition;
  const inner = transition?.solid
    ? { ...transition, solid: undefined }
    : transition;

  resetContext(composed.ctx);
  composed.ctx.clearRect(0, 0, w, h);
  const drawn = drawTimelineLayer(
    composed.ctx,
    {
      ...layer,
      matte: undefined,
      blendMode: "normal",
      transition: inner
    },
    geometry,
    surfaces,
    degraded
  );

  resetContext(keyhole.ctx);
  keyhole.ctx.clearRect(0, 0, w, h);
  drawTimelineLayer(
    keyhole.ctx,
    { ...matte.layer, matte: undefined, blendMode: "normal" },
    geometry,
    surfaces,
    degraded
  );
  if (matte.mode === "luma") lumaToAlpha(keyhole.ctx, w, h);
  if (matte.invert) invertAlpha(keyhole.ctx, w, h);
  const strength = matte.strength ?? 1;
  if (strength < 1) scaleAlpha(keyhole.ctx, w, h, Math.max(0, strength));
  // The GPU path blurs the keyhole before it is read; there is no separable
  // blur here, and `ctx.filter` would soften the *picture* rather than the
  // matte. Named rather than silently dropped (I7).
  if (matte.featherPx !== undefined && matte.featherPx > 0) {
    degraded.push({
      clipId: layer.clipId,
      reason: "generated_matte_feather_ignored"
    });
  }

  composed.ctx.globalCompositeOperation = "destination-in";
  composed.ctx.drawImage(keyhole.surface, 0, 0, w, h);
  resetContext(composed.ctx);

  const solid = transition?.solid;
  if (solid && solid.opacity > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.min(1, solid.opacity);
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    ctx.fillStyle = solid.color;
    ctx.fillRect(0, 0, geometry.canvasWidth, geometry.canvasHeight);
    ctx.restore();
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = blendModeToCanvasOp(layer.blendMode);
  ctx.filter = "none";
  let ok = drawn;
  try {
    ctx.drawImage(composed.surface, 0, 0, w, h);
  } catch {
    ok = false;
  }
  ctx.restore();
  resetContext(ctx);
  return ok;
}

/**
 * Move a surface's luminance into its alpha, which is what a luma matte means
 * and what no composite operation expresses.
 *
 * Canvas stores straight alpha, so a transparent pixel's colour says nothing
 * about the picture — the luminance is weighted by the coverage it was drawn
 * with, which is what makes a luma matte over an empty frame read as empty
 * rather than as whatever the surface happened to be cleared to.
 */
function lumaToAlpha<TSource>(
  ctx: CompositeContext2D<TSource>,
  width: number,
  height: number
): void {
  const pixels = ctx.getImageData(0, 0, width, height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const luma =
      0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = Math.round((luma * data[i + 3]!) / 255);
  }
  ctx.putImageData(pixels, 0, 0);
}

/**
 * `alpha *= scale`, which is what a matte's `strength` means: at 0.5 half of
 * what the matte hides comes back through. Run on the keyhole rather than on
 * the layer so the two compositors read one number the same way.
 */
function scaleAlpha<TSource>(
  ctx: CompositeContext2D<TSource>,
  width: number,
  height: number,
  scale: number
): void {
  const pixels = ctx.getImageData(0, 0, width, height);
  const data = pixels.data;
  for (let i = 3; i < data.length; i += 4) {
    data[i] = Math.round(data[i]! * scale);
  }
  ctx.putImageData(pixels, 0, 0);
}

/** `alpha = 1 - alpha`, for a matte that keeps what its source hides. */
function invertAlpha<TSource>(
  ctx: CompositeContext2D<TSource>,
  width: number,
  height: number
): void {
  const pixels = ctx.getImageData(0, 0, width, height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255 - data[i + 3]!;
  }
  ctx.putImageData(pixels, 0, 0);
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
 * Arm `ctx.shadow*` from the first enabled `dropShadow` in the chain, so the
 * next `drawImage` casts it (D7).
 *
 * Canvas 2D holds shadow offsets and blur in canvas units and leaves them out
 * of the current transform, while the document authors them in the layer's own
 * source pixels — the space the GPU recipe runs in, before placement. So the
 * offset goes through the affine's linear part and the blur through its scale,
 * which is what makes a shadow on a scaled-down layer the same size on both
 * paths. The blur itself is two thirds of the radius because `shadowBlur` is
 * twice the Gaussian sigma and `filters.blur.gaussian@1` derives sigma as a
 * third of its radius.
 */
function applyDropShadow<TSource>(
  ctx: CompositeContext2D<TSource>,
  effects: ClipEffect[] | undefined,
  t: CanvasAffine
): void {
  const shadow = (effects ?? []).find(
    (e): e is ClipDropShadowEffect => e.enabled && isClipDropShadowEffect(e)
  );
  if (!shadow) return;
  const scale = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1;
  ctx.shadowColor = shadowPaint(shadow.color, shadow.opacity ?? 1);
  ctx.shadowBlur = Math.max(0, shadow.blur) * (2 / 3) * scale;
  ctx.shadowOffsetX = t.a * shadow.offsetX + t.c * shadow.offsetY;
  ctx.shadowOffsetY = t.b * shadow.offsetX + t.d * shadow.offsetY;
}

/**
 * A shadow colour with its opacity folded in — Canvas 2D has no separate
 * shadow alpha. A colour that is not `#rgb`/`#rrggbb` is passed through, so a
 * named colour still casts at full strength rather than not at all.
 */
function shadowPaint(color: string, opacity: number): string {
  const alpha = Math.max(0, Math.min(1, opacity));
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) return color;
  const digits = hex[1] ?? "";
  const wide =
    digits.length === 3
      ? digits
          .split("")
          .map((c) => c + c)
          .join("")
      : digits;
  const v = parseInt(wide, 16);
  const rgb = `${(v >> 16) & 0xff}, ${(v >> 8) & 0xff}, ${v & 0xff}`;
  return `rgba(${rgb}, ${alpha})`;
}

/**
 * Memoize the built filter string per `(clipEffects, trackEffects)` array
 * identity. Both arrays are stable references on the clip/track until edited,
 * so a clip sitting still reuses its string across every frame instead of
 * rebuilding it per layer per frame.
 */
const FILTER_NONE_KEY: readonly never[] = Object.freeze([]);
const filterCache = new WeakMap<object, WeakMap<object, string>>();
const gradedFilterCache = new WeakMap<object, WeakMap<object, string>>();

/**
 * @param brightnessApplied The layer's brightness already landed as the GPU's
 * addition on a scratch copy, so the filter must leave it out rather than
 * apply the lift a second time.
 */
export function filterForEffects(
  clipEffects: ClipEffect[] | undefined,
  trackEffects: TrackEffect[] | undefined,
  brightnessApplied = false
): string {
  // Normalize undefined to a shared sentinel so both keys are always objects
  // the WeakMaps can hold.
  const clipKey = (clipEffects ?? FILTER_NONE_KEY) as object;
  const trackKey = (trackEffects ?? FILTER_NONE_KEY) as object;
  const cache = brightnessApplied ? gradedFilterCache : filterCache;
  let inner = cache.get(clipKey);
  if (inner) {
    const hit = inner.get(trackKey);
    if (hit !== undefined) return hit;
  } else {
    inner = new WeakMap<object, string>();
    cache.set(clipKey, inner);
  }
  const result = computeFilterForEffects(
    clipEffects,
    trackEffects,
    brightnessApplied
  );
  inner.set(trackKey, result);
  return result;
}

/**
 * The grade's total brightness, summed over the clip and track effects exactly
 * as the filter builder sums it — one accumulation, so the scratch pass and the
 * filter can never disagree about how much lift is left to apply.
 */
export function brightnessForEffects(
  clipEffects: ClipEffect[] | undefined,
  trackEffects: TrackEffect[] | undefined
): number {
  let brightness = 0;
  for (const e of clipEffects ?? []) {
    if (e.enabled && isClipColorEffect(e)) brightness += e.brightness ?? 0;
  }
  for (const e of trackEffects ?? []) {
    if (e.enabled && e.type === "colorCorrection") brightness += e.brightness;
  }
  return brightness;
}

/**
 * Approximate the clip + track color/blur effects with a CSS `filter` string.
 * Covers the brightness / contrast / saturation / hue / blur adjustments and
 * ignores the GPU-only effects — see {@link unsupportedEffectTypes}.
 */
function computeFilterForEffects(
  clipEffects: ClipEffect[] | undefined,
  trackEffects: TrackEffect[] | undefined,
  brightnessApplied: boolean
): string {
  let brightness = 0;
  let contrast = 1;
  let saturation = 1;
  let hue = 0;
  let blur = 0;

  const accumulate = (effects: readonly ClipEffect[]): void => {
    for (const e of effects) {
      if (!e.enabled) continue;
      if (isClipColorEffect(e)) {
        brightness += e.brightness ?? 0;
        contrast *= e.contrast ?? 1;
        saturation *= e.saturation ?? 1;
        hue += e.hue ?? 0;
      } else if (isClipBlurEffect(e)) {
        blur += e.radius;
      }
    }
  };
  accumulate(clipEffects ?? []);
  accumulate(trackEffectsAsClipEffects(trackEffects));

  const parts: string[] = [];
  if (!brightnessApplied && Math.abs(brightness) > 0.001) {
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
    // CSS blur() takes Gaussian sigma; the GPU kernel derives sigma = radius/3.
    parts.push(`blur(${(blur / 3).toFixed(2)}px)`);
  }
  return parts.length > 0 ? parts.join(" ") : "none";
}
