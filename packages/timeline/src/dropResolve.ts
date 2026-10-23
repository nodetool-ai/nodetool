/**
 * Drop resolution: what happens to the clips a moved clip lands on.
 *
 * During a drag the store lets a clip sit on top of whatever is under it, so
 * the picture follows the pointer. On release the editor picks one of three
 * outcomes, the same three Premiere and Final Cut offer:
 *
 * - **overwrite** — the moved clip replaces what it covers on its track. A
 *   clip fully under it goes, a clip it partly covers is trimmed back, and a
 *   clip that spans it is cut in two around it. The clip's linked partners
 *   (its audio) get the same cut.
 * - **insert** — the moved clip pushes everything from its start onward to
 *   the right by its length, on every unlocked track, cutting a clip on its
 *   own track that straddles the insert point (and that clip's linked
 *   partners).
 * - **overlap** — nothing else moves; the renderer composites the later clip
 *   on top and cross-fades across the overlap. This was the only behaviour
 *   before drop modes existed and stays available for that reason.
 *
 * Pure over the clip array so the store, the agent bridge and a test agree.
 */

import { createTimeOrderedUuid } from "./defaults.js";
import { groupDescendantIds, isGroupClip } from "./group.js";
import { planShift, type RippleOptions } from "./rippleEdit.js";
import { splitClip } from "./splitClip.js";
import { trimClip } from "./trimClip.js";
import type { TimelineClip } from "./types.js";

export const DROP_MODES = ["overwrite", "insert", "overlap"] as const;
export type DropMode = (typeof DROP_MODES)[number];

const clipEndMs = (c: TimelineClip): number => c.startMs + c.durationMs;

/**
 * Ids of every moved clip plus what travels with it: the members of its link
 * group and, for a group clip, everything under it. All of them moved.
 */
function movedWithDependants(
  clips: readonly TimelineClip[],
  movedIds: ReadonlySet<string>
): Set<string> {
  const out = new Set(movedIds);
  const linkIds = new Set<string>();
  const expanded = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of clips) {
      if (!out.has(c.id) || expanded.has(c.id)) continue;
      expanded.add(c.id);
      if (c.linkId !== undefined) linkIds.add(c.linkId);
      if (isGroupClip(c)) {
        for (const id of groupDescendantIds(clips, c.id)) out.add(id);
        grew = true;
      }
    }
    for (const c of clips) {
      if (c.linkId !== undefined && linkIds.has(c.linkId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

/**
 * What is left of `c` once the window [startMs, endMs) is cleared from it:
 * nothing when the window covers it, a trimmed clip when the window overlaps
 * one end, a head and a tail when the window falls inside it, and `c` itself
 * when they do not touch. Throws when `c` refuses the trim or split.
 */
function clearWindow(
  c: TimelineClip,
  startMs: number,
  endMs: number
): TimelineClip[] {
  const cStart = c.startMs;
  const cEnd = clipEndMs(c);
  if (cEnd <= startMs || cStart >= endMs) return [c];
  if (cStart >= startMs && cEnd <= endMs) return [];
  if (cStart < startMs && cEnd > endMs) {
    const [head, rest] = splitClip(c, startMs);
    const [, tail] = splitClip(rest, endMs);
    return [head, tail];
  }
  if (cStart < startMs) return [trimClip(c, "end", startMs - cEnd)];
  return [trimClip(c, "start", -(endMs - cStart))];
}

/**
 * Cut back, split or remove the clips that `movedIds` now cover on their own
 * tracks, and the same window out of each victim's linked partners, so a
 * video and its audio stay in sync. A cut that leaves a link group with a head
 * and a tail links the heads together and the tails together. Linked siblings
 * and group children of a moved clip moved with it, so each clears its own
 * track and none is a victim. A group clip is never a victim either: removing
 * or trimming it as media would strand its children. A link group with a
 * member that refuses a trim or split (a time-remapped one) is left whole
 * rather than half-edited, and a locked clip or one on a locked track keeps
 * its place: the mover overlaps it instead.
 */
export function resolveOverwrite(
  clips: readonly TimelineClip[],
  movedIds: ReadonlySet<string>,
  options: RippleOptions = {}
): TimelineClip[] {
  const movingIds = movedWithDependants(clips, movedIds);
  const movers = clips.filter((c) => movingIds.has(c.id));
  if (movers.length === 0) return [...clips];
  const editable = (c: TimelineClip): boolean =>
    !movingIds.has(c.id) &&
    !isGroupClip(c) &&
    options.lockedTrackIds?.has(c.trackId) !== true &&
    options.lockedClipIds?.has(c.id) !== true;

  let next: TimelineClip[] = [...clips];
  for (const m of movers) {
    const mStart = m.startMs;
    const mEnd = clipEndMs(m);
    const victims = next.filter(
      (c) =>
        c.trackId === m.trackId &&
        editable(c) &&
        clipEndMs(c) > mStart &&
        c.startMs < mEnd
    );
    if (victims.length === 0) continue;

    // Each victim with its linked partners, cut as one unit.
    const units = new Map<string, TimelineClip[]>();
    for (const v of victims) {
      const key = v.linkId ?? `clip:${v.id}`;
      if (units.has(key)) continue;
      units.set(
        key,
        v.linkId === undefined
          ? [v]
          : next.filter((c) => c.linkId === v.linkId && editable(c))
      );
    }

    const replaced = new Map<string, TimelineClip[]>();
    for (const unit of units.values()) {
      let pieces: TimelineClip[][];
      try {
        pieces = unit.map((c) => clearWindow(c, mStart, mEnd));
      } catch {
        continue;
      }
      const linkId = unit[0].linkId;
      if (linkId !== undefined && pieces.some((p) => p.length === 2)) {
        const headLinkId = createTimeOrderedUuid();
        const tailLinkId = createTimeOrderedUuid();
        pieces = pieces.map((p) =>
          p.map((piece) => ({
            ...piece,
            linkId: clipEndMs(piece) <= mStart ? headLinkId : tailLinkId
          }))
        );
      }
      unit.forEach((c, i) => replaced.set(c.id, pieces[i]));
    }

    next = next.flatMap((c) => replaced.get(c.id) ?? [c]);
  }
  return next;
}

/**
 * Make room for `movedIds`: every clip on an unlocked track that starts at or
 * after the earliest moved start shifts right by the moved span, and a clip on
 * a moved clip's own track that straddles that point is cut there first so
 * its second half can move. A cut clip's linked partners are cut at the same
 * point, each side forming its own link group, so the right halves move
 * together. The moved clips, their linked siblings and their group children
 * stay put. When the shift would separate a link group the drop is left as an
 * overlap.
 */
export function resolveInsert(
  clips: readonly TimelineClip[],
  movedIds: ReadonlySet<string>,
  options: RippleOptions = {}
): TimelineClip[] {
  const movingIds = movedWithDependants(clips, movedIds);
  const movers = clips.filter((c) => movingIds.has(c.id));
  if (movers.length === 0) return [...clips];
  const insertMs = Math.min(...movers.map((c) => c.startMs));
  const spanMs = Math.max(...movers.map(clipEndMs)) - insertMs;
  const moverTracks = new Set(movers.map((c) => c.trackId));
  const straddles = (c: TimelineClip): boolean =>
    !movingIds.has(c.id) && c.startMs < insertMs && clipEndMs(c) > insertMs;
  const locked = (c: TimelineClip): boolean =>
    options.lockedTrackIds?.has(c.trackId) === true ||
    options.lockedClipIds?.has(c.id) === true;

  // Straddlers on a mover's track, plus the straddling partners they link to.
  const cutLinkIds = new Set<string>();
  const toCut = new Set<string>();
  for (const c of clips) {
    if (moverTracks.has(c.trackId) && straddles(c)) {
      toCut.add(c.id);
      if (c.linkId !== undefined) cutLinkIds.add(c.linkId);
    }
  }
  for (const c of clips) {
    if (c.linkId !== undefined && cutLinkIds.has(c.linkId) && straddles(c)) {
      toCut.add(c.id);
    }
  }

  // A link group is cut whole or not at all.
  const halves = new Map<string, [TimelineClip, TimelineClip]>();
  const unitOf = (c: TimelineClip): string => c.linkId ?? `clip:${c.id}`;
  const units = new Map<string, TimelineClip[]>();
  for (const c of clips) {
    if (!toCut.has(c.id)) continue;
    const unit = units.get(unitOf(c));
    if (unit) unit.push(c);
    else units.set(unitOf(c), [c]);
  }
  for (const unit of units.values()) {
    if (unit.some(locked)) continue;
    let split: [TimelineClip, TimelineClip][];
    try {
      split = unit.map((c) => splitClip(c, insertMs));
    } catch {
      // A clip that cannot be split stays whole and does not move.
      continue;
    }
    if (unit[0].linkId !== undefined) {
      const leftLinkId = createTimeOrderedUuid();
      const rightLinkId = createTimeOrderedUuid();
      split = split.map(([left, right]) => [
        { ...left, linkId: leftLinkId },
        { ...right, linkId: rightLinkId }
      ]);
    }
    unit.forEach((c, i) => halves.set(c.id, split[i]));
  }

  const cut: TimelineClip[] = [];
  for (const c of clips) {
    const pair = halves.get(c.id);
    if (pair) cut.push(...pair);
    else cut.push(c);
  }
  return (
    planShift(cut, insertMs, spanMs, movingIds, options) ?? [...clips]
  );
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
      return resolveOverwrite(clips, movedIds, options);
    case "insert":
      return resolveInsert(clips, movedIds, options);
    case "overlap":
      return [...clips];
  }
}
