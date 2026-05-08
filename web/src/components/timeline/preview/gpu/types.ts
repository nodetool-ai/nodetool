import type { TimelineClip } from "@nodetool-ai/timeline";

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
}

export interface CompositorInitResult {
  ok: boolean;
  reason?: string;
}
