import type {
  AnimationSampleMask,
  ClipEffect,
  ClipMask,
  ClipTransform,
  TrackEffect
} from "@nodetool-ai/timeline";
import type {
  CompositorBlendMode,
  MatteMode,
  ResolvedTransition
} from "@nodetool-ai/timeline/render";

export type { CompositorBlendMode };

export type CompositeSource =
  | HTMLVideoElement
  | HTMLImageElement
  | ImageBitmap;

export interface CompositeLayer {
  id: string;
  source: CompositeSource;
  opacity: number;
  blendMode: CompositorBlendMode;
  zIndex: number;
  /** Optional 2D placement. Default: identity (centered, contain-fit). */
  transform?: ClipTransform;
  /**
   * The resolved matrix of the group the clip is parented to, from the scene
   * model. Composes as `parent × own`; absent when the clip names no group.
   */
  parentMatrix?: Float32Array;
  /**
   * The precomposite this layer draws into instead of the main stack, from the
   * scene model. Absent on every layer of a document whose groups carry no
   * effects and no blend mode, which is the path that allocates nothing.
   */
  precomposeGroupId?: string;
  /** Rounded-corner radius in source pixels. Default 0. */
  borderRadius?: number;
  /**
   * Wipe mask (from a `wipe` animation) applied in the layer's own quad
   * space, so the wipe edge rotates with the layer. Absent means unmasked.
   */
  mask?: AnimationSampleMask;
  /**
   * The clip's shape mask, in the layer's own normalized space. Kept as the
   * authored shape rather than a raster because only one of the two backends
   * wants pixels: Canvas 2D clips the path directly, and the WebGPU path
   * rasterizes it into coverage on its way to `maskApply`.
   */
  shapeMask?: ClipMask;
  /**
   * The track matte driving this layer's alpha, with the source clip already
   * resolved to a layer of its own. The source is not in the layer list: a
   * matte source never draws itself.
   */
  matte?: CompositeMatte;
  /** Per-clip GPU effects applied as a pre-pass before this layer's draw. */
  effects?: ClipEffect[];
  /**
   * Track-level video effects applied after `effects`, mirroring the audio
   * DSP chain on audio tracks. Only video-type variants of TrackEffect are
   * acted on; audio variants are ignored.
   */
  trackEffects?: TrackEffect[];
  /**
   * The cut this layer is part of, from the scene model. Its opacity is
   * already in `opacity`; the offset, scale, reveal mask and dip solid it
   * names are what the compositor draws with.
   */
  transition?: ResolvedTransition;
}

/** A track matte with its source layer already resolved. */
export interface CompositeMatte {
  mode: MatteMode;
  invert: boolean;
  layer: CompositeLayer;
}

/**
 * A group that composites its children onto an intermediate surface, runs its
 * effect chain on the composed picture, and blends the result once.
 *
 * Mirrors `PrecompositeLayer` from the scene model with `trackIndex` already
 * resolved to a `zIndex`, the way {@link CompositeLayer} mirrors `ActiveLayer`.
 */
export interface CompositePrecomposite {
  /** The group clip's id — what a layer names in `precomposeGroupId`. */
  id: string;
  /** Composite order of the blended result, ascending. */
  zIndex: number;
  opacity: number;
  blendMode: CompositorBlendMode;
  /** Run once on the composed surface, not once per child. */
  effects?: ClipEffect[];
  /** Set when a precompositing group holds this one: the surface it draws into. */
  precomposeGroupId?: string;
}

export interface CompositorInitResult {
  ok: boolean;
  reason?: string;
}

/**
 * Common surface implemented by both the WebGPU compositor and the Canvas2D
 * fallback, so the live preview and the offline renderer can drive either
 * backend through one reference. See {@link createCompositor}.
 */
export interface TimelineCompositor {
  init(canvas: HTMLCanvasElement): Promise<CompositorInitResult>;
  /** Reference (sequence) resolution that `transform.position` is stored in. */
  setReferenceSize(width: number, height: number): void;
  resize(width: number, height: number): void;
  /**
   * The frame to draw: the layers, and the groups that composite their children
   * before blending (scene-model order, innermost first). A document with no
   * precompositing group passes none and no intermediate is allocated.
   */
  setLayers(
    layers: CompositeLayer[],
    precomposites?: CompositePrecomposite[]
  ): void;
  render(): void;
  /** Resolve once all submitted GPU work has completed (no-op on Canvas2D). */
  flush(): Promise<void>;
  dispose(): void;
}
