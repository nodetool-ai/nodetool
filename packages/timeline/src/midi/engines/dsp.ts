/**
 * The DSP pieces WT-1, BL-1 and DR-1 share, ported from FableSynth's
 * AudioWorklets (github.com/georgi/fablesynth).
 *
 * Everything here is per-sample and allocation-free once constructed, and
 * nothing reads a clock or a random source it did not seed — two renders of the
 * same input are sample-exact equal, which the midi render cache depends on.
 *
 * The renderer is mono, so the worklets' stereo pan, unison spread and per-pad
 * bus routing are not ported; the sound-shaping stages are.
 */

import { getWavetable, type TableName, type Wavetable } from "./wavetables.js";

/** Concert A and its MIDI pitch. */
const A4_HZ = 440;
const A4_PITCH = 69;

/** Frequency of a (fractional) MIDI pitch in Hz. */
export function pitchHz(pitch: number): number {
  return A4_HZ * Math.pow(2, (pitch - A4_PITCH) / 12);
}

// ── Wavetable oscillator ────────────────────────────────────────────────────

/**
 * 4-point cubic Hermite (Catmull-Rom) read. Indices are pre-wrapped by the
 * caller; `off` selects the frame and mip. Linear interpolation leaves images
 * 10-20 dB louder below C6, which is why the worklet reads this way too.
 */
function readHermite(
  d: Float32Array,
  off: number,
  im1: number,
  i0: number,
  i1: number,
  i2: number,
  f: number
): number {
  const ym1 = d[off + im1];
  const y0 = d[off + i0];
  const y1 = d[off + i1];
  const y2 = d[off + i2];
  const c1 = 0.5 * (y1 - ym1);
  const c2 = ym1 - 2.5 * y0 + 2 * y1 - 0.5 * y2;
  const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
  return ((c3 * f + c2) * f + c1) * f + y0;
}

/**
 * One wavetable oscillator: a morph position across the table's frames, up to
 * `MAX_UNISON` detuned copies, and a mip picked from the pitch.
 */
export const MAX_UNISON = 7;

export class TableOscillator {
  private readonly table: Wavetable;
  private readonly phases: Float64Array;
  private unison = 1;
  private detune = 0;

  constructor(name: TableName, unison: number, detune: number, phase = 0) {
    this.table = getWavetable(name);
    this.unison = Math.max(1, Math.min(MAX_UNISON, Math.round(unison)));
    this.detune = Math.abs(detune);
    this.phases = new Float64Array(MAX_UNISON);
    // A fixed spread of start phases rather than a random one: the render has
    // to be reproducible, and identical phases would make unison a comb filter
    // at note-on.
    for (let u = 0; u < MAX_UNISON; u++) {
      this.phases[u] = ((phase + u * 0.137) % 1) * this.table.size;
    }
  }

  /**
   * One sample at `hz` and morph `position` (0..1).
   *
   * The mip is chosen so the highest partial of the most-detuned copy stays
   * under 0.475·sr, and the level below it is crossfaded in over the first 0.07
   * octaves past a boundary — the same continuous selection the worklet uses,
   * so a glide never steps in brightness.
   */
  next(hz: number, position: number, sampleRate: number): number {
    const table = this.table;
    const size = table.size;
    const mask = size - 1;
    const cps = hz / sampleRate;
    if (!(cps > 0 && cps < 0.45)) return 0;

    const posF = Math.min(1, Math.max(0, position)) * (table.frames - 1);
    const f0 = posF | 0;
    const f1 = Math.min(table.frames - 1, f0 + 1);
    const ft = posF - f0;

    const maxRatio = Math.pow(2, (this.detune * 50) / 1200);
    const mipF = Math.log2((cps * maxRatio * 1024) / 0.475);
    let mip = 0;
    let mipBlend = 0;
    const crossfadeOctaves = 0.07;
    if (mipF > 0) {
      mip = Math.min(table.mips - 1, Math.ceil(mipF));
      const over = mipF - (mip - 1);
      if (over < crossfadeOctaves) mipBlend = 1 - over / crossfadeOctaves;
    }
    const fineMip = mip > 0 ? mip - 1 : 0;
    const off0 = (f0 * table.mips + mip) * size;
    const off1 = (f1 * table.mips + mip) * size;
    const off0b = (f0 * table.mips + fineMip) * size;
    const off1b = (f1 * table.mips + fineMip) * size;

    const uni = this.unison;
    let sum = 0;
    for (let u = 0; u < uni; u++) {
      const spread = uni > 1 ? (u / (uni - 1)) * 2 - 1 : 0;
      const ratio = Math.pow(2, (spread * this.detune * 50) / 1200);
      const inc = cps * ratio * size;
      let phase = this.phases[u];
      const i0 = phase | 0;
      const frac = phase - i0;
      const im1 = (i0 - 1) & mask;
      const i1 = (i0 + 1) & mask;
      const i2 = (i0 + 2) & mask;
      const a = readHermite(table.data, off0, im1, i0, i1, i2, frac);
      const b = readHermite(table.data, off1, im1, i0, i1, i2, frac);
      let s = a + (b - a) * ft;
      if (mipBlend > 0) {
        const af = readHermite(table.data, off0b, im1, i0, i1, i2, frac);
        const bf = readHermite(table.data, off1b, im1, i0, i1, i2, frac);
        const fine = af + (bf - af) * ft;
        s += (fine - s) * mipBlend;
      }
      sum += s;
      phase += inc;
      if (phase >= size) phase -= size;
      this.phases[u] = phase;
    }
    // Loudness is held roughly constant across unison counts.
    return sum / Math.sqrt(uni);
  }
}

// ── Filter ──────────────────────────────────────────────────────────────────

/** The filter shapes both WT-1 and BL-1 offer. */
export const SVF_TYPES = ["lp12", "lp24", "bp12", "hp12", "notch"] as const;
export type SvfType = (typeof SVF_TYPES)[number];

/**
 * Cytomic (Simper) zero-delay state-variable filter, cascaded for LP24.
 *
 * Coefficients are recomputed per sample rather than per block: offline there
 * is no block to amortize over, and a per-sample update is what removes the
 * staircase the worklet spends a sub-block ramp avoiding.
 */
export class StateVariableFilter {
  private ic1 = 0;
  private ic2 = 0;
  private ic1b = 0;
  private ic2b = 0;

  reset(): void {
    this.ic1 = 0;
    this.ic2 = 0;
    this.ic1b = 0;
    this.ic2b = 0;
  }

  process(
    x: number,
    type: SvfType,
    cutoffHz: number,
    resonance: number,
    sampleRate: number
  ): number {
    const res = Math.min(0.999, Math.max(0, resonance));
    const cut = Math.min(sampleRate * 0.45, Math.max(20, cutoffHz));
    const twoPole = type === "lp24";
    let k1: number;
    let k2: number;
    if (twoPole) {
      // All the resonance in stage one, stage two critically damped — the
      // 24 dB slope stays stable at high resonance this way.
      const r2 = res * res;
      const resT = res + 0.0035 * r2 * r2;
      const kk = 2 - 1.93 * resT;
      k1 = Math.max(0.02, 0.5 * kk * kk);
      k2 = 2;
    } else {
      k1 = 2 - 1.93 * res;
      k2 = k1;
    }
    const g = Math.tan((Math.PI * cut) / sampleRate);
    const a1 = 1 / (1 + g * (g + k1));
    const a2 = g * a1;
    const a3 = g * a2;

    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;

    let y: number;
    switch (type) {
      case "lp12":
      case "lp24":
        y = v2;
        break;
      case "bp12":
        y = k1 * v1;
        break;
      case "hp12":
        y = x - k1 * v1 - v2;
        break;
      default:
        y = x - k1 * v1;
        break;
    }
    if (!twoPole) return y;

    const a1b = 1 / (1 + g * (g + k2));
    const a2b = g * a1b;
    const a3b = g * a2b;
    const w3 = y - this.ic2b;
    const w1 = a1b * this.ic1b + a2b * w3;
    const w2 = this.ic2b + a2b * this.ic1b + a3b * w3;
    this.ic1b = 2 * w1 - this.ic1b;
    this.ic2b = 2 * w2 - this.ic2b;
    return w2;
  }
}

/** Numerically stable ln(cosh(z)) — the antiderivative of tanh. */
function lcosh(z: number): number {
  const a = Math.abs(z);
  return a + Math.log1p(Math.exp(-2 * a)) - Math.LN2;
}

/**
 * Anti-aliased tanh drive (first-order antiderivative anti-aliasing).
 *
 * A naive per-sample saturator folds the harmonics it creates back down the
 * spectrum; integrating between successive inputs does not. `state` carries the
 * previous input and its antiderivative between calls.
 */
export class AdaaDrive {
  private xPrev = 0;
  private fPrev = 0;
  private gain = -1;

  reset(): void {
    this.xPrev = 0;
    this.fPrev = 0;
    this.gain = -1;
  }

  process(x: number, amount: number): number {
    if (amount <= 0.005) {
      this.xPrev = x;
      this.gain = -1;
      return x;
    }
    const dg = 1 + amount * 7;
    const comp = 1 / Math.pow(dg, 0.55);
    const kF = comp / dg;
    if (this.gain !== dg) {
      this.gain = dg;
      this.fPrev = kF * lcosh(dg * this.xPrev);
    }
    const f = kF * lcosh(dg * x);
    const dx = x - this.xPrev;
    // A vanishing step makes the difference quotient unstable; the midpoint
    // tanh is the same curve there.
    const y =
      dx > 1e-5 || dx < -1e-5
        ? (f - this.fPrev) / dx
        : comp * Math.tanh(dg * 0.5 * (x + this.xPrev));
    this.xPrev = x;
    this.fPrev = f;
    return y;
  }
}

// ── Envelopes ───────────────────────────────────────────────────────────────

/** How close to a target level counts as having reached it. */
const EPSILON = 1e-9;

export interface AdsrTimes {
  attackMs: number;
  decayMs: number;
  sustain: number;
  releaseMs: number;
}

/** Which segment of the ADSR a voice is in. */
export type AdsrStage = "attack" | "decay" | "sustain" | "release" | "done";

/**
 * A linear ADSR. The same shape `voice.ts` uses for the subtractive instrument,
 * lifted here so every engine releases from wherever it was rather than from
 * the sustain level.
 */
export class Adsr {
  stage: AdsrStage = "attack";
  level = 0;
  private releaseFrom = 0;
  private readonly attackPerSample: number;
  private readonly decayPerSample: number;
  private readonly releasePerSample: number;
  private readonly sustain: number;

  constructor(times: AdsrTimes, sampleRate: number) {
    const perSample = (ms: number, span: number) =>
      ms <= 0 ? Number.POSITIVE_INFINITY : span / ((ms / 1000) * sampleRate);
    this.attackPerSample = perSample(times.attackMs, 1);
    this.decayPerSample = perSample(times.decayMs, 1 - times.sustain);
    this.releasePerSample = perSample(times.releaseMs, 1);
    this.sustain = times.sustain;
  }

  step(gateOn: boolean): number {
    if (!gateOn && this.stage !== "release" && this.stage !== "done") {
      this.stage = "release";
      this.releaseFrom = this.level;
    }
    switch (this.stage) {
      case "attack":
        this.level = Math.min(1, this.level + this.attackPerSample);
        if (this.level >= 1 - EPSILON) {
          this.level = 1;
          this.stage = this.sustain >= 1 ? "sustain" : "decay";
        }
        break;
      case "decay":
        this.level = Math.max(this.sustain, this.level - this.decayPerSample);
        if (this.level - this.sustain <= EPSILON) {
          this.level = this.sustain;
          this.stage = "sustain";
        }
        break;
      case "sustain":
        this.level = this.sustain;
        break;
      case "release": {
        const stepDown = this.releasePerSample * this.releaseFrom;
        this.level = Number.isFinite(stepDown)
          ? Math.max(0, this.level - stepDown)
          : 0;
        if (this.level <= EPSILON) {
          this.level = 0;
          this.stage = "done";
        }
        break;
      }
      case "done":
        this.level = 0;
        break;
    }
    return this.level;
  }
}

/**
 * An attack-decay envelope with no sustain — BL-1's filter envelope and DR-1's
 * pitch envelope both use one. The decay is exponential (−4.5 nepers over the
 * decay time), which is what gives an acid line its snap.
 */
export class AdEnvelope {
  private t = 0;
  private readonly attackFrames: number;
  private readonly decayK: number;

  constructor(attackMs: number, decayMs: number, sampleRate: number) {
    this.attackFrames = Math.max(1, (attackMs / 1000) * sampleRate);
    this.decayK = -4.5 / Math.max(0.002, decayMs / 1000) / sampleRate;
  }

  step(): number {
    const t = this.t++;
    if (t < this.attackFrames) return t / this.attackFrames;
    return Math.exp(this.decayK * (t - this.attackFrames));
  }
}

// ── Noise ───────────────────────────────────────────────────────────────────

/**
 * xorshift32, seeded per voice. A drum hit needs noise that is the same on
 * every render of the same clip, so `Math.random` is not an option.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  /** Uniform in [-1, 1). */
  uniform(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return (this.s / 0x80000000) - 1;
  }
}

/**
 * One-pole coloured noise. `color` runs −1 (dark) to 1 (bright): the pole is
 * mapped from the 48 kHz reference the worklet uses so the tilt is the same
 * filter at any sample rate.
 */
export class ColouredNoise {
  private y = 0;
  private readonly a: number;

  constructor(
    private readonly rng: Rng,
    color: number,
    sampleRate: number
  ) {
    const at48k = 0.02 + (Math.min(1, Math.max(-1, color)) + 1) * 0.49;
    this.a = 1 - Math.pow(1 - at48k, 48000 / sampleRate);
  }

  next(): number {
    this.y += (this.rng.uniform() - this.y) * this.a;
    return this.y;
  }
}

