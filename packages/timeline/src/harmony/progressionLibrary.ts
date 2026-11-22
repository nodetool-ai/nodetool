/** The progression library as agents address it: ids, numerals, keys. */

import { MIDI_PPQ } from "../midi/ticks.js";
import type { ChordQuality } from "../types.js";
import {
  CHORD_QUALITIES,
  PROGRESSIONS,
  progressionFamily,
  progressionLengthTicks,
  type Progression
} from "./chords.js";

/** A stable ASCII id: the name with dashes, "b" for the flat and "hdim" for the half-diminished sign. */
export function progressionId(p: Progression): string {
  return p.name
    .replace(/[–—]/g, "-")
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/ø/g, "hdim")
    .replace(/\s+/g, "_");
}

const ROMAN = ["I", "bII", "II", "bIII", "III", "IV", "bV", "V", "bVI", "VI", "bVII", "VII"];

const NUMERAL_SUFFIX: Partial<Record<ChordQuality, string>> = {
  five: "5", dim: "dim", aug: "+", sus2: "sus2", sus4: "sus4", six: "6", m6: "6",
  dom7: "7", maj7: "maj7", m7: "7", mMaj7: "maj7", m7b5: "7b5", dim7: "dim7",
  aug7: "+7", sus7: "7sus4", add9: "add9", madd9: "add9", dom9: "9",
  maj9: "maj9", m9: "9", dom7b9: "7b9", dom7s9: "7#9", m11: "11", dom11: "11",
  maj13: "maj13", dom13: "13"
};

/** The roman numeral of one step: lower case for a minor third. */
export function stepNumeral(degree: number, quality: ChordQuality): string {
  const base = ROMAN[((degree % 12) + 12) % 12];
  const minor = CHORD_QUALITIES[quality].iv[1] === 3;
  return (minor ? base.toLowerCase() : base) + (NUMERAL_SUFFIX[quality] ?? "");
}

export interface ProgressionInfo {
  id: string;
  name: string;
  family: string;
  numerals: string[];
  length: { beats: number; bars: number };
}

export function listProgressionInfo(): ProgressionInfo[] {
  return PROGRESSIONS.map((p) => {
    const beats = progressionLengthTicks(p) / MIDI_PPQ;
    return {
      id: progressionId(p),
      name: p.name,
      family: progressionFamily(p),
      numerals: p.steps.map(([deg, q]) => stepNumeral(deg, q)),
      length: { beats, bars: beats / 4 }
    };
  });
}

/** A progression by id or name. Exact match first, then ignoring case when only one matches. */
export function findProgression(text: string): Progression | undefined {
  const t = text.trim();
  const exact = PROGRESSIONS.find((p) => progressionId(p) === t || p.name === t);
  if (exact) return exact;
  const lower = t.toLowerCase();
  const loose = PROGRESSIONS.filter(
    (p) => progressionId(p).toLowerCase() === lower || p.name.toLowerCase() === lower
  );
  return loose.length === 1 ? loose[0] : undefined;
}

const KEY_ROOTS: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11
};

/** The pitch class of a project tonic such as "Bb" or "F#". */
export function tonicPitchClass(tonic: string): number | undefined {
  return KEY_ROOTS[tonic];
}

export const KEY_HELP =
  'Write a key as a tonic and an optional mode: "C", "A minor", "F# major", "Bb", "Em". Tonics: C C# Db D D# Eb E F F# Gb G G# Ab A A# Bb B.';

/** Reads "A minor", "C", "F# major", "Em". */
export function parseKey(
  text: string
): { ok: true; tonic: number; mode: "major" | "minor" } | { ok: false; error: string } {
  const m = /^\s*([A-Ga-g])([#b♯♭]?)\s*(major|minor|maj|min|m|M)?\s*$/.exec(text);
  if (m) {
    const name = m[1].toUpperCase() + m[2].replace("♯", "#").replace("♭", "b");
    const root = KEY_ROOTS[name];
    if (root !== undefined) {
      const mode = m[3] === "minor" || m[3] === "min" || m[3] === "m" ? "minor" : "major";
      return { ok: true, tonic: root, mode };
    }
  }
  return { ok: false, error: `Cannot read the key "${text}". ${KEY_HELP}` };
}
