/**
 * Band-limited wavetables, ported from FableSynth's `src/engine/wavetables.ts`
 * (github.com/georgi/fablesynth).
 *
 * A table is FRAMES single cycles × MIPS brightness levels × SIZE samples. Mip
 * `m` keeps harmonics 1..(1024 >> m), so the oscillator picks a level by pitch
 * and no partial ever crosses Nyquist — the anti-aliasing WT-1, BL-1 and DR-1
 * all read from.
 *
 * Generation is pure arithmetic and deterministic, so a table is built once per
 * process and memoized: a render at the same sample rate hands back the same
 * samples, which is what lets `cacheKey.ts` reuse a previous render.
 */

/** Samples per cycle. */
export const TABLE_SIZE = 2048;
/** Morph frames per table. */
export const TABLE_FRAMES = 16;
/** Mip levels per frame: max harmonic 1024, 512, … 1 (a pure sine). */
export const TABLE_MIPS = 11;

/** The tonal tables WT-1 and BL-1 play. */
export const WAVETABLE_NAMES = [
  "prime",
  "bloom",
  "pulse",
  "vox",
  "chime",
  "glitch"
] as const;
export type WavetableName = (typeof WAVETABLE_NAMES)[number];

/** DR-1's percussive tables. Every tonal table is playable by a pad too. */
export const DRUM_TABLE_NAMES = ["thud", "crack", "tine", "grit"] as const;
export type DrumTableName = (typeof DRUM_TABLE_NAMES)[number];

/** Anything a pad or an oscillator can be pointed at. */
export type TableName = WavetableName | DrumTableName;

export interface Wavetable {
  name: TableName;
  frames: number;
  mips: number;
  size: number;
  /** frame-major, then mip, then sample. */
  data: Float32Array;
}

// ── FFT ─────────────────────────────────────────────────────────────────────

/** Iterative radix-2 complex FFT, in place. */
export function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const xr = re[i + k + half];
        const xi = im[i + k + half];
        const vr = xr * cr - xi * ci;
        const vi = xr * ci + xi * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + half] = ur - vr;
        im[i + k + half] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/** Add harmonic `k` at amplitude `a` and phase `ph` (cosine convention). */
function setHarm(
  re: Float64Array,
  im: Float64Array,
  k: number,
  a: number,
  ph: number
): void {
  re[k] += a * Math.cos(ph);
  im[k] += a * Math.sin(ph);
  re[TABLE_SIZE - k] += a * Math.cos(ph);
  im[TABLE_SIZE - k] -= a * Math.sin(ph);
}

/** sin(x) === cos(x - π/2). */
const SINE_PH = -Math.PI / 2;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Table specs ─────────────────────────────────────────────────────────────

/** PRIME: sine → triangle → saw → square. */
function specPrime(t: number, re: Float64Array, im: Float64Array): void {
  const seg = Math.min(2.9999, t * 3);
  const s = seg | 0;
  const f = seg - s;
  for (let k = 1; k <= 1024; k++) {
    const sine = k === 1 ? 1 : 0;
    const tri =
      k % 2 === 1 ? ((((k - 1) / 2) % 2 === 0 ? 1 : -1) / (k * k)) : 0;
    const saw = 1 / k;
    const sqr = k % 2 === 1 ? 1.27 / k : 0;
    const shapes = [sine, tri, saw, sqr];
    const a = lerp(shapes[s], shapes[s + 1], f);
    if (a !== 0) setHarm(re, im, k, a, SINE_PH);
  }
}

/** BLOOM: a fundamental opening into a bright stack. */
function specBloom(t: number, re: Float64Array, im: Float64Array): void {
  const n = 1 + Math.floor(t * t * 220);
  for (let k = 1; k <= 1024; k++) {
    const roll = Math.exp(-Math.pow(k / n, 4));
    const a = roll / Math.pow(k, 1.25);
    if (a < 1e-5) break;
    setHarm(re, im, k, a, SINE_PH + Math.sin(k * 12.9898) * 0.7 * t);
  }
}

/** PULSE: PWM, duty 50% → 6%. */
function specPulse(t: number, re: Float64Array, im: Float64Array): void {
  const d = 0.5 - 0.44 * t;
  for (let k = 1; k <= 1024; k++) {
    const a = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * d);
    setHarm(re, im, k, a, SINE_PH - Math.PI * k * d);
  }
}

/** Formant centres for A, E, I, O, U. */
const VOWELS = [
  [730, 1090, 2440],
  [530, 1840, 2480],
  [390, 1990, 2550],
  [570, 840, 2410],
  [440, 1020, 2240]
];
const F_AMPS = [1, 0.55, 0.32];
const F_BW = [95, 120, 160];

/** VOX: a saw through a vowel filter, morphing A-E-I-O-U. */
function specVox(t: number, re: Float64Array, im: Float64Array): void {
  const pos = t * 4;
  const v = Math.min(3, pos | 0);
  const f = pos - v;
  const formants = [0, 1, 2].map((j) =>
    lerp(VOWELS[v][j], VOWELS[v + 1][j], f)
  );
  for (let k = 1; k <= 256; k++) {
    const freq = k * 110;
    // A broadband floor so the darkest frames are not silent.
    let g = 0.04;
    for (let j = 0; j < 3; j++) {
      const d = (freq - formants[j]) / F_BW[j];
      g += F_AMPS[j] * Math.exp(-0.5 * d * d);
    }
    setHarm(re, im, k, g / Math.pow(k, 0.75), SINE_PH);
  }
}

/** CHIME: sparse inharmonic partials, hum → strike. */
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

/** GLITCH: a bit-crushed, sample-held sine pair. */
function waveGlitch(t: number, out: Float64Array): void {
  const levels = lerp(40, 2.4, t);
  const hold = 1 + Math.round(t * 40);
  let held = 0;
  for (let n = 0; n < TABLE_SIZE; n++) {
    if (n % hold === 0) {
      const x =
        Math.sin((2 * Math.PI * n) / TABLE_SIZE) +
        0.45 * t * Math.sin((2 * Math.PI * 5 * n) / TABLE_SIZE + 1.3) +
        0.2 * t * Math.sin((2 * Math.PI * 9 * n) / TABLE_SIZE + 2.6);
      held = Math.round(x * levels) / levels;
    }
    out[n] = held;
  }
}

/** THUD: a sine growing harmonics and saturation — kicks and toms. */
function waveThud(t: number, out: Float64Array): void {
  for (let i = 0; i < TABLE_SIZE; i++) {
    const x = i / TABLE_SIZE;
    let s = Math.sin(2 * Math.PI * x);
    s += t * 0.6 * Math.sin(2 * Math.PI * 2 * x + 0.6);
    s += t * t * 0.45 * Math.sin(2 * Math.PI * 3 * x + 1.2);
    out[i] = Math.tanh(s * (1 + t * 1.8));
  }
}

/** CRACK: a comb-filtered odd-harmonic burst — snares and claps. */
function waveCrack(t: number, out: Float64Array): void {
  for (let i = 0; i < TABLE_SIZE; i++) {
    const x = i / TABLE_SIZE;
    let s = 0;
    for (let k = 1; k <= 31; k += 2) {
      const comb = 0.5 + 0.5 * Math.cos(k * 0.9 + t * 5.2);
      const roll = Math.exp(-Math.pow((k - 5 - t * 10) / 7, 2));
      s += comb * roll * Math.sin(2 * Math.PI * k * x + Math.sin(k * 7.31) * 1.4);
    }
    out[i] = s;
  }
}

/** TINE: struck-metal partials — hats, rides, bells. */
const TINE_K = [1, 4, 7, 11, 16, 22];
function waveTine(t: number, out: Float64Array): void {
  for (let i = 0; i < TABLE_SIZE; i++) {
    const x = i / TABLE_SIZE;
    let s = 0;
    for (let j = 0; j < TINE_K.length; j++) {
      const a = Math.pow(Math.max(t, 0.001), 0.3 * j) / (j + 1);
      s += a * Math.sin(2 * Math.PI * TINE_K[j] * x + j * j * 1.7);
    }
    out[i] = s;
  }
}

/** GRIT: sample-held noise fading in over a sine — noisy percussion. */
function waveGrit(t: number, out: Float64Array): void {
  const hold = 2 + Math.round(30 * t);
  let held = 0;
  for (let i = 0; i < TABLE_SIZE; i++) {
    if (i % hold === 0) {
      const r = Math.sin((i + 1) * 127.1) * 43758.5453;
      held = (r - Math.floor(r)) * 2 - 1;
    }
    const x = i / TABLE_SIZE;
    out[i] = held * t + Math.sin(2 * Math.PI * x) * (1 - t);
  }
}

interface TableSpec {
  name: TableName;
  spectrum?: (t: number, re: Float64Array, im: Float64Array) => void;
  wave?: (t: number, out: Float64Array) => void;
}

const SPECS: readonly TableSpec[] = [
  { name: "prime", spectrum: specPrime },
  { name: "bloom", spectrum: specBloom },
  { name: "pulse", spectrum: specPulse },
  { name: "vox", spectrum: specVox },
  { name: "chime", spectrum: specChime },
  { name: "glitch", wave: waveGlitch },
  { name: "thud", wave: waveThud },
  { name: "crack", wave: waveCrack },
  { name: "tine", wave: waveTine },
  { name: "grit", wave: waveGrit }
];

// ── Band-limiting ───────────────────────────────────────────────────────────

/**
 * Turn one frame's full-band spectrum into every mip level. The mip-0 peak
 * sets one per-frame normalization (0.92 headroom) shared by all levels, so the
 * brightness ladder stays amplitude-matched.
 */
function bandlimitFrame(
  re: Float64Array,
  im: Float64Array,
  data: Float32Array,
  frame: number,
  wre: Float64Array,
  wim: Float64Array
): void {
  let scale = 1;
  for (let m = 0; m < TABLE_MIPS; m++) {
    const maxHarm = 1024 >> m;
    for (let i = 0; i < TABLE_SIZE; i++) {
      wre[i] = re[i];
      wim[i] = im[i];
    }
    for (let k = maxHarm + 1; k <= TABLE_SIZE - maxHarm - 1; k++) {
      wre[k] = 0;
      wim[k] = 0;
    }
    fft(wre, wim, true);
    if (m === 0) {
      let peak = 1e-9;
      for (let i = 0; i < TABLE_SIZE; i++) {
        peak = Math.max(peak, Math.abs(wre[i]));
      }
      scale = 0.92 / peak;
    }
    const off = (frame * TABLE_MIPS + m) * TABLE_SIZE;
    for (let i = 0; i < TABLE_SIZE; i++) {
      data[off + i] = wre[i] * scale;
    }
  }
}

function generateTable(spec: TableSpec): Wavetable {
  const re = new Float64Array(TABLE_SIZE);
  const im = new Float64Array(TABLE_SIZE);
  const wre = new Float64Array(TABLE_SIZE);
  const wim = new Float64Array(TABLE_SIZE);
  const tmp = new Float64Array(TABLE_SIZE);
  const data = new Float32Array(TABLE_FRAMES * TABLE_MIPS * TABLE_SIZE);

  for (let f = 0; f < TABLE_FRAMES; f++) {
    const t = f / (TABLE_FRAMES - 1);
    re.fill(0);
    im.fill(0);
    if (spec.spectrum) {
      spec.spectrum(t, re, im);
    } else {
      spec.wave!(t, tmp);
      for (let i = 0; i < TABLE_SIZE; i++) {
        re[i] = tmp[i];
        im[i] = 0;
      }
      fft(re, im, false);
    }
    // Kill DC and Nyquist before band-limiting.
    re[0] = 0;
    im[0] = 0;
    re[TABLE_SIZE / 2] = 0;
    im[TABLE_SIZE / 2] = 0;
    bandlimitFrame(re, im, data, f, wre, wim);
  }
  return {
    name: spec.name,
    frames: TABLE_FRAMES,
    mips: TABLE_MIPS,
    size: TABLE_SIZE,
    data
  };
}

const cache = new Map<TableName, Wavetable>();

/**
 * The named table, built on first use. Each is ~1.4 MB, so only the tables a
 * render actually touches are ever generated.
 */
export function getWavetable(name: TableName): Wavetable {
  const cached = cache.get(name);
  if (cached) return cached;
  const spec = SPECS.find((s) => s.name === name) ?? SPECS[0];
  const table = generateTable(spec);
  cache.set(spec.name, table);
  return table;
}

/** Every table name, tonal first. */
export const ALL_TABLE_NAMES: readonly TableName[] = [
  ...WAVETABLE_NAMES,
  ...DRUM_TABLE_NAMES
];
