/**
 * Loading a library progression onto a chord track over a tick range.
 */

import {
  createTimeOrderedUuid,
  PROGRESSIONS,
  progressionChords,
  replaceChordRange
} from "@nodetool-ai/timeline";
import type { TimelineChord } from "@nodetool-ai/timeline";

/**
 * `chords` with progression `index` in `key` repeated over `[fromTick,
 * toTick)`, replacing what was there. The range is widened to whole bars.
 */
export function fillProgression(
  chords: ReadonlyArray<TimelineChord>,
  index: number,
  key: number,
  fromTick: number,
  toTick: number,
  barTicks: number
): TimelineChord[] {
  const p = PROGRESSIONS[index];
  if (!p) return [...chords];
  const from = Math.max(0, Math.floor(fromTick / barTicks + 1e-9) * barTicks);
  const to = Math.max(from + barTicks, Math.ceil(toTick / barTicks - 1e-9) * barTicks);
  const incoming = progressionChords(p, key, {
    startTick: from,
    lengthTicks: to - from,
    mintId: () => createTimeOrderedUuid()
  });
  return replaceChordRange(chords, incoming, () => createTimeOrderedUuid());
}
