/** Range edits on a chord list, in document ticks. */

import type { TimelineChord } from "../types.js";
import { sortChords } from "./chords.js";

/**
 * `chords` with the span `[fromTick, toTick)` emptied. A chord that crosses an
 * edge is trimmed. A chord that spans the whole range splits in two, and the
 * tail gets the id from `mintId`.
 */
export function clearChordRange(
  chords: ReadonlyArray<TimelineChord>,
  fromTick: number,
  toTick: number,
  mintId: () => string
): TimelineChord[] {
  if (toTick <= fromTick) return sortChords(chords);
  const out: TimelineChord[] = [];
  for (const c of sortChords(chords)) {
    const end = c.startTick + c.durationTick;
    if (end <= fromTick || c.startTick >= toTick) {
      out.push(c);
      continue;
    }
    if (c.startTick < fromTick) {
      out.push({ ...c, durationTick: fromTick - c.startTick });
    }
    if (end > toTick) {
      out.push({
        ...c,
        id: c.startTick < fromTick ? mintId() : c.id,
        startTick: toTick,
        durationTick: end - toTick
      });
    }
  }
  return out;
}
