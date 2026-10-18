/**
 * Chords and chord progressions, ported from FableSynth `src/chords.ts`.
 * FableSynth counts in sixteenths over a 1-4 bar loop; here a chord is a
 * region of a chord track in document ticks (`MIDI_PPQ` per quarter note).
 */

import { MIDI_PPQ } from "../midi/ticks.js";
import type { ChordQuality, TimelineChord } from "../types.js";

export const CHORD_QUALITIES = {
  maj: { label: "", name: "MAJOR", iv: [0, 4, 7] },
  min: { label: "m", name: "MINOR", iv: [0, 3, 7] },
  dim: { label: "°", name: "DIMINISHED", iv: [0, 3, 6] },
  aug: { label: "+", name: "AUGMENTED", iv: [0, 4, 8] },
  sus2: { label: "sus2", name: "SUS 2", iv: [0, 2, 7] },
  sus4: { label: "sus4", name: "SUS 4", iv: [0, 5, 7] },
  five: { label: "5", name: "POWER", iv: [0, 7, 12] },
  six: { label: "6", name: "MAJOR 6", iv: [0, 4, 7, 9] },
  m6: { label: "m6", name: "MINOR 6", iv: [0, 3, 7, 9] },
  dom7: { label: "7", name: "DOMINANT 7", iv: [0, 4, 7, 10] },
  maj7: { label: "maj7", name: "MAJOR 7", iv: [0, 4, 7, 11] },
  m7: { label: "m7", name: "MINOR 7", iv: [0, 3, 7, 10] },
  mMaj7: { label: "m(maj7)", name: "MINOR MAJ 7", iv: [0, 3, 7, 11] },
  m7b5: { label: "m7♭5", name: "HALF-DIM 7", iv: [0, 3, 6, 10] },
  dim7: { label: "°7", name: "DIMINISHED 7", iv: [0, 3, 6, 9] },
  aug7: { label: "+7", name: "AUGMENTED 7", iv: [0, 4, 8, 10] },
  sus7: { label: "7sus4", name: "7 SUS 4", iv: [0, 5, 7, 10] },
  add9: { label: "add9", name: "ADD 9", iv: [0, 4, 7, 14] },
  madd9: { label: "m(add9)", name: "MINOR ADD 9", iv: [0, 3, 7, 14] },
  dom9: { label: "9", name: "DOMINANT 9", iv: [0, 4, 7, 10, 14] },
  maj9: { label: "maj9", name: "MAJOR 9", iv: [0, 4, 7, 11, 14] },
  m9: { label: "m9", name: "MINOR 9", iv: [0, 3, 7, 10, 14] },
  dom7b9: { label: "7♭9", name: "7 FLAT 9", iv: [0, 4, 7, 10, 13] },
  dom7s9: { label: "7♯9", name: "7 SHARP 9", iv: [0, 4, 7, 10, 15] },
  m11: { label: "m11", name: "MINOR 11", iv: [0, 3, 7, 10, 14, 17] },
  dom11: { label: "11", name: "DOMINANT 11", iv: [0, 4, 7, 10, 14, 17] },
  maj13: { label: "maj13", name: "MAJOR 13", iv: [0, 4, 7, 11, 14, 21] },
  dom13: { label: "13", name: "DOMINANT 13", iv: [0, 4, 7, 10, 14, 21] }
} as const satisfies Record<
  ChordQuality,
  { label: string; name: string; iv: readonly number[] }
>;

export const CHORD_QUALITY_IDS = Object.keys(CHORD_QUALITIES) as ChordQuality[];

export const PITCH_NAMES = [
  "C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"
] as const;

/** A chord without its place on the track. */
export type ChordShape = Pick<TimelineChord, "root" | "quality" | "inversion">;

export const chordName = (c: Pick<TimelineChord, "root" | "quality">): string =>
  PITCH_NAMES[((c.root % 12) + 12) % 12] + CHORD_QUALITIES[c.quality].label;

/** MIDI note name, C4 = 60. */
export const noteName = (n: number): string =>
  ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][n % 12] +
  (Math.floor(n / 12) - 1);

/** Chord tones voiced from `base` (the C of its octave), lowest first after the inversion. */
export function chordNotes(c: ChordShape, base: number): number[] {
  const notes = CHORD_QUALITIES[c.quality].iv.map((i) => base + c.root + i);
  const inv = Math.max(0, Math.min(notes.length - 1, c.inversion | 0));
  return [...notes.slice(inv), ...notes.slice(0, inv).map((n) => n + 12)].filter(
    (n) => n >= 0 && n <= 127
  );
}

/** Chords sorted by onset. */
export function sortChords<T extends Pick<TimelineChord, "startTick">>(
  chords: ReadonlyArray<T>
): T[] {
  return [...chords].sort((a, b) => a.startTick - b.startTick);
}

/** The chord sounding at document tick `tick`, if any. */
export function chordAtTick<T extends Pick<TimelineChord, "startTick" | "durationTick">>(
  chords: ReadonlyArray<T>,
  tick: number
): T | undefined {
  return chords.find(
    (c) => tick >= c.startTick && tick < c.startTick + c.durationTick
  );
}

/** Inserts a chord, trimming or splitting the chords it overlaps. Split tails get `splitId(id)`. */
export function placeChord(
  chords: ReadonlyArray<TimelineChord>,
  c: TimelineChord,
  splitId: (id: string) => string = (id) => `${id}-r`
): TimelineChord[] {
  const end = c.startTick + c.durationTick;
  const out: TimelineChord[] = [];
  for (const o of chords) {
    if (o.id === c.id) continue;
    const oEnd = o.startTick + o.durationTick;
    if (oEnd <= c.startTick || o.startTick >= end) {
      out.push(o);
      continue;
    }
    if (o.startTick < c.startTick) {
      out.push({ ...o, durationTick: c.startTick - o.startTick });
    }
    if (oEnd > end) {
      out.push({
        ...o,
        id: o.startTick < c.startTick ? splitId(o.id) : o.id,
        startTick: end,
        durationTick: oEnd - end
      });
    }
  }
  return sortChords([...out, c]);
}

/** Moves every chord's root by the distance from `fromKey` to `toKey`. */
export function transposeChords(
  chords: ReadonlyArray<TimelineChord>,
  fromKey: number,
  toKey: number
): TimelineChord[] {
  const d = toKey - fromKey;
  return chords.map((c) => ({ ...c, root: (((c.root + d) % 12) + 12) % 12 }));
}

/** Progression steps: [semitones above the key, quality, length in beats]. */
type Step = readonly [number, ChordQuality, number];
export interface Progression {
  name: string;
  mood: string;
  steps: readonly Step[];
}
const bar = (deg: number, q: ChordQuality): Step => [deg, q, 4];

export const PROGRESSIONS: readonly Progression[] = [
  { name: "I–V–vi–IV", mood: "POP", steps: [bar(0, "maj"), bar(7, "maj"), bar(9, "min"), bar(5, "maj")] },
  { name: "vi–IV–I–V", mood: "POP", steps: [bar(9, "min"), bar(5, "maj"), bar(0, "maj"), bar(7, "maj")] },
  { name: "I–vi–IV–V", mood: "DOO-WOP", steps: [bar(0, "maj"), bar(9, "min"), bar(5, "maj"), bar(7, "maj")] },
  { name: "I–IV–vi–V", mood: "POP", steps: [bar(0, "maj"), bar(5, "maj"), bar(9, "min"), bar(7, "maj")] },
  { name: "I–iii–IV–V", mood: "BALLAD", steps: [bar(0, "maj"), bar(4, "min"), bar(5, "maj"), bar(7, "maj")] },
  { name: "Canon", mood: "CLASSICAL", steps: [[0, "maj", 2], [7, "maj", 2], [9, "min", 2], [4, "min", 2], [5, "maj", 2], [0, "maj", 2], [5, "maj", 2], [7, "maj", 2]] },
  { name: "IV–V–iii–vi", mood: "ROYAL ROAD", steps: [bar(5, "maj7"), bar(7, "dom7"), bar(4, "m7"), bar(9, "m7")] },
  { name: "I–♭VII–IV–I", mood: "MIXOLYDIAN", steps: [bar(0, "maj"), bar(10, "maj"), bar(5, "maj"), bar(0, "maj")] },
  { name: "I–III–IV–iv", mood: "BITTERSWEET", steps: [bar(0, "maj"), bar(4, "maj"), bar(5, "maj"), bar(5, "min")] },
  { name: "I–IV", mood: "VAMP", steps: [[0, "maj", 8], [5, "maj", 8]] },
  { name: "i–VI–III–VII", mood: "EPIC MINOR", steps: [bar(0, "min"), bar(8, "maj"), bar(3, "maj"), bar(10, "maj")] },
  { name: "i–VII–VI–V", mood: "ANDALUSIAN", steps: [bar(0, "min"), bar(10, "maj"), bar(8, "maj"), bar(7, "maj")] },
  { name: "i–iv–v–i", mood: "NATURAL MINOR", steps: [bar(0, "min"), bar(5, "min"), bar(7, "min"), bar(0, "min")] },
  { name: "i–iv–V–i", mood: "HARMONIC MINOR", steps: [bar(0, "min"), bar(5, "min"), bar(7, "dom7"), bar(0, "min")] },
  { name: "i–VI–iv–V", mood: "DRAMATIC", steps: [bar(0, "min"), bar(8, "maj"), bar(5, "min"), bar(7, "maj")] },
  { name: "i–VII–VI–VII", mood: "TRANCE", steps: [bar(0, "min"), bar(10, "maj"), bar(8, "maj"), bar(10, "maj")] },
  { name: "i–♭II", mood: "PHRYGIAN", steps: [[0, "min", 8], [1, "maj", 8]] },
  { name: "i7–IV7", mood: "DORIAN", steps: [[0, "m7", 8], [5, "dom7", 8]] },
  { name: "i7–iv7", mood: "DUB VAMP", steps: [[0, "m7", 8], [5, "m7", 8]] },
  { name: "i9–VImaj7", mood: "DEEP HOUSE", steps: [[0, "m9", 8], [8, "maj7", 8]] },
  { name: "ii–V–I", mood: "JAZZ", steps: [bar(2, "m7"), bar(7, "dom7"), [0, "maj7", 8]] },
  { name: "I–vi–ii–V", mood: "TURNAROUND", steps: [bar(0, "maj7"), bar(9, "m7"), bar(2, "m7"), bar(7, "dom7")] },
  { name: "vi–ii–V–I", mood: "CIRCLE", steps: [bar(9, "m7"), bar(2, "m7"), bar(7, "dom7"), bar(0, "maj7")] },
  { name: "ii9–V13–I9–vi9", mood: "NEO SOUL", steps: [bar(2, "m9"), bar(7, "dom13"), bar(0, "maj9"), bar(9, "m9")] },
  { name: "I7–IV7–I7–V7", mood: "BLUES", steps: [bar(0, "dom7"), bar(5, "dom7"), bar(0, "dom7"), bar(7, "dom7")] },
  { name: "iiø–V7♭9–i", mood: "MINOR JAZZ", steps: [bar(2, "m7b5"), bar(7, "dom7b9"), [0, "m9", 8]] }
];

/** Browser groups for the progression library, by mood. */
export const PROGRESSION_FAMILIES = [
  { name: "MAJOR", moods: ["POP", "DOO-WOP", "BALLAD", "CLASSICAL", "ROYAL ROAD", "BITTERSWEET"] },
  { name: "MINOR", moods: ["EPIC MINOR", "ANDALUSIAN", "NATURAL MINOR", "HARMONIC MINOR", "DRAMATIC"] },
  { name: "MODAL", moods: ["MIXOLYDIAN", "PHRYGIAN", "DORIAN"] },
  { name: "CLUB", moods: ["VAMP", "TRANCE", "DUB VAMP", "DEEP HOUSE"] },
  { name: "JAZZ & SOUL", moods: ["JAZZ", "TURNAROUND", "CIRCLE", "NEO SOUL", "BLUES", "MINOR JAZZ"] }
] as const;

export const progressionFamily = (p: Progression): string =>
  PROGRESSION_FAMILIES.find((f) => (f.moods as readonly string[]).includes(p.mood))?.name ?? "OTHER";

/** Length of one pass of `p`, in ticks. */
export const progressionLengthTicks = (p: Progression): number =>
  p.steps.reduce((sum, [, , beats]) => sum + beats * MIDI_PPQ, 0);

/**
 * The chords of `p` in `key`, from `startTick`, repeated until `lengthTicks`
 * is filled (one pass when absent). The last chord is cut at the end.
 * Ids come from `mintId(i)`.
 */
export function progressionChords(
  p: Progression,
  key: number,
  opts: { startTick?: number; lengthTicks?: number; mintId?: (i: number) => string } = {}
): TimelineChord[] {
  const start = opts.startTick ?? 0;
  const end = start + (opts.lengthTicks ?? progressionLengthTicks(p));
  const mint = opts.mintId ?? ((i: number) => `chord-${i}`);
  const out: TimelineChord[] = [];
  let at = start;
  for (let i = 0; at < end && p.steps.length > 0; i++) {
    const [deg, quality, beats] = p.steps[i % p.steps.length];
    const len = Math.min(beats * MIDI_PPQ, end - at);
    out.push({
      id: mint(i),
      startTick: at,
      durationTick: len,
      root: (((key + deg) % 12) + 12) % 12,
      quality,
      inversion: 0
    });
    at += len;
  }
  return out;
}

/**
 * The library progression the chords hold in `key` (one pass from the first
 * chord's onset), or -1. Inversions and ids do not count.
 */
export function progressionIndex(chords: ReadonlyArray<TimelineChord>, key: number): number {
  if (chords.length === 0) return -1;
  const sorted = sortChords(chords);
  const origin = sorted[0].startTick;
  return PROGRESSIONS.findIndex((p) => {
    const want = progressionChords(p, key, { startTick: origin });
    return (
      want.length === sorted.length &&
      want.every((w, i) => {
        const c = sorted[i];
        return (
          c.startTick === w.startTick &&
          c.durationTick === w.durationTick &&
          c.root === w.root &&
          c.quality === w.quality
        );
      })
    );
  });
}

/** `chords` with each of `incoming` placed over them in order (see `placeChord`). */
export function replaceChordRange(
  chords: ReadonlyArray<TimelineChord>,
  incoming: ReadonlyArray<TimelineChord>,
  splitId?: (id: string) => string
): TimelineChord[] {
  return incoming.reduce<TimelineChord[]>((acc, c) => placeChord(acc, c, splitId), sortChords(chords));
}
