/**
 * Parameter schemas for the timeline agent tools, shared by every surface that
 * exposes them.
 *
 * Three hosts drive the same `ui_timeline_*` contract: the headless bridge in
 * `packages/agents/src/evals/surfaces/timeline.ts` (which `edit_timeline`
 * dispatches its ops to), the browser tools in
 * `web/src/lib/tools/builtin/timeline.ts`, and the live editor's handler.
 * Invariant I11 says they share one implementation; the field lists below are
 * the half a copy-paste twin gets wrong. `textStyle`, `shapeStyle` and
 * `captionStyle` were each written out three times and each copy fell behind
 * the renderer — a stroked title or a dashed path was expressible in the
 * document and unreachable from a tool call.
 *
 * So the style bags are the document schemas themselves: what a tool accepts
 * is exactly what a save stores (I1), and a field added to `timeline.ts` is
 * reachable from every surface the same day. The flat bags — a transition, a
 * mask, an effect — cannot be the document schema, because a tool call sends
 * one object rather than a union member; those enumerate their types from the
 * document schema's own lists and narrow through the `build*` helpers here, so
 * a field the named type does not read is never stored to be stripped later.
 */

import { z } from "zod";
import {
  captionStyle,
  clipShapeStyle,
  clipTextStyle,
  KNOWN_CLIP_EFFECT_TYPE_LIST,
  KNOWN_TRANSITION_TYPE_LIST,
  type ClipMask,
  type KnownClipEffect,
  type KnownClipTransition
} from "./timeline.js";

/** How every clip-addressing tool names its target. */
export const targetParam = z
  .string()
  .describe(
    'Clip id, clip name (case-insensitive), or the literal "selected" for the currently-selected clip.'
  );

// ── Style bags ──────────────────────────────────────────────────────────────

/**
 * Attach one-line notes to a document schema's fields for the model reading the
 * tool. A note naming a field the schema does not have throws at import, so a
 * note cannot outlive the field it describes — which is the same drift this
 * module exists to stop, one level down.
 */
export function withFieldNotes<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  notes: Partial<Record<keyof T & string, string>>
): z.ZodObject<T> {
  // Safety: a `ZodObject<T>`'s shape is `T`, whose values are schemas; through
  // the generic parameter TypeScript only sees the core constraint, which
  // carries no `describe`.
  const shape = schema.shape as unknown as Record<string, z.ZodType>;
  const next: Record<string, z.ZodType> = { ...shape };
  for (const [field, note] of Object.entries(notes)) {
    if (!(field in shape) || note === undefined) {
      throw new Error(
        `timeline tool params: no field "${field}" to describe (have: ${Object.keys(shape).join(", ")}).`
      );
    }
    next[field] = next[field].describe(note);
  }
  // Safety: every entry of `next` is the schema's own field with a description
  // attached — `describe` returns the same type it was called on — so the
  // rebuilt object has `T`'s shape. TypeScript loses that through the
  // string-keyed record the loop needs.
  return z.object(next) as unknown as z.ZodObject<T>;
}

/** A text clip's whole authored look, as `set_clip_params` replaces it. */
export const textStyleParams = withFieldNotes(clipTextStyle, {
  fontSizePx: "Font size in sequence pixels, not CSS pixels.",
  fontStyle: '"normal" (default) or "italic".',
  letterSpacingPx: "Extra advance between glyphs, in sequence px. Default 0.",
  lineHeight: "Line advance as a multiple of the font size. Default 1.2.",
  verticalAlign: '"top", "middle" (default) or "bottom".',
  maxWidthFrac: "Wrap width as a fraction of frame width.",
  stroke: "Outline drawn under the fill.",
  shadow: "Drop shadow behind the glyphs.",
  background: "Scrim drawn behind the wrapped block.",
  fill: "Gradient fill. Wins over `color` when set."
});

/**
 * The same look on `add_text_clip`, where the words come from `text` and every
 * remaining field falls back to a drawing default.
 */
export const partialTextStyleParams = textStyleParams
  .omit({ text: true })
  .partial();

/** A shape clip's geometry and fill. */
export const shapeStyleParams = withFieldNotes(clipShapeStyle, {
  x: "Left edge (or the line's first point), 0..1 of frame width.",
  y: "Top edge (or the line's first point), 0..1 of frame height.",
  width: "Width, 0..1 of frame width.",
  height: "Height, 0..1 of frame height.",
  x2: 'kind "line" only: the second point, 0..1 of frame width.',
  y2: 'kind "line" only: the second point, 0..1 of frame height.',
  d: 'kind "path" only: SVG path data in the same 0..1 space.',
  sides: 'Point count for kind "polygon" and "star".',
  innerRadius: 'kind "star" only: inner radius as a fraction of the outer.',
  cornerRadius: "Corner rounding, in the same normalized units.",
  fillStyle: "Gradient or solid fill. Wins over `fill` when set.",
  dash: "Dash pattern in normalized units, as ctx.setLineDash takes it.",
  lineCap: '"butt", "round" or "square".',
  lineJoin: '"miter", "round" or "bevel".',
  trimStart: "Stroke only the sub-range [trimStart, trimEnd] of the path, 0..1.",
  trimEnd: "Stroke only the sub-range [trimStart, trimEnd] of the path, 0..1."
});

/**
 * A caption's look. Every field is optional and an absent one keeps the
 * built-in value, so a partial patch restyles one thing rather than resetting
 * the rest.
 */
export const captionStyleParams = withFieldNotes(captionStyle, {
  fontSizeFrac: "Font size as a fraction of frame height. Default 0.05.",
  color: "Colour of the words not being spoken.",
  activeColor: "Colour of the word being spoken. Default #FFD60A.",
  outline: "Outline under the glyphs. widthPx 0 draws none.",
  bottomMarginFrac:
    "Gap from the frame bottom, as a fraction of height. Default 0.12.",
  background: "Scrim behind the whole block."
});

// ── Transitions ─────────────────────────────────────────────────────────────

/**
 * A cut, authored on the incoming clip (D5). The type is an enum so a model
 * inventing one is refused with the list, rather than saving a document the
 * renderer then quietly cross-fades.
 */
export const transitionParams = z.object({
  type: z.enum(KNOWN_TRANSITION_TYPE_LIST),
  durationMs: z
    .number()
    .describe(
      "Length of the cut from the clip's start. 0 or less is a hard cut."
    ),
  easing: z
    .string()
    .optional()
    .describe(
      "Easing id, cubic-bezier(x1,y1,x2,y2) or spring(stiffness,damping,mass)."
    ),
  color: z.string().optional().describe("dipToColor only, e.g. #000000."),
  direction: z
    .enum(["left", "right", "up", "down"])
    .optional()
    .describe(
      "wipe, push and slide only: the edge the incoming clip arrives from."
    ),
  softness: z
    .number()
    .optional()
    .describe("wipe only: feathered edge width, 0..1 of the wipe axis.")
});

export type TransitionParams = z.infer<typeof transitionParams>;

/**
 * The union member the named type actually takes. The input schema is one flat
 * object because that is what a tool call can express, so a `color` sent with a
 * `push` would otherwise be stored and then silently stripped on the next save
 * — a `field_stripped` warning for a field that never meant anything.
 */
export function buildTransition(input: TransitionParams): KnownClipTransition {
  const { type, durationMs, easing } = input;
  const direction = input.direction ?? "left";
  switch (type) {
    case "dipToColor":
      return { type, durationMs, easing, color: input.color ?? "#000000" };
    case "wipe":
      return { type, durationMs, easing, direction, softness: input.softness };
    case "push":
    case "slide":
      return { type, durationMs, easing, direction };
    case "crossfade":
    case "zoom":
      return { type, durationMs, easing };
  }
}

// ── Masks and mattes ────────────────────────────────────────────────────────

/**
 * The mask kinds `drawMask` rasterizes. The document types `kind` as a plain
 * string for forward compat (I2), but a kind this build cannot draw is a mask
 * that silently does nothing, and refusing it at the call is cheaper than
 * finding it in the pixels.
 */
export const MASK_KINDS = ["rect", "ellipse", "path"] as const;

/** A shape mask on one clip, in the layer's own normalized 0..1 space (D6). */
export const maskParams = z.object({
  kind: z.enum(MASK_KINDS),
  x: z
    .number()
    .optional()
    .describe("Left edge, 0..1 of the layer's width. Default 0."),
  y: z
    .number()
    .optional()
    .describe("Top edge, 0..1 of the layer's height. Default 0."),
  width: z
    .number()
    .optional()
    .describe("Width, 0..1 of the layer's width. Default 1."),
  height: z
    .number()
    .optional()
    .describe("Height, 0..1 of the layer's height. Default 1."),
  d: z
    .string()
    .optional()
    .describe(
      'kind "path" only: SVG path data in the same 0..1 space. M, L, C, Q and Z, absolute or relative.'
    ),
  featherPx: z
    .number()
    .optional()
    .describe("Soft edge width in the layer's own pixels. 0 is a hard edge."),
  invert: z
    .boolean()
    .optional()
    .describe("Keep what the mask excludes instead of what it covers.")
});

export type MaskParams = z.infer<typeof maskParams>;

/**
 * The stored mask, with the fields the named kind does not use left off — the
 * same reason {@link buildTransition} narrows a flat input.
 *
 * `checkPath` is the host's own path parser (`parseSvgPath`). Path data is
 * parsed at the call rather than at render time so a path the renderer cannot
 * read is refused while the caller can still fix it; a host with no parser in
 * reach passes none and stores the data unchecked.
 */
export function buildMask(
  input: MaskParams,
  checkPath?: (d: string) => { ok: boolean; error?: string }
): ClipMask {
  const { kind, x, y, width, height, featherPx, invert } = input;
  if (kind !== "path") return { kind, x, y, width, height, featherPx, invert };
  const d = input.d ?? "";
  const parsed = checkPath?.(d);
  if (parsed && !parsed.ok) {
    throw new Error(
      `mask.d is not path data this build can draw: ${parsed.error}`
    );
  }
  return { kind, d, featherPx, invert };
}

/** A track matte: another clip's alpha or luminance drives this layer's alpha. */
export const matteParams = z.object({
  source: z
    .string()
    .describe("The clip whose pixels drive the alpha, by id or name."),
  mode: z
    .enum(["alpha", "luma"])
    .describe(
      "alpha reads the source's transparency; luma reads its brightness."
    ),
  invert: z.boolean().optional()
});

export type MatteParams = z.infer<typeof matteParams>;

// ── Effects ─────────────────────────────────────────────────────────────────

/** A tone-curve control point list, normalized on both axes. */
const curvePoints = z.array(z.object({ x: z.number(), y: z.number() }));

/** Three numbers, one per channel, for the three-way grade. */
const rgbTriple = z.tuple([z.number(), z.number(), z.number()]);

/**
 * One effect in a clip's chain (D7). `type` decides which of the other fields
 * mean anything, the way {@link transitionParams} does: a tool call sends one
 * flat object, so {@link buildEffect} keeps only the fields the named type
 * uses rather than storing a `radius` on a `levels` that the next save strips.
 *
 * `enabled` and `id` are not asked for — the chain is replaced whole, so an
 * effect the caller sent is an effect it wants on, and an id it never sees is
 * one it cannot get wrong.
 */
export const effectParams = z.object({
  type: z.enum(KNOWN_CLIP_EFFECT_TYPE_LIST),
  brightness: z.number().optional().describe("color: -1..1, 0 is unchanged."),
  contrast: z.number().optional().describe("color: 0..4, 1 is unchanged."),
  saturation: z.number().optional().describe("color: 0..4, 1 is unchanged."),
  hue: z.number().optional().describe("color: degrees, -180..180."),
  temperature: z.number().optional().describe("color: -1..1, cool to warm."),
  tint: z.number().optional().describe("color: -1..1, green to magenta."),
  shadows: z.number().optional().describe("color: -1..1."),
  highlights: z.number().optional().describe("color: -1..1."),
  radius: z
    .number()
    .optional()
    .describe("blur, glow and sharpen: radius in the clip's own pixels."),
  intensity: z.number().optional().describe("glow: bloom strength, 0..2."),
  offsetX: z
    .number()
    .optional()
    .describe(
      "dropShadow: offset in the clip's own pixels, positive is right."
    ),
  offsetY: z
    .number()
    .optional()
    .describe("dropShadow: offset in the clip's own pixels, positive is down."),
  blur: z.number().optional().describe("dropShadow: blur radius in pixels."),
  color: z
    .string()
    .optional()
    .describe("dropShadow shadow colour, chromaKey key colour, e.g. #00ff00."),
  opacity: z.number().optional().describe("dropShadow: 0..1."),
  amount: z.number().optional().describe("vignette and sharpen: strength."),
  softness: z
    .number()
    .optional()
    .describe("vignette falloff and chromaKey edge, 0..1."),
  tolerance: z.number().optional().describe("chromaKey: match width, 0..1."),
  spill: z.number().optional().describe("chromaKey: spill suppression, 0..1."),
  master: curvePoints.optional().describe("curves: the luminance curve."),
  r: curvePoints.optional().describe("curves: red channel."),
  g: curvePoints.optional().describe("curves: green channel."),
  b: curvePoints.optional().describe("curves: blue channel."),
  inBlack: z.number().optional().describe("levels: input black point, 0..1."),
  inWhite: z.number().optional().describe("levels: input white point, 0..1."),
  gamma: z.number().optional().describe("levels: midtone gamma, 1 is neutral."),
  outBlack: z.number().optional().describe("levels: output black point, 0..1."),
  outWhite: z.number().optional().describe("levels: output white point, 0..1."),
  lift: rgbTriple
    .optional()
    .describe("liftGammaGain: shadow offset per channel."),
  gain: rgbTriple
    .optional()
    .describe("liftGammaGain: highlight scale per channel."),
  gammaRgb: rgbTriple
    .optional()
    .describe("liftGammaGain: midtone gamma per channel.")
});

export type EffectParams = z.infer<typeof effectParams>;

/**
 * The stored effect, narrowed to the fields its type reads. Defaults are the
 * neutral value of each knob, so an effect named with nothing else set is
 * harmless rather than refused.
 */
export function buildEffect(
  input: EffectParams,
  index: number
): KnownClipEffect {
  const base = { id: `fx-${index + 1}`, enabled: true };
  switch (input.type) {
    case "color":
      return {
        ...base,
        type: "color",
        brightness: input.brightness,
        contrast: input.contrast,
        saturation: input.saturation,
        hue: input.hue,
        temperature: input.temperature,
        tint: input.tint,
        shadows: input.shadows,
        highlights: input.highlights
      };
    case "blur":
      return { ...base, type: "blur", radius: input.radius ?? 0 };
    case "glow":
      return {
        ...base,
        type: "glow",
        radius: input.radius ?? 8,
        intensity: input.intensity ?? 1,
        color: input.color
      };
    case "dropShadow":
      return {
        ...base,
        type: "dropShadow",
        offsetX: input.offsetX ?? 0,
        offsetY: input.offsetY ?? 0,
        blur: input.blur ?? input.radius ?? 8,
        color: input.color ?? "#000000",
        opacity: input.opacity
      };
    case "vignette":
      return {
        ...base,
        type: "vignette",
        amount: input.amount ?? 0.5,
        softness: input.softness ?? 0.5
      };
    case "sharpen":
      return {
        ...base,
        type: "sharpen",
        amount: input.amount ?? 1,
        radius: input.radius
      };
    case "chromaKey":
      return {
        ...base,
        type: "chromaKey",
        color: input.color ?? "#00ff00",
        tolerance: input.tolerance ?? 0.1,
        softness: input.softness ?? 0.05,
        spill: input.spill
      };
    case "curves":
      return {
        ...base,
        type: "curves",
        master: input.master ?? [
          { x: 0, y: 0 },
          { x: 1, y: 1 }
        ],
        r: input.r,
        g: input.g,
        b: input.b
      };
    case "levels":
      return {
        ...base,
        type: "levels",
        inBlack: input.inBlack ?? 0,
        inWhite: input.inWhite ?? 1,
        gamma: input.gamma ?? 1,
        outBlack: input.outBlack ?? 0,
        outWhite: input.outWhite ?? 1
      };
    case "liftGammaGain":
      return {
        ...base,
        type: "liftGammaGain",
        lift: input.lift ?? [0, 0, 0],
        gamma: input.gammaRgb ?? [1, 1, 1],
        gain: input.gain ?? [1, 1, 1]
      };
  }
}

// ── Groups ──────────────────────────────────────────────────────────────────

/**
 * A group clip: no media of its own, just a transform, an opacity and a window
 * the clips naming it inherit (D4). It occupies a track like any other clip, so
 * the picture stays where it is — a child's z-order is its own track's (I9).
 */
export const addGroupParams = z.object({
  name: z.string().trim().min(1).describe("Label for the group clip."),
  startMs: z.number().describe("Where the group's window opens."),
  durationMs: z
    .number()
    .describe(
      "How long the window stays open. A child is clipped to it, so cover the children."
    ),
  trackId: z
    .string()
    .optional()
    .describe(
      "Track for the group clip, by id or name. Defaults to an overlay track, creating one when needed."
    ),
  children: z
    .array(z.string())
    .optional()
    .describe(
      "Clips to parent to the new group, by id or name. Each keeps its own track."
    )
});

export type AddGroupParams = z.infer<typeof addGroupParams>;

/** Parent one clip to a group, or unparent it with `parentId: null`. */
export const setParentParams = z.object({
  target: targetParam,
  parentId: z
    .string()
    .nullable()
    .describe(
      "The group clip to inherit from, by id or name. null releases the clip."
    )
});

export type SetParentParams = z.infer<typeof setParentParams>;

// ── The shared tool surface ─────────────────────────────────────────────────

/**
 * Every `ui_timeline_*` tool both the headless bridge and the browser registry
 * must expose. A tool one surface has and the other lacks is the drift I11
 * forbids and no shared field list can catch on its own, so each side asserts
 * this list against what it registered
 * (`packages/agents/tests/timelines-op-input.test.ts`,
 * `web/src/lib/tools/__tests__/timelineTools.test.ts`).
 *
 * `ui_timeline_get_clip_frames` is deliberately absent: it samples rendered
 * video frames and has no headless equivalent.
 */
export const SHARED_TIMELINE_TOOL_NAMES = [
  "ui_timeline_get_state",
  "ui_timeline_add_track",
  "ui_timeline_add_media_clip",
  "ui_timeline_add_text_clip",
  "ui_timeline_add_shape_clip",
  "ui_timeline_add_group",
  "ui_timeline_generate_clip",
  "ui_timeline_split_clip",
  "ui_timeline_trim_clip",
  "ui_timeline_move_clip",
  "ui_timeline_delete_clip",
  "ui_timeline_duplicate_clip",
  "ui_timeline_set_clip_params",
  "ui_timeline_set_parent",
  "ui_timeline_set_transition",
  "ui_timeline_set_mask",
  "ui_timeline_set_matte",
  "ui_timeline_set_effects",
  "ui_timeline_set_clip_binding",
  "ui_timeline_animate_clip",
  "ui_timeline_clear_animations",
  "ui_timeline_list_animation_presets",
  "ui_timeline_select_clip",
  "ui_timeline_seek"
] as const;
