/**
 * Scales for snapping written notes, ported from FableSynth `src/scales.ts`.
 * KEY snaps to one scale on the key; CHORDS gives each chord the scale that
 * fits it best in the key, and gaps between chords use the key scale.
 * FableSynth's FOLLOW mode is not ported.
 */

import type { HarmonyScaleId, TimelineChord } from "../types.js";
import { CHORD_QUALITIES, PITCH_NAMES } from "./chords.js";

export const SCALES = {
  major: { name: "MAJOR", iv: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: "MINOR", iv: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { name: "DORIAN", iv: [0, 2, 3, 5, 7, 9, 10] },
  mixolydian: { name: "MIXOLYDIAN", iv: [0, 2, 4, 5, 7, 9, 10] },
  phrygian: { name: "PHRYGIAN", iv: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { name: "LYDIAN", iv: [0, 2, 4, 6, 7, 9, 11] },
  locrian: { name: "LOCRIAN", iv: [0, 1, 3, 5, 6, 8, 10] },
  harmMinor: { name: "HARMONIC MINOR", iv: [0, 2, 3, 5, 7, 8, 11] },
  melMinor: { name: "MELODIC MINOR", iv: [0, 2, 3, 5, 7, 9, 11] },
  phrygDom: { name: "PHRYGIAN DOM", iv: [0, 1, 4, 5, 7, 8, 10] },
  lydDom: { name: "LYDIAN DOM", iv: [0, 2, 4, 6, 7, 9, 10] },
  locrian2: { name: "LOCRIAN ♮2", iv: [0, 2, 3, 5, 6, 8, 10] },
  altered: { name: "ALTERED", iv: [0, 1, 3, 4, 6, 8, 10] },
  wholeTone: { name: "WHOLE TONE", iv: [0, 2, 4, 6, 8, 10] },
  dimHW: { name: "DIM HALF-WHOLE", iv: [0, 1, 3, 4, 6, 7, 9, 10] },
  dimWH: { name: "DIM WHOLE-HALF", iv: [0, 2, 3, 5, 6, 8, 9, 11] },
  majPent: { name: "MAJOR PENT", iv: [0, 2, 4, 7, 9] },
  minPent: { name: "MINOR PENT", iv: [0, 3, 5, 7, 10] },
  blues: { name: "BLUES", iv: [0, 3, 5, 6, 7, 10] }
} as const satisfies Record<HarmonyScaleId, { name: string; iv: readonly number[] }>;

export const SCALE_IDS = Object.keys(SCALES) as HarmonyScaleId[];
/** Key scales AUTO picks from, in tie-break order. */
const KEY_CANDIDATES: HarmonyScaleId[] = ["minor", "major", "dorian", "mixolydian", "phrygian", "lydian", "harmMinor"];
/** Chord scales CHORDS picks from, in tie-break order (no pentatonics: they drop chord colour). */
const CHORD_CANDIDATES: HarmonyScaleId[] = ["major", "minor", "dorian", "mixolydian", "phrygian", "lydian", "locrian",
  "harmMinor", "melMinor", "phrygDom", "lydDom", "locrian2", "altered", "wholeTone", "dimHW", "dimWH"];

type ChordPc = Pick<TimelineChord, "root" | "quality">;

/** A 12-bit pitch-class set (bit 0 = C) of scale `id` on `root`. */
export const scaleMask = (root: number, id: HarmonyScaleId): number =>
  (SCALES[id].iv as readonly number[]).reduce((m, i) => m | (1 << (root + i) % 12), 0);
export const chordMask = (c: ChordPc): number =>
  (CHORD_QUALITIES[c.quality].iv as readonly number[]).reduce((m, i) => m | (1 << (c.root + i) % 12), 0);
const bits = (m: number): number => {
  let n = 0;
  for (let b = m & 0xfff; b; b &= b - 1) n++;
  return n;
};

/** The key scale on `key` that holds the most tick-weighted chord tones. */
export function keyScale(
  chords: ReadonlyArray<ChordPc & Pick<TimelineChord, "durationTick">>,
  key: number
): HarmonyScaleId {
  let best: HarmonyScaleId = KEY_CANDIDATES[0];
  let bestMiss = Infinity;
  for (const id of KEY_CANDIDATES) {
    const k = scaleMask(key, id);
    const miss = chords.reduce((s, c) => s + c.durationTick * bits(chordMask(c) & ~k), 0);
    if (miss < bestMiss) {
      best = id;
      bestMiss = miss;
    }
  }
  return best;
}

/** The scale on the chord's root that holds all its tones, stays closest to
 *  the key scale `keyMask`, and has the fewest avoid notes. */
export function chordScale(c: ChordPc, keyMask: number): HarmonyScaleId {
  const t = chordMask(c);
  let best: HarmonyScaleId = CHORD_CANDIDATES[0];
  let bestScore = -Infinity;
  for (const id of CHORD_CANDIDATES) {
    const s = scaleMask(c.root, id);
    const above = ((t << 1) | (t >> 11)) & 0xfff & ~t;
    const score = bits(s & t) * 100 + 4 * (bits(s & keyMask) - bits(s & ~keyMask)) - 3 * bits(s & above);
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

/** Offsets that move each pitch class to the nearest one in `mask`. A tie
 *  prefers a pitch class in `prefer` (the chord tones), else the lower one. */
export function scaleRemap(mask: number, prefer = 0): number[] {
  const has = (pc: number, m: number): boolean => ((m >> ((((pc % 12) + 12) % 12))) & 1) === 1;
  return Array.from({ length: 12 }, (_, pc) => {
    if (has(pc, mask)) return 0;
    for (let d = 1; d < 12; d++) {
      const down = has(pc - d, mask);
      const up = has(pc + d, mask);
      if (down && up) return has(pc + d, prefer) && !has(pc - d, prefer) ? d : -d;
      if (down) return -d;
      if (up) return d;
    }
    return 0;
  });
}

/** `note` moved by a remap table, clamped to 0..127. */
export const remapNote = (table: ReadonlyArray<number>, note: number): number =>
  Math.max(0, Math.min(127, note + table[((note % 12) + 12) % 12]));

export const scaleLabel = (root: number, scale: HarmonyScaleId): string =>
  `${PITCH_NAMES[((root % 12) + 12) % 12]} ${SCALES[scale].name}`;
