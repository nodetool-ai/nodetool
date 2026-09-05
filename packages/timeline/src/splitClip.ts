import { createTimeOrderedUuid } from "./defaults.js";
import { getAnimationPreset } from "./animation/presets.js";
import { sourceRate } from "./sourceRate.js";
import { assertNotTimeRemapped } from "./timeRemap.js";
import type { ClipAnimation } from "./animation/types.js";
import type { CaptionWord, TimelineClip } from "./types.js";

/**
 * Partition a clip's animations across a split at `splitMs` (clip-local ms).
 *
 * - `"in"` stays on the left half (it plays at the clip's original start),
 *   `"out"` on the right (it plays at the original end).
 * - An `"emphasis"` plays once at its `delayMs`, so it belongs to exactly one
 *   half: left when the delay falls before the cut, otherwise right with the
 *   delay rebased to the right half's start.
 * - A `"loop"` runs on both halves. `windowT` counts the cycle from the clip's
 *   own start, so the right half's delay is shifted to the next cycle boundary
 *   after the cut — the cycle grid carries across the cut instead of the loop
 *   restarting mid-cycle. A loop that has not started yet keeps the rest of
 *   its delay.
 * - A `fullClip` preset (kenBurns) ignores `delayMs` and runs once over the
 *   whole clip, and its curves are in canvas pixels that `splitClip` cannot
 *   compute, so neither half can carry a partial move: both replay the whole
 *   one-shot.
 *
 * Right-half animations get fresh ids so the two clips edit independently.
 */
function splitAnimations(
  animations: ReadonlyArray<ClipAnimation>,
  splitMs: number
) {
  const left: ClipAnimation[] = [];
  const right: ClipAnimation[] = [];
  for (const anim of animations) {
    if (anim.role === "in") {
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
 * Right-half delay for a loop cut at `splitMs`. Before the loop starts the
 * remaining delay carries over; after it has started, the delay lands on the
 * first cycle boundary at or after the cut, so the right half samples the same
 * phase the left half would have. `delayMs` cannot go negative (the compiler
 * clamps it), so a cut inside a cycle costs the remainder of that cycle rather
 * than re-phasing the loop.
 */
function rebaseLoopDelayMs(anim: ClipAnimation, splitMs: number): number {
  const delayMs = Math.max(0, anim.delayMs ?? 0);
  if (delayMs >= splitMs) {
    return delayMs - splitMs;
  }
  const preset = getAnimationPreset(anim.preset);
  if (preset?.fullClip === true) {
    return delayMs;
  }
  const periodMs = Math.max(1, anim.durationMs);
  const elapsedInCycleMs = (splitMs - delayMs) % periodMs;
  return elapsedInCycleMs === 0 ? 0 : periodMs - elapsedInCycleMs;
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

export function splitClip(clip: TimelineClip, atMs: number): [TimelineClip, TimelineClip] {
  // A group is a transform parent, not media: cutting it in two would leave
  // its children naming a parent that no longer covers them (D4).
  if (clip.mediaType === "group") {
    throw new Error(
      "splitClip cannot split a group — split the clips inside it instead"
    );
  }

  // A remap is a curve over this clip's window; two windows would resample it
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

  const animations = clip.animations ? splitAnimations(clip.animations, leftDurationMs) : null;

  const leftClip: TimelineClip = {
    ...clip,
    id: createTimeOrderedUuid(),
    durationMs: leftDurationMs,
    inPointMs,
    outPointMs: cutPointMs,
    versions: sharedVersions
  };
  // The left half's end is now an interior cut — drop the outgoing fade.
  delete leftClip.fadeOutMs;
  if (captions) {
    leftClip.caption = { words: captions.left };
  }
  if (animations) {
    leftClip.animations = animations.left;
  }

  const rightClip: TimelineClip = {
    ...clip,
    id: createTimeOrderedUuid(),
    startMs: atMs,
    durationMs: rightDurationMs,
    inPointMs: cutPointMs,
    outPointMs,
    versions: sharedVersions
  };
  // The right half's start is now an interior cut — drop the incoming fade and
  // the incoming transition (the boundary with the left half is a hard cut).
  delete rightClip.fadeInMs;
  delete rightClip.transitionIn;
  if (captions) {
    rightClip.caption = { words: captions.right };
  }
  if (animations) {
    rightClip.animations = animations.right;
  }

  return [leftClip, rightClip];
}
