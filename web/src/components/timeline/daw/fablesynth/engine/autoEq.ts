// Auto-EQ: measure a third-octave spectrum, compare it with a reference
// tonal curve and fit the four-band parametric EQ to close the gap. Shared by
// every device EQ panel and the SQ-4 mix assistant.

import { eqCoefficients, eqResponseDb, type EqBand } from './eqResponse';

/** Third-octave centres used for measurement, display and the fit. */
export const BAND_HZ = [31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
  1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000];

export const SILENCE_DB = -60;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const powerDb = (p: number) => 10 * Math.log10(Math.max(p, 1e-20));

interface Shape {
  /** Tilt in dB per octave above `bassHz`, pivoting at 1 kHz. */
  slope: number;
  /** The curve holds its level below this frequency, plus `bass` dB. */
  bassHz: number; bass?: number;
  /** Roll-off below `lowCutHz` in dB per octave. */
  lowCutHz?: number; lowCut?: number;
  /** Extra roll-off above `rollHz` in dB per octave. */
  rollHz?: number; roll?: number;
}

export interface EqReference { id: string; label: string; hint: string; shape: Shape }

// Band-power curves (third octaves), so pink noise is flat. Mix curves follow
// the usual -3 to -5 dB/octave tilt of finished electronic music; the part
// curves describe where a single instrument should sit before mixing.
export const EQ_REFERENCES: EqReference[] = [
  { id: 'mix', label: 'MIX · MODERN', hint: 'Balanced club/electronic master tilt', shape: { slope: -3.8, bassHz: 100, lowCutHz: 40, lowCut: 3, rollHz: 10000, roll: 3 } },
  { id: 'warm', label: 'MIX · WARM', hint: 'Darker top, fuller low end', shape: { slope: -4.5, bassHz: 100, bass: 1.5, lowCutHz: 40, lowCut: 3, rollHz: 10000, roll: 3 } },
  { id: 'bright', label: 'MIX · BRIGHT', hint: 'Forward presence and air', shape: { slope: -3, bassHz: 100, bass: -1, lowCutHz: 40, lowCut: 3, rollHz: 12000, roll: 3 } },
  { id: 'dub', label: 'MIX · DUB', hint: 'Deep sub, soft and dark top', shape: { slope: -5, bassHz: 90, bass: 2, lowCutHz: 35, lowCut: 6, rollHz: 6000, roll: 4 } },
  { id: 'pink', label: 'FLAT · PINK', hint: 'Equal energy per octave', shape: { slope: 0, bassHz: 20 } },
  { id: 'drums', label: 'PART · DRUMS', hint: 'Kick weight, tight mids, open top', shape: { slope: -3.2, bassHz: 70, bass: 2, lowCutHz: 35, lowCut: 9, rollHz: 14000, roll: 3 } },
  { id: 'bass', label: 'PART · BASS', hint: 'Solid low end, little top', shape: { slope: -7, bassHz: 120, lowCutHz: 35, lowCut: 12, rollHz: 3000, roll: 6 } },
  { id: 'lead', label: 'PART · LEAD', hint: 'Mid focus, clear of the bass', shape: { slope: -3, bassHz: 250, lowCutHz: 200, lowCut: 12, rollHz: 9000, roll: 4 } },
  { id: 'pad', label: 'PART · PAD', hint: 'Soft and wide, low end thinned', shape: { slope: -4, bassHz: 200, lowCutHz: 120, lowCut: 9, rollHz: 8000, roll: 4 } },
];

export const referenceById = (id: string) => EQ_REFERENCES.find(r => r.id === id) ?? EQ_REFERENCES[0];

/** Reference level in dB relative to 1 kHz. */
export function referenceDb(ref: EqReference, f: number): number {
  const s = ref.shape;
  let v = s.slope * Math.log2(Math.max(f, s.bassHz) / 1000);
  if (f < s.bassHz) v += (s.bass ?? 0) * Math.min(1, Math.log2(s.bassHz / f));
  if (s.lowCutHz && f < s.lowCutHz) v -= (s.lowCut ?? 0) * Math.log2(s.lowCutHz / f);
  if (s.rollHz && f > s.rollHz) v -= (s.roll ?? 0) * Math.log2(f / s.rollHz);
  return v;
}

/** Adds one AnalyserNode float-dB frame into third-octave band powers. */
export function addBandPower(bands: Float64Array, spectrumDb: Float32Array, sampleRate: number, fftSize: number): void {
  const binHz = sampleRate / fftSize;
  for (let b = 0; b < BAND_HZ.length; b++) {
    const lo = BAND_HZ[b] / 2 ** (1 / 6), hi = BAND_HZ[b] * 2 ** (1 / 6);
    let sum = 0;
    for (let k = Math.max(1, Math.ceil(lo / binHz)); k < Math.min(spectrumDb.length, hi / binHz); k++) sum += 10 ** (spectrumDb[k] / 10);
    bands[b] += sum;
  }
}

export function rmsDb(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return powerDb(s / Math.max(1, x.length));
}

/** Accumulates audible analyser frames into a long-term band spectrum. */
export class SpectrumCapture {
  readonly bandPower = new Float64Array(BAND_HZ.length);
  frames = 0;
  constructor(readonly sampleRate: number, readonly fftSize: number) {}
  add(spectrumDb: Float32Array, time: Float32Array): boolean {
    if (rmsDb(time) < SILENCE_DB) return false;
    this.frames++;
    addBandPower(this.bandPower, spectrumDb, this.sampleRate, this.fftSize);
    return true;
  }
  get seconds() { return this.frames * this.fftSize / this.sampleRate; }
  /** Band levels in dB relative to the total. */
  levels(): number[] {
    const total = this.bandPower.reduce((a, b) => a + b, 0) || 1e-20;
    return Array.from(this.bandPower, p => powerDb(p / total));
  }
}

export function eqCurveDb(bands: EqBand[], f: number, sampleRate: number): number {
  return bands.reduce((a, b) => a + (b.on ? eqResponseDb(eqCoefficients(b, sampleRate), f, sampleRate) : 0), 0);
}

/**
 * Aligns measured band levels with a reference: `offset` is the median
 * deviation over the bands with energy between 100 Hz and 8 kHz, so
 * `levels - offset` sits on the reference's dB scale.
 */
export function alignToReference(levels: number[], ref: EqReference): { present: boolean[]; offset: number } {
  const peak = Math.max(...levels);
  const present = levels.map(l => l > peak - 45);
  const judged = BAND_HZ.flatMap((f, i) => present[i] && f >= 100 && f <= 8000 ? [levels[i] - referenceDb(ref, f)] : []).sort((a, b) => a - b);
  return { present, offset: judged.length ? judged[Math.floor(judged.length / 2)] : 0 };
}

export interface EqFit {
  bands: EqBand[];
  /** Measured levels aligned to the reference (dB relative to 1 kHz). */
  measured: number[];
  /** Measured minus reference; 0 where the source has no energy. */
  deviation: number[];
  /** Deviation left after the fitted EQ. */
  residual: number[];
  /** Bands with enough energy to judge. */
  present: boolean[];
  /** Total fitted move in dB, summed over the four bands. */
  change: number;
}

/**
 * Fits low shelf, two bells and high shelf to the measured deviation.
 * `levels` must already exclude any EQ that coloured the measurement.
 * Cuts are preferred; boosts stay small so a register the part never plays
 * is not lifted out of the noise floor.
 */
export function fitEq(levels: number[], ref: EqReference, amount: number, sampleRate: number): EqFit {
  const { present, offset } = alignToReference(levels, ref);
  const rawDev = BAND_HZ.map((f, i) => levels[i] - referenceDb(ref, f));
  const deviation = rawDev.map((d, i) => present[i] ? d - offset : 0);
  const measured = levels.map(l => l - offset);

  const correction = (d: number, boostCap: number, cutCap: number) => {
    const g = clamp(-d * amount, -cutCap, boostCap);
    return Math.abs(g) < 0.5 ? 0 : Math.round(g * 2) / 2;
  };
  const mean = (lo: number, hi: number) => {
    const sel = deviation.filter((_, i) => BAND_HZ[i] >= lo && BAND_HZ[i] <= hi);
    return sel.reduce((s, d) => s + d, 0) / Math.max(1, sel.length);
  };
  const worst = (lo: number, hi: number) => {
    let best = { f: Math.sqrt(lo * hi), d: 0 };
    for (let i = 1; i < BAND_HZ.length - 1; i++) {
      if (BAND_HZ[i] < lo || BAND_HZ[i] > hi) continue;
      const d = (deviation[i - 1] + 2 * deviation[i] + deviation[i + 1]) / 4;
      if (Math.abs(d) > Math.abs(best.d)) best = { f: BAND_HZ[i], d };
    }
    return best;
  };
  const mid = worst(160, 1250), mid2 = worst(1600, 6300);
  const bands: EqBand[] = [
    { type: 0, freq: 110, q: Math.SQRT1_2, gain: correction(mean(40, 100), 3, 6), on: true },
    { type: 1, freq: Math.round(mid.f), q: 1.1, gain: correction(mid.d, 2, 4), on: true },
    { type: 1, freq: Math.round(mid2.f), q: 1.1, gain: correction(mid2.d, 2, 4), on: true },
    { type: 2, freq: 9000, q: Math.SQRT1_2, gain: correction(mean(8000, 16000), 3, 6), on: true },
  ];
  const residual = deviation.map((d, i) => d + (present[i] ? eqCurveDb(bands, BAND_HZ[i], sampleRate) : 0));
  return { bands, measured, deviation, residual, present, change: bands.reduce((a, b) => a + Math.abs(b.gain), 0) };
}

/** Removes an EQ's colouring from levels measured after it. */
export function removeEq(levels: number[], bands: EqBand[], sampleRate: number): number[] {
  return levels.map((l, i) => l - eqCurveDb(bands, BAND_HZ[i], sampleRate));
}
