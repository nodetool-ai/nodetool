import type {
  ClipEffect,
  ClipTransform,
  TimelineClip
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
  /** GPU effects applied as a pre-pass before this layer's composite draw. */
  effects?: ClipEffect[];
}

export interface CompositorInitResult {
  ok: boolean;
  reason?: string;
}
