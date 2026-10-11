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
const MAX_NUDGE = 0.25;
/** Error (seconds) at which the nudge saturates. */
const NUDGE_SPAN_SEC = 0.2;
/**
 * Drift (seconds) past which a playing element is hard-seeked. A seek stalls
 * the element for its decode plus a restart after `playing` (Chrome measured
 * 90-140 ms on a dev-server MP4), so a threshold below that cost makes every
 * seek land behind and seek again.
 */
const SEEK_THRESHOLD_SEC = 0.25;
/** Longest seek lead, so one stalled fetch does not overshoot later seeks. */
const MAX_SEEK_LEAD_SEC = 0.25;

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
  | { action: "seek"; rate: number; toSec: number };

/**
 * Compare a playing element with where the clock says it should be.
 * Past `SEEK_THRESHOLD_SEC` of error the element is hard-seeked. Smaller error
 * nudges `playbackRate` toward the target so it converges without a seek.
 * Positive error means the element is ahead. The clock keeps moving while a
 * seek decodes, so the seek lands `seekLeadSec` of clock time ahead of the
 * target. Without the lead a seek slower than the threshold always lands
 * behind and seeks again.
 */
export function decideVideoDrift(input: {
  elementSec: number;
  targetSec: number;
  fps: number;
  baseRate: number;
  seekLeadSec?: number;
}): DriftDecision {
  const { elementSec, targetSec, fps, baseRate, seekLeadSec = 0 } = input;
  const error = elementSec - targetSec;
  const seekThresholdSec = Math.max(1.5 / Math.max(1, fps), SEEK_THRESHOLD_SEC);
  const magnitude = Math.abs(error);
  if (magnitude >= seekThresholdSec) return { action: "seek", rate: baseRate, toSec: targetSec + seekLeadSec * baseRate };
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

/**
 * Measures how long each element takes to play again after a drift seek. Call
 * `begin` when a seek starts and `observe` on each tick once the element is no
 * longer seeking. The timer stops when the element advances past the seek
 * target, because it still holds still for a while after `seeked`. `observe`
 * returns the lead (seconds) for that element's next seek.
 */
export class SeekLatencyTracker {
  private readonly started = new WeakMap<HTMLVideoElement, { atMs: number; toSec: number }>();
  private readonly leadSec = new WeakMap<HTMLVideoElement, number>();

  begin(element: HTMLVideoElement, nowMs: number, toSec: number): void {
    this.started.set(element, { atMs: nowMs, toSec });
  }

  observe(element: HTMLVideoElement, nowMs: number, elementSec: number): number {
    const started = this.started.get(element);
    if (started !== undefined && elementSec > started.toSec + 0.001) {
      this.started.delete(element);
      const measured = Math.min(MAX_SEEK_LEAD_SEC, (nowMs - started.atMs) / 1000);
      const previous = this.leadSec.get(element);
      this.leadSec.set(element, previous === undefined ? measured : (previous + measured) / 2);
    }
    return this.leadSec.get(element) ?? 0;
  }
}
