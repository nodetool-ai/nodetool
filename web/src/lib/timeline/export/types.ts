import type {
  BlendMode,
  ClipEffect,
  ClipTransform,
  TimelineClip,
  TimelineTrack,
  TrackEffect
} from "@nodetool-ai/timeline";

/**
 * One renderable layer in a frame snapshot. Sources are resolved separately
 * (image/video element lookup happens in the media cache), so this type
 * carries identifiers only and is trivially serialisable / testable.
 */
export interface LayerSpec {
  clipId: string;
  trackId: string;
  trackIndex: number;
  mediaType: "video" | "image" | "overlay";
  blendMode: BlendMode;
  opacity: number;
  assetId: string;
  transform?: ClipTransform;
  borderRadius?: number;
  effects?: ClipEffect[];
  trackEffects?: TrackEffect[];
  /** Whether `speedMultiplier` is already baked into the asset. */
  speedBaked: boolean;
  speedMultiplier: number;
  /** Clip's inPoint within the source media, in ms. */
  inPointMs: number;
  /** Where the playhead sits within the clip's *timeline* range. */
  intoClipTimelineMs: number;
}

/** Minimum timeline projection needed by the exporter. */
export interface TimelineSnapshot {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  durationMs: number;
  fps: number;
  width: number;
  height: number;
}

export type ExportStage = "audio" | "video" | "finalize";

export interface ExportProgress {
  stage: ExportStage;
  framesDone: number;
  framesTotal: number;
  /** 0..1, monotonically non-decreasing across stages. */
  fraction: number;
}

export interface ExportOptions {
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  /** H.264 by default — broadest compatibility. */
  videoCodec?: "avc" | "hevc" | "vp9" | "av1";
  /** AAC by default. Set to null to skip the audio track entirely. */
  audioCodec?: "aac" | "opus" | null;
  videoBitrate?: number;
  audioBitrate?: number;
  audioSampleRate?: number;
  /** One keyframe per N frames. Default: 2 × fps (~ every 2 s). */
  keyframeInterval?: number;
}

export interface ExportCallbacks {
  signal?: AbortSignal;
  onProgress?: (p: ExportProgress) => void;
  /**
   * Async resolver for asset URLs. Mirrors `AssetStore.get` + `getAssetUrl`
   * but is injected so the exporter is decoupled from the store layer.
   */
  resolveAssetUrl: (assetId: string) => Promise<string | null>;
}

export interface ExportResult {
  blob: Blob;
  durationMs: number;
  frameCount: number;
  hasAudio: boolean;
}

export interface ExportCapability {
  ok: boolean;
  /** Human-readable reason when ok = false. */
  reason?: string;
}
