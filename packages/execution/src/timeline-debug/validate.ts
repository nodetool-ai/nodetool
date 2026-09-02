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
  sourceRate
} from "@nodetool-ai/timeline";
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

/** Collect every leaf/branch path the parse output dropped from the input. */
function collectStrippedPaths(
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
  fps: number
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
    const baked = normalizeCustomCurves(animation.custom?.curves);
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
  const shapeKind = unknownShapeKindIssue(clip);
  if (shapeKind) issues.push(shapeKind);
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

function checkOverlaps(doc: TimelineDocument): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
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
          message: `Clips "${clipLabel(current)}" (${current.startMs}–${end}ms) and "${clipLabel(next)}" (${next.startMs}–${next.startMs + next.durationMs}ms) overlap on track "${trackId}".`,
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
    if (track.type === "audio") continue;
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
    ...doc.clips.flatMap((clip) => checkClip(clip, trackIds, fps)),
    ...doc.clips.flatMap((clip) => checkClipMotion(clip, canvas)),
    ...checkLegibility(doc, canvas.height),
    ...checkParents(doc),
    ...checkMattes(doc),
    ...checkOverlaps(doc),
    ...checkVideoLayerCap(doc),
    ...checkDocumentLevel(doc)
  ];

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { ok: errors.length === 0, errors, warnings };
}
