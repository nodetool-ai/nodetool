/**
 * Chord detection from written MIDI notes.
 *
 * Per window: the weight of a pitch class is the ticks its notes overlap the
 * window, with the lowest note counted twice. Each candidate chord scores its
 * tone weight, minus half the off-tone weight, minus a penalty for every tone
 * that does not sound. The best score wins.
 */

import type { ChordQuality, MidiNote, TimelineChord } from "../types.js";
import { CHORD_QUALITIES } from "./chords.js";

/** A note on an absolute tick axis. */
export type DetectNote = Pick<MidiNote, "pitch" | "startTick" | "durationTick"> & {
  muted?: boolean;
};

export interface DetectWindow {
  startTick: number;
  endTick: number;
}

/** The qualities the detector can name, in tie-break order. */
export const DETECT_QUALITIES: readonly ChordQuality[] = [
  "maj", "min", "dim", "aug", "sus2", "sus4", "dom7", "maj7", "m7", "m7b5", "dim7"
];

const EPS = 1e-9;

export interface ChordGuess {
  root: number;
  quality: ChordQuality;
  inversion: number;
}

/**
 * The chord that best explains `weights` (12 pitch-class weights). `bass` is
 * the pitch class of the lowest note, or -1. Undefined when nothing sounds.
 */
export function bestChordForWeights(weights: ReadonlyArray<number>, bass: number): ChordGuess | undefined {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return undefined;
  const maxW = Math.max(...weights);
  let best: { guess: ChordGuess; score: number; tones: number } | undefined;
  for (let root = 0; root < 12; root++) {
    for (const quality of DETECT_QUALITIES) {
      const tones = [...new Set(CHORD_QUALITIES[quality].iv.map((i) => (root + i) % 12))];
      let on = 0;
      let missing = 0;
      for (const t of tones) {
        on += weights[t];
        if (weights[t] <= 0) missing++;
      }
      const score = on - 0.5 * (total - on) - 0.3 * maxW * missing;
      let better = !best;
      if (best) {
        if (score > best.score + EPS) better = true;
        else if (Math.abs(score - best.score) <= EPS) {
          if (tones.length !== best.tones) better = tones.length < best.tones;
          else {
            const a = root === bass;
            const b = best.guess.root === bass;
            if (a !== b) better = a;
            else better = root < best.guess.root;
          }
        }
      }
      if (better) best = { guess: { root, quality, inversion: 0 }, score, tones: tones.length };
    }
  }
  if (!best) return undefined;
  const g = best.guess;
  if (bass >= 0) {
    const i = CHORD_QUALITIES[g.quality].iv.findIndex((iv) => (g.root + iv) % 12 === bass);
    g.inversion = Math.max(0, i);
  }
  return g;
}

/**
 * One chord per run of windows. A window with no sounding note holds the
 * previous chord, and equal neighbours merge.
 */
export function detectChordsFromNotes(
  notes: ReadonlyArray<DetectNote>,
  windows: ReadonlyArray<DetectWindow>,
  mintId: (index: number) => string = (i) => `chord-${i}`
): TimelineChord[] {
  const out: TimelineChord[] = [];
  // Windows are disjoint. Each note is binned into the windows it overlaps, so
  // the work follows the overlaps, not notes x windows.
  const weightsOf = windows.map(() => new Array<number>(12).fill(0));
  const bassPitch = windows.map(() => Number.POSITIVE_INFINITY);
  const bassTicks = windows.map(() => 0);
  const order = windows.map((_, i) => i).sort((a, b) => windows[a].startTick - windows[b].startTick);
  for (const n of notes) {
    if (n.muted) continue;
    const end = n.startTick + n.durationTick;
    let lo = 0;
    let hi = order.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (windows[order[mid]].endTick <= n.startTick) lo = mid + 1;
      else hi = mid;
    }
    for (let k = lo; k < order.length && windows[order[k]].startTick < end; k++) {
      const wi = order[k];
      const w = windows[wi];
      const overlap = Math.min(end, w.endTick) - Math.max(n.startTick, w.startTick);
      if (overlap <= 0) continue;
      weightsOf[wi][((n.pitch % 12) + 12) % 12] += overlap;
      if (n.pitch < bassPitch[wi]) {
        bassPitch[wi] = n.pitch;
        bassTicks[wi] = overlap;
      } else if (n.pitch === bassPitch[wi]) {
        bassTicks[wi] += overlap;
      }
    }
  }
  for (let wi = 0; wi < windows.length; wi++) {
    const w = windows[wi];
    const weights = weightsOf[wi];
    const lowest = Number.isFinite(bassPitch[wi]) ? { pitch: bassPitch[wi], overlap: bassTicks[wi] } : undefined;
    const prev = out[out.length - 1];
    if (!lowest) {
      if (prev) prev.durationTick = w.endTick - prev.startTick;
      continue;
    }
    const bass = ((lowest.pitch % 12) + 12) % 12;
    weights[bass] += lowest.overlap;
    const g = bestChordForWeights(weights, bass);
    if (!g) continue;
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
