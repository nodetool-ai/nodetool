/**
 * Chord comping, ported from FableSynth `src/comp.ts`. Each step strikes a
 * voicing of the current chord instead of one arp note. Voice masks adapt to
 * any chord size: LOW is the lowest voice, TOP the highest, MID every voice
 * between them, BASS the root one octave below the voicing.
 */

import type { CompVoicing, StrumDirection } from "../types.js";

export const COMP_BASS = 1;
export const COMP_LOW = 2;
export const COMP_MID = 4;
export const COMP_TOP = 8;
export const COMP_ROWS = [["TOP", COMP_TOP], ["MID", COMP_MID], ["LOW", COMP_LOW], ["BASS", COMP_BASS]] as const;
/** Most notes one comp step strikes. */
export const COMP_MAX_NOTES = 8;
export const STRUM_DIRECTIONS: StrumDirection[] = ["up", "down", "alt"];
export const COMP_VOICINGS: CompVoicing[] = ["close", "drop2", "drop24", "open"];
export const STRUM_MAX_MS = 60;

const MASKS: Record<string, number> = {
  B: COMP_BASS, L: COMP_LOW, M: COMP_MID, T: COMP_TOP,
  C: COMP_LOW | COMP_MID | COMP_TOP, U: COMP_MID | COMP_TOP
};

/** Steps: '.' rest, '-' tie, else voices B L M T (C = L+M+T, U = M+T); '>' accents. */
export function parseCompSteps(steps: string): { comp: number[]; ties: boolean[]; accents: boolean[] } {
  const tokens = steps.trim().split(/\s+/);
  const mask = (t: string): number => [...t].reduce((m, ch) => m | (MASKS[ch] ?? 0), 0);
  return {
    comp: tokens.map(mask),
    ties: tokens.map((t) => t === "-"),
    accents: tokens.map((t) => t.endsWith(">"))
  };
}

/** The inverse of parseCompSteps. */
export function formatCompSteps(
  comp: ReadonlyArray<number>,
  ties: ReadonlyArray<boolean>,
  accents: ReadonlyArray<boolean>
): string {
  return comp
    .map((m, i) => {
      if (ties[i]) return "-";
      if (!m) return ".";
      const v = m & (COMP_LOW | COMP_MID | COMP_TOP);
      const body =
        (m & COMP_BASS ? "B" : "") +
        (v === (COMP_LOW | COMP_MID | COMP_TOP)
          ? "C"
          : v === (COMP_MID | COMP_TOP)
            ? "U"
            : (v & COMP_LOW ? "L" : "") + (v & COMP_MID ? "M" : "") + (v & COMP_TOP ? "T" : ""));
      return body + (accents[i] ? ">" : "");
    })
    .join(" ");
}

/** Spreads an ascending voicing: DROP 2 lowers the second-highest voice an
 *  octave, DROP 2+4 also the fourth-highest, OPEN raises every other voice. */
export function spreadVoicing(v: ReadonlyArray<number>, kind: CompVoicing): number[] {
  const n = v.length;
  const out = [...v];
  if (n >= 3 && (kind === "drop2" || kind === "drop24")) out[n - 2] -= 12;
  if (n >= 4 && kind === "drop24") out[n - 4] -= 12;
  if (n >= 3 && kind === "open") for (let i = 1; i < n; i += 2) out[i] += 12;
  return out.filter((x) => x >= 0 && x <= 127).sort((x, y) => x - y);
}

/** Strum direction of lane step `r`. ALT strums like a guitarist's arm: down
 *  on the beat side of each 8th, or of each 16th when the pattern plays odd 16ths. */
export function strumDown(dir: StrumDirection, r: number, sixteenths: boolean): boolean {
  if (dir !== "alt") return dir === "down";
  return sixteenths ? r % 2 === 0 : r % 4 < 2;
}

/** Notes a voice mask selects from an ascending voicing and its bass note. */
export function compVoices(mask: number, voicing: ReadonlyArray<number>, bass: number): number[] {
  const n = voicing.length;
  const out: number[] = [];
  if (!n) return out;
  if (mask & COMP_BASS && bass >= 0) out.push(bass);
  if (mask & COMP_LOW) out.push(voicing[0]);
  if (mask & COMP_MID) out.push(...voicing.slice(1, -1));
  if (mask & COMP_TOP) out.push(voicing[n - 1]);
  return [...new Set(out)].sort((x, y) => x - y).slice(0, COMP_MAX_NOTES);
}
