import { z } from "zod";
import { BLEND_MODE_TUPLE } from "../blend-modes.js";

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
  endMs: z.number(),
  /** Token classification; absent means a normal spoken word. Without this
   * field Zod strips it on every PATCH, so filler-word removal — which reads
   * `kind` — stops finding anything after one save. */
  kind: z.enum(["word", "filler", "pause"]).optional(),
  /** ASR confidence 0..1. Without this field Zod strips it on every PATCH. */
  confidence: z.number().min(0).max(1).optional()
});
export type CaptionWord = z.infer<typeof captionWord>;

/**
 * Authored look of a caption layer. Every field is optional: an absent one
 * keeps the drawing default, so a caption written before styling existed
 * renders exactly as it did.
 */
export const captionStyle = z.object({
  fontFamily: z.string().optional(),
  fontSizeFrac: z.number().optional(),
  color: z.string().optional(),
  activeColor: z.string().optional(),
  outline: z.object({ color: z.string(), widthPx: z.number() }).optional(),
  bottomMarginFrac: z.number().optional(),
  background: z
    .object({
      color: z.string(),
      paddingPx: z.number(),
      radiusPx: z.number().optional()
    })
    .optional()
});
export type CaptionStyle = z.infer<typeof captionStyle>;

/**
 * Word-level caption data carried by a caption clip. Sourced from the
 * transcription of the beat's voiceover. A single fixed render style is used
 * for the MVP, so no style fields are persisted yet.
 */
export const clipCaption = z.object({
  words: z.array(captionWord),
  /** Caption look. Without this field Zod strips it on every PATCH, so a
   * restyled caption reverts to the built-in look on the next save. */
  style: captionStyle.optional()
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

/**
 * Per-clip incoming transition. `easing` and `direction` are plain strings on
 * the wire for the same forward compat `preset` has: a value this build cannot
 * parse falls back rather than failing the document. Without the new members
 * Zod strips the whole `transitionIn` of any non-crossfade transition on every
 * PATCH, so the cut silently reverts to a hard one.
 */
const knownClipTransition = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("crossfade"),
    durationMs: z.number(),
    easing: z.string().optional()
  }),
  z.object({
    type: z.literal("dipToColor"),
    durationMs: z.number(),
    color: z.string(),
    easing: z.string().optional()
  }),
  z.object({
    type: z.literal("wipe"),
    durationMs: z.number(),
    direction: z.string(),
    softness: z.number().optional(),
    easing: z.string().optional()
  }),
  z.object({
    type: z.literal("push"),
    durationMs: z.number(),
    direction: z.string(),
    easing: z.string().optional()
  }),
  z.object({
    type: z.literal("slide"),
    durationMs: z.number(),
    direction: z.string(),
    easing: z.string().optional()
  }),
  z.object({
    type: z.literal("zoom"),
    durationMs: z.number(),
    easing: z.string().optional()
  })
]);

/**
 * Every transition `type` the members above spell out field by field. Exported
 * as a list so the agent tool schemas in `timeline-tool-params.ts` enumerate
 * the same cuts this schema stores — an enum written out twice drifts.
 */
export const KNOWN_TRANSITION_TYPE_LIST = [
  "crossfade",
  "dipToColor",
  "wipe",
  "push",
  "slide",
  "zoom"
] as const;
const KNOWN_TRANSITION_TYPES: ReadonlySet<string> = new Set(
  KNOWN_TRANSITION_TYPE_LIST
);

/**
 * A cut authored by a newer build (I2). The `refine` is what keeps the two
 * halves disjoint: a type one of the members above claims can never reach this
 * one, so `crossfade` with a string `durationMs` still fails rather than
 * sliding into the permissive branch. Everything past the shared shape rides
 * through untyped — dropping it here would lose the newer build's parameters
 * on the first save, which is the data loss `field_stripped` reports.
 */
const forwardClipTransition = z.looseObject({
  // `abort` is what keeps the failure legible: without it a bad field on a
  // known type leaves this the only branch Zod reports, so the error reads
  // "unknown type" about a type we ship.
  type: z.string().refine((type) => !KNOWN_TRANSITION_TYPES.has(type), {
    abort: true,
    error: (issue) =>
      `"${String(issue.input)}" is a transition type this build declares; it must match that type's own fields.`
  }),
  durationMs: z.number(),
  easing: z.string().optional()
});

export const clipTransition = z.union([
  knownClipTransition,
  forwardClipTransition
]);
export type ClipTransition = z.infer<typeof clipTransition>;
/** The cuts this build spells out field by field. */
export type KnownClipTransition = z.infer<typeof knownClipTransition>;
/** The catch-all a cut from a newer build lands in. */
export type UnknownClipTransition = z.infer<typeof forwardClipTransition>;

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

/** One control point of a tone curve. Both axes are normalized 0..1. */
export const curvePoint = z.object({ x: z.number(), y: z.number() });
export type CurvePoint = z.infer<typeof curvePoint>;

export const clipGlowEffect = z.object({
  id: z.string(),
  type: z.literal("glow"),
  enabled: z.boolean(),
  radius: z.number(),
  intensity: z.number(),
  color: z.string().optional()
});

export const clipDropShadowEffect = z.object({
  id: z.string(),
  type: z.literal("dropShadow"),
  enabled: z.boolean(),
  offsetX: z.number(),
  offsetY: z.number(),
  blur: z.number(),
  color: z.string(),
  opacity: z.number().optional()
});

export const clipVignetteEffect = z.object({
  id: z.string(),
  type: z.literal("vignette"),
  enabled: z.boolean(),
  amount: z.number(),
  softness: z.number()
});

export const clipSharpenEffect = z.object({
  id: z.string(),
  type: z.literal("sharpen"),
  enabled: z.boolean(),
  amount: z.number(),
  radius: z.number().optional()
});

export const clipChromaKeyEffect = z.object({
  id: z.string(),
  type: z.literal("chromaKey"),
  enabled: z.boolean(),
  color: z.string(),
  tolerance: z.number(),
  softness: z.number(),
  spill: z.number().optional()
});

export const clipCurvesEffect = z.object({
  id: z.string(),
  type: z.literal("curves"),
  enabled: z.boolean(),
  master: z.array(curvePoint),
  r: z.array(curvePoint).optional(),
  g: z.array(curvePoint).optional(),
  b: z.array(curvePoint).optional()
});

export const clipLevelsEffect = z.object({
  id: z.string(),
  type: z.literal("levels"),
  enabled: z.boolean(),
  inBlack: z.number(),
  inWhite: z.number(),
  gamma: z.number(),
  outBlack: z.number(),
  outWhite: z.number()
});

const rgbTriple = z.tuple([z.number(), z.number(), z.number()]);

export const clipLiftGammaGainEffect = z.object({
  id: z.string(),
  type: z.literal("liftGammaGain"),
  enabled: z.boolean(),
  lift: rgbTriple,
  gamma: rgbTriple,
  gain: rgbTriple
});

/**
 * The clip effect chain. Without the members below Zod drops any effect whose
 * type it does not carry on every PATCH, so a graded clip loses that step of
 * its chain on the next save.
 */
const knownClipEffect = z.discriminatedUnion("type", [
  clipColorEffect,
  clipBlurEffect,
  clipGlowEffect,
  clipDropShadowEffect,
  clipVignetteEffect,
  clipSharpenEffect,
  clipChromaKeyEffect,
  clipCurvesEffect,
  clipLevelsEffect,
  clipLiftGammaGainEffect
]);

/**
 * Every effect `type` the members above spell out field by field. Exported as
 * a list for the same reason {@link KNOWN_TRANSITION_TYPE_LIST} is.
 */
export const KNOWN_CLIP_EFFECT_TYPE_LIST = [
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
const KNOWN_CLIP_EFFECT_TYPES: ReadonlySet<string> = new Set(
  KNOWN_CLIP_EFFECT_TYPE_LIST
);

/**
 * An effect authored by a newer build (I2), same construction as
 * `forwardClipTransition`: the `refine` keeps this branch unreachable for a
 * type the members above claim, so their field validation is untouched, and
 * the parameters the newer build wrote ride through instead of being dropped
 * on the next save. `id` and `enabled` are required because the whole chain is
 * addressed and filtered by them.
 */
const forwardClipEffect = z.looseObject({
  id: z.string(),
  type: z.string().refine((type) => !KNOWN_CLIP_EFFECT_TYPES.has(type), {
    abort: true,
    error: (issue) =>
      `"${String(issue.input)}" is an effect type this build declares; it must match that type's own fields.`
  }),
  enabled: z.boolean()
});

export const clipEffect = z.union([knownClipEffect, forwardClipEffect]);
export type ClipEffect = z.infer<typeof clipEffect>;
/** The effects this build spells out field by field. */
export type KnownClipEffect = z.infer<typeof knownClipEffect>;
/** The catch-all an effect from a newer build lands in. */
export type UnknownClipEffect = z.infer<typeof forwardClipEffect>;

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
 * One keyframe of a baked custom-animation curve. `t` is normalized 0..1
 * within the animation window; `easing` names the segment ENDING at this
 * keyframe and is a plain string for the same forward compat as `preset`.
 */
export const animationKeyframe = z.object({
  t: z.number(),
  value: z.number(),
  easing: z.string().optional()
});
export type AnimationKeyframe = z.infer<typeof animationKeyframe>;

/**
 * One baked property curve. `property` is a plain string on the wire: a curve
 * naming a property this build does not animate parses fine and is dropped at
 * compile time, the same forward compat `preset` has.
 */
export const animationPropertyCurve = z.object({
  property: z.string(),
  keyframes: z.array(animationKeyframe)
});
export type AnimationPropertyCurve = z.infer<typeof animationPropertyCurve>;

/**
 * A custom animation: curves produced by a JS body rather than by a shipped
 * preset. The body runs ONCE, host-side in the QuickJS sandbox, and its
 * keyframes are baked in here — so playback, export, and the headless
 * compositor sample identical curves and no renderer needs a JS engine.
 *
 * `scriptId`/`code` are provenance: they say what produced `curves` so the
 * editor can re-bake, and are never executed at render time.
 */
export const customClipAnimation = z.object({
  /** JS script document (`js_scripts` row) the curves were baked from. */
  scriptId: z.string().optional(),
  /** Inline body the curves were baked from. */
  code: z.string().optional(),
  /** ISO timestamp of the bake that produced `curves`. */
  bakedAt: z.string().optional(),
  curves: z.array(animationPropertyCurve),
  /**
   * Required when a curve drives `wipeProgress`: direction and softness never
   * animate, so they ride here rather than on a curve.
   */
  mask: z
    .object({ direction: z.string(), softness: z.number() })
    .optional()
});
export type CustomClipAnimation = z.infer<typeof customClipAnimation>;

/**
 * `POST /api/timelines/animations/bake` — run a custom animation's JS body once
 * and get back the keyframes to store on the clip. Exactly one of `code` and
 * `script_id` names the body; the rest is the context the body reads off
 * `inputs` (see `buildCustomAnimationInputs` in `@nodetool-ai/timeline`).
 */
export const bakeCustomAnimationRequest = z
  .object({
    code: z.string().min(1).optional(),
    script_id: z.string().min(1).optional(),
    role: z.enum(["in", "out", "emphasis", "loop"]),
    duration_ms: z.number().positive(),
    clip_duration_ms: z.number().positive(),
    canvas: z.object({
      width: z.number().positive(),
      height: z.number().positive()
    }),
    params: z
      .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
      .optional(),
    stagger_count: z.number().int().nonnegative().optional(),
    sample_count: z.number().int().positive().optional()
  })
  .refine(
    (body) => (body.code === undefined) !== (body.script_id === undefined),
    { message: "Pass exactly one of `code` or `script_id`" }
  );
export type BakeCustomAnimationRequest = z.infer<
  typeof bakeCustomAnimationRequest
>;

export const bakeCustomAnimationResponse = z.object({
  ok: z.boolean(),
  /** Present only when `ok`. Store these under the animation's `custom`. */
  curves: z.array(animationPropertyCurve).optional(),
  mask: z.object({ direction: z.string(), softness: z.number() }).optional(),
  logs: z.array(z.string()),
  error: z.string().optional(),
  duration_ms: z.number()
});
export type BakeCustomAnimationResponse = z.infer<
  typeof bakeCustomAnimationResponse
>;

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
  params: z
    .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
    .optional(),
  /** Baked curves for a `"custom"` preset animation. Without this field Zod
   * strips it on every PATCH, silently reverting custom motion to nothing on
   * save. */
  custom: customClipAnimation.optional(),
  /** Per-word stagger on a text clip's animation. `unit` is a plain string on
   * the wire (only "word" is implemented; unknown units compile un-staggered)
   * for the same forward compat as `preset`. Without this field Zod strips it
   * on every PATCH, silently flattening staggered titles into block motion. */
  stagger: z
    .object({
      unit: z.string(),
      offsetMs: z.number(),
      from: z.enum(["start", "end", "center"]).optional()
    })
    .optional()
});
export type ClipAnimation = z.infer<typeof clipAnimation>;

/**
 * How a shape or a text run is filled. Stop offsets are normalized 0..1, so a
 * fill is independent of the shape's size.
 */
export const shapeFill = z.discriminatedUnion("type", [
  z.object({ type: z.literal("solid"), color: z.string() }),
  z.object({
    type: z.literal("linear"),
    angle: z.number(),
    stops: z.array(z.object({ offset: z.number(), color: z.string() }))
  }),
  z.object({
    type: z.literal("radial"),
    stops: z.array(z.object({ offset: z.number(), color: z.string() }))
  })
]);
export type ShapeFill = z.infer<typeof shapeFill>;

export const clipTextStyle = z.object({
  text: z.string(),
  fontFamily: z.string().optional(),
  fontSizePx: z.number(),
  fontWeight: z.number().optional(),
  color: z.string(),
  align: z.enum(["left", "center", "right"]).optional(),
  maxWidthFrac: z.number().optional(),
  /** Every field below is styling the rasterizer reads. Without them Zod
   * strips the styling on every PATCH, so a stroked, shadowed or backed title
   * reverts to plain fill on the next save. */
  fontStyle: z.string().optional(),
  letterSpacingPx: z.number().optional(),
  lineHeight: z.number().optional(),
  verticalAlign: z.string().optional(),
  stroke: z.object({ color: z.string(), widthPx: z.number() }).optional(),
  shadow: z
    .object({
      color: z.string(),
      blurPx: z.number(),
      offsetX: z.number(),
      offsetY: z.number()
    })
    .optional(),
  background: z
    .object({
      color: z.string(),
      paddingPx: z.number(),
      radiusPx: z.number().optional()
    })
    .optional(),
  fill: shapeFill.optional()
});
export type ClipTextStyle = z.infer<typeof clipTextStyle>;

export const clipShapeStyle = z.object({
  /** A plain string for forward compat (I2): a kind a newer build authored
   * parses and is skipped at render time — the geometry builder returns no
   * outline and the validator reports `unknown_shape_kind` — rather than
   * failing the whole document. */
  kind: z.string(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidthPx: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  /** Every field below is authored geometry. Without them Zod strips the
   * geometry on every PATCH, so a path, gradient, dash or trim reverts to a
   * plain filled box on the next save. */
  d: z.string().optional(),
  sides: z.number().optional(),
  innerRadius: z.number().optional(),
  cornerRadius: z.number().optional(),
  fillStyle: shapeFill.optional(),
  dash: z.array(z.number()).optional(),
  lineCap: z.string().optional(),
  lineJoin: z.string().optional(),
  trimStart: z.number().optional(),
  trimEnd: z.number().optional()
});
export type ClipShapeStyle = z.infer<typeof clipShapeStyle>;

/**
 * Shape mask on one clip, in the layer's own normalized 0..1 space. `kind` is
 * a plain string for forward compat: an unknown kind parses and is skipped at
 * render time rather than failing the document.
 */
export const clipMask = z.object({
  kind: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  d: z.string().optional(),
  featherPx: z.number().optional(),
  invert: z.boolean().optional()
});
export type ClipMask = z.infer<typeof clipMask>;

/** Track matte: another clip's alpha or luma drives this layer's alpha. */
export const clipMatte = z.object({
  sourceClipId: z.string(),
  mode: z.string(),
  invert: z.boolean().optional()
});
export type ClipMatte = z.infer<typeof clipMatte>;

/**
 * Retimes a clip's source. `t` is normalized 0..1 over the clip's window and
 * must ascend; `sourceMs` may descend, which is reverse playback.
 */
export const clipTimeRemap = z.object({
  keyframes: z.array(
    z.object({
      t: z.number(),
      sourceMs: z.number(),
      easing: z.string().optional()
    })
  )
});
export type ClipTimeRemap = z.infer<typeof clipTimeRemap>;

export const timelineClip = z.object({
  id: z.string(),
  trackId: z.string(),
  name: z.string(),
  startMs: z.number(),
  durationMs: z.number(),
  inPointMs: z.number().optional(),
  outPointMs: z.number().optional(),
  /** `"group"` carries no media: it is a transform parent children name with
   * `parentId`. Without it here Zod fails a document containing a group. */
  mediaType: z.enum([
    "image",
    "video",
    "audio",
    "overlay",
    "text",
    "shape",
    "group"
  ]),
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
  /** Script provenance (script→timeline assemble bridge). Without these
   * fields Zod strips them on every PATCH, breaking line→clip re-voice
   * round-trips. */
  scriptId: z.string().optional(),
  scriptLineId: z.string().optional(),
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
  textStyle: clipTextStyle.optional(),
  shapeStyle: clipShapeStyle.optional(),
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
  animations: z.array(clipAnimation).optional(),
  /** Group this clip is parented to. Without this field Zod strips it on every
   * PATCH, so autosave unparents every child of a group. */
  parentId: z.string().optional(),
  /** Shape mask. Without this field Zod strips it on every PATCH, so a masked
   * layer reverts to its full rectangle on the next save. */
  mask: clipMask.optional(),
  /** Track matte. Without this field Zod strips it on every PATCH, so the
   * matted layer reverts to opaque on the next save. */
  matte: clipMatte.optional(),
  /** Time remap. Without this field Zod strips it on every PATCH, so a
   * retimed or reversed clip plays back at its plain rate after one save. */
  timeRemap: clipTimeRemap.optional(),
  /** Composition provenance stamped by `insert_composition`. Without these
   * fields Zod strips them on every PATCH, so an instantiated composition
   * loses the link to its template and its parameter values. */
  compositionId: z.string().optional(),
  compositionParams: z
    .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
    .optional()
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
  /**
   * Client-supplied id. The caller mints it so the sequence is addressable
   * (agent tools, tab refs) before the create round-trip returns, and so a
   * retried create is idempotent rather than duplicating the sequence.
   */
  id: z.string().optional(),
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
  status: z
    .enum(["success", "failed", "cancelled"])
    .optional()
    .default("success")
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

// ── sequence version history (/api/timeline/:id/versions) ────────────────────

/**
 * How a snapshot came to exist. `restore` marks the snapshot taken of the
 * *pre-restore* state, so restoring is itself undoable.
 */
export const timelineVersionSaveType = z.enum([
  "manual",
  "autosave",
  "restore"
]);
export type TimelineVersionSaveType = z.infer<typeof timelineVersionSaveType>;

/**
 * Metadata for one snapshot. Deliberately carries no `document`: a timeline
 * document is large, and the history list renders from metadata alone.
 */
export const timelineVersionListItem = z.object({
  id: z.string(),
  timelineId: z.string(),
  version: z.number().int(),
  name: z.string().nullable().optional(),
  saveType: timelineVersionSaveType,
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  durationMs: z.number(),
  createdAt: z.string()
});
export type TimelineVersionListItem = z.infer<typeof timelineVersionListItem>;

/** One snapshot including the document it captured. */
export const timelineVersionResponse = timelineVersionListItem.extend({
  document: timelineDocument
});
export type TimelineVersionResponse = z.infer<typeof timelineVersionResponse>;

export const listTimelineVersionsInput = z.object({
  /** Timeline sequence whose history is read. */
  id: z.string(),
  limit: z.number().int().positive().max(500).optional(),
  saveType: timelineVersionSaveType.optional()
});
export type ListTimelineVersionsInput = z.infer<
  typeof listTimelineVersionsInput
>;

export const getTimelineVersionInput = z.object({
  id: z.string(),
  version: z.number().int()
});
export type GetTimelineVersionInput = z.infer<typeof getTimelineVersionInput>;

export const createTimelineVersionInput = z.object({
  id: z.string(),
  name: z.string().max(200).optional()
});
export type CreateTimelineVersionInput = z.infer<
  typeof createTimelineVersionInput
>;

export const restoreTimelineVersionInput = z.object({
  id: z.string(),
  version: z.number().int()
});
export type RestoreTimelineVersionInput = z.infer<
  typeof restoreTimelineVersionInput
>;

export const deleteTimelineVersionInput = z.object({
  id: z.string(),
  version: z.number().int()
});
export type DeleteTimelineVersionInput = z.infer<
  typeof deleteTimelineVersionInput
>;
