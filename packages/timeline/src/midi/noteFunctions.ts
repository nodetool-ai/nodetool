/**
 * Pure note functions shared by the web piano roll and the native one.
 *
 * Every function returns a new list and keeps survivors in list order. The
 * names, rules and test vectors follow the piano-roll contract, so the native
 * port in `PianoRollNotes.js` must agree with this file.
 */

import type { MidiNote } from "../types.js";
import { fitExpressionToDuration } from "./notesEdit.js";

const channelOf = (note: MidiNote): number => note.channel ?? 0;

const VELOCITY_STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [1, 110, 91, 216],
  [32, 62, 123, 224],
  [56, 63, 180, 200],
  [80, 108, 191, 78],
  [100, 201, 195, 63],
  [114, 224, 135, 58],
  [127, 224, 69, 58]
];

/** Note color for a velocity: a linear ramp through fixed stops. */
export function velocityColor(velocity: number): [number, number, number] {
  const v = Math.min(127, Math.max(1, velocity));
  for (let i = 1; i < VELOCITY_STOPS.length; i++) {
    const lo = VELOCITY_STOPS[i - 1];
    const hi = VELOCITY_STOPS[i];
    if (v <= hi[0]) {
      const t = (v - lo[0]) / (hi[0] - lo[0]);
      return [
        Math.round(lo[1] + (hi[1] - lo[1]) * t),
        Math.round(lo[2] + (hi[2] - lo[2]) * t),
        Math.round(lo[3] + (hi[3] - lo[3]) * t)
      ];
    }
  }
  const last = VELOCITY_STOPS[VELOCITY_STOPS.length - 1];
  return [last[1], last[2], last[3]];
}

/** Nearest pitch in 0..127 inside the scale. A tie takes the lower pitch. */
export function snapPitchToScale(
  pitch: number,
  root: number,
  intervals: ReadonlyArray<number>
): number {
  const classes = new Set(intervals.map((i) => (((root + i) % 12) + 12) % 12));
  if (classes.size === 0 || classes.size >= 12) return pitch;
  for (let d = 0; d <= 127; d++) {
    const down = pitch - d;
    if (down >= 0 && down <= 127 && classes.has(down % 12)) return down;
    const up = pitch + d;
    if (d > 0 && up >= 0 && up <= 127 && classes.has(up % 12)) return up;
  }
  return pitch;
}

/** Snap the pitch of the listed notes (all notes when `noteIds` is absent). */
export function scaleQuantizeNotes(
  notes: ReadonlyArray<MidiNote>,
  root: number,
  intervals: ReadonlyArray<number>,
  noteIds?: Iterable<string>
): MidiNote[] {
  const target = noteIds ? new Set(noteIds) : null;
  return notes.map((note) =>
    !target || target.has(note.id)
      ? { ...note, pitch: snapPitchToScale(note.pitch, root, intervals) }
      : note
  );
}

/** The finest candidate step that is at least 16 px wide, else the bar. */
export function smartSnapTicks(
  pxPerTick: number,
  beatTicks: number,
  beatsPerBar: number
): number {
  const bar = beatTicks * beatsPerBar;
  const candidates = [...new Set([bar, beatTicks, 480, 240, 120])].sort(
    (a, b) => b - a
  );
  let best = bar;
  for (const c of candidates) {
    if (c * pxPerTick >= 16) best = c;
  }
  return best;
}

/** Distinct pitches, highest first. */
export function collapsedRows(notes: ReadonlyArray<MidiNote>): number[] {
  return [...new Set(notes.map((n) => n.pitch))].sort((a, b) => b - a);
}

/** Merge the selected notes and the clicked note that share pitch and channel. */
export function glueNotes(
  notes: ReadonlyArray<MidiNote>,
  selectedIds: Iterable<string>,
  clickedId: string
): MidiNote[] {
  const ids = new Set(selectedIds);
  ids.add(clickedId);
  const groups = new Map<string, MidiNote[]>();
  for (const note of notes) {
    if (!ids.has(note.id)) continue;
    const key = `${note.pitch}:${channelOf(note)}`;
    const group = groups.get(key);
    if (group) group.push(note);
    else groups.set(key, [note]);
  }
  const replace = new Map<string, MidiNote>();
  const drop = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    let first = group[0];
    let end = -Infinity;
    for (const note of group) {
      if (note.startTick < first.startTick) first = note;
      end = Math.max(end, note.startTick + note.durationTick);
    }
    const start = Math.min(...group.map((n) => n.startTick));
    replace.set(
      first.id,
      fitExpressionToDuration({
        ...first,
        startTick: start,
        durationTick: end - start
      })
    );
    for (const note of group) if (note !== first) drop.add(note.id);
  }
  return notes
    .filter((n) => !drop.has(n.id))
    .map((n) => replace.get(n.id) ?? n);
}

/** Extend each listed note to the next later start of any pitch. */
export function forceLegato(
  notes: ReadonlyArray<MidiNote>,
  ids: Iterable<string>
): MidiNote[] {
  const target = new Set(ids);
  return notes.map((note) => {
    if (!target.has(note.id)) return note;
    let next = Infinity;
    for (const other of notes) {
      if (other.startTick > note.startTick && other.startTick < next) {
        next = other.startTick;
      }
    }
    if (next === Infinity) return note;
    return fitExpressionToDuration({
      ...note,
      durationTick: next - note.startTick
    });
  });
}

/** Cut each listed note at the nearest later same-pitch note it overlaps. */
export function removeOverlaps(
  notes: ReadonlyArray<MidiNote>,
  ids: Iterable<string>
): MidiNote[] {
  const target = new Set(ids);
  return notes.map((note) => {
    if (!target.has(note.id)) return note;
    const end = note.startTick + note.durationTick;
    let next = Infinity;
    for (const other of notes) {
      if (
        other.pitch === note.pitch &&
        channelOf(other) === channelOf(note) &&
        other.startTick > note.startTick &&
        other.startTick < end &&
        other.startTick < next
      ) {
        next = other.startTick;
      }
    }
    if (next === Infinity) return note;
    return fitExpressionToDuration({
      ...note,
      durationTick: next - note.startTick
    });
  });
}

/** Remove each listed note that has an earlier twin in list order. */
export function deleteDuplicates(
  notes: ReadonlyArray<MidiNote>,
  ids: Iterable<string>
): MidiNote[] {
  const target = new Set(ids);
  return notes.filter((note, index) => {
    if (!target.has(note.id)) return true;
    for (let i = 0; i < index; i++) {
      const other = notes[i];
      if (
        other.pitch === note.pitch &&
        channelOf(other) === channelOf(note) &&
        other.startTick === note.startTick
      ) {
        return false;
      }
    }
    return true;
  });
}

/** Resolve overlaps between moved notes and the notes they landed on. */
export function applyNoOverlap(
  notes: ReadonlyArray<MidiNote>,
  movedIds: Iterable<string>
): MidiNote[] {
  const moved = new Set(movedIds);
  const state = new Map<string, MidiNote>(notes.map((n) => [n.id, n]));
  const removed = new Set<string>();
  const shorten = (id: string, durationTick: number): void => {
    const note = state.get(id)!;
    state.set(id, fitExpressionToDuration({ ...note, durationTick }));
  };
  for (const m of notes) {
    if (!moved.has(m.id)) continue;
    for (const n of notes) {
      if (moved.has(n.id) || removed.has(n.id)) continue;
      const M = state.get(m.id)!;
      const N = state.get(n.id)!;
      if (N.pitch !== M.pitch || channelOf(N) !== channelOf(M)) continue;
      const overlaps =
        N.startTick < M.startTick + M.durationTick &&
        M.startTick < N.startTick + N.durationTick;
      if (!overlaps) continue;
      if (N.startTick < M.startTick) {
        shorten(N.id, M.startTick - N.startTick);
      } else if (N.startTick > M.startTick) {
        shorten(M.id, N.startTick - M.startTick);
      } else {
        removed.add(N.id);
      }
    }
  }
  return notes.filter((n) => !removed.has(n.id)).map((n) => state.get(n.id)!);
}
