/**
 * Drop resolution: what happens to the clips a moved clip lands on.
 *
 * During a drag the store lets a clip sit on top of whatever is under it, so
 * the picture follows the pointer. On release the editor picks one of three
 * outcomes, the same three Premiere and Final Cut offer:
 *
 * - **overwrite** — the moved clip replaces what it covers on its track. A
 *   clip fully under it goes, a clip it partly covers is trimmed back, and a
 *   clip that spans it is cut in two around it.
 * - **insert** — the moved clip pushes everything from its start onward to
 *   the right by its length, on every unlocked track, cutting a clip on its
 *   own track that straddles the insert point.
 * - **overlap** — nothing else moves; the renderer composites the later clip
 *   on top and cross-fades across the overlap. This was the only behaviour
 *   before drop modes existed and stays available for that reason.
 *
 * Pure over the clip array so the store, the agent bridge and a test agree.
 */

import { shiftClipsFrom, type RippleOptions } from "./rippleEdit.js";
import { splitClip } from "./splitClip.js";
import { trimClip } from "./trimClip.js";
import type { TimelineClip } from "./types.js";

export const DROP_MODES = ["overwrite", "insert", "overlap"] as const;
export type DropMode = (typeof DROP_MODES)[number];

const clipEndMs = (c: TimelineClip): number => c.startMs + c.durationMs;

/** Ids of every moved clip plus the members of their link groups. */
function movedAndLinked(
  clips: readonly TimelineClip[],
  movedIds: ReadonlySet<string>
): Set<string> {
  const linkIds = new Set<string>();
  for (const c of clips) {
    if (movedIds.has(c.id) && c.linkId !== undefined) linkIds.add(c.linkId);
  }
  const out = new Set(movedIds);
  for (const c of clips) {
    if (c.linkId !== undefined && linkIds.has(c.linkId)) out.add(c.id);
  }
  return out;
}

/**
 * Cut back, split or remove the clips that `movedIds` now cover on their own
 * tracks. Linked siblings of a moved clip are never victims (they moved
 * too), and a clip that refuses a trim or split (a time-remapped one) is
 * left where it is rather than half-edited.
 */
export function resolveOverwrite(
  clips: readonly TimelineClip[],
  movedIds: ReadonlySet<string>
): TimelineClip[] {
  const movers = clips.filter((c) => movedIds.has(c.id));
  if (movers.length === 0) return [...clips];
  const protectedIds = movedAndLinked(clips, movedIds);

  let next: TimelineClip[] = [...clips];
  for (const m of movers) {
    const mStart = m.startMs;
    const mEnd = clipEndMs(m);
    const out: TimelineClip[] = [];
    for (const c of next) {
      if (protectedIds.has(c.id) || c.trackId !== m.trackId) {
        out.push(c);
        continue;
      }
      const cStart = c.startMs;
      const cEnd = clipEndMs(c);
      if (cEnd <= mStart || cStart >= mEnd) {
        out.push(c);
        continue;
      }
      try {
        if (cStart >= mStart && cEnd <= mEnd) {
          // Fully covered: gone.
          continue;
        }
        if (cStart < mStart && cEnd > mEnd) {
          // Spans the mover: keep the head and the tail.
          const [head, rest] = splitClip(c, mStart);
          const [, tail] = splitClip(rest, mEnd);
          out.push(head, tail);
          continue;
        }
        if (cStart < mStart) {
          // Overlaps the mover's head: cut the victim's tail back.
          out.push(trimClip(c, "end", mStart - cEnd));
          continue;
        }
        // Overlaps the mover's tail: advance the victim's head.
        out.push(trimClip(c, "start", -(mEnd - cStart)));
      } catch {
        out.push(c);
      }
    }
    next = out;
  }
  return next;
}

/**
 * Make room for `movedIds`: every clip on an unlocked track that starts at or
 * after the earliest moved start shifts right by the moved span, and a clip on
 * a moved clip's own track that straddles that point is cut there first so
 * its second half can move. The moved clips themselves stay put.
 */
export function resolveInsert(
  clips: readonly TimelineClip[],
  movedIds: ReadonlySet<string>,
  options: RippleOptions = {}
): TimelineClip[] {
  const movers = clips.filter((c) => movedIds.has(c.id));
  if (movers.length === 0) return [...clips];
  const protectedIds = movedAndLinked(clips, movedIds);
  const insertMs = Math.min(...movers.map((c) => c.startMs));
  const spanMs = Math.max(...movers.map(clipEndMs)) - insertMs;
  const moverTracks = new Set(movers.map((c) => c.trackId));

  const cut: TimelineClip[] = [];
  for (const c of clips) {
    if (
      !protectedIds.has(c.id) &&
      moverTracks.has(c.trackId) &&
      c.startMs < insertMs &&
      clipEndMs(c) > insertMs
    ) {
      try {
        cut.push(...splitClip(c, insertMs));
        continue;
      } catch {
        // A clip that cannot be split stays whole and does not move.
      }
    }
    cut.push(c);
  }
  return shiftClipsFrom(cut, insertMs, spanMs, protectedIds, options);
}

/** Apply `mode` to a finished drop. */
export function resolveDrop(
  clips: readonly TimelineClip[],
  movedIds: ReadonlySet<string>,
  mode: DropMode,
  options: RippleOptions = {}
): TimelineClip[] {
  switch (mode) {
    case "overwrite":
      return resolveOverwrite(clips, movedIds);
    case "insert":
      return resolveInsert(clips, movedIds, options);
    case "overlap":
      return [...clips];
  }
}
