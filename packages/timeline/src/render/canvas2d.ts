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
 *
 * A group carrying effects or a blend mode composites its children onto an
 * intermediate surface first, so the effect chain runs on the composed picture
 * and the blend meets the frame once. The host vends that surface through
 * {@link CompositeSurfaceFactory}, because there is no way to make one that
 * exists in both a browser and Node.
 */

import { blendModeToCanvasOp } from "@nodetool-ai/gpu";

import type { AnimationSampleMask, WipeDirection } from "../animation/index.js";
import type {
  ClipDropShadowEffect,
  ClipEffect,
  ClipMask,
  ClipTransform,
  TrackEffect
} from "../types.js";
import {
  isClipBlurEffect,
  isClipColorEffect,
  isClipDropShadowEffect
} from "../types.js";
import { clipMask, drawMask, maskIsHard, type MaskContext2D } from "./draw.js";
import type { MatteMode } from "./sceneModel.js";
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
  opacity: number;
  blendMode: unknown;
  /** Run once on the composed surface, not once per child. */
  effects?: ClipEffect[];
  /** Set when a precompositing group holds this one: the surface it draws into. */
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
  /**
   * Scratch for feathered wipes. One reused surface is enough — a wipe draws it
   * back before the next layer asks for it.
   */
  maskScratch?: CompositeSurfaceFactory<TSource>;
  /** The groups to composite separately, innermost first (scene-model order). */
  precomposites?: readonly Canvas2DPrecomposite[];
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
 * Every one of these is a *host* shortfall rather than a missing rule: the
 * drawing exists, and the surface it needs to run on does not — except
 * `drop_shadow_extra_ignored`, which is `ctx.shadow*` being one set of fields
 * where the GPU recipe runs once per effect.
 */
export type Canvas2DDegradationReason =
  /** A feathered shape mask drawn as its hard edge. */
  | "mask_hard_edge"
  /** A feathered wipe drawn as a hard edge. */
  | "wipe_hard_edge"
  /** A track matte skipped: the layer drew unmatted. */
  | "matte_skipped"
  /** A precompositing group's blend mode and effects lost. */
  | "group_blend_lost"
  /** Drop shadows past the first in the chain, not cast. */
  | "drop_shadow_extra_ignored"
  /** Brightness applied as a CSS multiply instead of the GPU's addition. */
  | "brightness_multiplicative";

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
 * Effect types this path draws; everything else is dropped and reported.
 *
 * `dropShadow` is here because `ctx.shadow*` casts from the layer's own
 * silhouette, which is what the GPU recipe blurs too. The other clip effects
 * from the shader catalog (D7) have no Canvas 2D equivalent at all: there is no
 * filter for a key, a tone curve, an output range or a three-way grade, and
 * `drop-shadow()` on `ctx.filter` is not one of them either — it would apply to
 * the shadow as well.
 */
const CANVAS_EFFECT_TYPES = new Set([
  "color",
  "blur",
  "dropShadow",
  "colorCorrection",
  "videoBlur"
]);

/**
 * The effect types present on these layers that Canvas 2D cannot draw. A
 * caller reports these rather than letting the frame quietly differ from the
 * GPU render (I7).
 *
 * A group's effects run on its composed surface, not on any one layer, so a
 * caller with precomposites passes them in too — `Canvas2DPrecomposite` carries
 * `effects` for exactly that. Leaving them out is how a group blur that this
 * path never applied would go unreported.
 *
 * A grade is reported per channel rather than per type: `ctx.filter` carries
 * brightness, contrast, saturation and hue, and has no white balance at all, so
 * a `color` or `colorCorrection` effect that moves temperature, tint, shadows
 * or highlights is partly applied. Those come back as `color.temperature`,
 * `color.tint`, `color.shadows` and `color.highlights`, at the identity the GPU
 * grade uses (0 for all four) — including on the effect the scene model
 * synthesizes for an animated grade, which arrives here as an ordinary enabled
 * `color`.
 *
 * Brightness is not on this list: this path applies the GPU's addition itself
 * when the host vends a scratch surface, and reports the CSS-multiply fallback
 * as a {@link Canvas2DDegradation} instead, because whether it degraded is a
 * property of the frame draw and not of the effect list.
 */
export function unsupportedEffectTypes(
  layers: readonly {
    effects?: ClipEffect[];
    trackEffects?: TrackEffect[];
  }[]
): string[] {
  const found = new Set<string>();
  const grade = (channel: {
    temperature?: number;
    tint?: number;
    shadows?: number;
    highlights?: number;
  }): void => {
    if (Math.abs(channel.temperature ?? 0) > 0.001) found.add("color.temperature");
    if (Math.abs(channel.tint ?? 0) > 0.001) found.add("color.tint");
    if (Math.abs(channel.shadows ?? 0) > 0.001) found.add("color.shadows");
    if (Math.abs(channel.highlights ?? 0) > 0.001) found.add("color.highlights");
  };
  for (const layer of layers) {
    for (const e of layer.effects ?? []) {
      if (!e.enabled) continue;
      if (!CANVAS_EFFECT_TYPES.has(e.type)) found.add(e.type);
      if (isClipColorEffect(e)) grade(e);
    }
    for (const e of layer.trackEffects ?? []) {
      if (!e.enabled) continue;
      if (!CANVAS_EFFECT_TYPES.has(e.type)) found.add(e.type);
      if (e.type === "colorCorrection") grade(e);
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
 */
export function drawTimelineFrame<TSource>(
  ctx: CompositeContext2D<TSource>,
  layers: readonly Canvas2DLayer<TSource>[],
  geometry: Canvas2DFrameGeometry,
  options: DrawTimelineFrameOptions<TSource> = {}
): Canvas2DFrameReport<TSource> {
  resetContext(ctx);
  if (options.alpha === true) {
    ctx.clearRect(0, 0, geometry.canvasWidth, geometry.canvasHeight);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, geometry.canvasWidth, geometry.canvasHeight);
  }

  const skipped: Canvas2DLayer<TSource>[] = [];
  const degraded: Canvas2DDegradation[] = [];
  const stack = composePrecomposites(
    layers,
    geometry,
    options,
    skipped,
    degraded
  );
  const ordered = [...stack].sort((a, b) => a.zIndex - b.zIndex);
  for (const layer of ordered) {
    if (!drawTimelineLayer(ctx, layer, geometry, options, degraded)) {
      skipped.push(layer);
    }
  }
  resetContext(ctx);
  return { skipped, degraded };
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

  for (const group of groups) {
    const children = byGroup.get(group.id) ?? [];
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
      for (const child of children) assign(group.precomposeGroupId, child);
      continue;
    }

    const sctx = surface.ctx;
    resetContext(sctx);
    sctx.clearRect(0, 0, geometry.canvasWidth, geometry.canvasHeight);
    for (const child of [...children].sort((a, b) => a.zIndex - b.zIndex)) {
      if (!drawTimelineLayer(sctx, child, geometry, options, degraded)) {
        skipped.push(child);
      }
    }

    // The surface is frame-sized, so it composites untransformed: the group's
    // own matrix already rode into each child through `parentMatrix`.
    assign(group.precomposeGroupId, {
      source: surface.surface,
      sourceWidth: geometry.canvasWidth,
      sourceHeight: geometry.canvasHeight,
      opacity: group.opacity,
      blendMode: group.blendMode,
      zIndex: group.zIndex,
      effects: group.effects
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
  const { sourceWidth: width, sourceHeight: height } = layer;
  if (width <= 0 || height <= 0) return false;

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
  const t = layerCanvasAffine(
    transitionTransform(
      layer.transform,
      transition,
      geometry.refWidth || geometry.canvasWidth,
      geometry.refHeight || geometry.canvasHeight
    ),
    width,
    height,
    geometry,
    layer.parentMatrix
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

  // Both masks live in the layer's own source-pixel space, so they rotate with
  // the layer exactly as the GPU shader's quad-space mask does. Hard edges are
  // path clips and cost nothing; soft ones pre-mask the source on a scratch
  // surface with `destination-in`, which is also what lets a shape mask and a
  // wipe compose without a second copy.
  let source = layer.source;
  // An animated wipe on the clip and a wipe transition both reduce to one
  // reveal; the clip's own wins, because it is the motion the author put there.
  const wipe = layer.mask ?? transition?.mask;
  const shape = layer.shapeMask;
  const softWipe = wipe !== undefined && wipe.softness > 0;
  const softShape = shape !== undefined && !maskIsHard(shape);
  const brightness = brightnessForEffects(layer.effects, layer.trackEffects);
  const lifts = Math.abs(brightness) > 0.001;
  let applied = { shape: false, wipe: false, brightness: false };
  if (softWipe || softShape || lifts) {
    const prepared = prepareSource(
      layer.source,
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

  ctx.filter = filterForEffects(
    layer.effects,
    layer.trackEffects,
    applied.brightness
  );
  applyDropShadow(ctx, layer.effects, t);
  if (countDropShadows(layer.effects) > 1) {
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

  for (const e of clipEffects ?? []) {
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
    parts.push(`blur(${Math.min(40, blur).toFixed(2)}px)`);
  }
  return parts.length > 0 ? parts.join(" ") : "none";
}
