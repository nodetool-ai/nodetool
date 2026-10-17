// Display model for the worklet's RBJ biquads. Tests compare these coefficients
// with the actual audio processor, including non-default Q and sample rates.
import { PARAMS, type ParamValues } from '../params';

export const EQ_BANDS = [
  { gain: 'low', freq: 'lfreq', pre: 'l' },
  { gain: 'mid', freq: 'mfreq', pre: 'm' },
  { gain: 'mid2', freq: 'm2freq', pre: 'm2' },
  { gain: 'high', freq: 'hfreq', pre: 'h' },
].map(b => ({
  gain: `fx.eq.${b.gain}`, freq: `fx.eq.${b.freq}`,
  q: `fx.eq.${b.pre}q`, type: `fx.eq.${b.pre}type`, on: `fx.eq.${b.pre}on`,
}));

export interface EqBand { freq: number; gain: number; q: number; type: number; on: boolean }
export interface EqCoefficients { b0: number; b1: number; b2: number; a1: number; a2: number }
export const eqValue = (params: ParamValues, id: string) => params[id] ?? PARAMS[id].def;
export const readEqBands = (params: ParamValues): EqBand[] => EQ_BANDS.map(b => ({
  freq: eqValue(params, b.freq), gain: eqValue(params, b.gain),
  q: eqValue(params, b.q), type: eqValue(params, b.type), on: eqValue(params, b.on) > 0.5,
}));

export function eqCoefficients(band: EqBand, sampleRate: number): EqCoefficients {
  const A = Math.pow(10, (band.on ? band.gain : 0) / 40);
  const w = 2 * Math.PI * Math.min(band.freq, sampleRate * 0.49) / sampleRate;
  const c = Math.cos(w), alpha = Math.sin(w) / (2 * band.q);
  if (band.type === 1) {
    const a0 = 1 + alpha / A;
    return { b0: (1 + alpha * A) / a0, b1: -2 * c / a0, b2: (1 - alpha * A) / a0,
      a1: -2 * c / a0, a2: (1 - alpha / A) / a0 };
  }
  const t = 2 * Math.sqrt(A) * alpha;
  if (band.type === 0) {
    const a0 = A + 1 + (A - 1) * c + t;
    return { b0: A * (A + 1 - (A - 1) * c + t) / a0,
      b1: 2 * A * (A - 1 - (A + 1) * c) / a0, b2: A * (A + 1 - (A - 1) * c - t) / a0,
      a1: -2 * (A - 1 + (A + 1) * c) / a0, a2: (A + 1 + (A - 1) * c - t) / a0 };
  }
  const a0 = A + 1 - (A - 1) * c + t;
  return { b0: A * (A + 1 + (A - 1) * c + t) / a0,
    b1: -2 * A * (A - 1 + (A + 1) * c) / a0, b2: A * (A + 1 + (A - 1) * c - t) / a0,
    a1: 2 * (A - 1 - (A + 1) * c) / a0, a2: (A + 1 - (A - 1) * c - t) / a0 };
}

export function eqResponseDb(c: EqCoefficients, freq: number, sampleRate: number): number {
  const w = 2 * Math.PI * freq / sampleRate;
  const c1 = Math.cos(w), c2 = Math.cos(2 * w), s1 = Math.sin(w), s2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * c1 + c.b2 * c2, ni = c.b1 * s1 + c.b2 * s2;
  const dr = 1 + c.a1 * c1 + c.a2 * c2, di = c.a1 * s1 + c.a2 * s2;
  return 10 * Math.log10(Math.max(1e-20, (nr * nr + ni * ni) / (dr * dr + di * di)));
}
