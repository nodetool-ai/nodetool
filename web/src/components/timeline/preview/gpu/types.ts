import type {
  ClipEffect,
  ClipTransform,
  TimelineClip,
  TrackEffect
} from "@nodetool-ai/timeline";

export type CompositorBlendMode = NonNullable<TimelineClip["blendMode"]>;

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
  /** Rounded-corner radius in source pixels. Default 0. */
  borderRadius?: number;
  /** Per-clip GPU effects applied as a pre-pass before this layer's draw. */
  effects?: ClipEffect[];
  /**
   * Track-level video effects applied after `effects`, mirroring the audio
   * DSP chain on audio tracks. Only video-type variants of TrackEffect are
   * acted on; audio variants are ignored.
   */
  trackEffects?: TrackEffect[];
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
  setLayers(layers: CompositeLayer[]): void;
  render(): void;
  /** Resolve once all submitted GPU work has completed (no-op on Canvas2D). */
  flush(): Promise<void>;
  dispose(): void;
}
