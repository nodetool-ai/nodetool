// DR-1 kit auto-mix: learn each pad's post-FX spectrum, then move the pad
// levels so the summed kit follows a reference tonal curve. Pads only scale,
// so the fit is a small least-squares problem over per-pad dB moves: the kit
// band level is 10·log10(Σ w_p·P_pb), and its slope against a pad's move is
// that pad's power share of the band. A penalty on the moves keeps the mix
// close to the programmed one when several balances fit equally well.

import { BAND_HZ, alignToReference, powerDb, referenceDb, type EqReference } from '../engine/autoEq';
import { fft } from '../engine/wavetables';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MAX_CUT = 12, MAX_BOOST = 6;
/** Penalty per dB² of move, against dB² of band error summed over ~25 bands. */
const MOVE_PENALTY = 0.3;

/** Power per bin (0..n/2) of a Hann-windowed frame; the length must be a power of two. */
function powerSpectrum(x: Float32Array): Float64Array {
  const n = x.length, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
  fft(re, im, false);
  const out = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) out[k] = re[k] * re[k] + im[k] * im[k];
  return out;
}

/** Accumulates per-pad band power from worklet capture blocks. */
export class KitCapture {
  readonly bands: Float64Array[];
  /** Samples since capture began, the averaging window for every pad. */
  frames = 0;
  constructor(readonly sampleRate: number, pads = 16) {
    this.bands = Array.from({ length: pads }, () => new Float64Array(BAND_HZ.length));
  }
  add(pad: number, data: Float32Array, frames: number): void {
    this.frames = Math.max(this.frames, frames);
    const bands = this.bands[pad];
    if (!bands) return;
    const power = powerSpectrum(data), binHz = this.sampleRate / data.length;
    // Parseval over the one-sided spectrum, corrected for the Hann window's
    // 3/8 power gain: the band sums are the block's energy in each band.
    const norm = 2 / (data.length * 0.375);
    for (let b = 0; b < BAND_HZ.length; b++) {
      const lo = BAND_HZ[b] / 2 ** (1 / 6), hi = BAND_HZ[b] * 2 ** (1 / 6);
      let sum = 0;
      for (let k = Math.max(1, Math.ceil(lo / binHz)); k < Math.min(power.length, hi / binHz); k++) sum += power[k];
      bands[b] += sum * norm;
    }
  }
  get seconds() { return this.frames / this.sampleRate; }
  /** Mean band power per pad over the capture window. */
  meanBands(): Float64Array[] {
    const f = Math.max(1, this.frames);
    return this.bands.map(b => b.map(v => v / f));
  }
}

export interface KitMixFit {
  /** Pads with enough energy to balance. */
  heard: boolean[];
  /** Planned level move per pad in dB (0 for pads left alone). */
  moves: number[];
  /** New `lvl` value per pad, or null when the pad does not move. */
  levels: (number | null)[];
  /** Kit band levels before and after, aligned to the reference scale. */
  before: number[]; after: number[];
  target: number[];
  present: boolean[];
  /** RMS band error against the reference, dB, before and after. */
  errorBefore: number; errorAfter: number;
  /** Each heard pad's share of the kit energy, 0..1. */
  share: number[];
}

/** Solves A·x = b in place by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    const d = A[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / d;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / (A[r][r] || 1e-12);
  }
  return x;
}

const kitLevels = (pads: Float64Array[], w: number[]) => BAND_HZ.map((_, b) => powerDb(pads.reduce((s, p, i) => s + w[i] * p[b], 0)));

function aligned(levels: number[], ref: EqReference, present: boolean[]) {
  const { offset } = alignToReference(levels, ref);
  const out = levels.map(l => l - offset);
  const err = Math.sqrt(out.reduce((s, l, b) => s + (present[b] ? (l - referenceDb(ref, BAND_HZ[b])) ** 2 : 0), 0) / Math.max(1, present.filter(Boolean).length));
  return { out, err };
}

/**
 * `pads` holds each pad's mean band power, `lvl` its current level param
 * (gain = lvl², so a dB move is 40·log10 of the level ratio). `amount`
 * scales the fitted moves. Returns null when fewer than two pads play.
 */
export function fitKitMix(pads: Float64Array[], lvl: number[], ref: EqReference, amount: number): KitMixFit | null {
  const energy = pads.map(p => p.reduce((s, v) => s + v, 0));
  const loudest = Math.max(...energy);
  const heard = energy.map((e, i) => e > 0 && e > loudest * 1e-4 && lvl[i] > 0);
  const idx = heard.flatMap((h, i) => h ? [i] : []);
  if (idx.length < 2) return null;

  const kit0 = kitLevels(pads, pads.map(() => 1));
  const peak = Math.max(...kit0);
  const present = kit0.map((l, b) => l > peak - 45 && BAND_HZ[b] >= 40);
  const bands = BAND_HZ.flatMap((_, b) => present[b] ? [b] : []);
  const target = BAND_HZ.map(f => referenceDb(ref, f));

  // Unknowns: one dB move per heard pad, plus a free level offset c.
  const m = idx.length;
  const x = new Array(m + 1).fill(0);
  for (let iter = 0; iter < 40; iter++) {
    const w = idx.map((_, k) => 10 ** (x[k] / 10));
    const A = Array.from({ length: m + 1 }, () => new Array(m + 1).fill(0));
    const g = new Array(m + 1).fill(0);
    for (const b of bands) {
      const parts = idx.map((p, k) => w[k] * pads[p][b]), sum = parts.reduce((s, v) => s + v, 0) || 1e-30;
      const J = [...parts.map(v => v / sum), -1];
      const r = powerDb(sum) - target[b] - x[m];
      for (let i = 0; i <= m; i++) {
        g[i] += J[i] * r;
        for (let j = 0; j <= m; j++) A[i][j] += J[i] * J[j];
      }
    }
    for (let k = 0; k < m; k++) { A[k][k] += MOVE_PENALTY; g[k] += MOVE_PENALTY * x[k]; }
    const step = solve(A, g.map(v => -v));
    let change = 0;
    for (let k = 0; k <= m; k++) {
      const next = k < m ? clamp(x[k] + step[k], -MAX_CUT, MAX_BOOST) : x[k] + step[k];
      change = Math.max(change, Math.abs(next - x[k]));
      x[k] = next;
    }
    if (change < 0.01) break;
  }

  // Scale by amount, keep the kit's total level, then respect the level
  // ceiling: a pad that cannot rise far enough lowers the others instead.
  let moves = idx.map((_, k) => x[k] * amount);
  const e = idx.map(p => energy[p]), total = e.reduce((s, v) => s + v, 0);
  const keep = -powerDb(e.reduce((s, v, k) => s + v * 10 ** (moves[k] / 10), 0) / total);
  moves = moves.map(d => d + keep);
  const headroom = idx.map(p => 40 * Math.log10(1 / lvl[p]));
  const over = Math.max(0, ...moves.map((d, k) => d - headroom[k]));
  moves = moves.map(d => d - over);

  const all = new Array(pads.length).fill(0);
  const levels: (number | null)[] = new Array(pads.length).fill(null);
  idx.forEach((p, k) => {
    const d = Math.abs(moves[k]) < 0.5 ? 0 : Math.round(moves[k] * 2) / 2;
    if (!d) return;
    const to = clamp(lvl[p] * 10 ** (d / 40), 0, 1);
    levels[p] = Math.round(to * 1000) / 1000;
    all[p] = 40 * Math.log10(levels[p]! / lvl[p]);
  });
  const before = aligned(kit0, ref, present);
  const after = aligned(kitLevels(pads, all.map(d => 10 ** (d / 10))), ref, present);
  return {
    heard, moves: all, levels, before: before.out, after: after.out, target, present,
    errorBefore: before.err, errorAfter: after.err,
    share: energy.map((v, i) => heard[i] ? v / energy.reduce((s, u, j) => s + (heard[j] ? u : 0), 0) : 0),
  };
}
