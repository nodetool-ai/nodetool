/**
 * compositeLayers — turn the scene model's `ActiveLayer`s into the layer list
 * both browser compositors draw.
 *
 * The live preview and the in-browser exporter used to each walk the active
 * layers themselves and copy across the handful of fields they knew about,
 * which is how the browser came to show a different picture from the export and
 * the agent's frame preview: a group's precomposite, a transition's geometry, a
 * shape mask and a track matte were all resolved by the scene model and then
 * dropped on the floor here. This is the one place that mapping lives now, so a
 * field the scene model resolves reaches every host or none.
 *
 * The hosts still differ in how they get pixels — a pooled `<video>` element,
 * a decoded `<img>`, a rasterized `ImageBitmap` — so that is the one thing they
 * pass in, as {@link CompositeSourceResolver}.
 */

import type {
  ActiveLayer,
  AnimatedLayerProps,
  Canvas2DLayer,
  Canvas2DMatte,
  PrecompositeLayer
} from "@nodetool-ai/timeline/render";
import {
  resolveAnimatedLayerProps,
  trackZ,
  type AnimationCompileCache,
  type RenderCanvas
} from "@nodetool-ai/timeline/render";

import type {
  CompositeLayer,
  CompositePrecomposite,
  CompositeSource
} from "./gpu/types";

/** The pixels a layer draws, and how they sit on the frame. */
export interface ResolvedCompositeSource {
  source: CompositeSource;
  /**
   * True for a raster drawn at frame resolution — a caption. It composites
   * untransformed, so the clip's transform, its group's matrix, its effects and
   * its cut's geometry are all left off; only the cut's opacity, which is
   * already folded in, still applies.
   */
  untransformed?: boolean;
}

/**
 * How a host gets one layer's pixels. Null means it has none this frame — a
 * video still seeking, an image still decoding, a raster with nothing on it —
 * and the layer is left out of the frame.
 *
 * The layer's sampled props come with it because a rasterized layer's pixels
 * depend on them: a shape clip with an animated trim draws a different outline
 * at every timecode, and `anim.shapeStyle` is the one carrying it.
 */
export type CompositeSourceResolver = (
  layer: ActiveLayer,
  anim: AnimatedLayerProps
) => ResolvedCompositeSource | null;

export interface BuildCompositeLayersOptions {
  /** The frame time the layers are drawn at. */
  atMs: number;
  /** The sequence's own resolution: the space animations are sampled in. */
  canvas: RenderCanvas;
  animationCache?: AnimationCompileCache;
  resolveSource: CompositeSourceResolver;
}

/** The texture-cache key for a layer: stable across frames for one clip. */
const LAYER_ID_PREFIX: Record<ActiveLayer["kind"], string> = {
  video: "v",
  image: "i",
  text: "t",
  shape: "s",
  caption: "c"
};

/** A layer's id, matte sources included — they never collide with the layer. */
export function compositeLayerId(layer: ActiveLayer, prefix = ""): string {
  return `${prefix}${LAYER_ID_PREFIX[layer.kind]}:${layer.clipId}`;
}

/**
 * One active layer as something a compositor can draw, or null when the host
 * has no pixels for it.
 *
 * A matted layer's source is resolved here and nowhere else: the scene model
 * holds a matte source out of the layer list so it never draws itself, which
 * means this is the only walk that reaches it.
 */
export function buildCompositeLayer(
  layer: ActiveLayer,
  options: BuildCompositeLayersOptions,
  idPrefix = ""
): CompositeLayer | null {
  const anim = resolveAnimatedLayerProps(
    layer,
    options.atMs,
    options.canvas,
    options.animationCache
  );
  const resolved = options.resolveSource(layer, anim);
  if (!resolved) return null;

  const built: CompositeLayer = {
    id: compositeLayerId(layer, idPrefix),
    source: resolved.source,
    opacity: anim.opacity,
    blendMode: layer.blendMode,
    zIndex: trackZ(layer.trackIndex),
    precomposeGroupId: layer.precomposeGroupId,
    mask: anim.mask
  };
  if (resolved.untransformed) return built;

  built.transform = anim.transform;
  built.parentMatrix = layer.parentMatrix;
  built.borderRadius = layer.borderRadius;
  built.shapeMask = layer.shapeMask;
  built.effects = anim.effects ?? layer.effects;
  built.trackEffects = layer.trackEffects;
  built.transition = layer.transition;
  if (layer.matte) {
    const source = buildCompositeLayer(layer.matte.layer, options, "matte:");
    if (source) {
      built.matte = {
        mode: layer.matte.mode,
        invert: layer.matte.invert,
        layer: source
      };
    }
  }
  return built;
}

/** Every drawable layer of a frame, in the scene model's order. */
export function buildCompositeLayers(
  layers: readonly ActiveLayer[],
  options: BuildCompositeLayersOptions
): CompositeLayer[] {
  const out: CompositeLayer[] = [];
  for (const layer of layers) {
    const built = buildCompositeLayer(layer, options);
    if (built) out.push(built);
  }
  return out;
}

/** The scene model's precomposites with track indices resolved to z-order. */
export function buildCompositePrecomposites(
  precomposites: readonly PrecompositeLayer[]
): CompositePrecomposite[] {
  return precomposites.map((group) => ({
    id: group.clipId,
    zIndex: trackZ(group.trackIndex),
    opacity: group.opacity,
    blendMode: group.blendMode,
    effects: group.effects,
    precomposeGroupId: group.precomposeGroupId
  }));
}

/**
 * The pixel size of a composite source, or null when it has none decoded yet.
 * The Canvas 2D rules need the source's own pixel space to place and mask in,
 * and only the host can measure a `<video>` element.
 */
export type MeasureCompositeSource = (
  source: CompositeSource
) => { width: number; height: number } | null;

/**
 * One composite layer in the shape the shared Canvas 2D rules draw, or null
 * when its source has no pixels yet.
 *
 * A matted layer whose matte source is still decoding draws unmatted rather
 * than not at all: on the first frames of a cut the alternative is a hole in
 * the frame.
 */
export function toCanvas2DLayer(
  layer: CompositeLayer,
  measure: MeasureCompositeSource
): Canvas2DLayer<CompositeSource> | null {
  const size = measure(layer.source);
  if (!size || size.width <= 0 || size.height <= 0) return null;
  let matte: Canvas2DMatte<CompositeSource> | undefined;
  if (layer.matte) {
    const source = toCanvas2DLayer(layer.matte.layer, measure);
    if (source) {
      matte = {
        mode: layer.matte.mode,
        invert: layer.matte.invert,
        layer: source
      };
    }
  }
  return {
    source: layer.source,
    sourceWidth: size.width,
    sourceHeight: size.height,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    zIndex: layer.zIndex,
    transform: layer.transform,
    parentMatrix: layer.parentMatrix,
    precomposeGroupId: layer.precomposeGroupId,
    borderRadius: layer.borderRadius,
    mask: layer.mask,
    shapeMask: layer.shapeMask,
    matte,
    effects: layer.effects,
    trackEffects: layer.trackEffects,
    transition: layer.transition
  };
}
