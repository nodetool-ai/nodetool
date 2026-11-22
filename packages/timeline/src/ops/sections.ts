/**
 * Section edits across tracks (CE4, D48): `insert_time`, `delete_time` and
 * `duplicate_range`. They shift clips on every track and also move the chords
 * of chord tracks, automation points, and (without `trackIds`) markers.
 *
 * The document has one tempo, with no tempo or signature events, so there is
 * nothing of that kind to move.
 */

import { ease } from "../animation/easing.js";
import { automationValueAt } from "../automation.js";
import { activeLoopMs, unrollLoopedClip } from "../clipLoop.js";
import { clipSourceWindowMs } from "../generatedMatte.js";
import { resliceMediaTrackSamples, splitClipMediaTracks } from "../mediaTrack.js";
import { sliceParamCurves } from "../paramCurves.js";
import { barStartMs } from "../midi/grid.js";
import { msToTicks } from "../midi/ticks.js";
import { resolveTempo } from "../midi/tempo.js";
import { animationsForWindow, splitClip } from "../splitClip.js";
import type {
  AutomationPoint,
  MediaTrack,
  TimelineChord,
  TimelineClip,
  TimelineTrack
} from "../types.js";
import { resolveBarTime } from "./barTime.js";
import { bakeGroupInto, groupBakeProblem } from "./groupBake.js";
import { unrollLoopedInScope, type LoopScope } from "./loop.js";
import type { TimelineOp } from "./op.js";
import type { TimelineOpResult } from "./types.js";

const EPS = 1e-6;

/** What the section ops use of the op scope. `OpScope` in apply.ts satisfies it. */
export interface SectionScope extends Omit<LoopScope, "clips"> {
  clips: TimelineClip[];
  mediaTracks: MediaTrack[];
  readonly tracks: TimelineTrack[];
  resolveTrack(idOrName: string): TimelineTrack;
}

export interface Stats {
  splitClips: number;
  removedClips: string[];
  movedClips: number;
  copiedClips: number;
  movedMarkers: number;
  changedChords: number;
  movedAutomationPoints: number;
  /** Link ids a cut or a removal may have left with fewer than two clips. */
  links: Set<string>;
}

export const newStats = (): Stats => ({
  splitClips: 0,
  removedClips: [],
  movedClips: 0,
  copiedClips: 0,
  movedMarkers: 0,
  changedChords: 0,
  movedAutomationPoints: 0,
  links: new Set()
});

const endOf = (c: TimelineClip): number => c.startMs + c.durationMs;

/** A link id kept by one clip only links nothing. Drop it from the survivor. */
export function pruneSingletonLinks(scope: SectionScope, ids: Set<string>): void {
  if (ids.size === 0) return;
  const counts = new Map<string, number>();
  for (const c of scope.clips) {
    if (c.linkId !== undefined && ids.has(c.linkId)) {
      counts.set(c.linkId, (counts.get(c.linkId) ?? 0) + 1);
    }
  }
  for (const c of scope.clips) {
    if (c.linkId !== undefined && counts.get(c.linkId) === 1) {
      delete c.linkId;
      scope.touch(c.id);
    }
  }
}

/** Split a clip, and name it when it cannot be split (a time remap). */
function splitNamed(
  clip: TimelineClip,
  at: number,
  bpm: number,
  gridOffsetMs = 0
): [TimelineClip, TimelineClip] {
  try {
    return splitClip(clip, at, { bpm, gridOffsetMs });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Clip "${clip.name}" (${clip.id}) cannot be cut at ${at} ms: ${reason} Choose \`trackIds\` that avoid it.`
    );
  }
}

/**
 * Refuse an edit point that a locked clip (or a clip on a locked track)
 * strictly crosses. Cutting it would change the clip (D48).
 */
export function assertNoLockedCrossing(
  scope: SectionScope,
  at: number,
  tracks: Set<string> | null
): void {
  const lockedTracks = new Set(scope.tracks.filter((t) => t.locked).map((t) => t.id));
  const crossing = scope.clips.filter(
    (c) =>
      onTracks(c, tracks) &&
      (c.locked || lockedTracks.has(c.trackId)) &&
      at > c.startMs + EPS &&
      at < endOf(c) - EPS
  );
  if (crossing.length > 0) {
    const names = crossing.map((c) => `"${c.name}" (${c.id})`).join(", ");
    throw new Error(
      `The point ${at} ms cuts locked clips: ${names}. Unlock them first, or choose a point that avoids them.`
    );
  }
}

/** Groups whose direct children all lie inside the group window now. */
export function enclosingGroups(scope: SectionScope): Set<string> {
  const out = new Set<string>();
  for (const g of scope.clips) {
    if (g.mediaType !== "group") continue;
    const kids = scope.clips.filter((c) => c.parentId === g.id);
    if (kids.every((k) => k.startMs >= g.startMs - EPS && endOf(k) <= endOf(g) + EPS)) {
      out.add(g.id);
    }
  }
  return out;
}

/**
 * Grow each group in `enclosing` until its window holds its children again. An
 * edit on the children's tracks alone moves them past a group on another track.
 */
export function reencloseGroups(scope: SectionScope, enclosing: Set<string>): void {
  for (let pass = 0; pass <= scope.clips.length; pass += 1) {
    let changed = false;
    for (const g of scope.clips) {
      if (!enclosing.has(g.id)) continue;
      let start = g.startMs;
      let end = endOf(g);
      for (const k of scope.clips) {
        if (k.parentId !== g.id) continue;
        start = Math.min(start, k.startMs);
        end = Math.max(end, endOf(k));
      }
      if (start < g.startMs - EPS || end > endOf(g) + EPS) {
        g.startMs = Math.max(0, start);
        g.durationMs = end - g.startMs;
        scope.touch(g.id);
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/** The tracks an op acts on. `null` means every track, and the markers. */
export function resolveTargetTracks(
  scope: SectionScope,
  trackIds: readonly string[] | undefined
): Set<string> | null {
  if (trackIds === undefined) return null;
  return new Set(trackIds.map((ref) => scope.resolveTrack(ref).id));
}

export const onTracks = (c: TimelineClip, set: Set<string> | null): boolean =>
  set === null || set.has(c.trackId);

function barLengthMs(scope: SectionScope): number {
  const tempo = resolveTempo(scope.state);
  return barStartMs(2, tempo) - barStartMs(1, tempo);
}

function resolveRange(
  scope: SectionScope,
  op: { fromBar?: number; toBar?: number; fromMs?: number; toMs?: number }
): { from: number; to: number } {
  const bars = op.fromBar !== undefined || op.toBar !== undefined;
  const ms = op.fromMs !== undefined || op.toMs !== undefined;
  if (bars && ms) {
    throw new Error("Send `fromBar` and `toBar`, or `fromMs` and `toMs`, not both.");
  }
  let from: number | undefined;
  let to: number | undefined;
  if (bars) {
    if (op.fromBar === undefined || op.toBar === undefined) {
      throw new Error("Send both `fromBar` and `toBar`.");
    }
    const tempo = resolveTempo(scope.state);
    from = barStartMs(op.fromBar, tempo);
    to = barStartMs(op.toBar, tempo);
  } else {
    from = op.fromMs;
    to = op.toMs;
  }
  if (from === undefined || to === undefined) {
    throw new Error("Send `fromBar` and `toBar`, or `fromMs` and `toMs`.");
  }
  if (!(to > from + EPS)) {
    throw new Error(`The range must end after it starts. Got ${from} ms to ${to} ms.`);
  }
  return { from, to };
}

/**
 * Cut `clip` in the document at `at`. A looped clip is written out as plain
 * copies first (CE3). Groups are never cut: their children carry the time.
 */
function cutInDoc(
  scope: SectionScope,
  clip: TimelineClip,
  at: number,
  stats: Stats,
  linkMap: Map<string, string>
): void {
  if (clip.mediaType === "group") return;
  if (!(at > clip.startMs + EPS && at < endOf(clip) - EPS)) return;
  // An unroll leaves the link on the first repeat only, so prune it afterwards.
  if (clip.linkId !== undefined) stats.links.add(clip.linkId);
  const pieces = activeLoopMs(clip) !== undefined ? unrollLoopedInScope(scope, clip) : [clip];
  const { bpm, offsetMs } = resolveTempo(scope.state);
  for (const piece of pieces) {
    if (!(at > piece.startMs + EPS && at < endOf(piece) - EPS)) continue;
    const [cutLeft, cutRight] = splitNamed(piece, at, bpm, offsetMs);
    cutLeft.id = scope.ctx.newId("clip");
    cutRight.id = scope.ctx.newId("clip");
    if (piece.linkId !== undefined) {
      stats.links.add(piece.linkId);
      let fresh = linkMap.get(piece.linkId);
      if (fresh === undefined) {
        fresh = scope.ctx.newId("link");
        linkMap.set(piece.linkId, fresh);
        stats.links.add(fresh);
      }
      cutRight.linkId = fresh;
    }
    const split = splitClipMediaTracks(scope.mediaTracks, piece.id, cutLeft, cutRight, () =>
      scope.ctx.newId("track")
    );
    scope.mediaTracks = split.mediaTracks;
    const index = scope.clips.findIndex((c) => c.id === piece.id);
    scope.clips.splice(index, 1, split.left, split.right);
    scope.state.selectedClipIds = scope.state.selectedClipIds.filter((id) => id !== piece.id);
    scope.touch(piece.id, split.left.id, split.right.id);
    stats.splitClips += 1;
  }
}

export function cutAllCrossing(
  scope: SectionScope,
  at: number,
  tracks: Set<string> | null,
  stats: Stats
): void {
  const linkMap = new Map<string, string>();
  for (const clip of [...scope.clips]) {
    if (onTracks(clip, tracks)) cutInDoc(scope, clip, at, stats, linkMap);
  }
}

export function newChordId(used: Set<string>): string {
  let n = 0;
  let id: string;
  do {
    id = `chord_${(++n).toString(36)}`;
  } while (used.has(id));
  used.add(id);
  return id;
}

export function chordTicks(scope: Pick<SectionScope, "state">, ms: number): number {
  const tempo = resolveTempo(scope.state);
  return Math.round(msToTicks(ms - tempo.offsetMs, tempo.bpm));
}

export function lengthTicks(scope: Pick<SectionScope, "state">, ms: number): number {
  return Math.max(1, Math.round(msToTicks(ms, resolveTempo(scope.state).bpm)));
}

export const byTime = (a: AutomationPoint, b: AutomationPoint): number => a.timeMs - b.timeMs;

/** Linear sub-points that stand in for a slice of an eased segment. */
const SLICE_SAMPLES = 16;

/**
 * The easing that a slice `[u0, u1]` of an eased segment keeps exactly, or
 * `null` when only samples can follow it. Linear and `hold` slice to
 * themselves. A cubic ease-in keeps its shape on a slice that starts at the
 * segment start, and a cubic ease-out on one that ends at the segment end.
 */
function sliceEasing(easing: string | undefined, u0: number, u1: number): string | undefined | null {
  const id = easing ?? "linear";
  if (id === "linear") return undefined;
  if (u0 <= EPS && u1 >= 1 - EPS) return easing;
  if (id === "hold") return u1 >= 1 - EPS ? "hold" : undefined;
  if (id === "easeIn" && u0 <= EPS) return "easeIn";
  if (id === "easeOut" && u1 >= 1 - EPS) return "easeOut";
  return null;
}

/**
 * The points of the slice `[u0, u1]` of segment `a`→`b`, without the start
 * point. The last point sits at `u1` and carries the easing that makes the slice
 * draw what the segment drew there.
 */
function slicePoints(
  a: AutomationPoint,
  b: AutomationPoint,
  u0: number,
  u1: number
): AutomationPoint[] {
  const span = b.timeMs - a.timeMs;
  const at = (u: number): number =>
    u >= 1 - EPS ? b.value : a.value + (b.value - a.value) * ease(b.easing ?? "linear", u);
  const kept = sliceEasing(b.easing, u0, u1);
  const out: AutomationPoint[] = [];
  if (kept === null) {
    for (let k = 1; k < SLICE_SAMPLES; k += 1) {
      const u = u0 + ((u1 - u0) * k) / SLICE_SAMPLES;
      out.push({ timeMs: a.timeMs + u * span, value: at(u) });
    }
  }
  const end: AutomationPoint = { timeMs: a.timeMs + u1 * span, value: at(u1) };
  if (kept !== null && kept !== undefined) end.easing = kept;
  out.push(end);
  return out;
}

/**
 * The part of a lane between `from` and `to`, as points: the first sits at
 * `from` and the last at `to`, and the curve between them is the lane's own,
 * easing kept (D60). `points` is sorted and not empty.
 */
export function lanePiece(points: AutomationPoint[], from: number, to: number): AutomationPoint[] {
  const out: AutomationPoint[] = [{ timeMs: from, value: automationValueAt(points, from) }];
  const first = points[0]!;
  if (first.timeMs > from + EPS && first.timeMs <= to + EPS) {
    out.push({ timeMs: first.timeMs, value: first.value });
  }
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const span = b.timeMs - a.timeMs;
    if (span <= EPS) continue;
    const lo = Math.max(a.timeMs, from);
    const hi = Math.min(b.timeMs, to);
    if (hi <= lo + EPS) continue;
    out.push(...slicePoints(a, b, (lo - a.timeMs) / span, (hi - a.timeMs) / span));
  }
  if (out[out.length - 1]!.timeMs < to - EPS) {
    out.push({ timeMs: to, value: automationValueAt(points, to) });
  }
  return out;
}

export const shiftPoints = (points: AutomationPoint[], by: number): AutomationPoint[] =>
  points.map((p) => ({ ...p, timeMs: Math.max(0, p.timeMs + by) }));

/**
 * A lane after time `len` opens at `at`. Points at or after `at` move later.
 * A segment that crosses `at` would stretch, so the lane holds the value it has
 * at `at` across the gap, and nothing before `at` changes (D60). Each side of
 * a cut segment keeps its easing.
 */
export function laneAfterInsert(points: AutomationPoint[], at: number, len: number): AutomationPoint[] {
  const sorted = [...points].sort(byTime);
  const crosses =
    sorted.some((p) => p.timeMs < at - EPS) && sorted.some((p) => p.timeMs >= at - EPS);
  if (!crosses) {
    return sorted.map((p) => (p.timeMs >= at - EPS ? { ...p, timeMs: p.timeMs + len } : p));
  }
  const left = lanePiece(sorted, sorted[0]!.timeMs, at);
  const right = lanePiece(sorted, at, Math.max(at, sorted[sorted.length - 1]!.timeMs));
  return [...left, ...shiftPoints(right, len)];
}

/**
 * A lane after `[from, to)` closes. Points inside go. A lane that crosses or
 * holds the range joins the value at `from` to the value at `to`, so nothing
 * outside the range changes (D60). Each side keeps the easing of a cut segment.
 */
function laneAfterDelete(points: AutomationPoint[], from: number, to: number): AutomationPoint[] {
  const len = to - from;
  const sorted = [...points].sort(byTime);
  const touches =
    sorted.some((p) => p.timeMs < to - EPS) && sorted.some((p) => p.timeMs >= from - EPS);
  if (!touches) {
    const kept: AutomationPoint[] = [];
    for (const p of sorted) {
      if (p.timeMs < from - EPS) kept.push(p);
      else if (p.timeMs >= to - EPS) kept.push({ ...p, timeMs: Math.max(0, p.timeMs - len) });
    }
    return kept;
  }
  const first = sorted[0]!.timeMs;
  const last = sorted[sorted.length - 1]!.timeMs;
  const vFrom = automationValueAt(sorted, from);
  const vTo = automationValueAt(sorted, to);
  const left =
    from > first + EPS
      ? lanePiece(sorted, first, from)
      : [{ timeMs: from, value: vFrom } as AutomationPoint];
  const same = Math.abs(vFrom - vTo) <= 1e-9;
  if (to <= last + EPS) {
    const right = shiftPoints(lanePiece(sorted, to, last), -len);
    // A stable order keeps the join pair, `vFrom` first.
    return [...left, ...(same ? right.slice(1) : right)];
  }
  if (!same) left.push({ timeMs: from, value: vTo });
  return left;
}

/** The lane for a copy of `[from, to)` that goes in at `to` (D60). */
function laneAfterDuplicate(
  points: AutomationPoint[],
  from: number,
  to: number
): AutomationPoint[] {
  const len = to - from;
  const sorted = [...points].sort(byTime);
  const crosses =
    sorted.some((p) => p.timeMs < to - EPS) && sorted.some((p) => p.timeMs >= from - EPS);
  if (!crosses) {
    return sorted.map((p) => (p.timeMs >= to - EPS ? { ...p, timeMs: p.timeMs + len } : p));
  }
  const last = sorted[sorted.length - 1]!.timeMs;
  const head = lanePiece(sorted, sorted[0]!.timeMs, to);
  const copy = shiftPoints(lanePiece(sorted, from, to), len);
  const tail = last >= to - EPS ? shiftPoints(lanePiece(sorted, to, last), len) : [];
  const joined = Math.abs(copy[0]!.value - head[head.length - 1]!.value) <= 1e-9;
  return [...head, ...(joined ? copy.slice(1) : copy), ...tail.slice(1)];
}

export function insertGap(
  scope: SectionScope,
  at: number,
  len: number,
  tracks: Set<string> | null,
  stats: Stats,
  atTickOverride?: number,
  skipAutomation = false
): void {
  cutAllCrossing(scope, at, tracks, stats);
  for (const clip of scope.clips) {
    // A group is never cut. It grows so its children stay inside its window.
    if (
      clip.mediaType === "group" &&
      onTracks(clip, tracks) &&
      clip.startMs < at - EPS &&
      endOf(clip) > at + EPS
    ) {
      clip.durationMs += len;
      scope.touch(clip.id);
    }
  }
  for (const clip of scope.clips) {
    if (onTracks(clip, tracks) && clip.startMs >= at - EPS) {
      clip.startMs += len;
      scope.touch(clip.id);
      stats.movedClips += 1;
    }
  }
  if (tracks === null) {
    for (const marker of scope.state.markers) {
      const duration = marker.durationMs ?? 0;
      if (marker.timeMs >= at - EPS) {
        marker.timeMs += len;
        stats.movedMarkers += 1;
      } else if (duration > 0 && marker.timeMs + duration > at + EPS) {
        marker.durationMs = duration + len;
        stats.movedMarkers += 1;
      }
    }
  }
  const atTick = atTickOverride ?? chordTicks(scope, at);
  const lenTick = lengthTicks(scope, len);
  for (const track of scope.tracks) {
    if (tracks !== null && !tracks.has(track.id)) continue;
    if (track.chords) {
      const used = new Set(track.chords.map((c) => c.id));
      const next: TimelineChord[] = [];
      for (const chord of track.chords) {
        if (chord.startTick >= atTick) {
          next.push({ ...chord, startTick: chord.startTick + lenTick });
          stats.changedChords += 1;
        } else if (chord.startTick + chord.durationTick > atTick) {
          next.push({ ...chord, durationTick: atTick - chord.startTick });
          next.push({
            ...chord,
            id: newChordId(used),
            startTick: atTick + lenTick,
            durationTick: chord.startTick + chord.durationTick - atTick
          });
          stats.changedChords += 1;
        } else {
          next.push(chord);
        }
      }
      track.chords = next;
    }
    if (skipAutomation) continue;
    for (const lane of track.automation ?? []) {
      lane.points = laneAfterInsert(lane.points, at, len);
      stats.movedAutomationPoints += lane.points.filter((p) => p.timeMs >= at - EPS).length;
    }
  }
}

function removeRange(
  scope: SectionScope,
  from: number,
  to: number,
  tracks: Set<string> | null,
  stats: Stats
): void {
  const len = to - from;
  const lockedTracks = new Set(scope.tracks.filter((t) => t.locked).map((t) => t.id));
  const locked = scope.clips.filter(
    (c) =>
      onTracks(c, tracks) &&
      c.startMs < to - EPS &&
      endOf(c) > from + EPS &&
      (c.locked || lockedTracks.has(c.trackId))
  );
  if (locked.length > 0) {
    const names = locked.map((c) => `"${c.name}" (${c.id})`).join(", ");
    throw new Error(
      `The range cuts or removes locked clips: ${names}. Unlock them first, or choose a range that avoids them.`
    );
  }
  const fromTick = chordTicks(scope, from);
  const lenTick = lengthTicks(scope, len);
  const toTick = fromTick + lenTick;
  const lockedContent = scope.tracks.filter(
    (t) =>
      t.locked &&
      (tracks === null || tracks.has(t.id)) &&
      ((t.chords ?? []).some((c) => c.startTick < toTick && c.startTick + c.durationTick > fromTick) ||
        (t.automation ?? []).some(
          (l) =>
            l.points.some((p) => p.timeMs >= from - EPS && p.timeMs < to - EPS) ||
            // A ramp that crosses the range has no point inside, and still changes.
            (l.points.some((p) => p.timeMs < from - EPS) &&
              l.points.some((p) => p.timeMs >= to - EPS))
        ))
  );
  if (lockedContent.length > 0) {
    const names = lockedContent.map((t) => `"${t.name}" (${t.id})`).join(", ");
    throw new Error(
      `The range holds chords or automation on locked tracks: ${names}. Unlock them first, or choose a range that avoids them.`
    );
  }
  // Without `trackIds` the beat-one origin moves with the content. With them it
  // stays, so a chord cannot follow its clips to a time before it.
  if (tracks !== null && resolveTempo(scope.state).offsetMs > from + EPS) {
    const behind = scope.tracks.filter(
      (t) =>
        tracks.has(t.id) &&
        (t.chords ?? []).some((c) => {
          const end = c.startTick + c.durationTick;
          if (end <= fromTick) return false;
          const start = c.startTick >= toTick ? c.startTick - lenTick : Math.min(c.startTick, fromTick);
          const keeps = c.startTick >= toTick || (end > toTick ? end - lenTick : fromTick) > start;
          return keeps && start < 0;
        })
    );
    if (behind.length > 0) {
      const names = behind.map((t) => `"${t.name}" (${t.id})`).join(", ");
      throw new Error(
        `The range starts before beat one (tempo.offsetMs), and chords on ${names} cannot move there. Delete across all tracks, or choose a range after beat one.`
      );
    }
  }
  cutAllCrossing(scope, from, tracks, stats);
  cutAllCrossing(scope, to, tracks, stats);
  const removed = new Set<string>();
  for (const clip of scope.clips) {
    if (!onTracks(clip, tracks) || endOf(clip) <= from + EPS) continue;
    if (clip.startMs >= to - EPS) {
      clip.startMs = Math.max(0, clip.startMs - len);
      scope.touch(clip.id);
      stats.movedClips += 1;
    } else if (clip.startMs >= from - EPS && endOf(clip) <= to + EPS) {
      removed.add(clip.id);
    } else if (clip.mediaType === "group") {
      // A group is never cut, so it shrinks by the part of the range it holds.
      const newStart = Math.min(clip.startMs, from);
      const newEnd = endOf(clip) > to ? endOf(clip) - len : from;
      clip.startMs = newStart;
      clip.durationMs = Math.max(0, newEnd - newStart);
      scope.touch(clip.id);
    }
  }
  for (const c of scope.clips) {
    // A removed group releases the children that stay, and they keep its look.
    if (c.parentId === undefined || !removed.has(c.parentId) || removed.has(c.id)) continue;
    let parentId: string | undefined = c.parentId;
    while (parentId !== undefined && removed.has(parentId)) {
      const group = scope.clips.find((g) => g.id === parentId)!;
      const problem = groupBakeProblem(group, c);
      if (problem !== undefined) {
        throw new Error(
          `Clip "${c.name}" belongs to group "${group.name}" (${group.id}), which the range removes, and ${problem}. Add the clip's track to \`trackIds\`, or choose a range that keeps the group.`
        );
      }
      bakeGroupInto(c, group, scope.state);
      parentId = group.parentId;
    }
    if (parentId === undefined) delete c.parentId;
    else c.parentId = parentId;
    scope.touch(c.id);
  }
  if (removed.size > 0) {
    for (const c of scope.clips) {
      if (removed.has(c.id) && c.linkId !== undefined) stats.links.add(c.linkId);
    }
    scope.clips = scope.clips.filter((c) => !removed.has(c.id));
    const droppedMediaTracks = new Set(
      scope.mediaTracks.filter((t) => removed.has(t.clipId)).map((t) => t.id)
    );
    scope.mediaTracks = scope.mediaTracks.filter((t) => !removed.has(t.clipId));
    for (const c of scope.clips) {
      if (c.trackBinding && droppedMediaTracks.has(c.trackBinding.trackId)) {
        delete c.trackBinding;
        scope.touch(c.id);
      }
    }
    scope.state.selectedClipIds = scope.state.selectedClipIds.filter((id) => !removed.has(id));
    scope.touch(...removed);
    stats.removedClips.push(...removed);
  }
  if (tracks === null) {
    const keep = [];
    for (const marker of scope.state.markers) {
      const duration = marker.durationMs ?? 0;
      const start = marker.timeMs;
      const end = start + duration;
      if (start >= to - EPS) {
        marker.timeMs = Math.max(0, marker.timeMs - len);
        stats.movedMarkers += 1;
      } else if (duration > 0 && end > from + EPS) {
        const newStart = Math.min(start, from);
        const newEnd = end > to ? end - len : from;
        stats.movedMarkers += 1;
        if (newEnd - newStart <= EPS) continue;
        marker.timeMs = newStart;
        marker.durationMs = newEnd - newStart;
      } else if (duration === 0 && start >= from - EPS) {
        stats.movedMarkers += 1;
        continue;
      }
      keep.push(marker);
    }
    scope.state.markers = keep;
  }
  // Ticks count from `tempo.offsetMs`. A range that starts before it moves the
  // beat-one origin with the content, so chords keep their place against clips.
  const tempo = resolveTempo(scope.state);
  let originShiftTicks = 0;
  if (tracks === null && tempo.offsetMs > from + EPS) {
    const newOffset = tempo.offsetMs >= to - EPS ? tempo.offsetMs - len : from;
    originShiftTicks = Math.round(msToTicks(tempo.offsetMs - newOffset, tempo.bpm));
    scope.state.tempo = { ...tempo, offsetMs: newOffset };
  }
  for (const track of scope.tracks) {
    if (tracks !== null && !tracks.has(track.id)) continue;
    if (track.chords) {
      const next: TimelineChord[] = [];
      for (const chord of track.chords) {
        const start = chord.startTick;
        const end = start + chord.durationTick;
        if (end <= fromTick) {
          next.push(chord);
        } else if (start >= toTick) {
          next.push({
            ...chord,
            startTick: Math.max(0, start - lenTick + originShiftTicks)
          });
          stats.changedChords += 1;
        } else {
          const newStart = Math.min(start, fromTick);
          const newEnd = end > toTick ? end - lenTick : fromTick;
          stats.changedChords += 1;
          if (newEnd - newStart > 0) {
            next.push({
              ...chord,
              startTick: Math.max(0, newStart + originShiftTicks),
              durationTick: newEnd - newStart
            });
          }
        }
      }
      track.chords = next;
    }
    for (const lane of track.automation ?? []) {
      stats.movedAutomationPoints += lane.points.filter((p) => p.timeMs >= from - EPS).length;
      lane.points = laneAfterDelete(lane.points, from, to);
    }
  }
}

export function summary(stats: Stats, extra: Record<string, unknown>): TimelineOpResult {
  return {
    ok: true,
    ...extra,
    splitClips: stats.splitClips,
    movedClips: stats.movedClips,
    removedClipIds: stats.removedClips,
    copiedClips: stats.copiedClips,
    movedMarkers: stats.movedMarkers,
    changedChords: stats.changedChords,
    movedAutomationPoints: stats.movedAutomationPoints
  };
}

export function runInsertTime(
  scope: SectionScope,
  op: Extract<TimelineOp, { op: "insert_time" }>
): TimelineOpResult {
  const at = resolveBarTime(scope.state, op, op.atMs, "atMs");
  if (at === undefined) throw new Error("Send `atBar` or `atMs`.");
  if (op.bars !== undefined && op.ms !== undefined) {
    throw new Error("Send `bars` or `ms`, not both.");
  }
  const len = op.ms ?? (op.bars !== undefined ? op.bars * barLengthMs(scope) : undefined);
  if (len === undefined) throw new Error("Send `bars` or `ms` for the length.");
  if (!Number.isFinite(len) || len <= 0) {
    throw new Error("The inserted time must be longer than 0 ms.");
  }
  const tracks = resolveTargetTracks(scope, op.trackIds);
  const stats = newStats();
  assertNoLockedCrossing(scope, at, tracks);
  const enclosing = enclosingGroups(scope);
  insertGap(scope, at, len, tracks, stats);
  reencloseGroups(scope, enclosing);
  pruneSingletonLinks(scope, stats.links);
  return summary(stats, { atMs: at, lengthMs: len });
}

export function runDeleteTime(
  scope: SectionScope,
  op: Extract<TimelineOp, { op: "delete_time" }>
): TimelineOpResult {
  const { from, to } = resolveRange(scope, op);
  const tracks = resolveTargetTracks(scope, op.trackIds);
  const stats = newStats();
  const enclosing = enclosingGroups(scope);
  removeRange(scope, from, to, tracks, stats);
  reencloseGroups(scope, enclosing);
  pruneSingletonLinks(scope, stats.links);
  return summary(stats, { fromMs: from, toMs: to, lengthMs: to - from });
}

export interface RangeCopy {
  sourceId: string;
  piece: TimelineClip;
}

/** The parts of `clip` that lie inside `[from, to)`, as detached copies. */
export function clipToRange(
  scope: Pick<SectionScope, "state" | "ctx">,
  clip: TimelineClip,
  from: number,
  to: number
): RangeCopy[] {
  if (!(clip.startMs < to - EPS && endOf(clip) > from + EPS)) return [];
  const { bpm, offsetMs: gridOffsetMs } = resolveTempo(scope.state);
  const clone = structuredClone(clip);
  const loopMs = activeLoopMs(clone);
  const pieces =
    clone.mediaType !== "group" && loopMs !== undefined
      ? unrollLoopedClip(clone, bpm, loopMs, {
          newId: () => scope.ctx.newId("clip"),
          gridOffsetMs
        })
      : [clone];
  const out: RangeCopy[] = [];
  if (clone.mediaType === "group") {
    const start = Math.max(clone.startMs, from);
    const end = Math.min(endOf(clone), to);
    clone.startMs = start;
    clone.durationMs = end - start;
    if (clone.durationMs <= EPS) return [];
    // The window keeps only its own stretch of the group's curves and animations.
    const offsetMs = start - clip.startMs;
    if (clip.paramCurves && clip.durationMs > 0) {
      clone.paramCurves = sliceParamCurves(
        clip.paramCurves,
        offsetMs / clip.durationMs,
        (offsetMs + clone.durationMs) / clip.durationMs,
        clip.durationMs
      );
    }
    if (clip.animations) {
      clone.animations = animationsForWindow(
        clip.animations,
        {
          offsetMs,
          durationMs: clone.durationMs,
          totalMs: clip.durationMs,
          sourceFromMs: 0,
          sourceToMs: clone.durationMs
        },
        true
      );
    }
    return [{ sourceId: clip.id, piece: clone }];
  }
  for (const start of pieces) {
    let cur = start;
    if (cur.mediaType !== "group") {
      if (cur.startMs < from - EPS && endOf(cur) > from + EPS) {
        cur = splitNamed(cur, from, bpm, gridOffsetMs)[1];
      }
      if (endOf(cur) > to + EPS && cur.startMs < to - EPS) {
        cur = splitNamed(cur, to, bpm, gridOffsetMs)[0];
      }
    }
    if (cur.startMs >= from - EPS && endOf(cur) <= to + EPS && cur.durationMs > EPS) {
      out.push({ sourceId: clip.id, piece: cur });
    }
  }
  return out;
}

/**
 * Give detached range copies fresh ids, links, media tracks and parents.
 * `shiftMs` moves them in time. A parent that is not copied is written into the
 * copy, or the call refuses when that group cannot be written into a child.
 */
export function materializeCopies(
  scope: Pick<SectionScope, "state" | "ctx" | "mediaTracks">,
  copies: RangeCopy[],
  opts: {
    shiftMs: number;
    preMediaTracks: MediaTrack[];
    originalById: Map<string, TimelineClip>;
  }
): { made: TimelineClip[]; newMediaTracks: MediaTrack[] } {
  const freshIds = new Map<string, string>();
  for (const { sourceId } of copies) {
    if (!freshIds.has(sourceId)) freshIds.set(sourceId, scope.ctx.newId("clip"));
  }
  const linkCounts = new Map<string, number>();
  for (const { piece } of copies) {
    if (piece.linkId !== undefined) {
      linkCounts.set(piece.linkId, (linkCounts.get(piece.linkId) ?? 0) + 1);
    }
  }
  const freshLinks = new Map<string, string>();
  const made: TimelineClip[] = [];
  const newMediaTracks: MediaTrack[] = [];
  const firstCloneOf = new Map<string, string>();
  const clonesOf = new Map<TimelineClip, Map<string, string>>();
  for (const { sourceId, piece } of copies) {
    // One source can give several pieces (an unrolled loop): only the first keeps the mapped id.
    const id =
      made.some((m) => m.id === freshIds.get(sourceId)) ? scope.ctx.newId("clip") : freshIds.get(sourceId)!;
    piece.id = id;
    piece.startMs += opts.shiftMs;
    piece.locked = false;
    if (piece.linkId !== undefined && (linkCounts.get(piece.linkId) ?? 0) >= 2) {
      let fresh = freshLinks.get(piece.linkId);
      if (fresh === undefined) {
        fresh = scope.ctx.newId("link");
        freshLinks.set(piece.linkId, fresh);
      }
      piece.linkId = fresh;
    } else {
      delete piece.linkId;
    }
    const window = clipSourceWindowMs(piece);
    const clones = new Map<string, string>();
    for (const t of opts.preMediaTracks) {
      if (t.clipId !== sourceId) continue;
      const clone: MediaTrack = {
        ...resliceMediaTrackSamples(t, window.fromMs, window.toMs),
        id: scope.ctx.newId("track"),
        clipId: piece.id
      };
      newMediaTracks.push(clone);
      clones.set(t.id, clone.id);
      if (!firstCloneOf.has(t.id)) firstCloneOf.set(t.id, clone.id);
    }
    clonesOf.set(piece, clones);
    piece.animations =
      piece.mediaType === "group"
        ? piece.animations
        : piece.animations?.map((a) => ({ ...a, id: scope.ctx.newId("anim") }));
    made.push(piece);
  }
  const liveTracks = new Set([...scope.mediaTracks, ...newMediaTracks].map((t) => t.id));
  const copiedIds = new Set(made.map((m) => m.id));
  for (const piece of made) {
    // Parents: a copied group, or the presentation of one that stays behind.
    let parentId = piece.parentId;
    while (parentId !== undefined) {
      const mapped = freshIds.get(parentId);
      if (mapped !== undefined && copiedIds.has(mapped)) {
        piece.parentId = mapped;
        break;
      }
      const group = opts.originalById.get(parentId);
      if (group === undefined) {
        delete piece.parentId;
        break;
      }
      const problem = groupBakeProblem(group, piece);
      if (problem !== undefined) {
        throw new Error(
          `Clip "${piece.name}" belongs to group "${group.name}" (${group.id}), which is not copied, and ${problem}. Add the group's track to \`trackIds\`.`
        );
      }
      bakeGroupInto(piece, group, scope.state);
      parentId = group.parentId;
      if (parentId === undefined) delete piece.parentId;
      else piece.parentId = parentId;
    }
    const own = clonesOf.get(piece) ?? new Map<string, string>();
    const follow = (trackId: string): string | undefined =>
      own.get(trackId) ??
      (liveTracks.has(trackId) ? trackId : firstCloneOf.get(trackId));
    if (piece.trackBinding !== undefined) {
      const target = follow(piece.trackBinding.trackId);
      if (target === undefined) delete piece.trackBinding;
      else piece.trackBinding = { ...piece.trackBinding, trackId: target };
    }
    if (piece.reframe?.trackId !== undefined) {
      const target = follow(piece.reframe.trackId);
      if (target === undefined) {
        const { trackId: _dropped, ...rest } = piece.reframe;
        piece.reframe = { ...rest, mode: "center" };
      } else {
        piece.reframe = { ...piece.reframe, trackId: target };
      }
    }
  }
  return { made, newMediaTracks };
}

export function runDuplicateRange(
  scope: SectionScope,
  op: Extract<TimelineOp, { op: "duplicate_range" }>
): TimelineOpResult {
  const { from, to } = resolveRange(scope, op);
  const len = to - from;
  const tracks = resolveTargetTracks(scope, op.trackIds);
  const stats = newStats();
  assertNoLockedCrossing(scope, to, tracks);

  const copies = scope.clips
    .filter((c) => onTracks(c, tracks))
    .flatMap((c) => clipToRange(scope, c, from, to));
  const markerCopies =
    tracks === null
      ? scope.state.markers.flatMap((m) => {
          const duration = m.durationMs ?? 0;
          if (duration > 0) {
            const start = Math.max(m.timeMs, from);
            const end = Math.min(m.timeMs + duration, to);
            if (!(m.timeMs < to - EPS && m.timeMs + duration > from + EPS) || end - start <= EPS) {
              return [];
            }
            return [{ ...m, timeMs: start, durationMs: end - start }];
          }
          return m.timeMs >= from - EPS && m.timeMs < to - EPS ? [{ ...m }] : [];
        })
      : [];
  const fromTick = chordTicks(scope, from);
  const lenTick = lengthTicks(scope, len);
  const toTick = fromTick + lenTick;
  const chordCopies = new Map<string, TimelineChord[]>();
  const lanePoints = new Map<string, Map<string, AutomationPoint[]>>();
  for (const track of scope.tracks) {
    if (tracks !== null && !tracks.has(track.id)) continue;
    const chords: TimelineChord[] = [];
    for (const chord of track.chords ?? []) {
      const start = Math.max(chord.startTick, fromTick);
      const end = Math.min(chord.startTick + chord.durationTick, toTick);
      if (end > start) chords.push({ ...chord, startTick: start, durationTick: end - start });
    }
    if (chords.length > 0) chordCopies.set(track.id, chords);
    const lanes = new Map<string, AutomationPoint[]>();
    for (const lane of track.automation ?? []) {
      lanes.set(lane.id, laneAfterDuplicate(lane.points, from, to));
    }
    if (lanes.size > 0) lanePoints.set(track.id, lanes);
  }

  // A copy cannot go onto a locked track.
  const lockedIds = new Set(scope.tracks.filter((t) => t.locked).map((t) => t.id));
  const receiving = new Set<string>([
    ...copies.map((c) => c.piece.trackId),
    ...chordCopies.keys()
  ]);
  for (const track of scope.tracks) {
    if (
      (tracks === null || tracks.has(track.id)) &&
      (track.automation ?? []).some((l) =>
        l.points.some((p) => p.timeMs >= from - EPS && p.timeMs < to - EPS)
      )
    ) {
      receiving.add(track.id);
    }
  }
  const lockedTargets = scope.tracks.filter((t) => lockedIds.has(t.id) && receiving.has(t.id));
  if (lockedTargets.length > 0) {
    const names = lockedTargets.map((t) => `"${t.name}" (${t.id})`).join(", ");
    throw new Error(
      `The copy would write into locked tracks: ${names}. Unlock them first, or choose \`trackIds\` that avoid them.`
    );
  }

  // Each copy brings the media tracks of its source, cut to the copied window.
  const preMediaTracks = scope.mediaTracks;
  const originalById = new Map(scope.clips.map((c) => [c.id, c]));
  const enclosing = enclosingGroups(scope);

  // The copies end at `toTick`, so the tail splits and moves there too.
  insertGap(scope, to, len, tracks, stats, toTick, true);
  pruneSingletonLinks(scope, stats.links);

  // Fresh ids, links and parents for the copies, then place them after the section.
  const { made, newMediaTracks } = materializeCopies(scope, copies, {
    shiftMs: len,
    preMediaTracks,
    originalById
  });
  scope.mediaTracks = [...scope.mediaTracks, ...newMediaTracks];
  scope.clips.push(...made);
  reencloseGroups(scope, enclosing);
  scope.touch(...made.map((c) => c.id));
  stats.copiedClips = made.length;

  for (const marker of markerCopies) {
    scope.state.markers.push({ ...marker, id: scope.ctx.newId("marker"), timeMs: marker.timeMs + len });
    stats.movedMarkers += 1;
  }
  for (const track of scope.tracks) {
    const chords = chordCopies.get(track.id);
    if (chords) {
      const used = new Set((track.chords ?? []).map((c) => c.id));
      track.chords = [
        ...(track.chords ?? []),
        ...chords.map((c) => ({ ...c, id: newChordId(used), startTick: c.startTick + lenTick }))
      ].sort((a, b) => a.startTick - b.startTick);
      stats.changedChords += chords.length;
    }
    const lanes = lanePoints.get(track.id);
    if (lanes) {
      for (const lane of track.automation ?? []) {
        const pts = lanes.get(lane.id);
        if (!pts) continue;
        stats.movedAutomationPoints += Math.max(0, pts.length - lane.points.length);
        lane.points = pts;
      }
    }
  }
  return summary(stats, {
    fromMs: from,
    toMs: to,
    lengthMs: len,
    copiedClipIds: made.map((c) => c.id)
  });
}
