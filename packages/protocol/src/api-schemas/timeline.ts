import { z } from "zod";
import { BLEND_MODE_TUPLE } from "@nodetool-ai/gpu";

const blendModeEnum = z.enum(BLEND_MODE_TUPLE);

// ── Shared sub-schemas ───────────────────────────────────────────────────────

export const clipVersion = z.object({
  id: z.string(),
  createdAt: z.string(),
  jobId: z.string(),
  assetId: z.string(),
  workflowUpdatedAt: z.string(),
  dependencyHash: z.string(),
  paramOverridesSnapshot: z.record(z.string(), z.unknown()),
  costCredits: z.number().optional(),
  durationMs: z.number().optional(),
  status: z.enum(["success", "failed", "cancelled"]),
  favorite: z.boolean().optional()
});
export type ClipVersion = z.infer<typeof clipVersion>;

export const timelineMarker = z.object({
  id: z.string(),
  timeMs: z.number(),
  label: z.string(),
  color: z.string().optional(),
  note: z.string().optional()
});
export type TimelineMarker = z.infer<typeof timelineMarker>;

// ── Captions ─────────────────────────────────────────────────────────────────

/**
 * One word of a caption with its timing relative to the *clip start* (beat
 * local), not absolute timeline time. Keeping it clip-local means re-flowing a
 * beat (changing `clip.startMs`) never requires rewriting word timings.
 */
export const captionWord = z.object({
  word: z.string(),
  startMs: z.number(),
  endMs: z.number()
});
export type CaptionWord = z.infer<typeof captionWord>;

/**
 * Word-level caption data carried by a caption clip. Sourced from the
 * transcription of the beat's voiceover. A single fixed render style is used
 * for the MVP, so no style fields are persisted yet.
 */
export const clipCaption = z.object({
  words: z.array(captionWord)
});
export type ClipCaption = z.infer<typeof clipCaption>;

// ── Transcript (Studio) ────────────────────────────────────────────────────

/**
 * One line of the Studio transcript. Each line owns the clips generated from
 * it (`clipIds` — typically a voiceover audio clip and a caption clip).
 * `beatStartMs` is the line's position on the timeline, recomputed whenever
 * beats are added, removed, reordered, or re-flowed.
 */
export const transcriptLine = z.object({
  id: z.string(),
  text: z.string(),
  beatStartMs: z.number(),
  clipIds: z.array(z.string())
});
export type TranscriptLine = z.infer<typeof transcriptLine>;

// ── Track DSP effects ────────────────────────────────────────────────────────

export const trackGainEffect = z.object({
  id: z.string(),
  type: z.literal("gain"),
  enabled: z.boolean(),
  gainDb: z.number()
});

export const trackEq3Effect = z.object({
  id: z.string(),
  type: z.literal("eq3"),
  enabled: z.boolean(),
  lowFreq: z.number(),
  lowGainDb: z.number(),
  midFreq: z.number(),
  midQ: z.number(),
  midGainDb: z.number(),
  highFreq: z.number(),
  highGainDb: z.number()
});

export const trackFilterEffect = z.object({
  id: z.string(),
  type: z.literal("filter"),
  enabled: z.boolean(),
  mode: z.enum(["lowpass", "highpass", "bandpass"]),
  frequency: z.number(),
  q: z.number()
});

export const trackCompressorEffect = z.object({
  id: z.string(),
  type: z.literal("compressor"),
  enabled: z.boolean(),
  thresholdDb: z.number(),
  ratio: z.number(),
  attackMs: z.number(),
  releaseMs: z.number(),
  kneeDb: z.number()
});

// ── Track video effects ──────────────────────────────────────────────────────

export const trackColorCorrectionEffect = z.object({
  id: z.string(),
  type: z.literal("colorCorrection"),
  enabled: z.boolean(),
  brightness: z.number(),
  contrast: z.number(),
  saturation: z.number(),
  hue: z.number(),
  temperature: z.number(),
  tint: z.number(),
  shadows: z.number(),
  highlights: z.number()
});

export const trackVideoBlurEffect = z.object({
  id: z.string(),
  type: z.literal("videoBlur"),
  enabled: z.boolean(),
  radius: z.number()
});

export const trackSharpenEffect = z.object({
  id: z.string(),
  type: z.literal("sharpen"),
  enabled: z.boolean(),
  amount: z.number(),
  threshold: z.number()
});

export const trackVignetteEffect = z.object({
  id: z.string(),
  type: z.literal("vignette"),
  enabled: z.boolean(),
  intensity: z.number(),
  radius: z.number(),
  softness: z.number()
});

export const trackChromaKeyEffect = z.object({
  id: z.string(),
  type: z.literal("chromaKey"),
  enabled: z.boolean(),
  keyColor: z.string(),
  tolerance: z.number(),
  softness: z.number(),
  spill: z.number()
});

export const trackEffect = z.discriminatedUnion("type", [
  trackGainEffect,
  trackEq3Effect,
  trackFilterEffect,
  trackCompressorEffect,
  trackColorCorrectionEffect,
  trackVideoBlurEffect,
  trackSharpenEffect,
  trackVignetteEffect,
  trackChromaKeyEffect
]);
export type TrackEffect = z.infer<typeof trackEffect>;

export const timelineTrack = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["video", "audio", "overlay", "subtitle"]),
  index: z.number().int(),
  visible: z.boolean(),
  locked: z.boolean(),
  muted: z.boolean().optional(),
  solo: z.boolean().optional(),
  heightPx: z.number().optional(),
  effects: z.array(trackEffect).optional()
});
export type TimelineTrack = z.infer<typeof timelineTrack>;

// ── Per-clip placement, transitions, and GPU effects ─────────────────────────

export const clipTransform = z.object({
  position: z.object({ x: z.number(), y: z.number() }),
  scale: z.object({ x: z.number(), y: z.number() }),
  rotation: z.number(),
  anchor: z.object({ x: z.number(), y: z.number() })
});
export type ClipTransform = z.infer<typeof clipTransform>;

export const clipTransition = z.discriminatedUnion("type", [
  z.object({ type: z.literal("crossfade"), durationMs: z.number() })
]);
export type ClipTransition = z.infer<typeof clipTransition>;

export const clipColorEffect = z.object({
  id: z.string(),
  type: z.literal("color"),
  enabled: z.boolean(),
  brightness: z.number().optional(),
  contrast: z.number().optional(),
  saturation: z.number().optional(),
  hue: z.number().optional(),
  temperature: z.number().optional(),
  tint: z.number().optional(),
  shadows: z.number().optional(),
  highlights: z.number().optional()
});

export const clipBlurEffect = z.object({
  id: z.string(),
  type: z.literal("blur"),
  enabled: z.boolean(),
  radius: z.number(),
  sigma: z.number().optional()
});

export const clipEffect = z.discriminatedUnion("type", [
  clipColorEffect,
  clipBlurEffect
]);
export type ClipEffect = z.infer<typeof clipEffect>;

export const clipBindingKind = z.enum([
  "workflow",
  "text-to-image",
  "image-to-image",
  "text-to-video",
  "text-to-audio"
]);
export type ClipBindingKind = z.infer<typeof clipBindingKind>;

// ── Motion-design animations ─────────────────────────────────────────────────

/**
 * One motion-design animation attached to a clip. `preset` and `easing` are
 * plain strings on the wire by design (forward compat): a document saved by a
 * newer client may carry ids this build doesn't know — they parse fine and are
 * skipped at compile time. Validation of preset/role is the engine's job, not
 * the schema's. Without this field on the clip schema Zod would strip
 * `animations` on every PATCH, silently losing motion on save.
 */
export const clipAnimation = z.object({
  id: z.string(),
  role: z.enum(["in", "out", "emphasis", "loop"]),
  preset: z.string(),
  durationMs: z.number(),
  delayMs: z.number().optional(),
  easing: z.string().optional(),
  enabled: z.boolean().optional(),
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional()
});
export type ClipAnimation = z.infer<typeof clipAnimation>;

export const timelineClip = z
  .object({
    id: z.string(),
    trackId: z.string(),
    name: z.string(),
    startMs: z.number(),
    durationMs: z.number(),
    inPointMs: z.number().optional(),
    outPointMs: z.number().optional(),
    mediaType: z.enum(["image", "video", "audio", "overlay"]),
    sourceType: z.enum(["imported", "generated"]),
    bindingKind: clipBindingKind.optional(),
    workflowId: z.string().optional(),
    selectedOutputNodeId: z.string().optional(),
    paramOverrides: z.record(z.string(), z.unknown()).optional(),
    prompt: z.string().optional(),
    negativePrompt: z.string().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    /** TTS voice id for `text-to-audio` direct-gen clips. */
    voice: z.string().optional(),
    sourceClipId: z.string().nullable().optional(),
    /** Shared id linking a video clip to its auto-extracted audio clip so they
     * move/trim together. Without this field Zod strips it on every PATCH, so
     * autosave/reload silently breaks the link. */
    linkId: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    strength: z.number().optional(),
    numInferenceSteps: z.number().optional(),
    seed: z.number().optional(),
    dependencyHash: z.string().optional(),
    lastGeneratedHash: z.string().optional(),
    currentAssetId: z.string().optional(),
    thumbnailAssetId: z.string().optional(),
    waveformAssetId: z.string().optional(),
    /** Storyboard provenance (assemble bridge). Without these fields Zod
     * strips them on every PATCH, breaking shot→clip revision round-trips. */
    storyboardBoardId: z.string().optional(),
    storyboardShotId: z.string().optional(),
    status: z.enum([
      "draft",
      "queued",
      "generating",
      "generated",
      "stale",
      "failed",
      "locked",
      "missing"
    ]),
    locked: z.boolean(),
    muted: z.boolean().optional(),
    hidden: z.boolean().optional(),
    versions: z.array(clipVersion),
    opacity: z.number().optional(),
    blendMode: blendModeEnum.optional(),
    speedMultiplier: z.number().optional(),
    speedBaked: z.boolean().optional(),
    volumeDb: z.number().optional(),
    fadeInMs: z.number().optional(),
    fadeOutMs: z.number().optional(),
    transform: clipTransform.optional(),
    borderRadius: z.number().optional(),
    effects: z.array(clipEffect).optional(),
    transitionIn: clipTransition.optional(),
    /** Word-level caption data; present only on caption clips. Without this
     * field Zod strips it on every PATCH, so autosave erases captions. */
    caption: clipCaption.optional(),
    /** Speaker label for transcript clips. Without this field Zod strips it on
     * every PATCH, so autosave erases the speaker. */
    speaker: z.string().optional(),
    /** Paragraph grouping id for transcript clips. Without this field Zod strips
     * it on every PATCH, so autosave silently breaks paragraph grouping. */
    paragraphId: z.string().optional(),
    /** Motion-design animations. Without this field Zod strips it on every
     * PATCH, so autosave erases animations. */
    animations: z.array(clipAnimation).optional()
  });
export type TimelineClip = z.infer<typeof timelineClip>;

export const timelineDocument = z.object({
  tracks: z.array(timelineTrack),
  clips: z.array(timelineClip),
  markers: z.array(timelineMarker),
  transcript: z.array(transcriptLine).optional(),
  scriptEnabled: z.boolean().optional()
});
export type TimelineDocument = z.infer<typeof timelineDocument>;

// ── Sequence response ────────────────────────────────────────────────────────

export const timelineSequenceResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  workflowId: z.string().optional(),
  name: z.string(),
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  durationMs: z.number(),
  tracks: z.array(timelineTrack),
  clips: z.array(timelineClip),
  markers: z.array(timelineMarker),
  transcript: z.array(transcriptLine).optional(),
  scriptEnabled: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type TimelineSequenceResponse = z.infer<typeof timelineSequenceResponse>;

// Minimal list item (id, name, updatedAt only)
export const timelineSequenceListItem = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  updatedAt: z.string()
});
export type TimelineSequenceListItem = z.infer<typeof timelineSequenceListItem>;

// ── create (POST /api/timeline) ──────────────────────────────────────────────

export const createTimelineInput = z.object({
  name: z.string().min(1),
  projectId: z.string().min(1),
  fps: z.number().int().min(1).optional().default(30),
  width: z.number().int().min(1).optional().default(1920),
  height: z.number().int().min(1).optional().default(1080)
});
export type CreateTimelineInput = z.infer<typeof createTimelineInput>;

// ── patch (PATCH /api/timeline/:id) ─────────────────────────────────────────

export const patchTimelineInput = z
  .object({
    name: z.string().min(1).optional(),
    fps: z.number().int().min(1).optional(),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
    document: timelineDocument.optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field is required"
  });
export type PatchTimelineInput = z.infer<typeof patchTimelineInput>;

// ── append clip version (POST /api/timeline/:id/clips/:clipId/versions) ──────

export const appendClipVersionInput = z.object({
  jobId: z.string(),
  assetId: z.string(),
  dependencyHash: z.string(),
  workflowUpdatedAt: z.string(),
  paramOverridesSnapshot: z.record(z.string(), z.unknown()).optional(),
  costCredits: z.number().optional(),
  durationMs: z.number().optional(),
  status: z.enum(["success", "failed", "cancelled"]).optional().default("success")
});
export type AppendClipVersionInput = z.infer<typeof appendClipVersionInput>;

// ── create clip (POST /api/timeline/:id/clips) ────────────────────────────────

export const createClipInput = z.object({
  /** Timeline sequence that will own the clip. */
  id: z.string(),
  trackId: z.string(),
  startMs: z.number().int().min(0),
  /** The source workflow the clip will run. The clip references it directly; no clone is created. */
  sourceWorkflowId: z.string(),
  /**
   * Override which terminal node's output becomes the clip's media.
   * Required when the source workflow has multiple terminal output nodes;
   * optional (server auto-picks) when there is exactly one.
   */
  selectedOutputNodeId: z.string().optional(),
  /** If placed on an overlay track, pass `"overlay"` to override mediaType. */
  mediaTypeOverride: z.enum(["overlay"]).optional()
});
export type CreateClipInput = z.infer<typeof createClipInput>;

/** Response shape returned by `timeline.clips.create`. */
export const timelineClipResponse = timelineClip;
export type TimelineClipResponse = z.infer<typeof timelineClipResponse>;
