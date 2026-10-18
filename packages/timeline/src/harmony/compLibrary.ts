/**
 * Comp pattern library, ported from FableSynth `src/compLibrary.ts`. Each
 * family holds authored grooves and the playing feel (gate, strum, voicing)
 * that suits it. Every groove expands through named variations (no bass,
 * shell voicing, legato, offbeat, half-time...); variations that change
 * nothing or repeat an existing pattern are dropped.
 */

import type { CompVoicing, StrumDirection } from "../types.js";
import { COMP_BASS, COMP_LOW, COMP_MID, COMP_TOP, formatCompSteps, parseCompSteps } from "./comp.js";

export interface CompFeel { gate: number; strum: number; strumDir: StrumDirection; voicing: CompVoicing }
export interface CompGroove { name: string; steps: string; rate?: number; gate?: number }
export interface CompFamily { name: string; feel: CompFeel; grooves: CompGroove[] }

const feel = (gate: number, voicing: CompVoicing, strum = 0, strumDir: StrumDirection = "down"): CompFeel => ({ gate, strum, strumDir, voicing });

export const COMP_FAMILIES: CompFamily[] = [
  { name: "AMBIENT", feel: feel(.95, "open"), grooves: [
    { name: "WHOLE NOTES", steps: "BC> - - - - - - - - - - - - - - -" },
    { name: "SWELL", steps: "BC> - - - - - - - U - - - - - - -" },
    { name: "DRIFT", steps: "BC> - - - - - - - - - - - U - - -" },
    { name: "BREATH", steps: "C> - - - - - - - . . . . . . . ." },
  ] },
  { name: "BALLAD", feel: feel(.9, "open", 6, "up"), grooves: [
    { name: "HALF NOTES", steps: "BC> - - - - - - - C - - - - - - -" },
    { name: "QUARTERS", steps: "BC> - - - C - - - C> - - - C - - -" },
    { name: "BROKEN 8THS", steps: "B> - L - M - T - M> - L - M - T -" },
    { name: "ROLLING 16THS", steps: "B> L M T M L M T B> L M T M L M T" },
    { name: "PUSHED HALF", steps: "BC> - - - - - - C> - - - - - - - -" },
  ] },
  { name: "POP / ROCK", feel: feel(.6, "close"), grooves: [
    { name: "PULSE 8THS", steps: "BC> . C . C . C . BC> . C . C . C ." },
    { name: "ROOT 8THS", steps: "BL> . BL . BL . BL . BL> . BL . BL . BL ." },
    { name: "POP SYNCOPATION", steps: "BC> - - C - - C - - - C> - - C - -" },
    { name: "FLOOR CHORDS", steps: "C> . . . C . . . C> . . . C . . ." },
    { name: "PUNK DOWNSTROKES", steps: "BC> C C C C C C C BC> C C C C C C C", rate: .5, gate: .5 },
  ] },
  { name: "SOUL / R&B", feel: feel(.7, "drop2", 4, "up"), grooves: [
    { name: "BACKBEAT PIANO", steps: "BC> . . . U> . . . BC . . . U> . . ." },
    { name: "NEO SOUL LAYBACK", steps: "BC> - - - - - . U - - . . . U> - -" },
    { name: "MOTOWN", steps: "BC . C . C> . C . BC . C . C> . C ." },
    { name: "R&B SPLIT", steps: "B> . U . . U . . B . . U . U . ." },
  ] },
  { name: "FUNK", feel: feel(.25, "drop2", 5, "alt"), grooves: [
    { name: "FUNK 16THS", steps: "U> . U . . U . U . U> . . U . U ." },
    { name: "CHICKEN SCRATCH", steps: "T> T U T . T U T T> T U T . T U T" },
    { name: "CLAV OFFBEATS", steps: ". U . U> . U . U . U . U> . U . U" },
    { name: "ON THE ONE", steps: "BC> . . . . . U . . U . . U> . . ." },
    { name: "WAH PUSHES", steps: ". . U> - . U . . . . U> - . U . ." },
  ] },
  { name: "DISCO / HOUSE", feel: feel(.35, "close"), grooves: [
    { name: "HOUSE OFFBEAT", steps: ". . C> . . . C . . . C> . . . C ." },
    { name: "PIANO HOUSE", steps: "C> . . C . . C - . . C> . . C . ." },
    { name: "DISCO GALLOP", steps: "C> . C C C> . C C C> . C C C> . C C" },
    { name: "FRENCH FILTER", steps: "C> - . C . . C - . . C> - . C . ." },
    { name: "GARAGE SKIP", steps: "C> . . C . . . . . . C> . . . C ." },
    { name: "CHORD JACK", steps: ". C> . C . C> . C . C> . C . C> . C" },
  ] },
  { name: "DEEP HOUSE", feel: feel(.4, "drop2"), grooves: [
    { name: "DEEP STAB", steps: ". . . C> - . . . . . C - . . . ." },
    { name: "LATE NIGHT", steps: "C> - . . . . C - . . . . C - . ." },
    { name: "ORGAN BOUNCE", steps: ". . C> . . . C . . . C> . . C . C" },
  ] },
  { name: "DUB / TECHNO", feel: feel(.3, "close"), grooves: [
    { name: "DUB STAB", steps: ". . C> - . . . . . . C - . . . ." },
    { name: "DUB OFFBEAT", steps: ". . C> . . . . . . . C> . . . . ." },
    { name: "CHORD ECHO", steps: ". . . C> . . . . . . . . . . C ." },
    { name: "MINIMAL PING", steps: ". . . . . . C> . . . . . . . . ." },
    { name: "DETROIT PUSH", steps: "C> . . C . . C . . . C> . . . . ." },
    { name: "RAVE STAB", steps: "C> . . C> . . C> . . . C . . C . ." },
  ] },
  { name: "TRANCE / EDM", feel: feel(.45, "open"), grooves: [
    { name: "TRANCE GATE", steps: "C> C . C C . C C> . C C . C . C C" },
    { name: "SIDECHAIN PUMP", steps: ". C C C> . C C C . C C C> . C C C" },
    { name: "SUPERSAW OFFBEAT", steps: ". . C> - . . C - . . C> - . . C -" },
    { name: "FUTURE BOUNCE", steps: "C> . . C . . C> . . . C . C> . . ." },
  ] },
  { name: "REGGAE / SKA", feel: feel(.25, "close", 8, "up"), grooves: [
    { name: "SKANK", steps: ". . . . U> . . . . . . . U> . . ." },
    { name: "DOUBLE SKANK", steps: ". . . . U> . U . . . . . U> . U ." },
    { name: "SKA UPSTROKES", steps: ". . U> . . . U . . . U> . . . U ." },
    { name: "ORGAN BUBBLE", steps: ". U U> . . U U . . U U> . . U U ." },
    { name: "ROCKSTEADY", steps: ". . . . U> . . U . . . . U> . . U" },
  ] },
  { name: "LATIN", feel: feel(.3, "drop2", 3, "alt"), grooves: [
    { name: "BOSSA", steps: "B> . . U . . U . B . U . . U . ." },
    { name: "SAMBA", steps: "B> . U U . U . U B . U . U U . U" },
    { name: "MONTUNO", steps: "L> . T . . M . T . T> . M . T . L" },
    { name: "SON CLAVE", steps: "C> . . C . . C . . . C . C . . ." },
    { name: "CUMBIA", steps: "B> . U . B . U . B> . U . B . U ." },
    { name: "DEMBOW", steps: "C> . . C . . C . C> . . C . . C ." },
  ] },
  { name: "AFRO / CARIBBEAN", feel: feel(.35, "close", 4, "alt"), grooves: [
    { name: "TRESILLO", steps: "BC> - - - - - C - - - - - C> - - -" },
    { name: "DANCEHALL", steps: ". . . C> . . C . . . . C> . . C ." },
    { name: "AFROBEAT GUITAR", steps: "T> . T T . T . T T> . T . T T . T" },
    { name: "HIGHLIFE", steps: "L> . T . M . T . L> . T . M T . T" },
    { name: "AMAPIANO KEYS", steps: ". . . C> . . . . . . C - . . C ." },
  ] },
  { name: "JAZZ / SWING", feel: feel(.45, "drop2", 3, "up"), grooves: [
    { name: "CHARLESTON", steps: "BC> - . . . . C - . . . . . . . ." },
    { name: "FOUR TO THE BAR", steps: "LM> . . . LM . . . LM> . . . LM . . ." },
    { name: "RED GARLAND", steps: ". . . . . . C> - . . . . . . C -" },
    { name: "STRIDE", steps: "B> . . . U . . . L . . . U . . ." },
    { name: "BEBOP STABS", steps: ". . . U> . . . . . . U . . . . ." },
    { name: "SHUFFLE BLUES", steps: "BC> . C . BC . C . BC> . C . BC . C ." },
  ] },
  { name: "COUNTRY / FOLK", feel: feel(.5, "close", 14, "alt"), grooves: [
    { name: "BOOM-CHICK", steps: "B> . . . U . . . B . . . U . . ." },
    { name: "ALTERNATING BASS", steps: "B> . . . U . . . L> . . . U . . ." },
    { name: "TRAIN BEAT", steps: "B> . U U . . U U L . U U . . U U" },
    { name: "FOLK STRUM", steps: "C> . . . C . C . . . C . C> . C ." },
    { name: "TRAVIS PICK", steps: "B> . T . L . M . B> . T . L . M ." },
  ] },
  { name: "CLASSICAL", feel: feel(.8, "close"), grooves: [
    { name: "ALBERTI", steps: "L> T M T L T M T L> T M T L T M T" },
    { name: "CHORALE", steps: "BC> - - - BC - - - BC> - - - BC - - -" },
    { name: "ARPEGGIO SWEEP", steps: "L> M T M L M T M L> M T M L M T M" },
    { name: "MARCATO", steps: "BC> . . . . . . . C> . . . . . . ." },
  ] },
  { name: "HIP-HOP / LO-FI", feel: feel(.7, "open", 10, "up"), grooves: [
    { name: "LO-FI KEYS", steps: "BC> - - - - - - - . . U - - - . ." },
    { name: "BOOM BAP STAB", steps: "C> . . . . . . . . . C> . . . . ." },
    { name: "SOUL CHOP", steps: "C> - - . . . C - . . C> - . . . ." },
    { name: "DRAGGED", steps: ". . . C> - - . . . . . C - . . ." },
  ] },
  { name: "DRUM & BASS", feel: feel(.3, "open"), grooves: [
    { name: "LIQUID PADS", steps: "BC> - - - - - - - - - C - - - - -" },
    { name: "JUNGLE STAB", steps: "C> . . . . . . . . . C> . . . C ." },
    { name: "BREAK CHOPS", steps: "C> . . C . . . . . . C . C> . . ." },
  ] },
];

export interface CompLibraryEntry {
  name: string; family: string; groove: string; variation: string;
  comp: number[]; ties: boolean[]; accents: boolean[];
  rate: number; gate: number; strum: number; strumDir: StrumDirection; voicing: CompVoicing;
}
type Pattern = Pick<CompLibraryEntry, "comp" | "ties" | "accents" | "rate" | "gate">;

const VOICES = COMP_LOW | COMP_MID | COMP_TOP;
const hit = (p: Pattern, i: number): boolean => !!p.comp[i] && !p.ties[i];
// Ties only hold a sounding step (the loop wraps); a tie after a rest rests.
const normalize = (p: Pattern): Pattern => {
  const pass = (sounding: boolean, out?: Pattern): boolean => {
    for (let i = 0; i < 16; i++) {
      if (p.ties[i]) { if (!sounding && out) { out.ties[i] = false; out.comp[i] = 0; out.accents[i] = false; } }
      else sounding = !!p.comp[i];
    }
    return sounding;
  };
  const out = { ...p, comp: [...p.comp], ties: [...p.ties], accents: p.accents.map((a, i) => a && !!p.comp[i] && !p.ties[i]) };
  pass(pass(false), out);
  return out;
};
const map = (p: Pattern, f: (m: number) => number): Pattern =>
  ({ ...p, comp: p.comp.map((m, i) => p.ties[i] ? m : f(m)) });
/** Named variations; each returns null when it does not apply. */
export const COMP_VARIATIONS: { name: string; apply: (p: Pattern) => Pattern | null }[] = [
  { name: "ORIGINAL", apply: p => p },
  { name: "NO BASS", apply: p => map(p, m => m & ~COMP_BASS) },
  { name: "ROOTED", apply: p => {
    const comp = [...p.comp], ties = [...p.ties], accents = [...p.accents];
    for (const r of [0, 8]) {
      if (hit(p, r)) comp[r] |= COMP_BASS;
      else if (r === 0) { comp[0] = COMP_BASS; ties[0] = false; accents[0] = true; }
    }
    return { ...p, comp, ties, accents };
  } },
  { name: "SHELL", apply: p => map(p, m => m & COMP_MID ? (m & ~COMP_MID) | COMP_TOP | (m & COMP_LOW ? COMP_LOW : 0) : m) },
  { name: "FULL", apply: p => map(p, m => m & VOICES ? m | VOICES : m) },
  { name: "STACCATO", apply: p => ({ ...p, ties: p.ties.map(() => false), comp: p.comp.map((m, i) => p.ties[i] ? 0 : m), gate: Math.min(p.gate, .2) }) },
  { name: "LEGATO", apply: p => {
    let sounding = false;
    const ties = p.comp.map((_, i) => {
      if (hit(p, i)) { sounding = true; return false; }
      return p.ties[i] || sounding;
    });
    return { ...p, ties, gate: Math.max(p.gate, .9) };
  } },
  { name: "OFFBEAT", apply: p => {
    const rot = <T,>(a: T[]): T[] => a.map((_, i) => a[(i + 14) % 16]);
    return { ...p, comp: rot(p.comp), ties: rot(p.ties), accents: rot(p.accents) };
  } },
  { name: "HALF-TIME", apply: p => p.rate === .25 ? { ...p, rate: .5 } : null },
];

const key = (p: Pattern): string => `${formatCompSteps(p.comp, p.ties, p.accents)}|${p.rate}`;
/** Every family groove in every distinct variation, original first. */
export const COMP_LIBRARY: CompLibraryEntry[] = (() => {
  const seen = new Set<string>(), out: CompLibraryEntry[] = [];
  for (const family of COMP_FAMILIES) for (const groove of family.grooves) {
    const base: Pattern = { ...parseCompSteps(groove.steps), rate: groove.rate ?? .25, gate: groove.gate ?? family.feel.gate };
    for (const v of COMP_VARIATIONS) {
      const applied = v.apply(base), p = applied && normalize(applied);
      if (!p || !p.comp.some((m, i) => m && !p.ties[i]) || seen.has(key(p))) continue;
      seen.add(key(p));
      out.push({ ...family.feel, ...p, name: v.name === "ORIGINAL" ? groove.name : `${groove.name} · ${v.name}`,
        family: family.name, groove: groove.name, variation: v.name });
    }
  }
  return out;
})();

/** The library entry a pattern matches (voices, ties, accents and rate), or -1. */
export function compLibraryIndex(a: Pick<CompLibraryEntry, "comp" | "ties" | "accents" | "rate">): number {
  const k = key({ ...a, gate: 0 });
  return COMP_LIBRARY.findIndex(e => key(e) === k);
}
