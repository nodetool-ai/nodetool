/**
 * Chord symbols as plain ASCII text: the form agents read and write.
 * `chordName` in `chords.ts` keeps the Unicode display names for the UI.
 */

import type { ChordQuality } from "../types.js";
import { CHORD_QUALITIES, CHORD_QUALITY_IDS, type ChordShape } from "./chords.js";

/** Root names a symbol is written with, indexed by pitch class. */
export const CHORD_ROOT_NAMES = [
  "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"
] as const;

/** The ASCII suffix each quality is written with. */
export const CHORD_SYMBOL_SUFFIX: Record<ChordQuality, string> = {
  maj: "",
  min: "m",
  dim: "dim",
  aug: "aug",
  sus2: "sus2",
  sus4: "sus4",
  five: "5",
  six: "6",
  m6: "m6",
  dom7: "7",
  maj7: "maj7",
  m7: "m7",
  mMaj7: "m(maj7)",
  m7b5: "m7b5",
  dim7: "dim7",
  aug7: "aug7",
  sus7: "7sus4",
  add9: "add9",
  madd9: "m(add9)",
  dom9: "9",
  maj9: "maj9",
  m9: "m9",
  dom7b9: "7b9",
  dom7s9: "7#9",
  m11: "m11",
  dom11: "11",
  maj13: "maj13",
  dom13: "13"
};

const pc = (n: number): number => ((Math.round(n) % 12) + 12) % 12;

/** The pitch class of chord tone `index` (the `CHORD_QUALITIES` interval order). */
function toneClass(c: ChordShape, index: number): number {
  const iv = CHORD_QUALITIES[c.quality].iv;
  return pc(c.root + iv[index]);
}

/** The ASCII symbol of `c`: "Am", "Bb7", "F#m7b5", "C/E". */
export function chordSymbol(c: ChordShape): string {
  const root = pc(c.root);
  const base = CHORD_ROOT_NAMES[root] + CHORD_SYMBOL_SUFFIX[c.quality];
  const iv = CHORD_QUALITIES[c.quality].iv;
  const inv = Math.max(0, Math.min(iv.length - 1, c.inversion | 0));
  return inv > 0 ? `${base}/${CHORD_ROOT_NAMES[toneClass({ ...c, root }, inv)]}` : base;
}

/** Aliases for the suffix, besides the `CHORD_SYMBOL_SUFFIX` forms. */
const SUFFIX_ALIASES: ReadonlyArray<readonly [string, ChordQuality]> = [
  ["M", "maj"], ["maj", "maj"], ["major", "maj"],
  ["min", "min"], ["-", "min"], ["minor", "min"],
  ["°", "dim"], ["o", "dim"],
  ["+", "aug"],
  ["M7", "maj7"], ["Δ", "maj7"], ["Δ7", "maj7"],
  ["min7", "m7"], ["-7", "m7"],
  ["ø", "m7b5"], ["ø7", "m7b5"],
  ["°7", "dim7"], ["o7", "dim7"],
  ["+7", "aug7"], ["7#5", "aug7"],
  ["7sus", "sus7"],
  ["sus", "sus4"],
  ["mMaj7", "mMaj7"], ["mM7", "mMaj7"], ["mmaj7", "mMaj7"],
  ["madd9", "madd9"],
  ["M9", "maj9"], ["M13", "maj13"]
];

const SUFFIXES = new Map<string, ChordQuality>();
for (const id of CHORD_QUALITY_IDS) SUFFIXES.set(CHORD_SYMBOL_SUFFIX[id], id);
for (const [text, id] of SUFFIX_ALIASES) SUFFIXES.set(text, id);
/** Case-insensitive lookup for the word forms only ("Maj7", "DIM", "Sus4"). */
const WORD_SUFFIXES = new Map<string, ChordQuality>();
for (const [text, id] of SUFFIXES) {
  // "M13" and "M9" differ from "m13" and "m9" by case alone, so they stay exact.
  if (text.length >= 3 && /^[a-z0-9()#]+$/i.test(text) && !/^M(?!aj|in)/.test(text)) {
    WORD_SUFFIXES.set(text.toLowerCase(), id);
  }
}

/** What the error messages list, so an agent can correct a symbol in one try. */
export const CHORD_SYMBOL_HELP =
  `Roots: ${CHORD_ROOT_NAMES.join(" ")} (also written with ♯ or ♭, and with b or # as flat or sharp). ` +
  `Qualities after the root: ${CHORD_QUALITY_IDS.map((id) => CHORD_SYMBOL_SUFFIX[id] || "(none)").join(" ")}. ` +
  `A slash adds a bass that must be a chord tone, such as C/E.`;

export type ParsedChordSymbol =
  | ({ ok: true } & ChordShape)
  | { ok: false; error: string };

function readRoot(text: string): { root: number; length: number } | undefined {
  const m = /^([A-Ga-g])([#b♯♭]?)/.exec(text);
  if (!m) return undefined;
  const letter = m[1].toUpperCase();
  // A lower-case letter is a root only when it is "b" with nothing after it
  // that makes it a flat: "bb" is B flat, and "b" alone is B.
  const natural = ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const)[letter as "C"];
  const accidental = m[2] === "#" || m[2] === "♯" ? 1 : m[2] === "b" || m[2] === "♭" ? -1 : 0;
  return { root: pc(natural + accidental), length: m[0].length };
}

/**
 * Parses a chord symbol. Accepts the `chordSymbol` output and the aliases
 * ("M7", "Δ", "ø", "-7", "°7", "+"). A slash bass sets the inversion to the
 * first chord tone with that pitch class. A bass that is not a chord tone is
 * an error, because a chord has no free bass note.
 */
export function parseChordSymbol(input: string): ParsedChordSymbol {
  const text = input.trim();
  const fail = (why: string): ParsedChordSymbol => ({
    ok: false,
    error: `Cannot read the chord symbol "${input}": ${why} ${CHORD_SYMBOL_HELP}`
  });
  if (text === "") return fail("it is empty.");
  const root = readRoot(text);
  if (!root || !/^[A-G]/.test(text)) {
    return fail("a symbol starts with a root letter from A to G.");
  }
  const slash = text.indexOf("/");
  const suffixText = (slash >= 0 ? text.slice(root.length, slash) : text.slice(root.length))
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .trim();
  // A capital M that does not start "Maj" or "Min" is major, so it never falls back to a lower-case match.
  const folds = !/^M(?!aj|in|AJ|IN)/.test(suffixText);
  const quality = SUFFIXES.get(suffixText) ?? (folds ? WORD_SUFFIXES.get(suffixText.toLowerCase()) : undefined);
  if (quality === undefined) {
    return fail(`"${suffixText}" is not a known quality.`);
  }
  let inversion = 0;
  if (slash >= 0) {
    const bassText = text.slice(slash + 1).trim();
    const bass = readRoot(bassText);
    if (!bass || bass.length !== bassText.length || !/^[A-G]/.test(bassText)) {
      return fail(`"${bassText}" is not a bass note.`);
    }
    const iv = CHORD_QUALITIES[quality].iv;
    const index = iv.findIndex((i) => pc(root.root + i) === bass.root);
    if (index < 0) {
      const tones = [...new Set(iv.map((i) => CHORD_ROOT_NAMES[pc(root.root + i)]))];
      return fail(
        `the bass ${CHORD_ROOT_NAMES[bass.root]} is not a tone of ${CHORD_ROOT_NAMES[root.root]}${CHORD_SYMBOL_SUFFIX[quality]}. ` +
          `The chord tones are ${tones.join(" ")}.`
      );
    }
    inversion = index;
  }
  return { ok: true, root: root.root, quality, inversion };
}

