/**
 * A looped clip's window: its length and where each repeat starts. Kept apart
 * from `clipLoop.ts` so the modules that loop expansion itself depends on can
 * read it without importing the expansion back.
 */

import type { TimelineClip } from "./types.js";

export type LoopFields = Pick<TimelineClip, "loopLengthMs" | "durationMs">;

/** The loop window length when `clip` loops, otherwise undefined. */
export function activeLoopMs(clip: LoopFields): number | undefined {
  const length = clip.loopLengthMs;
  if (length === undefined || !Number.isFinite(length) || length <= 0) {
    return undefined;
  }
  return length < clip.durationMs ? length : undefined;
}

/** How many windows the clip plays, counting a partial last one. 1 without a loop. */
export function loopRepeatCount(clip: LoopFields): number {
  const length = activeLoopMs(clip);
  if (length === undefined) return 1;
  return Math.ceil(clip.durationMs / length - 1e-9);
}

/**
 * Where each repeat of a looped clip starts, as an offset from the clip start
 * in clip-timeline ms. `period` is the timeline length of one repeat.
 */
export function loopRepeatOffsets(
  clip: LoopFields,
  periodMs: number
): number[] {
  if (activeLoopMs(clip) === undefined || periodMs <= 0) return [0];
  const out: number[] = [];
  for (let k = 0; k * periodMs < clip.durationMs - 1e-9; k += 1) {
    out.push(k * periodMs);
  }
  return out;
}
