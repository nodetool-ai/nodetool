/**
 * Core timeline types for the NodeTool timeline feature.
 *
 * This module exports all canonical type definitions for sequences, tracks,
 * clips, markers, versions, and status values. No runtime code lives here —
 * runtime helpers (dependency hash, timeline math) live in NOD-297.
 *
 * `paramOverrides` values are typed as `unknown` because they come from
 * heterogeneous Input* nodes and cannot be narrowed further at this layer.
 */

export type ClipStatus =
  | "draft"
  | "queued"
  | "generating"
  | "generated"
  | "stale"
  | "failed"
  | "locked"
  | "missing";

// Blend modes are defined once in @nodetool-ai/gpu and shared by the
// sketch editor, the timeline preview compositor, and the Compositor node.
import type { BlendMode } from "@nodetool-ai/gpu";
export type { BlendMode };

export interface TimelineSequence {
  id: string;
  projectId: string;
  /** Reserved for Slice 3 sequence-as-workflow. */
  workflowId?: string;
  name: string;
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];
  createdAt: string;
  updatedAt: string;
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: "video" | "audio" | "overlay" | "subtitle";
  index: number;
  visible: boolean;
  locked: boolean;
  muted?: boolean;
  solo?: boolean;
  /** Pixel height of the track row in the timeline UI. */
  heightPx?: number;
  /**
   * Effect chain applied after the track's primary stage. On `audio` tracks
   * these are DSP effects (gain, EQ, filter, compressor). On `video` tracks
   * these are GPU video effects (color correction, blur, sharpen, vignette,
   * chroma key). Effects are applied in order. The runtime ignores effects
   * whose type doesn't match the track type.
   */
  effects?: TrackEffect[];
}

// ── Track DSP effects ───────────────────────────────────────────────────────

export type TrackEffect =
  | TrackGainEffect
  | TrackEq3Effect
  | TrackFilterEffect
  | TrackCompressorEffect
  | TrackColorCorrectionEffect
  | TrackVideoBlurEffect
  | TrackSharpenEffect
  | TrackVignetteEffect
  | TrackChromaKeyEffect;

/** Audio-side effect types. */
export type AudioTrackEffectType = "gain" | "eq3" | "filter" | "compressor";

/** Video-side effect types. */
export type VideoTrackEffectType =
  | "colorCorrection"
  | "videoBlur"
  | "sharpen"
  | "vignette"
  | "chromaKey";

export interface TrackGainEffect {
  id: string;
  type: "gain";
  enabled: boolean;
  /** Gain in decibels. Default 0. */
  gainDb: number;
}

export interface TrackEq3Effect {
  id: string;
  type: "eq3";
  enabled: boolean;
  /** Low-shelf corner frequency in Hz. Default 200. */
  lowFreq: number;
  /** Low-shelf gain in dB. Default 0. */
  lowGainDb: number;
  /** Mid peaking centre frequency in Hz. Default 1000. */
  midFreq: number;
  /** Mid peaking Q. Default 1. */
  midQ: number;
  /** Mid peaking gain in dB. Default 0. */
  midGainDb: number;
  /** High-shelf corner frequency in Hz. Default 5000. */
  highFreq: number;
  /** High-shelf gain in dB. Default 0. */
  highGainDb: number;
}

export type TrackFilterMode = "lowpass" | "highpass" | "bandpass";

export interface TrackFilterEffect {
  id: string;
  type: "filter";
  enabled: boolean;
  mode: TrackFilterMode;
  /** Cutoff or centre frequency in Hz. Default 1000. */
  frequency: number;
  /** Filter Q. Default 1. */
  q: number;
}

export interface TrackCompressorEffect {
  id: string;
  type: "compressor";
  enabled: boolean;
  /** Threshold in dB. Default -24. */
  thresholdDb: number;
  /** Compression ratio. Default 4. */
  ratio: number;
  /** Attack time in milliseconds. Default 3. */
  attackMs: number;
  /** Release time in milliseconds. Default 250. */
  releaseMs: number;
  /** Knee in dB. Default 30. */
  kneeDb: number;
}

// ── Video track effects ─────────────────────────────────────────────────────

export interface TrackColorCorrectionEffect {
  id: string;
  type: "colorCorrection";
  enabled: boolean;
  /** -1..1, default 0 */
  brightness: number;
  /** 0..4, default 1 */
  contrast: number;
  /** 0..4, default 1 */
  saturation: number;
  /** degrees -180..180, default 0 */
  hue: number;
  /** -1..1 (cool→warm), default 0 */
  temperature: number;
  /** -1..1 (green→magenta), default 0 */
  tint: number;
  /** -1..1, default 0 */
  shadows: number;
  /** -1..1, default 0 */
  highlights: number;
}

export interface TrackVideoBlurEffect {
  id: string;
  type: "videoBlur";
  enabled: boolean;
  /** Blur radius in source pixels (0..40 typical). Default 4. */
  radius: number;
}

export interface TrackSharpenEffect {
  id: string;
  type: "sharpen";
  enabled: boolean;
  /** Amount of sharpening 0..2. Default 0.5. */
  amount: number;
  /** Edge threshold 0..1. Default 0. */
  threshold: number;
}

export interface TrackVignetteEffect {
  id: string;
  type: "vignette";
  enabled: boolean;
  /** Vignette intensity 0..1. Default 0.4. */
  intensity: number;
  /** Outer radius (relative to frame half-diagonal) 0.1..1.5. Default 0.9. */
  radius: number;
  /** Softness of the falloff 0..1. Default 0.5. */
  softness: number;
}

export interface TrackChromaKeyEffect {
  id: string;
  type: "chromaKey";
  enabled: boolean;
  /** Key colour as `#rrggbb`. Default `#00ff00`. */
  keyColor: string;
  /** Match tolerance 0..1. Default 0.2. */
  tolerance: number;
  /** Edge softness 0..1. Default 0.1. */
  softness: number;
  /** Spill suppression 0..1. Default 0.5. */
  spill: number;
}

/**
 * Discriminator for how a generated clip's media is produced.
 *
 *   - `"workflow"` (default when absent): runs a NodeTool workflow via
 *     `WorkflowRunner`. The clip carries `workflowId`, `selectedOutputNodeId`,
 *     and `paramOverrides`; dependency-hash bookkeeping detects staleness.
 *   - `"text-to-image"` / `"image-to-image"`: calls the runner's
 *     `generate_media` RPC directly with a model + prompt. No workflow, no
 *     param overrides. `sourceClipId` is the input clip for i2i.
 *   - `"text-to-video"`: calls the runner's `generate_media` RPC with a video
 *     model + prompt. Returns a single `video/mp4` asset.
 *   - `"text-to-audio"`: calls the runner's `generate_media` RPC with a TTS
 *     model + voice + prompt text. Returns a single audio asset (wav/mp3/...).
 *
 * Optional in the persisted shape so clips written before this field existed
 * default to `"workflow"` on load.
 */
export type ClipBindingKind =
  | "workflow"
  | "text-to-image"
  | "image-to-image"
  | "text-to-video"
  | "text-to-audio";

export interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  startMs: number;
  durationMs: number;
  inPointMs?: number;
  outPointMs?: number;
  mediaType: "image" | "video" | "audio" | "overlay";
  sourceType: "imported" | "generated";
  /** Defaults to "workflow" when absent on legacy persisted data. */
  bindingKind?: ClipBindingKind;
  workflowId?: string;
  selectedOutputNodeId?: string;
  /** Heterogeneous per-clip parameter overrides for the associated workflow. */
  paramOverrides?: Record<string, unknown>;
  // ── Direct-gen fields (text-to-image / image-to-image) ────────────────
  prompt?: string;
  negativePrompt?: string;
  provider?: string;
  model?: string;
  /** TTS voice id for `text-to-audio` direct-gen clips. */
  voice?: string;
  /** Source clip for image-to-image. Reads the source clip's currentAssetId at submit time. */
  sourceClipId?: string | null;
  width?: number;
  height?: number;
  strength?: number;
  numInferenceSteps?: number;
  seed?: number;
  dependencyHash?: string;
  lastGeneratedHash?: string;
  currentAssetId?: string;
  thumbnailAssetId?: string;
  waveformAssetId?: string;
  status: ClipStatus;
  locked: boolean;
  muted?: boolean;
  hidden?: boolean;
  versions: ClipVersion[];
  /** Opacity in the range [0, 1]. Default: 1. */
  opacity?: number;
  blendMode?: BlendMode;
  /** Playback speed multiplier. Default: 1. */
  speedMultiplier?: number;
  /** Whether the speed change has been baked into the asset. */
  speedBaked?: boolean;
  /** Audio volume in dB. Default: 0. */
  volumeDb?: number;
  /** Duration of the fade-in effect in milliseconds. */
  fadeInMs?: number;
  /** Duration of the fade-out effect in milliseconds. */
  fadeOutMs?: number;
  /** 2D placement on the preview canvas. Default: identity (centered, contain-fit). */
  transform?: ClipTransform;
  /** Rounded-corner radius in source pixels. 0 = sharp corners. */
  borderRadius?: number;
  /** GPU effects applied to this clip in order. */
  effects?: ClipEffect[];
  /**
   * Transition into this clip from the previously-overlapping clip on the
   * same track. The two clips must overlap in time by at least
   * `durationMs` for the transition to be visible.
   */
  transitionIn?: ClipTransition;
}

/**
 * Per-clip incoming transition. Only `crossfade` is implemented today; the
 * union is open for future types (`fade`, `wipe`, etc.) without a schema
 * break.
 */
export type ClipTransition = ClipCrossfadeTransition;

export interface ClipCrossfadeTransition {
  type: "crossfade";
  /** Length of the cross-fade in milliseconds. */
  durationMs: number;
}

/**
 * 2D transform applied per clip in the GPU compositor.
 * - `position` is in canvas pixels relative to the canvas center.
 * - `scale` multiplies the contain-fit base scale (1 = fit, 2 = 2x).
 * - `rotation` is in radians.
 * - `anchor` is the rotation/scale pivot in normalized [0,1] coords (0.5 = center).
 */
export interface ClipTransform {
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  anchor: { x: number; y: number };
}

export type ClipEffect = ClipColorEffect | ClipBlurEffect;

export interface ClipColorEffect {
  id: string;
  type: "color";
  enabled: boolean;
  /** -1..1, default 0 */
  brightness?: number;
  /** 0..4, default 1 */
  contrast?: number;
  /** 0..4, default 1 */
  saturation?: number;
  /** degrees -180..180, default 0 */
  hue?: number;
  /** -1..1 (cool→warm), default 0 */
  temperature?: number;
  /** -1..1 (green→magenta), default 0 */
  tint?: number;
  /** -1..1, default 0 */
  shadows?: number;
  /** -1..1, default 0 */
  highlights?: number;
}

export interface ClipBlurEffect {
  id: string;
  type: "blur";
  enabled: boolean;
  /** Blur radius in source pixels (0..20 typical). */
  radius: number;
  /** Optional Gaussian sigma. Defaults to radius / 3. */
  sigma?: number;
}

export interface ClipVersion {
  id: string;
  createdAt: string;
  jobId: string;
  assetId: string;
  workflowUpdatedAt: string;
  dependencyHash: string;
  /** Snapshot of paramOverrides at the time this version was generated. */
  paramOverridesSnapshot: Record<string, unknown>;
  costCredits?: number;
  durationMs?: number;
  status: "success" | "failed" | "cancelled";
  favorite?: boolean;
}

export interface TimelineMarker {
  id: string;
  timeMs: number;
  label: string;
  color?: string;
  note?: string;
}
