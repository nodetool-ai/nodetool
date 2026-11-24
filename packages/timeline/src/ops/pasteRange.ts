/**
 * Copy and paste of a section (CE4, D61).
 *
 * `readSectionContent` reads a range into plain content and changes nothing, so
 * it runs no mutation guard: a locked track can be copied. `paste_range` places
 * that content at a time as one edit. It honors the locks of the tracks that
 * receive content, and a host runs it as one undo step.
 */

import { automationTargetKey, automationValueAt, createAutomationLane } from "../automation.js";
import type {
  AutomationPoint,
  MediaTrack,
  TimelineChord,
  TimelineClip,
  TimelineMarker
} from "../types.js";
import type { SectionContentParams } from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import { resolveBarTime } from "./barTime.js";
import type { TimelineOp } from "./op.js";
import {
  assertNoLockedCrossing,
  byTime,
  chordTicks,
  clipToRange,
  cutAllCrossing,
  enclosingGroups,
  insertGap,
  lanePiece,
  lengthTicks,
  materializeCopies,
  newChordId,
  newStats,
  pruneSingletonLinks,
  reencloseGroups,
  shiftPoints,
  summary,
  type SectionScope
} from "./sections.js";
import type { TimelineOpContext, TimelineOpResult, TimelineOpState } from "./types.js";

const EPS = 1e-6;

/** What a copy holds. Times count from the start of the section. */
export interface SectionContent {
  lengthMs: number;
  clips: TimelineClip[];
  mediaTracks: MediaTrack[];
  chords: Array<{ trackId: string; chords: TimelineChord[] }>;
  automation: Array<{
    trackId: string;
    laneId: string;
    target: NonNullable<TimelineOpState["tracks"][number]["automation"]>[number]["target"];
    points: AutomationPoint[];
    /** `false` for a lane that was switched off. Absent means on. */
    enabled?: boolean;
  }>;
  markers: TimelineMarker[];
}

export interface SectionReadRange {
  fromMs: number;
  toMs: number;
  /** Track ids or names. Omit for every track and the markers. */
  trackIds?: readonly string[];
}

/**
 * The content of `[fromMs, toMs)`, as detached copies with fresh ids. It
 * reads `state` and writes nothing, and it ignores locks.
 */
export function readSectionContent(
  state: TimelineOpState,
  range: SectionReadRange,
  newId: TimelineOpContext["newId"]
): SectionContent {
  const { fromMs: from, toMs: to } = range;
  if (!(to > from + EPS)) throw new Error("The range must end after it starts.");
  const scope = { state, ctx: { newId }, mediaTracks: state.mediaTracks ?? [] };
  const tracks =
    range.trackIds === undefined
      ? null
      : new Set(
          range.trackIds.map((ref) => {
            const hit =
              state.tracks.find((t) => t.id === ref) ??
              state.tracks.find((t) => t.name.toLowerCase() === ref.toLowerCase());
            if (!hit) throw new Error(`No track "${ref}".`);
            return hit.id;
          })
        );
  const onTrack = (id: string): boolean => tracks === null || tracks.has(id);

  const copies = state.clips.filter((c) => onTrack(c.trackId)).flatMap((c) =>
    clipToRange(scope as never, c, from, to)
  );
  const { made, newMediaTracks } = materializeCopies(scope, copies, {
    shiftMs: -from,
    preMediaTracks: state.mediaTracks ?? [],
    originalById: new Map(state.clips.map((c) => [c.id, c]))
  });

  const markers =
    tracks === null
      ? state.markers.flatMap((m) => {
          const duration = m.durationMs ?? 0;
          if (duration > 0) {
            const start = Math.max(m.timeMs, from);
            const end = Math.min(m.timeMs + duration, to);
            if (end - start <= EPS) return [];
            return [{ ...m, id: newId("marker"), timeMs: start - from, durationMs: end - start }];
          }
          return m.timeMs >= from - EPS && m.timeMs < to - EPS
            ? [{ ...m, id: newId("marker"), timeMs: m.timeMs - from }]
            : [];
        })
      : [];

  const fromTick = chordTicks(scope, from);
  const toTick = fromTick + lengthTicks(scope, to - from);
  const chords: SectionContent["chords"] = [];
  const automation: SectionContent["automation"] = [];
  for (const track of state.tracks) {
    if (!onTrack(track.id)) continue;
    const kept: TimelineChord[] = [];
    for (const chord of track.chords ?? []) {
      const start = Math.max(chord.startTick, fromTick);
      const end = Math.min(chord.startTick + chord.durationTick, toTick);
      if (end > start) {
        kept.push({ ...chord, startTick: start - fromTick, durationTick: end - start });
      }
    }
    if (kept.length > 0) chords.push({ trackId: track.id, chords: kept });
    for (const lane of track.automation ?? []) {
      const sorted = [...lane.points].sort(byTime);
      // A lane with a point before the window end plays through the window:
      // its points sit inside it, or it holds the value of an earlier point.
      if (sorted.length === 0 || sorted[0]!.timeMs >= to - EPS) continue;
      const piece: SectionContent["automation"][number] = {
        trackId: track.id,
        laneId: lane.id,
        target: structuredClone(lane.target),
        points: shiftPoints(lanePiece(sorted, from, to), -from)
      };
      if (lane.enabled === false) piece.enabled = false;
      automation.push(piece);
    }
  }
  return {
    lengthMs: to - from,
    clips: made,
    mediaTracks: newMediaTracks,
    chords,
    automation,
    markers
  };
}

/** A lane with `window` laid over `[at, at + len]` and the rest of the lane kept. */
function laneWithWindow(
  points: AutomationPoint[],
  at: number,
  len: number,
  window: AutomationPoint[]
): AutomationPoint[] {
  if (window.length === 0) return points;
  const end = at + len;
  const sorted = [...points].sort(byTime);
  // Outside the window the lane keeps the value it had: a boundary point at
  // each edge holds the destination value there.
  const left =
    sorted.length === 0
      ? []
      : sorted[0]!.timeMs < at - EPS
        ? lanePiece(sorted, sorted[0]!.timeMs, at)
        : [{ timeMs: at, value: automationValueAt(sorted, at) }];
  const last = sorted.length > 0 ? sorted[sorted.length - 1]!.timeMs : -1;
  const right =
    sorted.length === 0
      ? []
      : last >= end - EPS
        ? lanePiece(sorted, end, last)
        : [{ timeMs: end, value: automationValueAt(sorted, end) }];
  const middle = shiftPoints([...window].sort(byTime), at);
  const out = [...left];
  const lastLeft = left[left.length - 1];
  out.push(...(lastLeft && Math.abs(lastLeft.value - middle[0]!.value) <= 1e-9 ? middle.slice(1) : middle));
  const lastMiddle = middle[middle.length - 1]!;
  out.push(...(right.length > 0 && Math.abs(right[0]!.value - lastMiddle.value) <= 1e-9 ? right.slice(1) : right));
  return out;
}

export function runPasteRange(
  scope: SectionScope,
  op: Extract<TimelineOp, { op: "paste_range" }>
): TimelineOpResult {
  const at = resolveBarTime(scope.state, op, op.atMs, "atMs");
  if (at === undefined) throw new Error("Send `atBar` or `atMs`.");
  const content: SectionContentParams = op.content;
  const len = content.lengthMs;
  if (!Number.isFinite(len) || len <= 0) throw new Error("The section must be longer than 0 ms.");
  const mode = op.mode ?? "insert";
  const trackById = new Map(scope.tracks.map((t) => [t.id, t]));
  const clips = (content.clips ?? []).filter((c) => trackById.has(c.trackId));
  const chordSets = (content.chords ?? []).filter((e) => trackById.has(e.trackId));
  const laneSets = (content.automation ?? []).filter(
    (e) => trackById.has(e.trackId) && e.points.length > 0
  );

  const receiving = new Set<string>([
    ...clips.map((c) => c.trackId),
    ...chordSets.map((e) => e.trackId),
    ...laneSets.map((e) => e.trackId)
  ]);
  const lockedTargets = scope.tracks.filter((t) => t.locked && receiving.has(t.id));
  if (lockedTargets.length > 0) {
    const names = lockedTargets.map((t) => `"${t.name}" (${t.id})`).join(", ");
    throw new Error(
      `The paste would write into locked tracks: ${names}. Unlock them first, or copy content from other tracks.`
    );
  }

  const stats = newStats();
  const end = at + len;
  if (mode === "insert") {
    assertNoLockedCrossing(scope, at, null);
    const enclosing = enclosingGroups(scope);
    insertGap(scope, at, len, null, stats);
    reencloseGroups(scope, enclosing);
    pruneSingletonLinks(scope, stats.links);
  } else {
    const locked = scope.clips.filter(
      (c) => receiving.has(c.trackId) && c.locked && c.startMs < end - EPS && c.startMs + c.durationMs > at + EPS
    );
    if (locked.length > 0) {
      const names = locked.map((c) => `"${c.name}" (${c.id})`).join(", ");
      throw new Error(
        `The paste would replace locked clips: ${names}. Unlock them first, or choose another point.`
      );
    }
    clearReceiving(scope, at, end, receiving, stats);
  }

  // Clips: fresh ids, links, media tracks and parents.
  const copies = clips.map((piece) => ({ sourceId: piece.id, piece: structuredClone(piece) }));
  const { made, newMediaTracks } = materializeCopies(scope, copies, {
    shiftMs: at,
    preMediaTracks: content.mediaTracks ?? [],
    originalById: new Map()
  });
  scope.mediaTracks = [...scope.mediaTracks, ...newMediaTracks];
  scope.clips.push(...made);
  scope.touch(...made.map((c) => c.id));
  stats.copiedClips = made.length;

  // Chords.
  const atTick = chordTicks(scope, at);
  for (const entry of chordSets) {
    const track = trackById.get(entry.trackId)!;
    const used = new Set((track.chords ?? []).map((c) => c.id));
    track.chords = [
      ...(track.chords ?? []),
      ...entry.chords.map((c) => ({ ...c, id: newChordId(used), startTick: atTick + c.startTick }))
    ].sort((a, b) => a.startTick - b.startTick);
    stats.changedChords += entry.chords.length;
  }

  // Automation.
  for (const entry of laneSets) {
    const track = trackById.get(entry.trackId)!;
    track.automation ??= [];
    const key = automationTargetKey(entry.target);
    let lane =
      track.automation.find((l) => l.id === entry.laneId) ??
      track.automation.find((l) => automationTargetKey(l.target) === key);
    if (!lane) {
      lane = createAutomationLane(structuredClone(entry.target));
      if (entry.enabled === false) lane.enabled = false;
      track.automation.push(lane);
    }
    const before = lane.points.length;
    lane.points = laneWithWindow(lane.points, at, len, entry.points);
    stats.movedAutomationPoints += Math.max(0, lane.points.length - before);
  }

  for (const m of content.markers ?? []) {
    scope.state.markers.push({ ...m, id: scope.ctx.newId("marker"), timeMs: at + m.timeMs });
    stats.movedMarkers += 1;
  }

  return summary(stats, {
    atMs: at,
    lengthMs: len,
    mode,
    pastedClipIds: made.map((c) => c.id),
    skippedClips: (content.clips ?? []).length - clips.length
  });
}

/** Overwrite mode: clear `[at, end)` on the tracks that receive content. */
function clearReceiving(
  scope: SectionScope,
  at: number,
  end: number,
  receiving: Set<string>,
  stats: ReturnType<typeof newStats>
): void {
  cutAllCrossing(scope, at, receiving, stats);
  cutAllCrossing(scope, end, receiving, stats);
  const removed = new Set(
    scope.clips
      .filter(
        (c) =>
          receiving.has(c.trackId) &&
          c.mediaType !== "group" &&
          c.startMs >= at - EPS &&
          c.startMs + c.durationMs <= end + EPS
      )
      .map((c) => c.id)
  );
  if (removed.size > 0) {
    for (const c of scope.clips) {
      if (removed.has(c.id) && c.linkId !== undefined) stats.links.add(c.linkId);
      if (c.parentId !== undefined && removed.has(c.parentId)) {
        delete c.parentId;
        scope.touch(c.id);
      }
    }
    scope.clips = scope.clips.filter((c) => !removed.has(c.id));
    const dropped = new Set(
      scope.mediaTracks.filter((t) => removed.has(t.clipId)).map((t) => t.id)
    );
    scope.mediaTracks = scope.mediaTracks.filter((t) => !removed.has(t.clipId));
    for (const c of scope.clips) {
      if (c.trackBinding && dropped.has(c.trackBinding.trackId)) {
        delete c.trackBinding;
        scope.touch(c.id);
      }
    }
    scope.state.selectedClipIds = scope.state.selectedClipIds.filter((id) => !removed.has(id));
    scope.touch(...removed);
    stats.removedClips.push(...removed);
  }
  pruneSingletonLinks(scope, stats.links);
  const fromTick = chordTicks(scope, at);
  const toTick = fromTick + lengthTicks(scope, end - at);
  for (const track of scope.tracks) {
    if (!receiving.has(track.id) || !track.chords) continue;
    const used = new Set(track.chords.map((c) => c.id));
    const next: TimelineChord[] = [];
    for (const chord of track.chords) {
      const cEnd = chord.startTick + chord.durationTick;
      if (cEnd <= fromTick || chord.startTick >= toTick) {
        next.push(chord);
        continue;
      }
      stats.changedChords += 1;
      if (chord.startTick < fromTick) {
        next.push({ ...chord, durationTick: fromTick - chord.startTick });
      }
      if (cEnd > toTick) {
        next.push({
          ...chord,
          id: chord.startTick < fromTick ? newChordId(used) : chord.id,
          startTick: toTick,
          durationTick: cEnd - toTick
        });
      }
    }
    track.chords = next;
  }
}
