/**
 * Pure helpers of the music view's Chord row and the chord strip of a clip:
 * the diatonic chords of a key, the edits a click or a drag makes, and the
 * cells a clip shows.
 */

import {
  isHarmonyActive,
  placeChord,
  sortChords,
  type ChordQuality,
  type ClipHarmony,
  type MusicKey,
  type TimelineChord,
  type TimelineTempo
} from "@nodetool-ai/timeline";

import { docTickToMs } from "./chordGrid";

const TONIC_PC: Record<MusicKey["tonic"], number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11
};

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10] as const;

const MAJOR_TRIADS: ChordQuality[] = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const MAJOR_SEVENTHS: ChordQuality[] = ["maj7", "m7", "m7", "maj7", "dom7", "m7", "m7b5"];
const MINOR_TRIADS: ChordQuality[] = ["min", "dim", "maj", "min", "min", "maj", "maj"];
const MINOR_SEVENTHS: ChordQuality[] = ["m7", "m7b5", "maj7", "m7", "m7", "maj7", "dom7"];

export interface ChordChoice {
  root: number;
  quality: ChordQuality;
}

/** The seven diatonic chords of a key. No key reads as C major. */
export function diatonicChords(key: MusicKey | undefined, sevenths: boolean): ChordChoice[] {
  const tonic = key ? TONIC_PC[key.tonic] : 0;
  const minor = key?.mode === "minor";
  const steps = minor ? MINOR_STEPS : MAJOR_STEPS;
  const qualities = minor
    ? sevenths ? MINOR_SEVENTHS : MINOR_TRIADS
    : sevenths ? MAJOR_SEVENTHS : MAJOR_TRIADS;
  return steps.map((step, i) => ({ root: (tonic + step) % 12, quality: qualities[i] }));
}

/** The key as the Signature row shows it: "C", "Am", or "" without a key. */
export function keyShort(key: MusicKey | undefined): string {
  return key ? `${key.tonic}${key.mode === "minor" ? "m" : ""}` : "";
}

/** Whether a clip's harmony makes it play from the chord track. */
export function followsChordTrack(harmony: ClipHarmony | undefined): boolean {
  if (!isHarmonyActive(harmony)) return false;
  return (harmony.style !== "off" && harmony.input === "chords") || harmony.scale === "chords";
}

/** `chords` with chord `id` changed to `choice`; its place and length stay. */
export function withChordChoice(
  chords: ReadonlyArray<TimelineChord>,
  id: string,
  choice: ChordChoice & { inversion?: number }
): TimelineChord[] {
  return sortChords(
    chords.map((c) =>
      c.id === id ? { ...c, root: choice.root, quality: choice.quality, inversion: choice.inversion ?? 0 } : c
    )
  );
}

/**
 * Moves the change between chord `rightId` and the chord before it to `tick`.
 * The change stays inside its two chords, one `step` from each far end.
 * Chords that do not touch change only the right chord's start.
 */
export function withBoundaryAt(
  chords: ReadonlyArray<TimelineChord>,
  rightId: string,
  tick: number,
  step: number
): TimelineChord[] {
  const sorted = sortChords(chords);
  const at = sorted.findIndex((c) => c.id === rightId);
  if (at < 0) return sorted;
  const right = sorted[at];
  const left = sorted[at - 1];
  const rightEnd = right.startTick + right.durationTick;
  const touches = left !== undefined && left.startTick + left.durationTick === right.startTick;
  const lo = touches ? left.startTick + step : 0;
  const hi = rightEnd - step;
  const next = Math.min(hi, Math.max(lo, Math.round(tick / step) * step));
  if (next === right.startTick) return sorted;
  const moved: TimelineChord = { ...right, startTick: next, durationTick: rightEnd - next };
  const base = sorted.filter((c) => c.id !== right.id && !(touches && c.id === left.id));
  const out = touches ? [...base, { ...left, durationTick: next - left.startTick }] : base;
  return placeChord(out, moved);
}

export interface ChordStripCell {
  id: string;
  chord: TimelineChord;
  leftPx: number;
  widthPx: number;
}

/** The cells of a clip's chord strip: one per chord under the clip, clipped to it. */
export function chordStripCells(
  chords: ReadonlyArray<TimelineChord>,
  clip: { startMs: number; durationMs: number },
  tempo: TimelineTempo,
  msPerPx: number
): ChordStripCell[] {
  const endMs = clip.startMs + clip.durationMs;
  const cells: ChordStripCell[] = [];
  for (const chord of sortChords(chords)) {
    const from = Math.max(clip.startMs, docTickToMs(chord.startTick, tempo));
    const to = Math.min(endMs, docTickToMs(chord.startTick + chord.durationTick, tempo));
    if (to <= from) continue;
    cells.push({
      id: chord.id,
      chord,
      leftPx: (from - clip.startMs) / msPerPx,
      widthPx: (to - from) / msPerPx
    });
  }
  return cells;
}
