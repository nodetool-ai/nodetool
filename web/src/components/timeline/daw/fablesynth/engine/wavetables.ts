// Procedural wavetable generation with per-mip band-limiting.
// Each table: FRAMES frames x SIZE samples x MIPS mip levels.
// Mip m keeps harmonics 1..(1024 >> m) — the engine picks a mip per note so no
// partial ever crosses Nyquist (Serum-style anti-aliasing).

export const SIZE = 2048;
export const FRAMES = 16;
export const MIPS = 11; // maxHarm: 1024,512,...,1 — coarsest mip is a pure sine, so even fundamentals at the 0.45*sr pitch guard can't fold
export const VIZ_N = 128; // points per frame kept for visualization

export interface GeneratedTable {
  name: string;
  frames: number;
  mips: number;
  size: number;
  data: Float32Array;
  viz: Float32Array;
}

// ---------- FFT (iterative radix-2, complex, in-place) ----------
export function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const ur = re[i + k], ui = im[i + k];
        const xr = re[i + k + half], xi = im[i + k + half];
        const vr = xr * cr - xi * ci;
        const vi = xr * ci + xi * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + half] = ur - vr; im[i + k + half] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
}

// Add harmonic k with amplitude a, phase ph (cosine convention) to a spectrum.
function setHarm(re: Float64Array, im: Float64Array, k: number, a: number, ph: number): void {
  re[k] += a * Math.cos(ph);
  im[k] += a * Math.sin(ph);
  re[SIZE - k] += a * Math.cos(ph);
  im[SIZE - k] -= a * Math.sin(ph);
}

const SINE_PH = -Math.PI / 2; // sin(x) == cos(x - pi/2)

// ---------- table specs ----------
// Each spec returns, for frame position t in [0,1], either a spectrum builder
// (fills re/im) or a time-domain frame (then FFT'd to a spectrum).

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

// PRIME: sine -> triangle -> saw -> square
function specPrime(t: number, re: Float64Array, im: Float64Array): void {
  const seg = Math.min(2.9999, t * 3);
  const s = seg | 0, f = seg - s;
  for (let k = 1; k <= 1024; k++) {
    const sine = k === 1 ? 1 : 0;
    const tri = k % 2 === 1 ? ((((k - 1) / 2) % 2 === 0 ? 1 : -1) / (k * k)) : 0;
    const saw = 1 / k;
    const sqr = k % 2 === 1 ? 1.27 / k : 0;
    const shapes = [sine, tri, saw, sqr];
    const a = lerp(shapes[s], shapes[s + 1], f);
    if (a !== 0) setHarm(re, im, k, a, SINE_PH);
  }
}

// BLOOM: fundamental blossoming into a bright shimmering stack
function specBloom(t: number, re: Float64Array, im: Float64Array): void {
  const n = 1 + Math.floor(t * t * 220);
  for (let k = 1; k <= 1024; k++) {
    const roll = Math.exp(-Math.pow(k / n, 4));
    const a = roll / Math.pow(k, 1.25);
    if (a < 1e-5) break;
    const ph = SINE_PH + Math.sin(k * 12.9898) * 0.7 * t;
    setHarm(re, im, k, a, ph);
  }
}

// PULSE: PWM, duty 50% -> 6%
function specPulse(t: number, re: Float64Array, im: Float64Array): void {
  const d = 0.5 - 0.44 * t;
  for (let k = 1; k <= 1024; k++) {
    const a = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * d);
    setHarm(re, im, k, a, SINE_PH - Math.PI * k * d);
  }
}

// VOX: vowel morph A-E-I-O-U, formant-filtered saw at ~110 Hz reference
const VOWELS = [
  [730, 1090, 2440],
  [530, 1840, 2480],
  [390, 1990, 2550],
  [570, 840, 2410],
  [440, 1020, 2240],
];
const F_AMPS = [1, 0.55, 0.32];
const F_BW = [95, 120, 160];
function specVox(t: number, re: Float64Array, im: Float64Array): void {
  const pos = t * 4;
  const v = Math.min(3, pos | 0), f = pos - v;
  const F = [0, 1, 2].map((j) => lerp(VOWELS[v][j], VOWELS[v + 1][j], f));
  for (let k = 1; k <= 256; k++) {
    const freq = k * 110;
    let g = 0.04; // slight broadband floor so low frames aren't silent
    for (let j = 0; j < 3; j++) {
      const d = (freq - F[j]) / F_BW[j];
      g += F_AMPS[j] * Math.exp(-0.5 * d * d);
    }
    setHarm(re, im, k, g / Math.pow(k, 0.75), SINE_PH);
  }
}

// CHIME: sparse metallic partials, hum -> bright strike
const PARTIALS = [1, 2, 3, 5, 7, 9, 13, 16, 19, 24];
function specChime(t: number, re: Float64Array, im: Float64Array): void {
  for (let j = 0; j < PARTIALS.length; j++) {
    const k = PARTIALS[j];
    const base = 1 / Math.pow(j + 1, 0.8);
    const a = base * Math.pow(Math.max(t, 0.001), j * 0.45);
    const ph = SINE_PH + ((j * j * 1.7) % (Math.PI * 2));
    setHarm(re, im, k, a, ph);
    if (j > 0 && t > 0.15) setHarm(re, im, k + 1, a * 0.28 * t, ph + 1.1);
  }
}

// GLITCH: bit-crushed / sample-held sine pair (time domain, then band-limited)
function waveGlitch(t: number, out: Float64Array): void {
  const levels = lerp(40, 2.4, t);
  const hold = 1 + Math.round(t * 40);
  let held = 0;
  for (let n = 0; n < SIZE; n++) {
    if (n % hold === 0) {
      const x =
        Math.sin((2 * Math.PI * n) / SIZE) +
        0.45 * t * Math.sin((2 * Math.PI * 5 * n) / SIZE + 1.3) +
        0.2 * t * Math.sin((2 * Math.PI * 9 * n) / SIZE + 2.6);
      held = Math.round(x * levels) / levels;
    }
    out[n] = held;
  }
}

interface TableSpec {
  name: string;
  spectrum?: (t: number, re: Float64Array, im: Float64Array) => void;
  wave?: (t: number, out: Float64Array) => void;
}

const SPECS: TableSpec[] = [
  { name: 'PRIME', spectrum: specPrime },
  { name: 'BLOOM', spectrum: specBloom },
  { name: 'PULSE', spectrum: specPulse },
  { name: 'VOX', spectrum: specVox },
  { name: 'CHIME', spectrum: specChime },
  { name: 'GLITCH', wave: waveGlitch },
];

// ---------- band-limiting ----------
// Turn one frame's full-band spectrum (re/im, SIZE bins, DC + Nyquist already
// zeroed) into every mip level for frame f. Mip m keeps harmonics 1..(1024>>m);
// each level is inverse-FFT'd back to the time domain. The mip-0 peak sets a
// single per-frame normalization (0.92 headroom) shared by all levels so the
// brightness ladder stays amplitude-matched. wre/wim are reused scratch.
// Shared verbatim by the procedural tables and the user-import / draw modes.
function bandlimitFrame(
  re: Float64Array, im: Float64Array,
  data: Float32Array, viz: Float32Array, f: number,
  wre: Float64Array, wim: Float64Array,
): void {
  let scale = 1;
  for (let m = 0; m < MIPS; m++) {
    const maxHarm = 1024 >> m;
    for (let i = 0; i < SIZE; i++) { wre[i] = re[i]; wim[i] = im[i]; }
    for (let k = maxHarm + 1; k <= SIZE - maxHarm - 1; k++) { wre[k] = 0; wim[k] = 0; }
    fft(wre, wim, true);

    if (m === 0) {
      let peak = 1e-9;
      for (let i = 0; i < SIZE; i++) peak = Math.max(peak, Math.abs(wre[i]));
      scale = 0.92 / peak;
    }
    const off = (f * MIPS + m) * SIZE;
    for (let i = 0; i < SIZE; i++) data[off + i] = wre[i] * scale;
    if (m === 0) {
      const step = SIZE / VIZ_N;
      for (let i = 0; i < VIZ_N; i++) viz[f * VIZ_N + i] = wre[(i * step) | 0] * scale;
    }
  }
}

// ---------- generation ----------
export function generateTables(): GeneratedTable[] {
  const re = new Float64Array(SIZE);
  const im = new Float64Array(SIZE);
  const wre = new Float64Array(SIZE);
  const wim = new Float64Array(SIZE);
  const tmp = new Float64Array(SIZE);

  return SPECS.map((spec) => {
    const data = new Float32Array(FRAMES * MIPS * SIZE);
    const viz = new Float32Array(FRAMES * VIZ_N);

    for (let f = 0; f < FRAMES; f++) {
      const t = f / (FRAMES - 1);
      re.fill(0); im.fill(0);
      if (spec.spectrum) {
        spec.spectrum(t, re, im);
      } else {
        spec.wave!(t, tmp);
        for (let i = 0; i < SIZE; i++) { re[i] = tmp[i]; im[i] = 0; }
        fft(re, im, false);
      }
      re[0] = 0; im[0] = 0; // kill DC
      re[SIZE / 2] = 0; im[SIZE / 2] = 0;
      bandlimitFrame(re, im, data, viz, f, wre, wim);
    }
    return { name: spec.name, frames: FRAMES, mips: MIPS, size: SIZE, data, viz };
  });
}

// Build a band-limited table from raw single-cycle time-domain frames. Each
// input frame is SIZE samples (one cycle); it is FFT'd to a spectrum and then
// run through the same band-limit / mip pipeline as the procedural tables, so
// imported and drawn tables anti-alias identically. Frame count is arbitrary
// (the engine + worklet read frames/mips/size off the table). Used by the
// user-wavetable import (audio) and draw modes.
export function buildUserTable(name: string, frames: Float32Array[]): GeneratedTable {
  const nf = Math.max(1, frames.length);
  const data = new Float32Array(nf * MIPS * SIZE);
  const viz = new Float32Array(nf * VIZ_N);
  const re = new Float64Array(SIZE);
  const im = new Float64Array(SIZE);
  const wre = new Float64Array(SIZE);
  const wim = new Float64Array(SIZE);

  for (let f = 0; f < nf; f++) {
    const src = frames[f];
    re.fill(0); im.fill(0);
    for (let i = 0; i < SIZE; i++) re[i] = src ? src[i] || 0 : 0;
    fft(re, im, false);
    re[0] = 0; im[0] = 0; // kill DC
    re[SIZE / 2] = 0; im[SIZE / 2] = 0;
    bandlimitFrame(re, im, data, viz, f, wre, wim);
  }
  return { name, frames: nf, mips: MIPS, size: SIZE, data, viz };
}
