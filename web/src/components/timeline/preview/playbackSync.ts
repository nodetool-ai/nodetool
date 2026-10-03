/**
 * Pure rules for keeping pooled `<video>` elements and the play start position
 * locked to the master clock. The compositor and PreviewArea call these; they
 * hold no state so they can be tested without media.
 */

/** Browsers hold `playbackRate` reliably inside this range. */
export const VIDEO_MIN_RATE = 0.0625;
export const VIDEO_MAX_RATE = 16;

/** Drift below this many seconds is left alone. */
const DRIFT_DEAD_ZONE_SEC = 0.02;
/** Largest relative rate correction applied to catch up or fall back. */
const MAX_NUDGE = 0.1;
/** Error (seconds) at which the nudge saturates. */
const NUDGE_SPAN_SEC = 0.25;

export function clampVideoRate(rate: number): number {
  return Math.min(VIDEO_MAX_RATE, Math.max(VIDEO_MIN_RATE, rate));
}

export type VideoRateMode =
  | { mode: "play"; rate: number }
  /** The element stays paused and is seeked to its target each tick. */
  | { mode: "scrub" };

/**
 * How an element follows the clock. `baseRate` is the clip's own source rate
 * and `globalRate` the J/K/L shuttle rate. A reverse or out-of-range rate
 * cannot be given to an element, so it is scrubbed instead.
 */
export function videoRateMode(
  baseRate: number,
  globalRate: number
): VideoRateMode {
  if (!(globalRate > 0)) return { mode: "scrub" };
  const rate = baseRate * globalRate;
  if (rate < VIDEO_MIN_RATE || rate > VIDEO_MAX_RATE) return { mode: "scrub" };
  return { mode: "play", rate };
}

export type DriftDecision =
  | { action: "none"; rate: number }
  | { action: "nudge"; rate: number }
  | { action: "seek"; rate: number };

/**
 * Compare a playing element with where the clock says it should be.
 * Past about one frame of error the element is hard-seeked. Smaller error
 * nudges `playbackRate` toward the target so it converges without a seek.
 * Positive error means the element is ahead.
 */
export function decideVideoDrift(input: {
  elementSec: number;
  targetSec: number;
  fps: number;
  baseRate: number;
}): DriftDecision {
  const { elementSec, targetSec, fps, baseRate } = input;
  const error = elementSec - targetSec;
  const seekThresholdSec = Math.max(1.5 / Math.max(1, fps), 0.05);
  const magnitude = Math.abs(error);
  if (magnitude >= seekThresholdSec) return { action: "seek", rate: baseRate };
  if (magnitude < DRIFT_DEAD_ZONE_SEC) return { action: "none", rate: baseRate };
  const nudge = Math.min(MAX_NUDGE, magnitude / NUDGE_SPAN_SEC) * Math.sign(error);
  const rate = Math.min(
    VIDEO_MAX_RATE,
    Math.max(VIDEO_MIN_RATE, baseRate * (1 - nudge))
  );
  return { action: "nudge", rate };
}

/**
 * Where playback begins. Parked at the end of a forward run it restarts at the
 * top, and parked at the top of a reverse run it restarts at the end. A reverse
 * run at the end, or a forward run at the top, starts where it is.
 */
export function resolvePlayStartMs(input: {
  startMs: number;
  rate: number;
  loopStartMs: number;
  endMs: number;
  frameMs: number;
}): number {
  const { startMs, rate, loopStartMs, endMs, frameMs } = input;
  if (!(endMs > 0)) return startMs;
  if (rate >= 0) {
    return startMs >= endMs - frameMs ? loopStartMs : startMs;
  }
  return startMs <= loopStartMs + frameMs ? endMs : startMs;
}

/**
 * Whether the master clock is advancing. It is while the live position moved
 * within `graceMs`. Elements stay paused until then so the picture does not
 * run ahead of audio that is still decoding.
 */
export function isClockAdvancing(
  nowMs: number,
  lastMoveMs: number,
  graceMs = 150
): boolean {
  return nowMs - lastMoveMs < graceMs;
}
