import { copySequenceRhythm, type SequenceRhythm } from './shared/sequenceRhythm';
// Pure WT-1 note-sequencer data model + timing math. A step is
// { on, note (0..11 within the lane octave), oct (-1/0/+1), acc, duration }.
// patterns are packed 3 bytes per step so they cross the worklet port as one
// The worklet re-implements the same unpack + timing internally
// (self-contained); the parity test asserts the constants.

import type { SeqLayout } from './shared/seqEdit';

export const STEPS = 16;
export const NPATTERNS = 4;
export const PATTERN_NAMES = ['1', '2', '3', '4'];
export const NOTE_LANES = 12; // one octave of lanes, C at the bottom
export const OCT_MIN = -1;
export const OCT_MAX = 1;

// byte 0: bit0 on, bit1 acc, bits2..7 duration (1..63 steps) · byte 1: note 0..11 · byte 2: oct+1
export const STEP_STRIDE = 3;

export const ACCENT_VEL = 1.0;
export const PLAIN_VEL = 0.72;
export const MAX_NOTE_STEPS = 63;
// Swing: odd 16ths are delayed by swing * SWING_MAX of a step (1.0 → triplet feel).
export const SWING_MAX = 0.667;

export interface SeqStep {
  on: boolean;
  note: number; // 0..11
  oct: number; // -1 | 0 | 1
  acc: boolean;
  duration: number;
}

export type Patterns = Uint8Array;

// Layout descriptor for src/shared/seqEdit.ts's pure range helpers.
export const WT1_LAYOUT: SeqLayout = { stride: STEP_STRIDE, stepsPerPattern: STEPS, patternSize: STEPS * STEP_STRIDE };

// Byte pattern of a cleared step: duration 1, neutral octave, rest note — the
// same "empty step" makeEmptyPatterns() writes, not all-zero (see setStep).
export const EMPTY_STEP: Uint8Array = Uint8Array.of(1 << 2, 0, 1);

export const stepOff = (pat: number, step: number): number =>
  (pat * STEPS + step) * STEP_STRIDE;

export const makeEmptyPatterns = (): Patterns => {
  const p = new Uint8Array(NPATTERNS * STEPS * STEP_STRIDE);
  // Neutral octave plus a one-step duration.
  for (let i = 0; i < p.length; i += STEP_STRIDE) { p[i] = 1 << 2; p[i + 2] = 1; }
  return p;
};

export function getStep(p: Patterns, pat: number, step: number): SeqStep {
  const o = stepOff(pat, step);
  const flags = p[o];
  return {
    on: (flags & 1) !== 0,
    note: Math.min(NOTE_LANES - 1, p[o + 1]),
    oct: Math.min(OCT_MAX, Math.max(OCT_MIN, p[o + 2] - 1)),
    acc: (flags & 2) !== 0,
    duration: Math.max(1, Math.min(MAX_NOTE_STEPS, (flags >> 2) & 0x3f)),
  };
}

export function setStep(p: Patterns, pat: number, step: number, s: Partial<SeqStep>): Patterns {
  const next = p.slice();
  const cur = getStep(p, pat, step);
  const merged = { ...cur, ...s };
  const o = stepOff(pat, step);
  const duration = Math.min(MAX_NOTE_STEPS, Math.max(1, merged.duration | 0));
  next[o] = (merged.on ? 1 : 0) | (merged.acc ? 2 : 0) | (duration << 2);
  next[o + 1] = Math.min(NOTE_LANES - 1, Math.max(0, merged.note | 0));
  next[o + 2] = Math.min(OCT_MAX, Math.max(OCT_MIN, merged.oct | 0)) + 1;
  return next;
}

// Semitone offset from the root for a step (lane note + octave switch).
export const stepSemi = (s: { note: number; oct: number } & Record<string, unknown>): number => s.note + 12 * s.oct;

export const cycleOct = (oct: number): number => (oct >= OCT_MAX ? OCT_MIN : oct + 1);

export const stepDurSamples = (bpm: number, sampleRate: number): number =>
  (60 / bpm / 4) * sampleRate;

export const swingDelaySamples = (step: number, swing: number, stepDur: number): number =>
  step % 2 === 1 ? swing * SWING_MAX * stepDur : 0;

export const nextChainPos = (chainLen: number, pos: number): number =>
  chainLen > 0 ? (pos + 1) % chainLen : 0;

export function writePattern(p: Patterns, pat: number, steps: Array<Partial<SeqStep>>): Patterns {
  let next = p;
  steps.forEach((s, i) => {
    if (i < STEPS) next = setStep(next, pat, i, { on: false, note: 0, oct: 0, acc: false, duration: 1, ...s });
  });
  return next;
}

// The RAND button: a sparse minor line with occasional octave throws,
// accents and varied note lengths — melodic flavor rather than BL-1's acid crawl.
export function randomPattern(rng: () => number = Math.random): Array<Partial<SeqStep>> {
  const pool = [0, 0, 2, 3, 5, 7, 10];
  const steps: Array<Partial<SeqStep>> = [];
  for (let i = 0; i < STEPS; i++) {
    const on = rng() < 0.62;
    steps.push({
      on,
      note: pool[(rng() * pool.length) | 0],
      oct: rng() < 0.18 ? (rng() < 0.5 ? -1 : 1) : 0,
      acc: on && rng() < 0.22,
      duration: 1 + ((rng() * 4) | 0),
    });
  }
  return steps;
}

// ---------- persistence ----------
// Patterns + chain live in localStorage independent of presets (presets stay
// sound-only; BL-1 embeds patterns in patches, but WT-1's preset schema and
// its factory presets predate the sequencer).

const LS_KEY = 'fable.noteseq.v1';

export interface SeqState {
  sequenceRhythm?: SequenceRhythm;
  patterns: Patterns;
  chain: number[];
}

export function loadSeqState(): SeqState {
  const fallback = { patterns: makeEmptyPatterns(), chain: [0] };
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return fallback;
    const j = JSON.parse(raw) as { pats?: number[]; chain?: number[]; sequenceRhythm?: SequenceRhythm };
    if (!Array.isArray(j.pats) || j.pats.length !== NPATTERNS * STEPS * STEP_STRIDE) return fallback;
    const chain = Array.isArray(j.chain) && j.chain.length
      ? j.chain.map((x) => Math.min(NPATTERNS - 1, Math.max(0, x | 0)))
      : [0];
    return { sequenceRhythm: copySequenceRhythm(j.sequenceRhythm), patterns: Uint8Array.from(j.pats.map((x) => x & 0xff)), chain };
  } catch {
    return fallback;
  }
}

export function saveSeqState(patterns: Patterns, chain: number[], sequenceRhythm?: SequenceRhythm): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LS_KEY, JSON.stringify({ pats: Array.from(patterns), chain, ...(sequenceRhythm ? { sequenceRhythm: copySequenceRhythm(sequenceRhythm) } : {}) }));
  } catch {
    /* quota / private mode — sequencer still works, just not persisted */
  }
}
