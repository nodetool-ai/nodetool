/**
 * How long each reasoning block took, measured in the browser while it
 * streamed. The server sends no timing for reasoning, and the row remounts
 * when the server's finalized message replaces the streaming one, so the
 * timing lives here instead of in component state. A block is recognized by
 * how its text starts, which the replacement keeps verbatim.
 */

/** Long enough to tell two reasoning blocks apart. */
const KEY_LENGTH = 64;
/** Only the blocks of the last few replies need a duration. */
const MAX_ENTRIES = 50;

interface ThoughtTiming {
  key: string;
  startedAt: number;
  durationMs: number | null;
}

const timings: ThoughtTiming[] = [];

/**
 * The timing a block's text belongs to. A block still streaming matches only
 * an unfinished timing, so an older block that opened with the same words is
 * never resumed. Otherwise the longest matching key wins.
 */
const find = (text: string, running: boolean): ThoughtTiming | undefined => {
  let best: ThoughtTiming | undefined;
  for (const timing of timings) {
    if (!text.startsWith(timing.key)) {
      continue;
    }
    if (running && timing.durationMs !== null) {
      continue;
    }
    if (!best || timing.key.length > best.key.length) {
      best = timing;
    }
  }
  return best;
};

/** Note that a block is streaming; the first call starts its clock. */
export const markThoughtRunning = (text: string, now = Date.now()): void => {
  if (text.length === 0) {
    return;
  }
  const timing = find(text, true);
  if (timing) {
    // The key grows with the text so a later block that opens with the same
    // few words is not mistaken for this one.
    if (timing.key.length < KEY_LENGTH) {
      timing.key = text.slice(0, KEY_LENGTH);
    }
    return;
  }
  timings.push({ key: text.slice(0, KEY_LENGTH), startedAt: now, durationMs: null });
  if (timings.length > MAX_ENTRIES) {
    timings.shift();
  }
};

/** Stop a block's clock. Returns its duration, or null if it never ran here. */
export const markThoughtDone = (
  text: string,
  now = Date.now()
): number | null => {
  const timing = find(text, true) ?? find(text, false);
  if (!timing) {
    return null;
  }
  if (timing.durationMs === null) {
    timing.durationMs = now - timing.startedAt;
  }
  return timing.durationMs;
};

/** A finished block's duration, or null when it was not timed. */
export const thoughtDuration = (text: string): number | null =>
  find(text, false)?.durationMs ?? null;

/** Forget every timing. For tests. */
export const resetThoughtTimings = (): void => {
  timings.length = 0;
};
