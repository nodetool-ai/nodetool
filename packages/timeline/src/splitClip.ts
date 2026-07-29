import { createTimeOrderedUuid } from "./defaults.js";
import { sourceRate } from "./sourceRate.js";
import type { ClipAnimation } from "./animation/types.js";
import type { CaptionWord, TimelineClip } from "./types.js";

/**
 * Partition a clip's animations across a split. `"in"` animations stay on the
 * left half (they play at the clip's original start); `"out"` on the right (they
 * play at the original end); `"emphasis"` and `"loop"` are copied to both halves
 * — their windows re-derive from each half's own duration at compile time.
 * Right-half animations get fresh ids so the two clips edit independently.
 */
function splitAnimations(
  animations: ReadonlyArray<ClipAnimation>
): { left: ClipAnimation[]; right: ClipAnimation[] } {
  const left: ClipAnimation[] = [];
  const right: ClipAnimation[] = [];
  for (const anim of animations) {
    if (anim.role === "in") {
      left.push({ ...anim });
    } else if (anim.role === "out") {
      right.push({ ...anim, id: createTimeOrderedUuid() });
    } else {
      left.push({ ...anim });
      right.push({ ...anim, id: createTimeOrderedUuid() });
    }
  }
  return { left, right };
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
): { left: CaptionWord[]; right: CaptionWord[] } {
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

  const animations = clip.animations ? splitAnimations(clip.animations) : null;

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
