/**
 * Core timeline types: sequences, tracks, clips, markers, versions, status.
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

// Motion-design animations attached to a clip (pure engine in ./animation).
// Re-exported from the package root via ./animation/index.js, so only imported
// here (not re-exported) to avoid a duplicate star-export.
import type { ClipAnimation } from "./animation/types.js";

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
  /**
   * Studio transcript lines. Optional so sequences written before Studio
   * existed load with no transcript. Persisted inside the document blob so
   * autosave and export inherit it for free.
   */
  transcript?: TranscriptLine[];
  /**
   * When set, controls whether the script lane + transcript panel are shown.
   * Unset on legacy sequences (treated as enabled if transcript clips exist).
   */
  scriptEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Classification of a caption token. Normal spoken words are `"word"` (the
 * default when absent); `"filler"` marks disfluencies ("um", "uh", "like", …)
 * that filler-word removal can ripple-cut in bulk; `"pause"` marks a silence
 * gap surfaced as an editable token.
 */
export type CaptionWordKind = "word" | "filler" | "pause";

/**
 * One word of a caption, timed relative to the *clip start* (clip-local) so
 * splitting or moving a clip never requires rewriting word timings — the
 * timings travel with the clip and stay valid against its new `startMs`.
 */
export interface CaptionWord {
  word: string;
  startMs: number;
  endMs: number;
  /** Token classification. Absent means a normal spoken word. */
  kind?: CaptionWordKind;
  /** ASR confidence in [0, 1] when the provider reports one. */
  confidence?: number;
}

/**
 * Word-level caption data carried directly by the media clip it transcribes
 * (the voiceover audio clip, or an imported audio/video clip). The transcript
 * document is projected from these words, and every text edit maps back to the
 * clip span the words index. A single fixed render style is used for the MVP,
 * so no style fields are persisted yet.
 */
export interface ClipCaption {
  words: CaptionWord[];
  /** Look of the caption layer. Absent means the built-in default style. */
  style?: CaptionStyle;
}

/**
 * Authored look of a caption layer. Every field is optional: an absent one
 * keeps the drawing default, so a caption written before styling existed
 * renders exactly as it did.
 */
export interface CaptionStyle {
  fontFamily?: string;
  /** Font size as a fraction of frame height. */
  fontSizeFrac?: number;
  /** Colour of inactive words. */
  color?: string;
  /** Colour of the word being spoken. */
  activeColor?: string;
  outline?: { color: string; widthPx: number };
  /** Distance from the frame bottom as a fraction of frame height. */
  bottomMarginFrac?: number;
  background?: { color: string; paddingPx: number; radiusPx?: number };
}

/**
 * Authored text drawn by a timeline text clip. Font size is in sequence
 * pixels, keeping preview and export independent of the editor's CSS scale.
 */
export interface ClipTextStyle {
  text: string;
  fontFamily?: string;
  fontSizePx: number;
  fontWeight?: number;
  color: string;
  align?: "left" | "center" | "right";
  maxWidthFrac?: number;
  /** `"normal"` (default) or `"italic"`. A plain string for forward compat. */
  fontStyle?: string;
  /** Extra advance between glyphs, in sequence px. Default 0. */
  letterSpacingPx?: number;
  /** Line advance as a multiple of the font size. Default 1.2. */
  lineHeight?: number;
  /** `"top" | "middle" | "bottom"`. Default `"middle"`. */
  verticalAlign?: string;
  /** Outline drawn under the fill. */
  stroke?: { color: string; widthPx: number };
  shadow?: { color: string; blurPx: number; offsetX: number; offsetY: number };
  /** Scrim drawn behind the wrapped block. */
  background?: { color: string; paddingPx: number; radiusPx?: number };
  /** Gradient fill. Wins over `color` when set. */
  fill?: ShapeFill;
}

/**
 * How a shape or a text run is filled. `solid` is the same thing a plain
 * colour string says; the gradients carry their stops in normalized 0..1
 * offsets so a fill is independent of the shape's size.
 */
export type ShapeFill =
  | { type: "solid"; color: string }
  | {
      type: "linear";
      /** Gradient axis in degrees, 0 = left→right. */
      angle: number;
      stops: { offset: number; color: string }[];
    }
  | { type: "radial"; stops: { offset: number; color: string }[] };

/**
 * Every geometry this build draws. `rect`, `ellipse` and `line` are rasterized
 * directly; the rest are drawn by the path renderer. Anything else parses and
 * rides through as an unknown kind (I2); the geometry builder returns no
 * outline for it, so the clip draws nothing, and the validator reports it as
 * `unknown_shape_kind`.
 */
export const CLIP_SHAPE_KINDS = [
  "rect",
  "ellipse",
  "line",
  "path",
  "polygon",
  "star"
] as const;

export type ClipShapeKind = (typeof CLIP_SHAPE_KINDS)[number];

/** Whether a document's shape `kind` names a geometry this build draws. */
export function isKnownShapeKind(kind: string): kind is ClipShapeKind {
  return (CLIP_SHAPE_KINDS as readonly string[]).includes(kind);
}

/** Authored vector-like geometry drawn by a rasterized shape clip. */
export interface ClipShapeStyle {
  /** Plain string for forward compat (I2) — see {@link CLIP_SHAPE_KINDS}. */
  kind: string;
  fill?: string;
  stroke?: string;
  strokeWidthPx?: number;
  /** Normalized canvas coordinates for the shape's bounds or line endpoints. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  /** SVG path data in normalized 0..1 space. `kind: "path"` only. */
  d?: string;
  /** Point count for `polygon` and `star`. */
  sides?: number;
  /** Inner radius as a fraction of the outer radius. `star` only. */
  innerRadius?: number;
  /** Corner rounding in normalized units. */
  cornerRadius?: number;
  /** Gradient or solid fill. Wins over `fill` when set. */
  fillStyle?: ShapeFill;
  /** Dash pattern in normalized units, as `ctx.setLineDash` takes it. */
  dash?: number[];
  /** `"butt" | "round" | "square"`. */
  lineCap?: string;
  /** `"miter" | "round" | "bevel"`. */
  lineJoin?: string;
  /** Stroke the sub-range `[trimStart, trimEnd]` of the path, 0..1. Animatable. */
  trimStart?: number;
  trimEnd?: number;
}

/**
 * One line of the Studio transcript. Each line owns the clips generated from
 * it (`clipIds` — typically a voiceover audio clip and a caption clip).
 * `beatStartMs` is the line's position on the timeline, recomputed whenever
 * beats are added, removed, reordered, or re-flowed.
 */
export interface TranscriptLine {
  id: string;
  text: string;
  beatStartMs: number;
  clipIds: string[];
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

/**
 * What a clip draws. `"group"` carries no media: it is a transform parent its
 * children name with `parentId` (see {@link TimelineClip.parentId}).
 */
export type ClipMediaType =
  | "image"
  | "video"
  | "audio"
  | "overlay"
  | "text"
  | "shape"
  | "group";

export interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  startMs: number;
  durationMs: number;
  inPointMs?: number;
  outPointMs?: number;
  mediaType: ClipMediaType;
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
  /**
   * Speaker label for transcript-bearing clips, from ASR diarization or set
   * manually. Drives per-paragraph speaker headers in the transcript editor.
   */
  speaker?: string;
  /**
   * Groups transcript clips that should read as a single paragraph. Set to the
   * clip's own id when a beat or import is created; `splitClip` copies it, so
   * the two halves of an interior word-deletion (or filler removal) keep
   * reading as one paragraph while distinct authored beats stay separate.
   */
  paragraphId?: string;
  /** Source clip for image-to-image. Reads the source clip's currentAssetId at submit time. */
  sourceClipId?: string | null;
  /**
   * Links this clip to one or more sibling clips. Clips sharing a `linkId`
   * move and trim together (e.g. a video clip and the audio extracted from it).
   * Cleared by "Unlink", or automatically when a link group drops below two
   * members. Independent from `sourceClipId` (image-to-image).
   */
  linkId?: string;
  width?: number;
  height?: number;
  /** Direct-gen video: target aspect ratio, e.g. "16:9". */
  aspectRatio?: string;
  /** Direct-gen video: target resolution tier, e.g. "720p". */
  resolution?: string;
  strength?: number;
  numInferenceSteps?: number;
  seed?: number;
  dependencyHash?: string;
  lastGeneratedHash?: string;
  currentAssetId?: string;
  thumbnailAssetId?: string;
  waveformAssetId?: string;
  /**
   * Storyboard provenance: the board/shot this clip was assembled from.
   * Lets a shot revision on the storyboard round-trip into the cut (the
   * revised clip asset replaces this clip's currentAssetId). Both fields must
   * also exist on the protocol zod schema or PATCH would strip them.
   */
  storyboardBoardId?: string;
  storyboardShotId?: string;
  /**
   * Script provenance: the script/line this voiceover clip was assembled from.
   * Lets a re-voiced line round-trip its new take into the assembled sequence
   * (the take asset replaces this clip's currentAssetId, duration, caption).
   * Both fields must also exist on the protocol zod schema or PATCH strips them.
   */
  scriptId?: string;
  scriptLineId?: string;
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
  /**
   * Word-level caption data carried by the media clip it transcribes — the
   * voiceover audio clip, or an imported audio/video clip. When set, the clip
   * contributes a caption layer (drawn on top) in both the live preview and
   * the export, in addition to any visual media it draws. The transcript
   * editor projects its document from these words.
   */
  caption?: ClipCaption;
  /** Authored content for a rasterized text clip. */
  textStyle?: ClipTextStyle;
  /** Authored geometry for a rasterized shape clip. */
  shapeStyle?: ClipShapeStyle;
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
  /**
   * Motion-design animations evaluated at render time (see
   * `animation/`). Evaluation is order-independent (the fold is commutative —
   * see `animation/sample.ts`); array order is presentation order in the UI
   * only. Must also exist on the protocol zod schema or PATCH would strip it.
   */
  animations?: ClipAnimation[];
  /**
   * Group this clip belongs to. The parent's transform composes with this
   * clip's, its opacity multiplies, and its window clips this one. Must name a
   * clip with `mediaType: "group"`; a missing or cyclic parent is a validator
   * error and renders unparented.
   */
  parentId?: string;
  /** Shape mask applied to this layer before it is blended. */
  mask?: ClipMask;
  /** Track matte: another clip's alpha or luma drives this layer's alpha. */
  matte?: ClipMatte;
  /** Retime the clip's source. Replaces `speedMultiplier` when set. */
  timeRemap?: ClipTimeRemap;
  /** Composition provenance, stamped by `insert_composition`. */
  compositionId?: string;
  /** Parameter values the composition was instantiated with. */
  compositionParams?: Record<string, number | string | boolean>;
}

/**
 * A shape mask on one clip, in the layer's own normalized 0..1 space so it
 * rotates and scales with the layer. `kind` is a plain string for the same
 * forward compat `preset` has: an unknown kind parses and is skipped.
 */
export interface ClipMask {
  /** `"rect" | "ellipse" | "path"`. */
  kind: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** SVG path data in normalized 0..1 space. `kind: "path"` only. */
  d?: string;
  /** Feathered edge width in source px. 0 = hard edge. */
  featherPx?: number;
  /** Keep what the mask excludes instead of what it covers. */
  invert?: boolean;
}

/**
 * Track matte: `sourceClipId` names the clip whose pixels drive this layer's
 * alpha. A matte source never draws itself.
 */
export interface ClipMatte {
  sourceClipId: string;
  /** `"alpha" | "luma"`. */
  mode: string;
  invert?: boolean;
}

/**
 * Retimes a clip's source. `t` is normalized 0..1 over the clip's own window
 * and must ascend; `sourceMs` may descend, which is reverse playback. A clip
 * carrying a remap cannot be split or trimmed until it is baked.
 */
export interface ClipTimeRemap {
  keyframes: { t: number; sourceMs: number; easing?: string }[];
}

/**
 * Per-clip incoming transition, resolved for both the incoming clip and the
 * outgoing clip it overlaps on the same track. `easing` takes the same string
 * grammar animations take; an unparseable one falls back to linear.
 */
export type ClipTransition = KnownClipTransition | UnknownClipTransition;

/** The cuts this build draws, each spelled out field by field. */
export type KnownClipTransition =
  | ClipCrossfadeTransition
  | ClipDipToColorTransition
  | ClipWipeTransition
  | ClipPushTransition
  | ClipSlideTransition
  | ClipZoomTransition;

/**
 * A cut whose `type` this build does not draw, carried rather than refused
 * (I2). `resolveTransition` cross-fades it and the validator reports
 * `unknown_transition`; the fields the authoring build wrote survive the round
 * trip under the index signature, so saving the document does not strip them.
 *
 * Its `type` is a plain `string`, so a `type === "wipe"` test narrows this
 * member in too. Readers that want a field only some types carry check the
 * value with `typeof` rather than trusting the narrowing.
 */
export interface UnknownClipTransition {
  type: string;
  durationMs: number;
  easing?: string;
  [key: string]: unknown;
}

export interface ClipCrossfadeTransition {
  type: "crossfade";
  /** Length of the cross-fade in milliseconds. */
  durationMs: number;
  easing?: string;
}

/** Both clips fade through a solid colour that peaks at the midpoint. */
export interface ClipDipToColorTransition {
  type: "dipToColor";
  durationMs: number;
  color: string;
  easing?: string;
}

/** The incoming clip is revealed behind a feathered edge. */
export interface ClipWipeTransition {
  type: "wipe";
  durationMs: number;
  /** Edge the reveal starts from: `"left" | "right" | "up" | "down"`. */
  direction: string;
  /** Feathered edge width as a fraction of the wipe axis. 0 = hard edge. */
  softness?: number;
  easing?: string;
}

/** The incoming clip pushes the outgoing one off the frame. */
export interface ClipPushTransition {
  type: "push";
  durationMs: number;
  direction: string;
  easing?: string;
}

/** The incoming clip slides in over a stationary outgoing one. */
export interface ClipSlideTransition {
  type: "slide";
  durationMs: number;
  direction: string;
  easing?: string;
}

/** The outgoing clip scales up while the incoming one scales in. */
export interface ClipZoomTransition {
  type: "zoom";
  durationMs: number;
  easing?: string;
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

/**
 * Effects a clip applies in order. Every member carries `id` and `enabled`:
 * the compositor filters the chain on `enabled` and pools intermediates per
 * effect, so both are part of the union's shared shape.
 */
export type ClipEffect = KnownClipEffect | UnknownClipEffect;

/** The effects this build applies, each spelled out field by field. */
export type KnownClipEffect =
  | ClipColorEffect
  | ClipBlurEffect
  | ClipGlowEffect
  | ClipDropShadowEffect
  | ClipVignetteEffect
  | ClipSharpenEffect
  | ClipChromaKeyEffect
  | ClipCurvesEffect
  | ClipLevelsEffect
  | ClipLiftGammaGainEffect;

/**
 * An effect whose `type` this build does not apply, carried rather than
 * refused (I2). `id` and `enabled` are the shared shape every compositor
 * addresses the chain by; the parameters the authoring build wrote survive the
 * round trip under the index signature. Canvas 2D already names an
 * unapplied type in `unsupportedEffectTypes`, so it is reported, not dropped.
 *
 * As with {@link UnknownClipTransition}, its `type` is a plain `string`: a
 * `type === "blur"` test does not exclude this member, so the narrowing
 * predicates below are what readers use to reach a known effect's fields.
 */
export interface UnknownClipEffect {
  id: string;
  type: string;
  enabled: boolean;
  [key: string]: unknown;
}

/**
 * Narrow the chain to one known effect type. A plain `e.type === "color"` no
 * longer does it: {@link UnknownClipEffect} carries a `string` type, so it
 * survives that test and its index signature turns every field read into
 * `unknown`. These predicates keep the reads typed.
 */
export const isClipColorEffect = (e: ClipEffect): e is ClipColorEffect =>
  e.type === "color";

export const isClipBlurEffect = (e: ClipEffect): e is ClipBlurEffect =>
  e.type === "blur";

export const isClipGlowEffect = (e: ClipEffect): e is ClipGlowEffect =>
  e.type === "glow";

export const isClipDropShadowEffect = (
  e: ClipEffect
): e is ClipDropShadowEffect => e.type === "dropShadow";

export const isClipVignetteEffect = (e: ClipEffect): e is ClipVignetteEffect =>
  e.type === "vignette";

export const isClipSharpenEffect = (e: ClipEffect): e is ClipSharpenEffect =>
  e.type === "sharpen";

export const isClipChromaKeyEffect = (
  e: ClipEffect
): e is ClipChromaKeyEffect => e.type === "chromaKey";

export const isClipCurvesEffect = (e: ClipEffect): e is ClipCurvesEffect =>
  e.type === "curves";

export const isClipLevelsEffect = (e: ClipEffect): e is ClipLevelsEffect =>
  e.type === "levels";

export const isClipLiftGammaGainEffect = (
  e: ClipEffect
): e is ClipLiftGammaGainEffect => e.type === "liftGammaGain";

/**
 * Effect types this build applies. Anything else parses and rides through as an
 * {@link UnknownClipEffect} (I2); the validator reports it as `unknown_effect`
 * and Canvas 2D names it in `unsupportedEffectTypes`.
 */
export const CLIP_EFFECT_TYPES = [
  "color",
  "blur",
  "glow",
  "dropShadow",
  "vignette",
  "sharpen",
  "chromaKey",
  "curves",
  "levels",
  "liftGammaGain"
] as const;

export type ClipEffectType = (typeof CLIP_EFFECT_TYPES)[number];

/** Narrow a document's effect `type` to one this build applies, or `null`. */
export function parseClipEffectType(type: string): ClipEffectType | null {
  return (CLIP_EFFECT_TYPES as readonly string[]).includes(type)
    ? (type as ClipEffectType)
    : null;
}

/** One control point of a tone curve. Both axes are normalized 0..1. */
export interface CurvePoint {
  x: number;
  y: number;
}

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

export interface ClipGlowEffect {
  id: string;
  type: "glow";
  enabled: boolean;
  /** Bloom radius in source pixels. */
  radius: number;
  /** Bloom strength, 0..2 typical. */
  intensity: number;
  /** Tint of the bloom. Defaults to the source colour. */
  color?: string;
}

export interface ClipDropShadowEffect {
  id: string;
  type: "dropShadow";
  enabled: boolean;
  /** Offset in source pixels. */
  offsetX: number;
  offsetY: number;
  /** Shadow blur radius in source pixels. */
  blur: number;
  color: string;
  /** 0..1, default 1. */
  opacity?: number;
}

export interface ClipVignetteEffect {
  id: string;
  type: "vignette";
  enabled: boolean;
  /** 0..1. */
  amount: number;
  /** Falloff width, 0..1. */
  softness: number;
  /**
   * Outer radius relative to the frame half-diagonal, 0.1..1.5. Absent means
   * `vignette@1`'s own default, which is where a clip vignette has always
   * started. Written by the track conversion, which carries a midpoint the
   * legacy spelling made mandatory.
   */
  radius?: number;
}

export interface ClipSharpenEffect {
  id: string;
  type: "sharpen";
  enabled: boolean;
  /** 0..2 typical. */
  amount: number;
  /** Unsharp-mask radius in source pixels. */
  radius?: number;
  /**
   * Edge threshold 0..1. Absent means `filters.sharpen.unsharpMask@1`'s own
   * default. Same provenance as {@link ClipVignetteEffect.radius}.
   */
  threshold?: number;
}

export interface ClipChromaKeyEffect {
  id: string;
  type: "chromaKey";
  enabled: boolean;
  /** Key colour as `#rrggbb`. */
  color: string;
  /** Match tolerance 0..1. */
  tolerance: number;
  /** Edge softness 0..1. */
  softness: number;
  /** Spill suppression 0..1. */
  spill?: number;
}

export interface ClipCurvesEffect {
  id: string;
  type: "curves";
  enabled: boolean;
  /** Luminance curve applied to every channel. */
  master: CurvePoint[];
  r?: CurvePoint[];
  g?: CurvePoint[];
  b?: CurvePoint[];
}

export interface ClipLevelsEffect {
  id: string;
  type: "levels";
  enabled: boolean;
  /** Input black/white points, 0..1. */
  inBlack: number;
  inWhite: number;
  /** Midtone gamma. 1 = unchanged. */
  gamma: number;
  /** Output black/white points, 0..1. */
  outBlack: number;
  outWhite: number;
}

export interface ClipLiftGammaGainEffect {
  id: string;
  type: "liftGammaGain";
  enabled: boolean;
  /** Per-channel RGB triples. */
  lift: [number, number, number];
  gamma: [number, number, number];
  gain: [number, number, number];
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
