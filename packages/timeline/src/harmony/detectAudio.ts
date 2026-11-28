/**
 * Chord detection from decoded audio.
 *
 * Per window: Hann frames (4096 samples at 44.1 kHz, scaled to the rate and
 * rounded to a power of two), hop of half a frame, magnitude spectrum. Spectral
 * peaks between 55 Hz and 5 kHz add their magnitude to the nearest pitch class
 * (A4 = 440 Hz). The window chroma is the mean over its frames, normalized to a
 * maximum of 1, with weights under `CHROMA_FLOOR` dropped to 0. The bass is the
 * lowest strong peak (above half of the frame maximum) under 300 Hz. The chord
 * comes from the same scoring as the MIDI detector (`bestChordForWeights`).
 *
 * The host decodes the samples. This module has no I/O.
 */

import { fftInPlace } from "../audioOnsets.js";
import type { TimelineChord } from "../types.js";
import { bestChordForWeights } from "./detect.js";

const MIN_HZ = 55;
const MAX_HZ = 5000;
const BASS_MAX_HZ = 300;
/** Chroma weights under this share of the window maximum count as silent. */
export const CHROMA_FLOOR = 0.15;
/** Peaks under this share of the frame maximum are leakage and noise. */
const PEAK_FLOOR = 0.05;
/** A window quieter than this RMS has no chord. */
const SILENCE_RMS = 1e-3;
const BASS_STRONG = 0.5;

/** The FFT size for a sample rate: 4096 at 44.1 kHz, scaled, a power of two. */
export function chromaFrameSize(sampleRate: number): number {
  const target = (4096 * sampleRate) / 44100;
  return 2 ** Math.max(8, Math.round(Math.log2(Math.max(1, target))));
}

export interface WindowChroma {
  /** 12 pitch-class weights, maximum 1, bass already doubled. */
  weights: number[];
  /** Pitch class of the bass, or -1. */
  bass: number;
  /** The same weights before the bass doubling (maximum 1). Used to mix sources. */
  chroma?: number[];
  /** Square root of the span's energy: loud and long spans count more when sources mix. */
  level?: number;
  /** Frequency of the lowest strong bass peak, or 0. */
  bassHz?: number;
}

const hannCache = new Map<number, Float32Array>();
function hann(size: number): Float32Array {
  let w = hannCache.get(size);
  if (!w) {
    w = new Float32Array(size);
    for (let i = 0; i < size; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / size));
    hannCache.set(size, w);
  }
  return w;
}

/** A Hann taper of `n` points, for a span shorter than one frame. */
function hannOf(n: number, size: number): Float32Array {
  if (n === size) return hann(size);
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, n)));
  return w;
}

const pitchClassOfHz = (hz: number): number => (((Math.round(12 * Math.log2(hz / 440)) + 9) % 12) + 12) % 12;

/**
 * The chroma and bass of `samples[from, to)`, or null when the span is silent
 * or empty. `from` and `to` are sample indices and clamp to the buffer.
 */
export function windowChroma(
  samples: Float32Array,
  sampleRate: number,
  from: number,
  to: number
): WindowChroma | null {
  const lo = Math.max(0, Math.floor(from));
  const hi = Math.min(samples.length, Math.ceil(to));
  if (hi - lo < 64) return null;
  let sum = 0;
  for (let i = lo; i < hi; i++) sum += samples[i] * samples[i];
  if (Math.sqrt(sum / (hi - lo)) < SILENCE_RMS) return null;
  const level = Math.sqrt(sum);

  const size = chromaFrameSize(sampleRate);
  const hop = size / 2;
  const binHz = sampleRate / size;
  // The bin nearest 55 Hz at every rate, so 44.1, 48 and 22.05 kHz keep the same low notes.
  const kMin = Math.max(2, Math.round(MIN_HZ / binHz));
  const kMax = Math.min(size / 2 - 2, Math.floor(MAX_HZ / binHz));
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  const mag = new Float32Array(size / 2);
  const chroma = new Array<number>(12).fill(0);
  const bassVotes = new Array<number>(12).fill(0);
  const bassMinHz = new Array<number>(12).fill(Number.POSITIVE_INFINITY);
  let frames = 0;
  // Full frames every hop, then one frame that ends at `hi`, so the tail is read.
  const starts: number[] = [];
  if (hi - lo <= size) {
    starts.push(lo);
  } else {
    for (let start = lo; start + size <= hi; start += hop) starts.push(start);
    if (starts[starts.length - 1] + size < hi) starts.push(hi - size);
  }
  for (const start of starts) {
    re.fill(0);
    im.fill(0);
    const n = Math.min(size, hi - start);
    const win = hannOf(n, size);
    for (let i = 0; i < n; i++) re[i] = samples[start + i] * win[i];
    fftInPlace(re, im);
    let frameMax = 0;
    for (let k = 0; k < size / 2; k++) {
      mag[k] = Math.hypot(re[k], im[k]);
      if (k >= kMin - 1 && k <= kMax + 1 && mag[k] > frameMax) frameMax = mag[k];
    }
    if (frameMax <= 0) continue;
    let lowestStrong = Number.POSITIVE_INFINITY;
    for (let k = kMin; k <= kMax; k++) {
      const m = mag[k];
      if (m < PEAK_FLOOR * frameMax || m <= mag[k - 1] || m < mag[k + 1]) continue;
      // Parabolic interpolation on the log magnitude gives the peak frequency.
      const a = Math.log(mag[k - 1] + 1e-12);
      const b = Math.log(m + 1e-12);
      const c = Math.log(mag[k + 1] + 1e-12);
      const denom = a - 2 * b + c;
      const delta = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
      const hz = (k + Math.max(-0.5, Math.min(0.5, delta))) * binHz;
      chroma[pitchClassOfHz(hz)] += m;
      if (hz < BASS_MAX_HZ && m >= BASS_STRONG * frameMax && hz < lowestStrong) lowestStrong = hz;
    }
    if (Number.isFinite(lowestStrong)) {
      // A loud frame votes with its weight, so a quiet hum cannot outvote a chord hit.
      const pc = pitchClassOfHz(lowestStrong);
      bassVotes[pc] += frameMax;
      bassMinHz[pc] = Math.min(bassMinHz[pc], lowestStrong);
    }
    frames++;
  }
  if (frames === 0) return null;
  const max = Math.max(...chroma);
  if (max <= 0) return null;
  const plain = chroma.map((v) => (v / max >= CHROMA_FLOOR ? v / max : 0));
  let bass = -1;
  let votes = 0;
  for (let pc = 0; pc < 12; pc++) {
    if (bassVotes[pc] > votes) {
      votes = bassVotes[pc];
      bass = pc;
    }
  }
  // A bass whose pitch class fell under the floor is not part of the chord.
  if (bass >= 0 && plain[bass] === 0) bass = -1;
  const weights = [...plain];
  if (bass >= 0) weights[bass] *= 2;
  return { weights, bass, chroma: plain, level, bassHz: bass >= 0 ? bassMinHz[bass] : 0 };
}

/**
 * One chroma for several sources that sound in the same window (stacked clips).
 * Each source counts by its level, so a quiet bleed or a short tail does not
 * weigh like a full stem. The bass is the lowest bass among the audible sources.
 */
export function mixWindowChroma(list: ReadonlyArray<WindowChroma>): WindowChroma | null {
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  const top = Math.max(...list.map((c) => c.level ?? 1));
  const sum = new Array<number>(12).fill(0);
  let bass = -1;
  let bassHz = Number.POSITIVE_INFINITY;
  for (const c of list) {
    const level = c.level ?? 1;
    const plain = c.chroma ?? c.weights;
    for (let i = 0; i < 12; i++) sum[i] += plain[i] * level;
    if (c.bass >= 0 && level >= 0.1 * top && (c.bassHz ?? 0) < bassHz) {
      bass = c.bass;
      bassHz = c.bassHz ?? 0;
    }
  }
  const max = Math.max(...sum);
  if (max <= 0) return null;
  const plain = sum.map((v) => (v / max >= CHROMA_FLOOR ? v / max : 0));
  if (bass >= 0 && plain[bass] === 0) bass = -1;
  const weights = [...plain];
  if (bass >= 0) weights[bass] *= 2;
  return { weights, bass, chroma: plain, level: top, bassHz: Number.isFinite(bassHz) ? bassHz : 0 };
}

/** One analysis window. Ticks default to the millisecond values. */
export interface AudioDetectWindow {
  startMs: number;
  endMs: number;
  startTick?: number;
  endTick?: number;
}

/** A window with its chroma (null when it has no sound). */
export interface ChromaWindow {
  startTick: number;
  endTick: number;
  chroma: WindowChroma | null;
}

/**
 * One chord per run of windows. A silent window holds the previous chord and
 * equal neighbours merge, as in `detectChordsFromNotes`.
 */
export function chordsFromChromaWindows(
  windows: ReadonlyArray<ChromaWindow>,
  mintId: (index: number) => string = (i) => `chord-${i}`
): TimelineChord[] {
  const out: TimelineChord[] = [];
  for (const w of windows) {
    const prev = out[out.length - 1];
    const g = w.chroma ? bestChordForWeights(w.chroma.weights, w.chroma.bass) : undefined;
    if (!g) {
      if (prev) prev.durationTick = w.endTick - prev.startTick;
      continue;
    }
    if (prev && prev.root === g.root && prev.quality === g.quality && prev.inversion === g.inversion) {
      prev.durationTick = w.endTick - prev.startTick;
    } else {
      out.push({
        id: mintId(out.length),
        startTick: w.startTick,
        durationTick: w.endTick - w.startTick,
        root: g.root,
        quality: g.quality,
        inversion: g.inversion
      });
    }
  }
  return out;
}

/** Chords of one mono signal. Windows are in ms from the start of `samples`. */
export function detectChordsFromAudio(
  samples: Float32Array,
  sampleRate: number,
  windows: ReadonlyArray<AudioDetectWindow>,
  mintId?: (index: number) => string
): TimelineChord[] {
  return chordsFromChromaWindows(
    windows.map((w) => ({
      startTick: w.startTick ?? w.startMs,
      endTick: w.endTick ?? w.endMs,
      chroma: windowChroma(samples, sampleRate, (w.startMs * sampleRate) / 1000, (w.endMs * sampleRate) / 1000)
    })),
    mintId
  );
}
