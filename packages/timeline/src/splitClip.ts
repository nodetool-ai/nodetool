import { createTimeOrderedUuid } from "./defaults.js";
import { getAnimationPreset } from "./animation/presets.js";
import {
  isSourceAnchoredAnimation,
  sliceSourceAnimation
} from "./animation/sourceCurves.js";
import { sourceRate } from "./sourceRate.js";
import { isKeyframeAnimation, sliceKeyframeAnimation } from "./keyframes.js";
import { sliceParamCurves } from "./paramCurves.js";
import { assertNotTimeRemapped, isHoldRemap } from "./timeRemap.js";
import { DEFAULT_TEMPO } from "./midi/tempo.js";
import { msToTicks } from "./midi/ticks.js";
import { bakeRegionQuantize } from "./midi/regionParams.js";
import { curveValueAt as valueAt, expressionUpTo } from "./midi/curveCut.js";
import type { ClipAnimation } from "./animation/types.js";
import type {
  CaptionWord,
  MidiControllerLane,
  MidiExpressionPoint,
  MidiNote,
  TimelineClip
} from "./types.js";

/** What a split does with a midi note that crosses the cut. */
export type SplitCrossing = "shorten" | "split";

export interface SplitClipOptions {
  /** Tempo of the document, to turn the cut into content ticks. Default 120. */
  bpm?: number;
  /** `tempo.offsetMs`, the origin of the grid a region quantize snaps to. Default 0. */
  gridOffsetMs?: number;
  /** A midi note that crosses the cut: end it at the cut (default) or also play its rest on the right. */
  crossing?: SplitCrossing;
}

function expressionAfter(
  expression: NonNullable<MidiNote["expression"]>,
  offset: number
): MidiNote["expression"] | undefined {
  const out: NonNullable<MidiNote["expression"]> = {};
  for (const key of ["pitch", "volume", "pan", "brightness"] as const) {
    const points = expression[key];
    if (!points?.length) continue;
    const kept: MidiExpressionPoint[] = points
      .filter((p) => p.tick >= offset)
      .map((p) => ({ tick: p.tick - offset, value: p.value }));
    if (kept.length === 0 || kept[0]!.tick > 0) {
      const carried = valueAt(points, offset);
      if (carried !== undefined) kept.unshift({ tick: 0, value: carried });
    }
    out[key] = kept;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Partition a midi clip's notes and controllers at `cutTick` (content ticks).
 * Only the visible window `[windowStartTick, windowEndTick)` is read: a note
 * that starts before the window or after it is hidden and stays out of both
 * halves. The left half keeps what starts before the cut, the right half what
 * starts at or after it, re-based to the cut. Neither half holds hidden content.
 */
function splitMidiContent(
  notes: ReadonlyArray<MidiNote>,
  controllers: ReadonlyArray<MidiControllerLane>,
  cutTick: number,
  crossing: SplitCrossing,
  windowStartTick: number,
  windowEndTick: number
) {
  const leftNotes: MidiNote[] = [];
  const rightNotes: MidiNote[] = [];
  for (const n of notes) {
    if (n.startTick < windowStartTick || n.startTick >= windowEndTick) continue;
    if (n.startTick >= cutTick) {
      rightNotes.push({ ...n, id: createTimeOrderedUuid(), startTick: n.startTick - cutTick });
      continue;
    }
    const end = n.startTick + n.durationTick;
    if (end <= cutTick) {
      leftNotes.push(n);
      continue;
    }
    const keptLength = cutTick - n.startTick;
    const head: MidiNote = { ...n, durationTick: keptLength };
    if (n.expression) {
      const expr = expressionUpTo(n.expression, keptLength);
      if (expr) head.expression = expr;
      else delete head.expression;
    }
    leftNotes.push(head);
    if (crossing === "split") {
      const tail: MidiNote = { ...n, id: createTimeOrderedUuid(), startTick: 0, durationTick: end - cutTick };
      if (n.expression) {
        const expr = expressionAfter(n.expression, keptLength);
        if (expr) tail.expression = expr;
        else delete tail.expression;
      }
      rightNotes.unshift(tail);
    }
  }
  const leftLanes: MidiControllerLane[] = [];
  const rightLanes: MidiControllerLane[] = [];
  for (const lane of controllers) {
    const step = lane.interpolation === "step";
    const visible = lane.points.filter(
      (p) => p.tick >= windowStartTick && p.tick < windowEndTick
    );
    // The value held from before the window keeps sounding at its start.
    if (
      lane.points.some((p) => p.tick < windowStartTick) &&
      (visible.length === 0 || visible[0]!.tick > windowStartTick)
    ) {
      const held = valueAt(lane.points, windowStartTick, step);
      if (held !== undefined) {
        visible.unshift({
          id: createTimeOrderedUuid(),
          tick: windowStartTick,
          value: Math.round(held)
        });
      }
    }
    // A ramp whose next point lies past the window end stops at the last
    // visible point. End the window on the value the ramp reaches there.
    const lastVisible = visible[visible.length - 1];
    if (
      !step &&
      lastVisible &&
      lastVisible.tick < windowEndTick - 1 &&
      lane.points.some((p) => p.tick >= windowEndTick)
    ) {
      const edge = valueAt(lane.points, windowEndTick - 1, false);
      if (edge !== undefined) {
        visible.push({
          id: createTimeOrderedUuid(),
          tick: windowEndTick - 1,
          value: Math.round(edge)
        });
      }
    }
    const before = visible.filter((p) => p.tick < cutTick);
    const after = visible.filter((p) => p.tick >= cutTick);
    // The left half keeps the ramp up to the cut.
    const lastBefore = before[before.length - 1];
    if (!step && lastBefore && after.length > 0 && lastBefore.tick < cutTick - 1) {
      const edge = valueAt(lane.points, cutTick - 1, false);
      if (edge !== undefined) {
        before.push({ id: createTimeOrderedUuid(), tick: cutTick - 1, value: Math.round(edge) });
      }
    }
    if (before.length > 0) leftLanes.push({ ...lane, points: before });
    if (after.length === 0 && before.length === 0) continue;
    const points = after.map((p) => ({ ...p, id: createTimeOrderedUuid(), tick: p.tick - cutTick }));
    // The value in force at the cut keeps sounding on the right half.
    if (before.length > 0 && (points.length === 0 || points[0]!.tick > 0)) {
      const carried = valueAt(lane.points, cutTick, step);
      if (carried !== undefined) {
        points.unshift({ id: createTimeOrderedUuid(), tick: 0, value: Math.round(carried) });
      }
    }
    if (points.length > 0) rightLanes.push({ ...lane, id: createTimeOrderedUuid(), points });
  }
  return { leftNotes, rightNotes, leftLanes, rightLanes };
}

/**
 * Partition a clip's animations across a split at `splitMs` (clip-local ms).
 *
 * - `"in"` stays on the left half (it plays at the clip's original start),
 *   `"out"` on the right (it plays at the original end).
 * - An `"emphasis"` plays once at its `delayMs`, so it belongs to exactly one
 *   half: left when the delay falls before the cut, otherwise right with the
 *   delay rebased to the right half's start.
 * - A `"loop"` runs on both halves. `windowT` counts the cycle from the clip's
 *   own start, so the right half's delay goes negative by the time already
 *   elapsed — the compiler reads that as a phase offset and opens the right
 *   half mid-cycle exactly where the left half left off, rather than
 *   restarting the loop at the cut. A loop that has not started yet keeps the
 *   rest of its delay ({@link rebaseLoopDelayMs}).
 * - A `fullClip` preset (kenBurns) ignores `delayMs` and runs once over the
 *   whole clip, and its curves are in canvas pixels that `splitClip` cannot
 *   compute, so neither half can carry a partial move: both replay the whole
 *   one-shot.
 * - A source-anchored custom animation (`custom.timeBase: "source"`) is placed
 *   on the media's clock rather than the clip's, so role says nothing about
 *   which half it belongs to: BOTH halves get it, each carrying the stretch of
 *   the curve its own source window shows (`animation/sourceCurves.ts`).
 *
 * - The hand-keyframe animation spans the whole clip with `t` normalized over
 *   it, so each half gets the stretch of every curve inside its own span
 *   ({@link sliceKeyframeAnimation}), not the whole curve squeezed into one.
 *
 * Right-half animations get fresh ids so the two clips edit independently.
 */
function splitAnimations(
  animations: ReadonlyArray<ClipAnimation>,
  splitMs: number,
  source: {
    inPointMs: number;
    leftOutMs: number;
    rightInMs: number;
    outPointMs: number;
    leftDurationMs: number;
    rightDurationMs: number;
  }
) {
  const left: ClipAnimation[] = [];
  const right: ClipAnimation[] = [];
  for (const anim of animations) {
    if (isSourceAnchoredAnimation(anim)) {
      left.push(
        sliceSourceAnimation(
          anim,
          source.inPointMs,
          source.leftOutMs,
          source.leftDurationMs
        )
      );
      right.push({
        ...sliceSourceAnimation(
          anim,
          source.rightInMs,
          source.outPointMs,
          source.rightDurationMs
        ),
        id: createTimeOrderedUuid()
      });
    } else if (isKeyframeAnimation(anim)) {
      const totalMs = source.leftDurationMs + source.rightDurationMs;
      const cutT = totalMs > 0 ? splitMs / totalMs : 0;
      left.push(sliceKeyframeAnimation(anim, 0, cutT, source.leftDurationMs));
      right.push({
        ...sliceKeyframeAnimation(anim, cutT, 1, source.rightDurationMs),
        id: createTimeOrderedUuid()
      });
    } else if (anim.role === "in") {
      left.push({ ...anim });
    } else if (anim.role === "out") {
      right.push({ ...anim, id: createTimeOrderedUuid() });
    } else if (anim.role === "emphasis") {
      const delayMs = Math.max(0, anim.delayMs ?? 0);
      if (delayMs < splitMs) {
        left.push({ ...anim });
      } else {
        right.push({
          ...anim,
          id: createTimeOrderedUuid(),
          delayMs: delayMs - splitMs
        });
      }
    } else {
      left.push({ ...anim });
      right.push({
        ...anim,
        id: createTimeOrderedUuid(),
        delayMs: rebaseLoopDelayMs(anim, splitMs)
      });
    }
  }
  return { left, right };
}

/**
 * The animations of one window `[offsetMs, offsetMs + durationMs)` of a clip
 * `totalMs` long, for a copy that plays only that window (an unrolled repeat,
 * a section copy). An `in` animation stays with a window that starts at the
 * clip start and an `out` one with a window that ends at the clip end. An
 * `emphasis` plays once, in the window that holds its delay. A `loop` keeps its
 * phase. Keyframe animations keep their own stretch. A source-anchored one
 * keeps the stretch of `[sourceFromMs, sourceToMs)`. Copies take fresh ids
 * unless `keepIds` is set.
 */
export function animationsForWindow(
  animations: ReadonlyArray<ClipAnimation>,
  window: {
    offsetMs: number;
    durationMs: number;
    totalMs: number;
    sourceFromMs: number;
    sourceToMs: number;
  },
  keepIds = false
): ClipAnimation[] {
  const { offsetMs, durationMs, totalMs } = window;
  const first = offsetMs <= 1e-6;
  const last = offsetMs + durationMs >= totalMs - 1e-6;
  const out: ClipAnimation[] = [];
  for (const anim of animations) {
    let next: ClipAnimation | undefined;
    if (isSourceAnchoredAnimation(anim)) {
      next = sliceSourceAnimation(
        anim,
        window.sourceFromMs,
        window.sourceToMs,
        durationMs
      );
    } else if (isKeyframeAnimation(anim)) {
      next = sliceKeyframeAnimation(
        anim,
        totalMs > 0 ? offsetMs / totalMs : 0,
        totalMs > 0 ? (offsetMs + durationMs) / totalMs : 1,
        durationMs
      );
    } else if (anim.role === "in") {
      if (first) next = { ...anim };
    } else if (anim.role === "out") {
      if (last) next = { ...anim };
    } else if (anim.role === "emphasis") {
      const delayMs = Math.max(0, anim.delayMs ?? 0);
      if (delayMs >= offsetMs - 1e-6 && (last || delayMs < offsetMs + durationMs)) {
        next = { ...anim, delayMs: delayMs - offsetMs };
      }
    } else {
      next = { ...anim, delayMs: rebaseLoopDelayMs(anim, offsetMs) };
    }
    if (next) out.push(keepIds ? next : { ...next, id: createTimeOrderedUuid() });
  }
  return out;
}

/**
 * Right-half delay for a loop cut at `splitMs`. Before the loop starts the
 * remaining delay carries over. After it has started the delay goes negative
 * by the time already elapsed, which the compiler reads as a phase offset
 * (`loopOriginMs`): the right half opens at 0 mid-cycle exactly where the
 * left half left off, with no pause to the next boundary. A `fullClip` loop
 * ignores delay and replays whole on both halves.
 */
function rebaseLoopDelayMs(anim: ClipAnimation, splitMs: number): number {
  const delayMs = anim.delayMs ?? 0;
  const preset = getAnimationPreset(anim.preset);
  if (preset?.fullClip === true) {
    return Math.max(0, delayMs);
  }
  return delayMs - splitMs;
}

/**
 * Partition clip-local caption words at `splitMs` — the split point measured in
 * timeline-ms from the clip's start. Each word is assigned by its start time:
 * words starting before the split stay on the left half; words starting at or
 * after it move to the right half and are rebased so their timings remain
 * clip-local to the right half's new start. Words are never duplicated, and
 * each half's word timings are clamped to that half's span.
 */
function splitCaptionWords(
  words: ReadonlyArray<CaptionWord>,
  splitMs: number,
  rightDurationMs: number
) {
  const left: CaptionWord[] = [];
  const right: CaptionWord[] = [];
  for (const word of words) {
    if (word.startMs < splitMs) {
      left.push({ ...word, endMs: Math.min(word.endMs, splitMs) });
    } else {
      right.push({
        ...word,
        startMs: Math.max(0, word.startMs - splitMs),
        endMs: Math.min(word.endMs - splitMs, rightDurationMs)
      });
    }
  }
  return { left, right };
}

export function splitClip(
  source: TimelineClip,
  atMs: number,
  options: SplitClipOptions = {}
): [TimelineClip, TimelineClip] {
  // A region quantize is written into the notes first, at the clip's own place
  // on the tempo grid. Each half then plays the notes the whole clip played,
  // wherever the cut falls (a note the quantize moved across the cut included).
  const clip =
    source.mediaType === "midi" && !source.pattern
      ? bakeRegionQuantize(
          source,
          options.bpm ?? DEFAULT_TEMPO.bpm,
          options.gridOffsetMs ?? 0
        )
      : source;
  // A group is a transform parent, not media: cutting it in two would leave
  // its children naming a parent that no longer covers them (D4).
  if (clip.mediaType === "group") {
    throw new Error(
      "splitClip cannot split a group — split the clips inside it instead"
    );
  }

  // A nonconstant remap is a curve over this window; two windows resample it
  // and move every frame both halves show (D13).
  assertNotTimeRemapped(clip, "splitClip");

  const clipEndMs = clip.startMs + clip.durationMs;
  if (atMs <= clip.startMs || atMs >= clipEndMs) {
    throw new Error("splitClip requires startMs < atMs < startMs + durationMs");
  }

  const leftDurationMs = atMs - clip.startMs;
  const rightDurationMs = clipEndMs - atMs;

  // Source in/out points are source-space; one timeline-ms consumes `rate`
  // source-ms, so the cut lands `leftDurationMs * rate` into the source.
  const rate = sourceRate(clip);
  const inPointMs = clip.inPointMs ?? 0;
  const outPointMs = clip.outPointMs ?? inPointMs + clip.durationMs * rate;
  const cutPointMs = inPointMs + leftDurationMs * rate;

  // Intentionally shared: both split clips reference the same generation history metadata.
  // Regenerating one half creates a new version for that half only; it does not auto-regenerate the sibling.
  const sharedVersions = clip.versions;

  // Captions are clip-local in timeline-ms, so they partition at the timeline
  // cut (`leftDurationMs`) independent of playback rate.
  const captions = clip.caption
    ? splitCaptionWords(clip.caption.words, leftDurationMs, rightDurationMs)
    : null;

  const animations = clip.animations
    ? splitAnimations(clip.animations, leftDurationMs, {
        inPointMs,
        // Both halves of a hold show the same source window, so each keeps the whole curve.
        leftOutMs: isHoldRemap(clip) ? outPointMs : cutPointMs,
        rightInMs: isHoldRemap(clip) ? inPointMs : cutPointMs,
        outPointMs,
        leftDurationMs,
        rightDurationMs
      })
    : null;

  const leftClip: TimelineClip = {
    ...clip,
    id: createTimeOrderedUuid(),
    durationMs: leftDurationMs,
    versions: sharedVersions
  };
  if (!isHoldRemap(clip)) {
    leftClip.inPointMs = inPointMs;
    leftClip.outPointMs = cutPointMs;
  }
  // The left half's end is now an interior cut — drop the outgoing fade.
  delete leftClip.fadeOutMs;
  delete leftClip.fadeOutShape;
  if (captions) {
    leftClip.caption = { ...clip.caption, words: captions.left };
  }
  if (clip.paramCurves) {
    leftClip.paramCurves = sliceParamCurves(clip.paramCurves, 0, leftDurationMs / clip.durationMs, clip.durationMs);
  }
  if (animations) {
    leftClip.animations = animations.left;
  }

  const rightClip: TimelineClip = {
    ...clip,
    id: createTimeOrderedUuid(),
    startMs: atMs,
    durationMs: rightDurationMs,
    versions: sharedVersions
  };
  if (!isHoldRemap(clip)) {
    rightClip.inPointMs = cutPointMs;
    rightClip.outPointMs = outPointMs;
  }
  // The right half's start is now an interior cut — drop the incoming fade and
  // the incoming transition (the boundary with the left half is a hard cut).
  delete rightClip.fadeInMs;
  delete rightClip.fadeInShape;
  delete rightClip.transitionIn;
  if (captions) {
    rightClip.caption = { ...clip.caption, words: captions.right };
  }
  if (clip.paramCurves) {
    rightClip.paramCurves = sliceParamCurves(clip.paramCurves, leftDurationMs / clip.durationMs, 1, clip.durationMs);
  }
  if (animations) {
    rightClip.animations = animations.right;
  }

  if (clip.mediaType === "midi" && clip.pattern) {
    // SQ23 (D87): split a pattern region into two independent pattern regions
    // whose phase continues across the cut so playback and cycle counts match.
    const bpm = options.bpm ?? DEFAULT_TEMPO.bpm;
    const basePhase =
      (clip.patternPhaseTicks ?? 0) + Math.round(msToTicks(inPointMs, bpm));
    const cutOffsetTicks = Math.round(msToTicks(leftDurationMs, bpm));
    leftClip.pattern = structuredClone(clip.pattern);
    rightClip.pattern = structuredClone(clip.pattern);
    if (clip.patternRowCycles) {
      leftClip.patternRowCycles = structuredClone(clip.patternRowCycles);
      rightClip.patternRowCycles = structuredClone(clip.patternRowCycles);
    }
    delete leftClip.notes;
    delete leftClip.controllers;
    delete rightClip.notes;
    delete rightClip.controllers;
    leftClip.inPointMs = 0;
    rightClip.inPointMs = 0;
    if (basePhase > 0) leftClip.patternPhaseTicks = basePhase;
    else delete leftClip.patternPhaseTicks;
    rightClip.patternPhaseTicks = basePhase + cutOffsetTicks;
    if (clip.outPointMs !== undefined) {
      leftClip.outPointMs = leftDurationMs;
      rightClip.outPointMs = rightDurationMs;
    } else {
      delete leftClip.outPointMs;
      delete rightClip.outPointMs;
    }
  } else if (clip.mediaType === "midi") {
    const bpm = options.bpm ?? DEFAULT_TEMPO.bpm;
    const cutTick = Math.round(msToTicks(inPointMs + leftDurationMs, bpm));
    const parts = splitMidiContent(
      clip.notes ?? [],
      clip.controllers ?? [],
      cutTick,
      options.crossing ?? "shorten",
      Math.round(msToTicks(inPointMs, bpm)),
      Math.round(msToTicks(inPointMs + clip.durationMs, bpm))
    );
    if (clip.notes) {
      leftClip.notes = parts.leftNotes;
      rightClip.notes = parts.rightNotes;
    }
    if (clip.controllers) {
      leftClip.controllers = parts.leftLanes;
      rightClip.controllers = parts.rightLanes;
    }
    // The right half's content starts at the cut.
    rightClip.inPointMs = 0;
    if (clip.outPointMs !== undefined) {
      rightClip.outPointMs = rightDurationMs;
    } else {
      delete rightClip.outPointMs;
    }
  }

  return [leftClip, rightClip];
}
