/**
 * Section edits across tracks (CE4, D48): `insert_time`, `delete_time` and
 * `duplicate_range`. They shift clips on every track and also move the chords
 * of chord tracks, automation points, and (without `trackIds`) markers.
 *
 * The document has one tempo, with no tempo or signature events, so there is
 * nothing of that kind to move.
 */

import { activeLoopMs, unrollLoopedClip } from "../clipLoop.js";
import { splitClipMediaTracks } from "../mediaTrack.js";
import { barStartMs } from "../midi/grid.js";
import { msToTicks } from "../midi/ticks.js";
import { resolveTempo } from "../midi/tempo.js";
import { splitClip } from "../splitClip.js";
import type {
  MediaTrack,
  TimelineChord,
  TimelineClip,
  TimelineTrack
} from "../types.js";
import { resolveBarTime } from "./barTime.js";
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

interface Stats {
  splitClips: number;
  removedClips: string[];
  movedClips: number;
  copiedClips: number;
  movedMarkers: number;
  changedChords: number;
  movedAutomationPoints: number;
}

const newStats = (): Stats => ({
  splitClips: 0,
  removedClips: [],
  movedClips: 0,
  copiedClips: 0,
  movedMarkers: 0,
  changedChords: 0,
  movedAutomationPoints: 0
});

const endOf = (c: TimelineClip): number => c.startMs + c.durationMs;

/** The tracks an op acts on. `null` means every track, and the markers. */
function resolveTargetTracks(
  scope: SectionScope,
  trackIds: readonly string[] | undefined
): Set<string> | null {
  if (trackIds === undefined) return null;
  return new Set(trackIds.map((ref) => scope.resolveTrack(ref).id));
}

const onTracks = (c: TimelineClip, set: Set<string> | null): boolean =>
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
function cutInDoc(scope: SectionScope, clip: TimelineClip, at: number, stats: Stats): void {
  if (clip.mediaType === "group") return;
  if (!(at > clip.startMs + EPS && at < endOf(clip) - EPS)) return;
  const pieces = activeLoopMs(clip) !== undefined ? unrollLoopedInScope(scope, clip) : [clip];
  const bpm = resolveTempo(scope.state).bpm;
  const linkMap = new Map<string, string>();
  for (const piece of pieces) {
    if (!(at > piece.startMs + EPS && at < endOf(piece) - EPS)) continue;
    const [cutLeft, cutRight] = splitClip(piece, at, { bpm });
    cutLeft.id = scope.ctx.newId("clip");
    cutRight.id = scope.ctx.newId("clip");
    if (piece.linkId !== undefined) {
      let fresh = linkMap.get(piece.linkId);
      if (fresh === undefined) {
        fresh = scope.ctx.newId("link");
        linkMap.set(piece.linkId, fresh);
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

function cutAllCrossing(
  scope: SectionScope,
  at: number,
  tracks: Set<string> | null,
  stats: Stats
): void {
  for (const clip of [...scope.clips]) {
    if (onTracks(clip, tracks)) cutInDoc(scope, clip, at, stats);
  }
}

function newChordId(used: Set<string>): string {
  let n = 0;
  let id: string;
  do {
    id = `chord_${(++n).toString(36)}`;
  } while (used.has(id));
  used.add(id);
  return id;
}

function chordTicks(scope: SectionScope, ms: number): number {
  const tempo = resolveTempo(scope.state);
  return Math.max(0, Math.round(msToTicks(ms - tempo.offsetMs, tempo.bpm)));
}

function lengthTicks(scope: SectionScope, ms: number): number {
  return Math.max(1, Math.round(msToTicks(ms, resolveTempo(scope.state).bpm)));
}

function insertGap(
  scope: SectionScope,
  at: number,
  len: number,
  tracks: Set<string> | null,
  stats: Stats
): void {
  cutAllCrossing(scope, at, tracks, stats);
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
  const atTick = chordTicks(scope, at);
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
    for (const lane of track.automation ?? []) {
      for (const point of lane.points) {
        if (point.timeMs >= at - EPS) {
          point.timeMs += len;
          stats.movedAutomationPoints += 1;
        }
      }
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
  cutAllCrossing(scope, from, tracks, stats);
  cutAllCrossing(scope, to, tracks, stats);
  const removed = new Set<string>();
  for (const clip of scope.clips) {
    if (!onTracks(clip, tracks) || endOf(clip) <= from + EPS) continue;
    if (clip.startMs >= to - EPS) {
      clip.startMs -= len;
      scope.touch(clip.id);
      stats.movedClips += 1;
    } else if (clip.startMs >= from - EPS && endOf(clip) <= to + EPS) {
      removed.add(clip.id);
    }
  }
  if (removed.size > 0) {
    scope.clips = scope.clips.filter((c) => !removed.has(c.id));
    scope.mediaTracks = scope.mediaTracks.filter((t) => !removed.has(t.clipId));
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
        marker.timeMs -= len;
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
  const fromTick = chordTicks(scope, from);
  const toTick = chordTicks(scope, to);
  const lenTick = toTick - fromTick;
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
          next.push({ ...chord, startTick: start - lenTick });
          stats.changedChords += 1;
        } else {
          const newStart = Math.min(start, fromTick);
          const newEnd = end > toTick ? end - lenTick : fromTick;
          stats.changedChords += 1;
          if (newEnd - newStart > 0) {
            next.push({ ...chord, startTick: newStart, durationTick: newEnd - newStart });
          }
        }
      }
      track.chords = next;
    }
    for (const lane of track.automation ?? []) {
      const points = [];
      for (const point of lane.points) {
        if (point.timeMs < from - EPS) {
          points.push(point);
        } else if (point.timeMs >= to - EPS) {
          points.push({ ...point, timeMs: point.timeMs - len });
          stats.movedAutomationPoints += 1;
        } else {
          stats.movedAutomationPoints += 1;
        }
      }
      lane.points = points;
    }
  }
}

function summary(stats: Stats, extra: Record<string, unknown>): TimelineOpResult {
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
  insertGap(scope, at, len, tracks, stats);
  return summary(stats, { atMs: at, lengthMs: len });
}

export function runDeleteTime(
  scope: SectionScope,
  op: Extract<TimelineOp, { op: "delete_time" }>
): TimelineOpResult {
  const { from, to } = resolveRange(scope, op);
  const tracks = resolveTargetTracks(scope, op.trackIds);
  const stats = newStats();
  removeRange(scope, from, to, tracks, stats);
  return summary(stats, { fromMs: from, toMs: to, lengthMs: to - from });
}

interface RangeCopy {
  sourceId: string;
  piece: TimelineClip;
}

/** The parts of `clip` that lie inside `[from, to)`, as detached copies. */
function clipToRange(
  scope: SectionScope,
  clip: TimelineClip,
  from: number,
  to: number
): RangeCopy[] {
  if (!(clip.startMs < to - EPS && endOf(clip) > from + EPS)) return [];
  const bpm = resolveTempo(scope.state).bpm;
  const clone = structuredClone(clip);
  const loopMs = activeLoopMs(clone);
  const pieces =
    clone.mediaType !== "group" && loopMs !== undefined
      ? unrollLoopedClip(clone, bpm, loopMs, { newId: () => scope.ctx.newId("clip") })
      : [clone];
  const out: RangeCopy[] = [];
  for (const start of pieces) {
    let cur = start;
    if (cur.mediaType !== "group") {
      if (cur.startMs < from - EPS && endOf(cur) > from + EPS) {
        cur = splitClip(cur, from, { bpm })[1];
      }
      if (endOf(cur) > to + EPS && cur.startMs < to - EPS) {
        cur = splitClip(cur, to, { bpm })[0];
      }
    }
    if (cur.startMs >= from - EPS && endOf(cur) <= to + EPS && cur.durationMs > EPS) {
      out.push({ sourceId: clip.id, piece: cur });
    }
  }
  return out;
}

export function runDuplicateRange(
  scope: SectionScope,
  op: Extract<TimelineOp, { op: "duplicate_range" }>
): TimelineOpResult {
  const { from, to } = resolveRange(scope, op);
  const len = to - from;
  const tracks = resolveTargetTracks(scope, op.trackIds);
  const stats = newStats();

  const copies = scope.clips
    .filter((c) => onTracks(c, tracks))
    .flatMap((c) => clipToRange(scope, c, from, to));
  const markerCopies =
    tracks === null
      ? scope.state.markers
          .filter((m) => m.timeMs >= from - EPS && m.timeMs < to - EPS)
          .map((m) => ({ ...m }))
      : [];
  const fromTick = chordTicks(scope, from);
  const toTick = chordTicks(scope, to);
  const lenTick = toTick - fromTick;
  const chordCopies = new Map<string, TimelineChord[]>();
  const pointCopies = new Map<string, Map<string, { timeMs: number; value: number; easing?: string }[]>>();
  for (const track of scope.tracks) {
    if (tracks !== null && !tracks.has(track.id)) continue;
    const chords: TimelineChord[] = [];
    for (const chord of track.chords ?? []) {
      const start = Math.max(chord.startTick, fromTick);
      const end = Math.min(chord.startTick + chord.durationTick, toTick);
      if (end > start) chords.push({ ...chord, startTick: start, durationTick: end - start });
    }
    if (chords.length > 0) chordCopies.set(track.id, chords);
    const lanes = new Map<string, { timeMs: number; value: number; easing?: string }[]>();
    for (const lane of track.automation ?? []) {
      const pts = lane.points
        .filter((p) => p.timeMs >= from - EPS && p.timeMs < to - EPS)
        .map((p) => ({ ...p }));
      if (pts.length > 0) lanes.set(lane.id, pts);
    }
    if (lanes.size > 0) pointCopies.set(track.id, lanes);
  }

  insertGap(scope, to, len, tracks, stats);

  // Fresh ids, links and parents for the copies, then place them after the section.
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
  for (const { sourceId, piece } of copies) {
    // One source can give several pieces (an unrolled loop): only the first keeps the mapped id.
    const id =
      made.some((m) => m.id === freshIds.get(sourceId)) ? scope.ctx.newId("clip") : freshIds.get(sourceId)!;
    piece.id = id;
    piece.startMs += len;
    piece.locked = false;
    if (piece.parentId !== undefined) piece.parentId = freshIds.get(piece.parentId) ?? piece.parentId;
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
    piece.animations = piece.animations?.map((a) => ({ ...a, id: scope.ctx.newId("anim") }));
    made.push(piece);
  }
  scope.clips.push(...made);
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
    const lanes = pointCopies.get(track.id);
    if (lanes) {
      for (const lane of track.automation ?? []) {
        const pts = lanes.get(lane.id);
        if (!pts) continue;
        lane.points = [...lane.points, ...pts.map((p) => ({ ...p, timeMs: p.timeMs + len }))].sort(
          (a, b) => a.timeMs - b.timeMs
        );
        stats.movedAutomationPoints += pts.length;
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
