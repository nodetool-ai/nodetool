/**
 * The piano roll's tools and the pure rules behind them.
 *
 * The gestures in `PianoRoll` call these so each rule (which tool a click
 * uses, where a brush stroke lands, what a velocity drag does) is testable
 * without a pointer. The shared note functions live in `@nodetool-ai/timeline`.
 */

import {
  MIDI_PPQ,
  SCALES,
  addNote,
  barsBeatsAt,
  collapsedRows,
  moveNotes,
  snapPitchToScale
} from "@nodetool-ai/timeline";
import type { MidiNote, TimelineTempo } from "@nodetool-ai/timeline";

import type { PianoRollTool } from "../../../stores/timeline/TimelineUIStore";
import { pitchName, snapTickToGrid, type RowSet, makeRowSet } from "./pianoRollGeometry";

/** Every tool, in the order the tool menu lists them. */
export const PIANO_ROLL_TOOLS: readonly PianoRollTool[] = [
  "pointer",
  "pencil",
  "eraser",
  "brush",
  "scissors",
  "glue",
  "mute",
  "velocity",
  "quantize"
];

/** Whether the platform is a Mac. Read once per mount, not per event. */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform || navigator.userAgent || "";
  return /mac/i.test(platform);
}

/** The tool a press uses: the second tool while Cmd (Mac) or Ctrl is down. */
export function resolveTool<T extends string = PianoRollTool>(
  event: { metaKey: boolean; ctrlKey: boolean },
  mac: boolean,
  tool: T,
  altTool: T
): T {
  return (mac ? event.metaKey : event.ctrlKey) ? altTool : tool;
}

/** Whether a drag skips the snap: Control on a Mac, never on other systems. */
export function bypassesSnap(
  event: { ctrlKey: boolean },
  mac: boolean
): boolean {
  return mac && event.ctrlKey;
}

/** The pointer cursor over empty grid for a tool. */
export function toolCursor(tool: PianoRollTool): string {
  switch (tool) {
    case "pencil":
    case "brush":
      return "crosshair";
    case "eraser":
      return "not-allowed";
    case "scissors":
      return "col-resize";
    case "glue":
      return "alias";
    case "mute":
      return "pointer";
    case "velocity":
      return "ns-resize";
    case "quantize":
      return "cell";
    default:
      return "default";
  }
}

/** The rows Collapse Mode shows for these notes, or null for an empty clip. */
export function collapseRowSet(notes: ReadonlyArray<MidiNote>): RowSet | null {
  const pitches = collapsedRows(notes);
  return pitches.length > 0 ? makeRowSet(pitches) : null;
}

/** Move by whole rows: each moved note lands on the row `deltaRows` away. */
export function moveNotesByRows(
  notes: ReadonlyArray<MidiNote>,
  ids: Iterable<string>,
  deltaTick: number,
  deltaRows: number,
  rows: RowSet
): MidiNote[] {
  const moving = new Set(ids);
  const shifted = moveNotes(notes, moving, { deltaTick, deltaPitch: 0 });
  if (deltaRows === 0) return shifted;
  const last = rows.pitches.length - 1;
  return shifted.map((note) => {
    if (!moving.has(note.id)) return note;
    const row = rows.index.get(note.pitch);
    if (row === undefined) return note;
    const target = Math.min(last, Math.max(0, row + Math.round(deltaRows)));
    return { ...note, pitch: rows.pitches[target]! };
  });
}

/** Scale settings that decide whether a pitch is pulled to a scale. */
export interface ScaleSnap {
  root: number;
  intervals: readonly number[];
}

/** The scale a scale id names, or null for Chromatic. */
export function scaleSnapFor(
  scaleId: string,
  root: number
): ScaleSnap | null {
  const scale = (SCALES as Record<string, { iv: readonly number[] }>)[scaleId];
  return scale ? { root, intervals: scale.iv } : null;
}

/** Pull the moved notes to the scale after a vertical move. */
export function snapMovedToScale(
  notes: ReadonlyArray<MidiNote>,
  ids: ReadonlySet<string>,
  scale: ScaleSnap
): MidiNote[] {
  return notes.map((note) =>
    ids.has(note.id)
      ? { ...note, pitch: snapPitchToScale(note.pitch, scale.root, scale.intervals) }
      : note
  );
}

/** One brush or pencil note: a snap step long at velocity 100. */
export function addStepNote(
  notes: ReadonlyArray<MidiNote>,
  pitch: number,
  startTick: number,
  stepTicks: number
): MidiNote[] {
  return addNote(notes, {
    pitch,
    startTick,
    durationTick: Math.max(1, Math.round(stepTicks)),
    velocity: 100
  });
}

/** Where a brush or pencil press starts its note. */
export function stepStartTick(
  rawTick: number,
  snapped: boolean,
  stepTicks: number,
  phaseTick: number
): number {
  return snapped
    ? snapTickToGrid(rawTick, stepTicks, phaseTick, "floor")
    : Math.max(0, Math.round(rawTick));
}

/** Whether a note already sits at this pitch and start. */
export function hasNoteAt(
  notes: ReadonlyArray<MidiNote>,
  pitch: number,
  startTick: number
): boolean {
  return notes.some((n) => n.pitch === pitch && n.startTick === startTick);
}

/**
 * Shift the velocity of the listed notes by one shared `delta`. The delta stops
 * where the first listed note reaches 1 or 127, so the notes keep their spacing.
 */
export function shiftVelocity(
  baseline: ReadonlyArray<MidiNote>,
  ids: ReadonlySet<string>,
  delta: number
): MidiNote[] {
  let lowest = 127;
  let highest = 1;
  for (const note of baseline) {
    if (!ids.has(note.id)) continue;
    lowest = Math.min(lowest, note.velocity);
    highest = Math.max(highest, note.velocity);
  }
  const shift = Math.round(Math.min(127 - highest, Math.max(1 - lowest, delta)));
  return baseline.map((note) =>
    ids.has(note.id) ? { ...note, velocity: note.velocity + shift } : note
  );
}

/** The velocity of the earliest selected note (ties: list order). */
export function earliestVelocity(
  notes: ReadonlyArray<MidiNote>,
  ids: ReadonlySet<string>
): number | null {
  let best: MidiNote | null = null;
  for (const note of notes) {
    if (ids.has(note.id) && (best === null || note.startTick < best.startTick)) {
      best = note;
    }
  }
  return best ? best.velocity : null;
}

/** Mute or unmute: the clicked note's new state goes to the selection it is in. */
export function toggleMuteAt(
  notes: ReadonlyArray<MidiNote>,
  clickedId: string,
  selected: ReadonlySet<string>
): MidiNote[] {
  const clicked = notes.find((n) => n.id === clickedId);
  if (!clicked) return [...notes];
  const mute = !clicked.muted;
  const targets = selected.has(clickedId) ? selected : new Set([clickedId]);
  return notes.map((note) => {
    if (!targets.has(note.id)) return note;
    if (mute) return { ...note, muted: true };
    const { muted: _muted, ...rest } = note;
    void _muted;
    return rest;
  });
}

/** Mute the selection when any note in it is unmuted, otherwise unmute it. */
export function toggleMuteSelection(
  notes: ReadonlyArray<MidiNote>,
  selected: ReadonlySet<string>
): MidiNote[] {
  const mute = notes.some((n) => selected.has(n.id) && !n.muted);
  return notes.map((note) => {
    if (!selected.has(note.id)) return note;
    if (mute) return { ...note, muted: true };
    const { muted: _muted, ...rest } = note;
    void _muted;
    return rest;
  });
}

/** Notes starting at or after the earliest selected start, or the playhead. */
export function selectFollowing(
  notes: ReadonlyArray<MidiNote>,
  selected: ReadonlySet<string>,
  playheadTick: number
): Set<string> {
  let from = playheadTick;
  const chosen = notes.filter((n) => selected.has(n.id));
  if (chosen.length > 0) from = Math.min(...chosen.map((n) => n.startTick));
  return new Set(notes.filter((n) => n.startTick >= from).map((n) => n.id));
}

/** Every note whose pitch is in the selection. */
export function selectSamePitch(
  notes: ReadonlyArray<MidiNote>,
  selected: ReadonlySet<string>
): Set<string> {
  const pitches = new Set(
    notes.filter((n) => selected.has(n.id)).map((n) => n.pitch)
  );
  return new Set(notes.filter((n) => pitches.has(n.pitch)).map((n) => n.id));
}

/** Every muted note. */
export function selectMuted(notes: ReadonlyArray<MidiNote>): Set<string> {
  return new Set(notes.filter((n) => n.muted).map((n) => n.id));
}

/** Every note that is not selected. */
export function invertSelection(
  notes: ReadonlyArray<MidiNote>,
  selected: ReadonlySet<string>
): Set<string> {
  return new Set(notes.filter((n) => !selected.has(n.id)).map((n) => n.id));
}

/** The position text: bar, beat, sixteenth and tick, each counted from 1. */
export function positionText(
  pitch: number | null,
  timelineMs: number | null,
  tempo: TimelineTempo
): string {
  if (timelineMs === null) return "";
  const { bar, beat, tick } = barsBeatsAt(timelineMs, tempo);
  const sixteenth = MIDI_PPQ / 4;
  const division = Math.floor(tick / sixteenth) + 1;
  const sub = (tick % sixteenth) + 1;
  const name = pitch === null ? "" : pitchName(pitch);
  return `${name}  ${bar} ${beat} ${division} ${sub}`;
}

const SCALE_ROOT_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
] as const;

/** Root choices for Scale Quantize. */
export const SCALE_ROOT_OPTIONS = SCALE_ROOT_NAMES.map((label, value) => ({
  value,
  label
}));

const TONIC_PITCH_CLASS: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11
};

/** The scale root the document key names, else C. */
export function defaultScaleRoot(tempo: TimelineTempo): number {
  const tonic = tempo.key?.tonic;
  return tonic !== undefined ? TONIC_PITCH_CLASS[tonic] ?? 0 : 0;
}

const titleCase = (name: string): string =>
  name
    .toLowerCase()
    .replace(/(^|[\s-])(\S)/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());

/** Scale choices: Chromatic, then every scale with a readable name. */
export function scaleOptions(chromaticLabel: string) {
  return [
    { value: "chromatic", label: chromaticLabel },
    ...Object.entries(SCALES).map(([value, scale]) => ({
      value,
      label: titleCase(scale.name)
    }))
  ];
}

/** Ticks of a line every `step`, anchored at `phase`, inside the range. Capped. */
export function stepLineTicks(
  fromTick: number,
  toTick: number,
  step: number,
  phase: number
): number[] {
  const out: number[] = [];
  if (!(step > 0) || !Number.isFinite(fromTick) || !Number.isFinite(toTick)) return out;
  const first = Math.ceil((fromTick - phase) / step - 1e-9);
  for (let n = 0; n < MAX_STEP_LINES; n++) {
    const tick = phase + (first + n) * step;
    if (tick > toTick) break;
    if (tick >= 0) out.push(tick);
  }
  return out;
}

const MAX_STEP_LINES = 4000;

/**
 * Move the start of each chosen note by `deltaTick` and keep its end, as a
 * drag on a note's left edge does. A note never gets shorter than `minTick`
 * and never starts before tick 0.
 */
export function resizeNoteStarts(
  notes: ReadonlyArray<MidiNote>,
  ids: ReadonlyArray<string>,
  deltaTick: number,
  minTick: number
): MidiNote[] {
  const chosen = new Set(ids);
  return notes.map((note) => {
    if (!chosen.has(note.id)) {
      return note;
    }
    const end = note.startTick + note.durationTick;
    const start = Math.max(0, Math.min(end - Math.max(1, minTick), note.startTick + deltaTick));
    return { ...note, startTick: start, durationTick: end - start };
  });
}

/** A signed semitone count for the drag help tag: "+3", "−2", "0". */
export function semitoneText(delta: number): string {
  if (delta > 0) {
    return `+${delta}`;
  }
  return delta < 0 ? `−${-delta}` : "0";
}

/** A length in ticks as beats, sixteenths and ticks: "1 2 0". */
export function lengthText(ticks: number): string {
  const sixteenth = MIDI_PPQ / 4;
  const beats = Math.floor(ticks / MIDI_PPQ);
  const division = Math.floor((ticks % MIDI_PPQ) / sixteenth);
  return `${beats} ${division} ${Math.round(ticks % sixteenth)}`;
}
