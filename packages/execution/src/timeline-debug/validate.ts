/**
 * Static validation of a timeline document.
 *
 * Pure and structural: everything here is decidable from the document alone —
 * no database, no assets, no decode, no rendering. The check catalog follows
 * the landmines in `packages/timeline/AGENTS.md` (timeline-space vs.
 * source-space, boundary properties on split, overlap) plus the schema's own
 * history: every `Without this field Zod strips it on every PATCH` comment in
 * `@nodetool-ai/protocol/api-schemas/timeline.ts` is a data-loss bug that
 * shipped, which is what `field_stripped` exists to catch mechanically.
 */
import {
  timelineDocument,
  type TimelineClip,
  type TimelineDocument
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  ANIMATION_PRESETS,
  CLIP_EFFECT_TYPES,
  CLIP_SHAPE_KINDS,
  CUSTOM_ANIMATION_PRESET_ID,
  EASING_IDS,
  normalizeCustomCurves,
  BUNDLED_FONT_FAMILIES,
  isKnownShapeKind,
  parseClipEffectType,
  parseEasing,
  resolveFontFamily,
  resolveCustomMask,
  computeModel3DBakeHash,
  isGeneratedMatteStale,
  isCropUsable,
  sourceRate,
  DEFAULT_TEMPO,
  resolveTempo,
  validateNotes,
  visibleNotes
} from "@nodetool-ai/timeline";
import type { Model3DBakeSequence } from "@nodetool-ai/timeline";
import {
  MASK_KINDS,
  MAX_VIDEO_LAYERS,
  TRANSITION_DIRECTIONS,
  TRANSITION_TYPES,
  parseSvgPath,
  parseTransitionDirection,
  parseTransitionType
} from "@nodetool-ai/timeline/scene";

import { checkLegibility } from "./legibility.js";
import { checkClipMotion } from "./motion.js";
import type { TimelineDebugIssue, TimelineValidation } from "./types.js";

export interface TimelineValidationMeta {
  fps?: number;
  width?: number;
  height?: number;
}

const DEFAULT_FPS = 30;
/** The sequence size a document carries no meta for — 1080p, the editor's own. */
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

const PRESET_IDS = new Set<string>([
  ...ANIMATION_PRESETS.map((preset) => preset.id),
  CUSTOM_ANIMATION_PRESET_ID
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const clipLabel = (clip: TimelineClip): string => `${clip.name || clip.id}`;

/** What an `easing` field accepts, for the `unknown_easing` message. */
const EASING_GRAMMAR = `${EASING_IDS.join(", ")}, cubic-bezier(x1,y1,x2,y2), spring(stiffness,damping,mass)`;

/**
 * An easing string nothing in the grammar parses. A warning, not an error: the
 * sampler eases linearly rather than dropping the motion, so a document from a
 * newer build still plays (I2). The offending string is named because it is
 * almost always a typo — `ease-out` for `easeOut`, a spring with two arguments.
 */
function unknownEasingIssue(
  clip: TimelineClip,
  easing: string | undefined,
  path: string
): TimelineDebugIssue | null {
  if (easing === undefined || parseEasing(easing) !== null) return null;
  return {
    severity: "warning",
    code: "unknown_easing",
    message: `Clip "${clipLabel(clip)}" eases with "${easing}", which this build cannot parse — it will ease linearly. Expected one of ${EASING_GRAMMAR}.`,
    path,
    clipId: clip.id,
    trackId: clip.trackId
  };
}

/** Source milliseconds a curve may overhang before it counts as outside. */
const SOURCE_WINDOW_SLACK_MS = 1;

/**
 * The stretch of source a clip shows: the remap curve's own range when it
 * carries one, otherwise the in-point plus what the clip consumes at its rate.
 * `outPointMs` is deliberately not consulted — a document where it disagrees
 * with `durationMs * rate` is what `in_out_duration_mismatch` reports.
 */
function clipSourceWindow(clip: TimelineClip) {
  const keyframes = clip.timeRemap?.keyframes ?? [];
  if (keyframes.length > 0) {
    const times = keyframes.map((keyframe) => keyframe.sourceMs);
    return { fromMs: Math.min(...times), toMs: Math.max(...times) };
  }
  const fromMs = clip.inPointMs ?? 0;
  return { fromMs, toMs: fromMs + clip.durationMs * sourceRate(clip) };
}

/**
 * A source-anchored curve reaching past the source the clip plays.
 *
 * The keyframes name absolute times in the media, so the part outside the
 * clip's window is never sampled: the motion the author drew there does not
 * happen, and the sampler holds the edge value instead. A warning rather than
 * an error — the clip still renders, and a trim that shortened the clip
 * without re-slicing (an older client's edit) lands here.
 */
function sourceCurveOutsideWindowIssue(
  clip: TimelineClip,
  animationId: string,
  curves: ReadonlyArray<{ keyframes: ReadonlyArray<{ sourceMs?: number }> }>
): TimelineDebugIssue | null {
  const times: number[] = [];
  for (const curve of curves) {
    for (const keyframe of curve.keyframes) {
      if (keyframe.sourceMs !== undefined) times.push(keyframe.sourceMs);
    }
  }
  if (times.length === 0) return null;
  const curveFromMs = Math.min(...times);
  const curveToMs = Math.max(...times);
  const window = clipSourceWindow(clip);
  if (
    curveFromMs >= window.fromMs - SOURCE_WINDOW_SLACK_MS &&
    curveToMs <= window.toMs + SOURCE_WINDOW_SLACK_MS
  ) {
    return null;
  }
  return {
    severity: "warning",
    code: "source_curve_outside_window",
    message: `Clip "${clipLabel(clip)}" animation "${animationId}" keyframes ${Math.round(curveFromMs)}–${Math.round(curveToMs)}ms of source, outside the ${Math.round(window.fromMs)}–${Math.round(window.toMs)}ms the clip plays — the motion outside never runs. Re-slice the curve to the clip's source window.`,
    path: "animations[*].custom.curves[*].keyframes[*].sourceMs",
    clipId: clip.id,
    trackId: clip.trackId
  };
}

/** What a transition's `type` accepts, for the `unknown_transition` message. */
const TRANSITION_GRAMMAR = TRANSITION_TYPES.join(", ");

/** What a `wipe`/`push`/`slide` `direction` accepts. */
const DIRECTION_GRAMMAR = TRANSITION_DIRECTIONS.join(", ");

/**
 * A transition type this build cannot draw.
 *
 * `type` is a plain string on the wire (I2), so a cut a newer build authored
 * parses, reaches the renderer, and cross-fades. This names the type the
 * document asked for and says what happens instead. It reads the parsed clip:
 * the schema no longer refuses an unknown type, so there is nothing left for a
 * pre-parse scan of the raw document to see.
 */
function unknownTransitionTypeIssue(
  clip: TimelineClip
): TimelineDebugIssue | null {
  const transition = clip.transitionIn;
  if (!transition || parseTransitionType(transition.type) !== null) return null;
  return {
    severity: "warning",
    code: "unknown_transition",
    message: `Clip "${clipLabel(clip)}" opens with a "${transition.type}" transition, which this build cannot draw — it cross-fades instead. Expected one of ${TRANSITION_GRAMMAR}.`,
    path: "transitionIn.type",
    clipId: clip.id,
    trackId: clip.trackId
  };
}

/**
 * A `direction` the renderer cannot read on a transition whose type it can.
 * Falls back to `left` at render time, the way an unknown type falls back to a
 * cross-fade.
 */
function unknownDirectionIssue(clip: TimelineClip): TimelineDebugIssue | null {
  const transition = clip.transitionIn;
  if (!transition || !("direction" in transition)) return null;
  const { direction } = transition;
  // An unknown type can carry any value under a key our own types use as a
  // string, so the read is guarded rather than trusted.
  if (typeof direction !== "string") return null;
  if (parseTransitionDirection(direction) !== null) return null;
  return {
    severity: "warning",
    code: "unknown_transition",
    message: `Clip "${clipLabel(clip)}" runs its ${transition.type} toward "${direction}", which this build cannot read — it runs left. Expected one of ${DIRECTION_GRAMMAR}.`,
    path: "transitionIn.direction",
    clipId: clip.id,
    trackId: clip.trackId
  };
}

/**
 * Collect every leaf/branch path the parse output dropped from the input.
 *
 * Exported because the save path needs the same answer the debug report gives:
 * `timeline.update` in `packages/websocket` parses the incoming document with
 * the same stripping schema and reports what it dropped, so a field lost on
 * autosave is named at the moment it is lost rather than at the next debug run.
 */
export function collectStrippedPaths(
  input: unknown,
  output: unknown,
  path: string,
  found: Set<string>
): void {
  if (Array.isArray(input)) {
    if (!Array.isArray(output)) return;
    input.forEach((item, index) => {
      collectStrippedPaths(item, output[index], `${path}[*]`, found);
    });
    return;
  }
  if (!isRecord(input)) return;
  if (!isRecord(output)) return;
  for (const [key, value] of Object.entries(input)) {
    // An explicit `undefined` carries nothing, so its absence loses nothing.
    if (value === undefined) continue;
    const childPath = path ? `${path}.${key}` : key;
    if (!(key in output) || output[key] === undefined) {
      found.add(childPath);
      continue;
    }
    collectStrippedPaths(value, output[key], childPath, found);
  }
}

/**
 * Fields the schema silently drops. A stripped field survives in memory and
 * disappears on the next autosave round-trip, so it never fails loudly — the
 * only way to see it is to diff the input against what Zod handed back.
 */
function checkFieldStripping(
  raw: unknown,
  parsed: TimelineDocument
): TimelineDebugIssue[] {
  const paths = new Set<string>();
  collectStrippedPaths(raw, parsed, "", paths);
  return [...paths].sort().map((path) => ({
    severity: "warning" as const,
    code: "field_stripped",
    path,
    message: `\`${path}\` is present in the document but absent after schema parse — the schema strips it, so it is lost on the next save.`
  }));
}

function checkDuplicateIds(doc: TimelineDocument): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const check = (kind: string, ids: string[]): void => {
    const seen = new Set<string>();
    const reported = new Set<string>();
    for (const id of ids) {
      if (seen.has(id) && !reported.has(id)) {
        reported.add(id);
        const issue: TimelineDebugIssue = {
          severity: "error",
          code: "duplicate_id",
          message: `Duplicate ${kind} id "${id}".`
        };
        if (kind === "track") {
          issue.trackId = id;
        }
        if (kind === "clip") {
          issue.clipId = id;
        }
        issues.push(issue);
      }
      seen.add(id);
    }
  };
  check(
    "track",
    doc.tracks.map((track) => track.id)
  );
  check(
    "clip",
    doc.clips.map((clip) => clip.id)
  );
  check(
    "marker",
    doc.markers.map((marker) => marker.id)
  );
  return issues;
}

function checkClip(
  clip: TimelineClip,
  trackIds: ReadonlySet<string>,
  fps: number,
  canvas: { width: number; height: number }
): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const at = { clipId: clip.id, trackId: clip.trackId };
  const label = clipLabel(clip);

  if (!trackIds.has(clip.trackId)) {
    issues.push({
      severity: "error",
      code: "clip_track_missing",
      message: `Clip "${label}" sits on track "${clip.trackId}", which the document does not declare.`,
      ...at
    });
  }

  if (clip.startMs < 0) {
    issues.push({
      severity: "error",
      code: "negative_timing",
      message: `Clip "${label}" starts at ${clip.startMs}ms — before the timeline origin.`,
      path: "startMs",
      ...at
    });
  }
  if (clip.durationMs <= 0) {
    issues.push({
      severity: "error",
      code: "negative_timing",
      message: `Clip "${label}" has durationMs ${clip.durationMs} — a clip must last longer than zero.`,
      path: "durationMs",
      ...at
    });
  }

  const fadeIn = clip.fadeInMs ?? 0;
  const fadeOut = clip.fadeOutMs ?? 0;
  if (fadeIn + fadeOut > clip.durationMs) {
    issues.push({
      severity: "error",
      code: "fade_exceeds_duration",
      message: `Clip "${label}" fades ${fadeIn}ms in + ${fadeOut}ms out over a ${clip.durationMs}ms clip — the fades overlap.`,
      ...at
    });
  }

  const { inPointMs, outPointMs } = clip;
  if (inPointMs !== undefined && inPointMs < 0) {
    issues.push({
      severity: "error",
      code: "in_out_points_invalid",
      message: `Clip "${label}" has inPointMs ${inPointMs} — a source point cannot be negative.`,
      path: "inPointMs",
      ...at
    });
  }
  if (outPointMs !== undefined && outPointMs < 0) {
    issues.push({
      severity: "error",
      code: "in_out_points_invalid",
      message: `Clip "${label}" has outPointMs ${outPointMs} — a source point cannot be negative.`,
      path: "outPointMs",
      ...at
    });
  }
  if (
    inPointMs !== undefined &&
    outPointMs !== undefined &&
    outPointMs <= inPointMs
  ) {
    issues.push({
      severity: "error",
      code: "in_out_points_invalid",
      message: `Clip "${label}" has outPointMs ${outPointMs} at or before inPointMs ${inPointMs} — the source span is empty.`,
      ...at
    });
  } else if (
    inPointMs !== undefined &&
    outPointMs !== undefined &&
    clip.durationMs > 0
  ) {
    // Timeline duration and source span are different quantities: the source
    // consumes `rate` ms per timeline ms. Comparing them without the rate is
    // the bug `sourceRate` exists to prevent.
    const rate = sourceRate(clip);
    const expected = clip.durationMs * rate;
    const actual = outPointMs - inPointMs;
    if (Math.abs(actual - expected) > 1) {
      issues.push({
        severity: "warning",
        code: "in_out_duration_mismatch",
        message: `Clip "${label}" spans ${actual}ms of source but ${clip.durationMs}ms of timeline at rate ${rate} (expected ${Math.round(expected)}ms of source).`,
        ...at
      });
    }
  }

  if (clip.speedMultiplier !== undefined && clip.speedMultiplier <= 0) {
    issues.push({
      severity: "error",
      code: "speed_multiplier_invalid",
      message: `Clip "${label}" has speedMultiplier ${clip.speedMultiplier} — playback rate must be positive.`,
      path: "speedMultiplier",
      ...at
    });
  }

  if (clip.transitionIn && clip.transitionIn.durationMs > clip.durationMs) {
    issues.push({
      severity: "warning",
      code: "transition_exceeds_duration",
      message: `Clip "${label}" opens with a ${clip.transitionIn.durationMs}ms ${clip.transitionIn.type} over a ${clip.durationMs}ms clip.`,
      ...at
    });
  }

  const transitionEasing = unknownEasingIssue(
    clip,
    clip.transitionIn?.easing,
    "transitionIn.easing"
  );
  if (transitionEasing) issues.push(transitionEasing);

  const transitionType = unknownTransitionTypeIssue(clip);
  if (transitionType) issues.push(transitionType);

  const transitionDirection = unknownDirectionIssue(clip);
  if (transitionDirection) issues.push(transitionDirection);

  for (const [index, keyframe] of (clip.timeRemap?.keyframes ?? []).entries()) {
    const issue = unknownEasingIssue(
      clip,
      keyframe.easing,
      `timeRemap.keyframes[${index}].easing`
    );
    if (issue) issues.push(issue);
  }

  for (const animation of clip.animations ?? []) {
    const animationEasing = unknownEasingIssue(
      clip,
      animation.easing,
      "animations[*].easing"
    );
    if (animationEasing) issues.push(animationEasing);

    if (!PRESET_IDS.has(animation.preset)) {
      issues.push({
        severity: "error",
        code: "unknown_animation_preset",
        message: `Clip "${label}" animation "${animation.id}" uses preset "${animation.preset}", which this build does not ship.`,
        path: "animations[*].preset",
        ...at
      });
      continue;
    }
    if (animation.preset !== CUSTOM_ANIMATION_PRESET_ID) continue;

    // A custom animation renders nothing unless its baked curves survive the
    // one gate every render site applies, so what the compiler would skip with
    // a console warning is reported here instead.
    const baked = normalizeCustomCurves(
      animation.custom?.curves,
      animation.custom?.timeBase
    );
    if (!baked.ok) {
      issues.push({
        severity: "error",
        code: "custom_animation_invalid",
        message: `Clip "${label}" animation "${animation.id}" is a custom animation whose baked curves are unusable: ${baked.error}. Re-bake it from its script.`,
        path: "animations[*].custom.curves",
        ...at
      });
      continue;
    }
    for (const easing of baked.unknownEasings ?? []) {
      const issue = unknownEasingIssue(
        clip,
        easing,
        "animations[*].custom.curves[*].keyframes[*].easing"
      );
      if (issue) issues.push(issue);
    }

    if (baked.timeBase === "source") {
      const outside = sourceCurveOutsideWindowIssue(clip, animation.id, baked.curves);
      if (outside) issues.push(outside);
    }

    const mask = resolveCustomMask(baked.curves, animation.custom?.mask);
    if (!mask.ok) {
      issues.push({
        severity: "error",
        code: "custom_animation_invalid",
        message: `Clip "${label}" animation "${animation.id}": ${mask.error}.`,
        path: "animations[*].custom.mask",
        ...at
      });
      continue;
    }
  }

  if (clip.sourceType === "generated" && !clip.workflowId && !clip.prompt) {
    issues.push({
      severity: "warning",
      code: "binding_incomplete",
      message: `Clip "${label}" is generated but names neither a workflowId nor a prompt — nothing can produce its media.`,
      ...at
    });
  }

  for (const word of clip.caption?.words ?? []) {
    if (
      word.endMs <= word.startMs ||
      word.startMs < 0 ||
      word.endMs > clip.durationMs
    ) {
      issues.push({
        severity: "warning",
        code: "caption_out_of_range",
        message: `Clip "${label}" caption word "${word.word}" spans ${word.startMs}–${word.endMs}ms, outside the clip's 0–${clip.durationMs}ms window.`,
        ...at
      });
      break;
    }
  }

  issues.push(...maskIssues(clip));
  issues.push(...unknownEffectIssues(clip));
  issues.push(...cropIssues(clip));
  const shapeKind = unknownShapeKindIssue(clip);
  if (shapeKind) issues.push(shapeKind);
  issues.push(...model3dIssues(clip, { fps, ...canvas }));
  issues.push(...fontPortabilityIssues(clip));

  const frameMs = 1000 / fps;
  if (clip.durationMs > 0 && clip.durationMs < frameMs) {
    issues.push({
      severity: "warning",
      code: "clip_shorter_than_frame",
      message: `Clip "${label}" lasts ${clip.durationMs}ms, less than one frame at ${fps}fps (${frameMs.toFixed(2)}ms) — it may never be sampled.`,
      ...at
    });
  }

  return issues;
}

/** The families NodeTool ships, for the `font_not_portable` message. */
const BUNDLED_FONT_GRAMMAR = BUNDLED_FONT_FAMILIES.join(", ");

/**
 * A text or caption style naming a family this build does not ship (D8).
 *
 * A warning, because the picture is drawn either way — the family list ends in
 * a generic, so text appears. What is lost is that it is the *same* picture:
 * a system font resolves against whatever the machine drawing the frame has,
 * so the editor preview, a server render and the agent's frame preview each
 * pick their own face, and the difference only shows when two of them are
 * compared. That is F15, and naming the family here is the cheap half of the
 * fix.
 */
function fontPortabilityIssues(clip: TimelineClip): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const at = { clipId: clip.id, trackId: clip.trackId };
  const declared: [string, string | undefined][] = [
    ["textStyle.fontFamily", clip.textStyle?.fontFamily],
    ["caption.style.fontFamily", clip.caption?.style?.fontFamily]
  ];
  for (const [path, family] of declared) {
    if (family === undefined || family.trim() === "") continue;
    if (resolveFontFamily(family).portable) continue;
    issues.push({
      severity: "warning",
      code: "font_not_portable",
      message: `Clip "${clipLabel(clip)}" is set in "${family}", which NodeTool does not ship — every host resolves it against its own installed fonts, so the editor preview and the render can differ. Bundled families: ${BUNDLED_FONT_GRAMMAR}.`,
      path,
      ...at
    });
  }
  return issues;
}

/**
 * A crop whose insets keep no picture.
 *
 * `left + right >= 1` on either axis leaves nothing to draw. Both compositors
 * fall back to the whole source rather than blanking the shot — a slider
 * dragged to the end should show the uncropped picture, not a hole — so this is
 * a warning about a framing that is being ignored, not an error.
 */
function cropIssues(clip: TimelineClip): TimelineDebugIssue[] {
  const crop = clip.crop;
  if (!crop || isCropUsable(crop)) return [];
  return [
    {
      severity: "warning",
      code: "crop_degenerate",
      message:
        `Clip "${clipLabel(clip)}" is cropped to nothing (left ${crop.left} + ` +
        `right ${crop.right}, top ${crop.top} + bottom ${crop.bottom}); each ` +
        "pair must stay below 1. The clip draws its whole source instead.",
      path: "crop",
      clipId: clip.id,
      trackId: clip.trackId
    }
  ];
}

/** What an effect's `type` accepts, for the `unknown_effect` message. */
const EFFECT_GRAMMAR = CLIP_EFFECT_TYPES.join(", ");

/**
 * An effect type this build does not apply (D7).
 *
 * `type` is a plain string on the wire (I2), so an effect a newer build
 * authored parses and reaches the renderer, which steps over it. A warning
 * rather than an error: the layer draws ungraded, which is a different picture
 * and not a broken one. Canvas 2D reports the same set at render time through
 * `unsupportedEffectTypes`; this is the half that answers before anything runs.
 */
function unknownEffectIssues(clip: TimelineClip): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  for (const [index, effect] of (clip.effects ?? []).entries()) {
    if (parseClipEffectType(effect.type) !== null) continue;
    issues.push({
      severity: "warning",
      code: "unknown_effect",
      message: `Clip "${clipLabel(clip)}" carries a "${effect.type}" effect, which this build cannot apply — the layer draws without it. Expected one of ${EFFECT_GRAMMAR}.`,
      path: `effects[${index}].type`,
      clipId: clip.id,
      trackId: clip.trackId
    });
  }
  return issues;
}

/** What a shape's `kind` accepts, for the `unknown_shape_kind` message. */
const SHAPE_KIND_GRAMMAR = CLIP_SHAPE_KINDS.join(", ");

/**
 * A shape geometry this build cannot draw.
 *
 * `kind` is a plain string on the wire (I2), so a shape a newer build authored
 * parses and reaches the renderer, which builds no outline for it — the clip
 * draws nothing. A warning rather than an error: the rest of the document
 * plays, and the alternative is refusing the whole timeline over one shape.
 */
function unknownShapeKindIssue(clip: TimelineClip): TimelineDebugIssue | null {
  const kind = clip.shapeStyle?.kind;
  if (kind === undefined || isKnownShapeKind(kind)) return null;
  return {
    severity: "warning",
    code: "unknown_shape_kind",
    message: `Clip "${clipLabel(clip)}" draws a "${kind}" shape, which this build has no geometry for — it draws nothing. Expected one of ${SHAPE_KIND_GRAMMAR}.`,
    path: "shapeStyle.kind",
    clipId: clip.id,
    trackId: clip.trackId
  };
}

/**
 * A 3D clip that cannot draw, and a bake that no longer matches what it would.
 *
 * The style and the glTF are both errors: the style names the camera, the
 * lighting and the animation a 3D layer renders from, and the glTF is the
 * clip's asset the way an image is an image clip's — without either the clip
 * draws nothing at all, and nothing else in the document compensates.
 *
 * A stale bake is a warning instead: the scene model falls back to the live 3D
 * layer, so what plays is the intended picture at proxy quality rather than a
 * render of a style the clip no longer has.
 */
function model3dIssues(
  clip: TimelineClip,
  sequence: Model3DBakeSequence
): TimelineDebugIssue[] {
  if (clip.mediaType !== "model3d") return [];
  const issues: TimelineDebugIssue[] = [];
  const at = { clipId: clip.id, trackId: clip.trackId };
  const label = clipLabel(clip);

  if (!clip.model3dStyle) {
    issues.push({
      severity: "error",
      code: "model3d_style_missing",
      message: `Clip "${label}" is a 3D clip with no model3dStyle — nothing names its camera, lighting or animation, so it draws nothing.`,
      path: "model3dStyle",
      ...at
    });
  }
  if (!clip.currentAssetId) {
    issues.push({
      severity: "error",
      code: "model3d_style_missing",
      message: `Clip "${label}" is a 3D clip with no currentAssetId — the glTF a 3D clip draws is its asset, the way an image is an image clip's.`,
      path: "currentAssetId",
      ...at
    });
  }

  const bake = clip.model3dStyle?.bake;
  if (bake && bake.dependencyHash !== computeModel3DBakeHash(clip, sequence)) {
    issues.push({
      severity: "warning",
      code: "bake_stale",
      message: `Clip "${label}" carries a bake rendered from a style it no longer has — the live 3D layer draws instead. Re-bake it.`,
      path: "model3dStyle.bake.dependencyHash",
      ...at
    });
  }

  return issues;
}

/** What a mask's `kind` accepts, for the `mask_path_invalid` message. */
const MASK_KIND_GRAMMAR = MASK_KINDS.join(", ");

/**
 * A mask this build cannot rasterize (D6) — a warning, because the layer draws
 * unmasked rather than not at all.
 *
 * Two ways to get there, and the message names which. `kind` is a plain string
 * on the wire (I2), so a mask shape a newer build authored parses and reaches
 * the renderer, which skips it. And a `path` mask's `d` is only ever read at
 * render time, where a typo in the path data is a mask that quietly does
 * nothing.
 */
function maskIssues(clip: TimelineClip): TimelineDebugIssue[] {
  const mask = clip.mask;
  if (!mask) return [];
  const at = { clipId: clip.id, trackId: clip.trackId };
  if (!(MASK_KINDS as readonly string[]).includes(mask.kind)) {
    return [
      {
        severity: "warning",
        code: "mask_path_invalid",
        message: `Clip "${clipLabel(clip)}" is masked with kind "${mask.kind}", which this build cannot rasterize — it draws unmasked. Expected one of ${MASK_KIND_GRAMMAR}.`,
        path: "mask.kind",
        ...at
      }
    ];
  }
  if (mask.kind !== "path") return [];
  const parsed = parseSvgPath(mask.d ?? "");
  if (parsed.ok) return [];
  return [
    {
      severity: "warning",
      code: "mask_path_invalid",
      message: `Clip "${clipLabel(clip)}" has a path mask this build cannot draw — it draws unmasked. ${parsed.error}.`,
      path: "mask.d",
      ...at
    }
  ];
}

/**
 * Track mattes (D6). A `matte` must name a clip the document contains, and not
 * itself — a matte source never draws, so a clip matted by itself resolves to
 * nothing at all.
 *
 * Both are errors rather than warnings because they cost the whole point of
 * the field without failing anything: a missing source draws the layer
 * unmatted, so a keyhole meant to reveal one shape shows the entire picture.
 */
function checkMattes(doc: TimelineDocument): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const ids = new Set(doc.clips.map((clip) => clip.id));
  for (const clip of doc.clips) {
    const matte = clip.matte;
    if (!matte) continue;
    const at = { clipId: clip.id, trackId: clip.trackId };
    if (!ids.has(matte.sourceClipId)) {
      issues.push({
        severity: "error",
        code: "matte_source_missing",
        message: `Clip "${clipLabel(clip)}" is matted by "${matte.sourceClipId}", which the document does not contain — it draws unmatted.`,
        path: "matte.sourceClipId",
        ...at
      });
      continue;
    }
    if (matte.sourceClipId === clip.id) {
      issues.push({
        severity: "error",
        code: "matte_source_missing",
        message: `Clip "${clipLabel(clip)}" names itself as its matte source — a matte source never draws itself, so the clip resolves to nothing and disappears.`,
        path: "matte.sourceClipId",
        ...at
      });
    }
  }
  return issues;
}

/**
 * A matte whose source names an adjustment clip.
 *
 * An adjustment clip draws no picture of its own — `attachMattes`
 * (`render/sceneModel.ts`) treats that the same as a source clip the document
 * does not contain: the layer draws unmatted and, unlike a genuinely missing
 * or inactive source, nothing is logged at render time. A warning, because the
 * document still renders — just not the cutout the author asked for.
 */
function checkMatteSourceAdjustment(doc: TimelineDocument): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const byId = new Map(doc.clips.map((clip) => [clip.id, clip]));
  for (const clip of doc.clips) {
    const matte = clip.matte;
    if (!matte) continue;
    const source = byId.get(matte.sourceClipId);
    if (!source || source.mediaType !== "adjustment") continue;
    issues.push({
      severity: "warning",
      code: "matte_source_invalid",
      message: `Clip "${clipLabel(clip)}" is matted by "${clipLabel(source)}", which is an adjustment clip — an adjustment has no pixels of its own, so the layer draws unmatted.`,
      path: "matte.sourceClipId",
      clipId: clip.id,
      trackId: clip.trackId
    });
  }
  return issues;
}

/**
 * Fields an adjustment clip carries that the scene model ignores on one (D-adj):
 * `transform`, `borderRadius`, `blendMode` and `matte` all place or shape a
 * picture the clip does not draw, and `effects` with nothing enabled leaves
 * the clip a no-op even though it still costs a resolve. Both are warnings —
 * the document still renders, just not differently for the field carried.
 */
function checkAdjustmentEffects(doc: TimelineDocument): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  for (const clip of doc.clips) {
    if (clip.mediaType !== "adjustment") continue;
    const at = { clipId: clip.id, trackId: clip.trackId };
    const label = clipLabel(clip);

    if (!(clip.effects ?? []).some((effect) => effect.enabled)) {
      issues.push({
        severity: "warning",
        code: "adjustment_no_effects",
        message: `Adjustment clip "${label}" carries no enabled effect — it treats nothing beneath it and is a no-op.`,
        ...at
      });
    }

    const ignoredFields: string[] = [];
    if (clip.transform !== undefined) ignoredFields.push("transform");
    if (clip.borderRadius !== undefined) ignoredFields.push("borderRadius");
    if (clip.blendMode !== undefined) ignoredFields.push("blendMode");
    if (clip.matte !== undefined) ignoredFields.push("matte");
    if (ignoredFields.length > 0) {
      issues.push({
        severity: "warning",
        code: "adjustment_field_ignored",
        message: `Adjustment clip "${label}" carries ${ignoredFields.join(", ")} — an adjustment draws no picture of its own, so ${ignoredFields.length > 1 ? "those fields go" : "that field goes"} unused.`,
        path: ignoredFields[0],
        ...at
      });
    }
  }
  return issues;
}

/**
 * An adjustment clip whose window has nothing to treat (D-adj).
 *
 * Unparented, it treats every track with a *higher* index than its own —
 * index 0 draws on top, so a higher index is further down the stack
 * (`render/sceneModel.ts` § z-order) — so the check looks for any clip on
 * such a track overlapping its window; audio and midi tracks never composite
 * and are excluded the same way `checkDocumentLevel`'s z-order check excludes
 * them. Parented to a group, it treats that group's own composited surface
 * instead (`groupNeedsPrecomposite`), so the check looks at siblings sharing
 * the same `parentId` rather than at tracks. Both are warnings: the clip still
 * resolves, it simply never has anything under it to change.
 */
function checkAdjustmentTargets(doc: TimelineDocument): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const trackById = new Map(doc.tracks.map((track) => [track.id, track]));
  const clipById = new Map(doc.clips.map((clip) => [clip.id, clip]));
  const siblingsByParent = new Map<string, TimelineClip[]>();
  for (const clip of doc.clips) {
    if (clip.parentId === undefined) continue;
    const list = siblingsByParent.get(clip.parentId);
    if (list) list.push(clip);
    else siblingsByParent.set(clip.parentId, [clip]);
  }

  const overlaps = (a: TimelineClip, b: TimelineClip): boolean =>
    b.startMs < a.startMs + a.durationMs && b.startMs + b.durationMs > a.startMs;

  for (const clip of doc.clips) {
    if (clip.mediaType !== "adjustment") continue;
    const at = { clipId: clip.id, trackId: clip.trackId };
    const label = clipLabel(clip);

    if (clip.parentId !== undefined) {
      const parent = clipById.get(clip.parentId);
      if (!parent || parent.mediaType !== "group") continue; // reported by checkParents
      const siblings = siblingsByParent.get(clip.parentId) ?? [];
      const treatsSomething = siblings.some(
        (sibling) => sibling.id !== clip.id && overlaps(clip, sibling)
      );
      if (!treatsSomething) {
        issues.push({
          severity: "warning",
          code: "adjustment_group_empty",
          message: `Adjustment clip "${label}" is parented to group "${clipLabel(parent)}", but no other clip in that group overlaps its window — it treats nothing.`,
          ...at
        });
      }
      continue;
    }

    const ownTrack = trackById.get(clip.trackId);
    if (!ownTrack) continue; // reported by checkClip as clip_track_missing
    const treatsSomething = doc.clips.some((other) => {
      if (other.id === clip.id) return false;
      const otherTrack = trackById.get(other.trackId);
      if (!otherTrack) return false;
      if (otherTrack.type === "audio" || otherTrack.type === "midi") return false;
      return otherTrack.index > ownTrack.index && overlaps(clip, other);
    });
    if (!treatsSomething) {
      issues.push({
        severity: "warning",
        code: "adjustment_treats_nothing",
        message: `Adjustment clip "${label}" has no clip on a lower track (a higher track index) overlapping its window — it treats nothing.`,
        ...at
      });
    }
  }
  return issues;
}

/**
 * Generated mattes (D2). A matte cut from the clip's own source stays aligned
 * through any edit, so the only thing that can go wrong is that it no longer
 * describes what the clip shows: the asset was regenerated under it, or a trim
 * or a speed change now reaches source the generation never covered.
 *
 * A warning rather than an error: the clip still renders, keyed by the matte it
 * has — over the wrong picture, or with the uncovered stretch keyed by whatever
 * the mask video's last frame holds. The fix is a regenerate, which costs a
 * provider call, so this reports rather than blocks.
 *
 * `isGeneratedMatteStale` is the same predicate the editor and the compositor
 * ask, so a document that validates clean cannot be shown as stale in the UI.
 */
function checkGeneratedMattes(doc: TimelineDocument): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  for (const clip of doc.clips) {
    const matte = clip.generatedMatte;
    if (!matte || !isGeneratedMatteStale(clip)) continue;
    const reason =
      matte.sourceAssetId === clip.currentAssetId
        ? `its window now covers ${Math.round(clipSourceWindow(clip).fromMs)}–${Math.round(clipSourceWindow(clip).toMs)}ms of the source and the matte was cut from ${Math.round(matte.sourceRange.fromMs)}–${Math.round(matte.sourceRange.toMs)}ms`
        : `it was cut from asset "${matte.sourceAssetId}" and the clip now plays "${clip.currentAssetId ?? "none"}"`;
    issues.push({
      severity: "warning",
      code: "generated_matte_stale",
      message: `Clip "${clipLabel(clip)}" has a generated matte that no longer matches what it plays — ${reason}. Regenerate it.`,
      path: "generatedMatte",
      clipId: clip.id,
      trackId: clip.trackId
    });
  }
  return issues;
}

/**
 * Parent links (D4). A `parentId` must name a clip the document contains, that
 * clip must be a group, and the chain must reach a root.
 *
 * The first two are warnings and the cycle is an error, which is the split the
 * rest of this catalog uses: a child whose parent is missing or is not a group
 * renders unparented — the wrong picture, from a document a newer build could
 * have meant (I2) — while a cycle is a document that cannot be resolved at all,
 * and no read of it produces the scene its author described.
 */
function checkParents(doc: TimelineDocument): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const byId = new Map(doc.clips.map((clip) => [clip.id, clip]));
  /** Chains already walked, so a shared ancestor is not re-walked per child. */
  const settled = new Map<string, "rooted" | "cyclic">();

  for (const clip of doc.clips) {
    const parentId = clip.parentId;
    if (parentId === undefined) continue;
    const at = { clipId: clip.id, trackId: clip.trackId, path: "parentId" };

    const parent = byId.get(parentId);
    if (!parent) {
      issues.push({
        severity: "warning",
        code: "parent_missing",
        message: `Clip "${clipLabel(clip)}" names parent "${parentId}", which the document does not contain — it renders unparented.`,
        ...at
      });
      continue;
    }
    if (parent.mediaType !== "group") {
      issues.push({
        severity: "warning",
        code: "parent_not_group",
        message: `Clip "${clipLabel(clip)}" names parent "${clipLabel(parent)}", whose mediaType is "${parent.mediaType}" — only a clip with mediaType "group" can be a transform parent.`,
        ...at
      });
      continue;
    }

    const walked: string[] = [];
    const seen = new Set<string>();
    let cursor: TimelineClip | undefined = clip;
    let loopedAt: string | undefined;
    while (cursor) {
      if (seen.has(cursor.id)) {
        loopedAt = cursor.id;
        break;
      }
      const known = settled.get(cursor.id);
      if (known === "rooted") break;
      if (known === "cyclic") {
        loopedAt = cursor.id;
        break;
      }
      seen.add(cursor.id);
      walked.push(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    for (const id of walked) {
      settled.set(id, loopedAt === undefined ? "rooted" : "cyclic");
    }
    if (loopedAt !== undefined) {
      issues.push({
        severity: "error",
        code: "parent_cycle",
        message: `Clip "${clipLabel(clip)}" has a parent chain that loops back to "${loopedAt}" — the chain is refused, so it renders unparented.`,
        ...at
      });
    }
  }

  return issues;
}

/**
 * What an overlap does at render, which is the half the warning used to leave
 * out.
 *
 * Two clips overlapping on one track cross-fade: with no `transitionIn` on the
 * later clip the renderer auto-cross-fades over exactly the overlap
 * (`resolveTransition`). That is what a picture track wants and what an overlay
 * track almost never does — two titles meant to be on screen together dissolve
 * into each other instead, and nobody asked for that transition. Concurrently
 * visible overlays belong on separate tracks.
 */
function overlapConsequence(
  later: TimelineClip,
  trackType: string | undefined
): string {
  if (later.transitionIn) {
    return `That window is the ${later.transitionIn.type} transition authored on "${clipLabel(later)}".`;
  }
  if (trackType === "midi") {
    // Nothing cross-fades notes: both phrases sound, and their notes sum.
    return "Both phrases play over the overlap and their notes sum — put one on its own midi track if that is not the chord you meant.";
  }
  const auto =
    "With no transition authored on the later clip the renderer auto-cross-fades over the overlap.";
  return trackType === "overlay" || trackType === "subtitle"
    ? `${auto} Two overlays meant to be visible at once belong on separate tracks — put one on its own track (add_track) instead of overlapping them here.`
    : auto;
}

function checkOverlaps(doc: TimelineDocument): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const trackTypes = new Map(doc.tracks.map((t) => [t.id, t.type]));
  const byTrack = new Map<string, TimelineClip[]>();
  for (const clip of doc.clips) {
    const list = byTrack.get(clip.trackId);
    if (list) list.push(clip);
    else byTrack.set(clip.trackId, [clip]);
  }
  for (const [trackId, clips] of byTrack) {
    const ordered = [...clips].sort((a, b) => a.startMs - b.startMs);
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const current = ordered[i]!;
      const end = current.startMs + Math.max(0, current.durationMs);
      for (let j = i + 1; j < ordered.length; j += 1) {
        const next = ordered[j]!;
        if (next.startMs >= end) break;
        issues.push({
          severity: "warning",
          code: "clips_overlap",
          message: `Clips "${clipLabel(current)}" (${current.startMs}–${end}ms) and "${clipLabel(next)}" (${next.startMs}–${next.startMs + next.durationMs}ms) overlap on track "${trackId}". ${overlapConsequence(next, trackTypes.get(trackId))}`,
          trackId,
          clipId: current.id
        });
      }
    }
  }
  return issues;
}

/**
 * Instants where more video clips overlap than the compositor will draw.
 *
 * The cap is applied while resolving a frame, so the clips past it never reach
 * the picture. Sampling frames to find that would miss an overlap shorter than
 * the sample interval, so this is a sweep over the clip windows themselves:
 * every start raises the count and every end lowers it, ends first at a shared
 * instant because a clip is active over `[startMs, startMs + durationMs)`. The
 * count is therefore exact at every boundary, and the peak between boundaries
 * is one of them.
 *
 * What counts is what the scene model would count: a clip on a visible video or
 * overlay track whose media is picture the compositor holds in its video pool.
 * Images are not capped, and audio, text, shape and group clips draw through
 * other paths.
 */
function checkVideoLayerCap(doc: TimelineDocument): TimelineDebugIssue[] {
  const cappedTrackIds = new Set(
    doc.tracks
      .filter(
        (track) =>
          track.visible && (track.type === "video" || track.type === "overlay")
      )
      .map((track) => track.id)
  );
  const capped = doc.clips.filter(
    (clip) =>
      cappedTrackIds.has(clip.trackId) &&
      (clip.mediaType === "video" || clip.mediaType === "overlay") &&
      clip.durationMs > 0
  );

  // -1 before +1 at one instant, so a clip ending where another starts does
  // not read as two simultaneous layers.
  const events = capped.flatMap((clip) => [
    { timeMs: clip.startMs, delta: 1 },
    { timeMs: clip.startMs + clip.durationMs, delta: -1 }
  ]);
  events.sort((a, b) => a.timeMs - b.timeMs || a.delta - b.delta);

  let open = 0;
  let peak = 0;
  let peakAtMs = 0;
  for (const event of events) {
    open += event.delta;
    if (open > peak) {
      peak = open;
      peakAtMs = event.timeMs;
    }
  }
  if (peak <= MAX_VIDEO_LAYERS) return [];

  return [
    {
      severity: "warning",
      code: "layer_cap_exceeded",
      message: `${peak} video clips overlap at ${peakAtMs}ms — the compositor draws ${MAX_VIDEO_LAYERS} and silently discards the rest, keeping the ones on the topmost tracks.`
    }
  ];
}

/**
 * MIDI: what a played part cannot survive.
 *
 * A midi clip is notes plus a window over them, and the track owns the synth —
 * so the two placement rules are errors: a midi clip anywhere but a midi track
 * has no instrument to sound it, and a non-midi clip on a midi track has no
 * picture path and no audio path either. Both are silence, not a different
 * picture, which is what separates them from the warnings below.
 *
 * `midi_clip_retimed` is the same class: `speedMultiplier`, `speedBaked` and
 * `timeRemap` all retime *source samples*, and a midi clip has none — its
 * timing comes from ticks read against the tempo. A retimed midi clip is a
 * document no reader can honour, so it is reported rather than silently
 * ignored at render.
 *
 * The two warnings are recoverable: a clip whose window plays none of its
 * notes still loads (it just makes no sound), and a document with midi and no
 * `tempo` is read at {@link DEFAULT_TEMPO} — right until someone stores a
 * different one and every phrase moves.
 */
function checkMidi(doc: TimelineDocument): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const trackTypes = new Map(doc.tracks.map((track) => [track.id, track.type]));
  const bpm = resolveTempo(doc).bpm;
  let sawMidi = doc.tracks.some((track) => track.type === "midi");

  for (const clip of doc.clips) {
    const trackType = trackTypes.get(clip.trackId);
    const at = { clipId: clip.id, trackId: clip.trackId };
    const label = clipLabel(clip);

    if (clip.mediaType === "midi") {
      sawMidi = true;
      // An unknown track is already `clip_track_missing`; saying it twice
      // helps nobody.
      if (trackType !== undefined && trackType !== "midi") {
        issues.push({
          severity: "error",
          code: "midi_clip_off_midi_track",
          message: `Clip "${label}" carries notes but sits on a ${trackType} track — only a midi track has an instrument to play them, so it makes no sound. Move it to a midi track (add_track type "midi").`,
          path: "trackId",
          ...at
        });
      }
    } else if (trackType === "midi") {
      issues.push({
        severity: "error",
        code: "non_midi_clip_on_midi_track",
        message: `Clip "${label}" is a ${clip.mediaType} clip on a midi track — a midi track plays notes through its instrument and draws no picture, so this clip is neither heard nor seen.`,
        path: "trackId",
        ...at
      });
    }

    // Checked wherever notes are stored: a list is unplayable for the same
    // reasons whatever kind of clip is carrying it.
    for (const problem of validateNotes(clip.notes ?? [])) {
      issues.push({
        severity: "error",
        code: "midi_notes_invalid",
        message: `Clip "${label}"${problem.noteId ? ` note "${problem.noteId}"` : ""}: ${problem.message}`,
        path: problem.index === undefined ? "notes" : `notes[${problem.index}]`,
        ...at
      });
    }

    if (clip.mediaType !== "midi") continue;

    const retimed: string[] = [];
    if (clip.speedMultiplier !== undefined && clip.speedMultiplier !== 1) {
      retimed.push(`speedMultiplier ${clip.speedMultiplier}`);
    }
    if (clip.speedBaked) retimed.push("speedBaked");
    if (clip.timeRemap) retimed.push("timeRemap");
    if (retimed.length > 0) {
      issues.push({
        severity: "error",
        code: "midi_clip_retimed",
        message: `Clip "${label}" carries ${retimed.join(" and ")} — those retime source samples, and a midi clip has none: its timing is ticks read against the document tempo. Change the tempo with set_tempo instead.`,
        path: "speedMultiplier",
        ...at
      });
    }

    const carried = clip.notes?.length ?? 0;
    if (visibleNotes(clip, bpm).length === 0) {
      const windowStart = clip.inPointMs ?? 0;
      issues.push({
        severity: "warning",
        code: "midi_clip_silent",
        message:
          carried === 0
            ? `Clip "${label}" carries no notes, so it makes no sound. Give it some with set_notes, or delete it.`
            : `Clip "${label}" plays none of its ${carried} notes: not one of them starts inside the clip's window (${windowStart}–${windowStart + clip.durationMs}ms of content at ${bpm} BPM). Widen the window or move the notes.`,
        ...at
      });
    }
  }

  if (sawMidi && doc.tempo === undefined) {
    issues.push({
      severity: "warning",
      code: "midi_tempo_missing",
      message: `This document has midi in it but no \`tempo\`, so every note is read at the ${DEFAULT_TEMPO.bpm} BPM default. Store the tempo with set_tempo — the moment one is written the midi clips are rescaled to it.`,
      path: "tempo"
    });
  }

  return issues;
}

function checkDocumentLevel(doc: TimelineDocument): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];

  for (const marker of doc.markers) {
    if (marker.timeMs < 0) {
      issues.push({
        severity: "error",
        code: "negative_timing",
        message: `Marker "${marker.label || marker.id}" sits at ${marker.timeMs}ms — before the timeline origin.`,
        path: "markers[*].timeMs"
      });
    }
  }

  // Only visual tracks composite, so only they compete for z-order. Audio
  // tracks sharing an index with anything is normal and harmless.
  const indexes = new Map<number, string>();
  for (const track of doc.tracks) {
    // Neither audio nor midi composites, so neither competes for z-order.
    if (track.type === "audio" || track.type === "midi") continue;
    const previous = indexes.get(track.index);
    if (previous !== undefined) {
      issues.push({
        severity: "warning",
        code: "duplicate_track_index",
        message: `Visual tracks "${previous}" and "${track.id}" both claim index ${track.index} — their stacking order is undefined.`,
        trackId: track.id
      });
    } else {
      indexes.set(track.index, track.id);
    }
  }

  const clipIds = new Set(doc.clips.map((clip) => clip.id));
  for (const line of doc.transcript ?? []) {
    for (const clipId of line.clipIds) {
      if (!clipIds.has(clipId)) {
        issues.push({
          severity: "warning",
          code: "transcript_clip_missing",
          message: `Transcript line "${line.id}" owns clip "${clipId}", which the document does not contain.`,
          clipId
        });
      }
    }
  }

  // A `linkId` binds a video clip to its extracted audio; a lone one means the
  // partner was deleted and moves/trims no longer travel together.
  const linked = new Map<string, string[]>();
  for (const clip of doc.clips) {
    if (!clip.linkId) continue;
    const list = linked.get(clip.linkId);
    if (list) list.push(clip.id);
    else linked.set(clip.linkId, [clip.id]);
  }
  for (const [linkId, ids] of linked) {
    if (ids.length === 1) {
      issues.push({
        severity: "warning",
        code: "link_partner_missing",
        message: `Clip "${ids[0]}" carries linkId "${linkId}" but no other clip shares it — its linked partner is gone.`,
        clipId: ids[0]
      });
    }
  }

  return issues;
}

/** The shape of a Zod issue this module reads, including a union's branches. */
interface SchemaIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
  readonly errors?: readonly (readonly SchemaIssue[])[];
}

/**
 * Zod issues as the paths and messages a reader can act on.
 *
 * `transitionIn` and every `effects[]` entry are unions (I2: a type from a
 * newer build parses through a permissive branch). A union reports one
 * `invalid_union` against the object with the reason each branch failed buried
 * in `errors`, so reporting it verbatim would say "Invalid input" about the
 * clip rather than naming the field that is wrong. Flattening puts each
 * branch's issues back on the union's own path.
 */
function flattenSchemaIssues(
  issues: readonly SchemaIssue[],
  prefix: readonly PropertyKey[] = []
): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [];
  for (const issue of issues) {
    const path = [...prefix, ...issue.path];
    if (issue.errors === undefined) {
      out.push({
        path: path.map((p) => String(p)).join("."),
        message: issue.message
      });
      continue;
    }
    for (const branch of issue.errors) {
      out.push(...flattenSchemaIssues(branch, path));
    }
  }
  return out;
}

/**
 * Validate a parsed-JSON timeline document. `raw` is untrusted: anything that
 * fails the schema is reported as `schema_invalid` and the structural checks
 * are skipped, since they read fields the parse could not establish.
 */
export function validateTimelineSequence(
  raw: unknown,
  meta?: TimelineValidationMeta
): TimelineValidation {
  const parsed = timelineDocument.safeParse(raw);
  if (!parsed.success) {
    const errors: TimelineDebugIssue[] = flattenSchemaIssues(
      parsed.error.issues
    )
      .slice(0, 25)
      .map(({ path, message }) => {
        const schemaIssue: TimelineDebugIssue = {
          severity: "error",
          code: "schema_invalid",
          message: `${path || "(root)"}: ${message}`
        };
        if (path) {
          schemaIssue.path = path;
        }
        return schemaIssue;
      });
    if (errors.length === 0) {
      errors.push({
        severity: "error",
        code: "schema_invalid",
        message: "Document does not match the timeline schema."
      });
    }
    return { ok: false, errors, warnings: [] };
  }

  const doc = parsed.data;
  const fps = meta?.fps && meta.fps > 0 ? meta.fps : DEFAULT_FPS;
  const canvas = {
    width: meta?.width && meta.width > 0 ? meta.width : DEFAULT_WIDTH,
    height: meta?.height && meta.height > 0 ? meta.height : DEFAULT_HEIGHT
  };
  const trackIds = new Set(doc.tracks.map((track) => track.id));

  const issues: TimelineDebugIssue[] = [
    ...checkFieldStripping(raw, doc),
    ...checkDuplicateIds(doc),
    ...doc.clips.flatMap((clip) => checkClip(clip, trackIds, fps, canvas)),
    ...doc.clips.flatMap((clip) => checkClipMotion(clip, canvas)),
    ...checkLegibility(doc, canvas.height),
    ...checkParents(doc),
    ...checkMattes(doc),
    ...checkGeneratedMattes(doc),
    ...checkMatteSourceAdjustment(doc),
    ...checkAdjustmentEffects(doc),
    ...checkAdjustmentTargets(doc),
    ...checkOverlaps(doc),
    ...checkVideoLayerCap(doc),
    ...checkMidi(doc),
    ...checkDocumentLevel(doc)
  ];

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { ok: errors.length === 0, errors, warnings };
}
