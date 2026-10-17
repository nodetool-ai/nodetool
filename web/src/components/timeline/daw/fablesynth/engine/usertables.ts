// User wavetables — audio import, single-cycle draw, and (de)serialization.
//
// A user table is stored by its *source* single-cycle frames only (frames x
// SIZE samples). The 11-level band-limited mip pyramid the engine actually plays
// is rebuilt from those frames with `buildUserTable` on load — so it is never
// persisted, keeping the on-disk form ~11x smaller and always matching the
// current band-limiting code.
//
// ---------- serialization format ----------
// A persisted user table is JSON:
//   { v: 1, name: string, frames: number, wave: string }
// `wave` is base64 of the little-endian bytes of a Float32Array of length
// frames*SIZE: the raw single-cycle frames laid out frame-major (frame 0's
// SIZE samples, then frame 1's, ...). Samples are normalized waveform values
// (roughly [-1, 1] but not clamped). To decode: base64 -> bytes -> Float32Array
// -> slice into `frames` chunks of SIZE -> buildUserTable. This same blob is
// embedded in presets (Preset.tables) and in the localStorage table pool.

import { SIZE, MIPS, buildUserTable, fft, type GeneratedTable } from './wavetables';

export const MAX_FRAMES = 64; // cap on imported frame count (memory + UI)

export interface UserTable {
  name: string;
  frames: number;
  wave: Float32Array; // length frames*SIZE — source single-cycle frames
  table: GeneratedTable; // rebuilt band-limited pyramid (runtime only)
}

export interface SerializedUserTable {
  v: number;
  name: string;
  frames: number;
  wave: string; // base64 Float32
}

// ---------- base64 <-> Float32 ----------
function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

function encodeWave(wave: Float32Array): string {
  return bytesToBase64(new Uint8Array(wave.buffer, wave.byteOffset, wave.byteLength));
}

function decodeWave(b64: string): Float32Array {
  const bytes = base64ToBytes(b64);
  // Copy into a fresh, correctly-aligned buffer (atob output may be unaligned).
  const out = new Float32Array(bytes.byteLength / 4);
  new Uint8Array(out.buffer).set(bytes);
  return out;
}

// ---------- construction ----------
// Build a runtime UserTable from a flat list of single-cycle frames.
export function makeUserTable(name: string, frames: Float32Array[]): UserTable {
  const nf = Math.max(1, Math.min(MAX_FRAMES, frames.length));
  const wave = new Float32Array(nf * SIZE);
  for (let f = 0; f < nf; f++) wave.set(frames[f], f * SIZE);
  return { name, frames: nf, wave, table: buildUserTable(name, frames.slice(0, nf)) };
}

export function serializeUserTable(u: UserTable): SerializedUserTable {
  return { v: 1, name: u.name, frames: u.frames, wave: encodeWave(u.wave) };
}

export function deserializeUserTable(s: SerializedUserTable): UserTable {
  const wave = decodeWave(s.wave);
  const frames: Float32Array[] = [];
  for (let f = 0; f < s.frames; f++) frames.push(wave.subarray(f * SIZE, (f + 1) * SIZE));
  return { name: s.name, frames: s.frames, wave, table: buildUserTable(s.name, frames) };
}

// ---------- localStorage pool ----------
// The global user-table pool: the imported/drawn tables available across
// reloads, independent of which preset is active. Stored as an array of the
// serialized form documented above.
const LS_TABLES = 'fablesynth.userTables';

export function loadUserTablePool(): UserTable[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_TABLES) as string) as SerializedUserTable[];
    if (!Array.isArray(raw)) return [];
    return raw.map(deserializeUserTable);
  } catch {
    return [];
  }
}

export function saveUserTablePool(list: UserTable[]): void {
  localStorage.setItem(LS_TABLES, JSON.stringify(list.map(serializeUserTable)));
}

// ---------- audio analysis ----------
// Average all channels of a decoded AudioBuffer to mono.
export function mixToMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.length;
  const out = new Float32Array(n);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < n; i++) out[i] += d[i];
  }
  const g = 1 / Math.max(1, buffer.numberOfChannels);
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}

// Estimate the fundamental cycle length (in samples) by autocorrelation over a
// bounded analysis window. Searches f0 in [40, 1000] Hz. Returns a period in
// samples, clamped so slicing always yields at least one usable frame.
export function detectCycleLength(x: Float32Array, sampleRate: number): number {
  const win = Math.min(x.length, 16384);
  const minLag = Math.max(2, Math.floor(sampleRate / 1000));
  const maxLag = Math.min(Math.floor(sampleRate / 40), (win >> 1) - 1);
  if (maxLag <= minLag) return Math.max(2, Math.min(SIZE, x.length));

  let energy = 1e-9;
  for (let i = 0; i < win; i++) energy += x[i] * x[i];

  const score = new Float64Array(maxLag + 2);
  let bestLag = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < win - lag; i++) corr += x[i] * x[i + lag];
    // Bias slightly toward longer periods to avoid octave-too-high errors.
    score[lag] = (corr / energy) * (1 + lag / maxLag * 0.02);
    if (score[lag] > bestScore) { bestScore = score[lag]; bestLag = lag; }
  }
  // Real periods are almost never a whole number of samples. Fit a parabola
  // through the three correlation scores around the peak and return its vertex,
  // so the frame slicer does not accumulate a fraction of a sample per frame.
  if (bestLag > minLag && bestLag < maxLag) {
    const y0 = score[bestLag - 1], y1 = score[bestLag], y2 = score[bestLag + 1];
    const den = y0 - 2 * y1 + y2;
    if (den !== 0) {
      const d = (0.5 * (y0 - y2)) / den;
      if (Number.isFinite(d) && Math.abs(d) <= 0.5) return bestLag + d;
    }
  }
  return bestLag;
}

// Slice `x` into consecutive segments of `cycleLen` samples, resampling each to
// SIZE. Produces one wavetable frame per segment, up to MAX_FRAMES. A
// non-integer cycleLen is honored so detected pitches that are not a whole
// number of samples don't drift across frames.
//
// The resampling is exact and band-limited (finding J8). Stretching a 100-500
// sample cycle to 2048 with linear interpolation — what this used to do — leaves
// the interpolation images (sinc² lobes at -20 to -40 dB) inside the band the
// following FFT keeps, so they became permanent "harmonics" of the imported
// table, and the real partials picked up the sinc² droop. Instead each cycle is
// transformed at its own period directly: harmonic k is projected out of the
// N ≈ cycleLen source samples at the exact fractional period, and those bins are
// placed into the 2048-point spectrum with the rest zeroed. That IS ideal
// band-limited resampling, and it costs one DFT of at most 1024 harmonics per
// frame (the analysis range caps the period at sampleRate/40).
export function sliceToFrames(x: Float32Array, cycleLen: number): Float32Array[] {
  const len = Math.max(1, cycleLen);
  const nf = Math.max(1, Math.min(MAX_FRAMES, Math.floor(x.length / len)));
  const n = Math.max(2, Math.round(len));
  // The projection costs n operations per harmonic. Keeping every harmonic is
  // free at musical periods (n <= 1200 from the 40 Hz analysis floor); the
  // budget only bites on a pathologically long "single cycle" import.
  const kmax = Math.min(SIZE / 2 - 1, Math.floor(n / 2), Math.max(1, Math.floor(33554432 / n)));
  const re = new Float64Array(SIZE);
  const im = new Float64Array(SIZE);
  const frames: Float32Array[] = [];

  for (let f = 0; f < nf; f++) {
    const start = f * len;
    const i0 = Math.round(start);
    re.fill(0); im.fill(0);
    // Project the cycle onto harmonics of period `len`. The samples are taken
    // at their integer positions and their phase is measured against the
    // fractional cycle start, so a non-integer period needs no time-domain
    // interpolation at all.
    for (let k = 1; k <= kmax; k++) {
      const w = (2 * Math.PI * k) / len;
      // Advance the reference phasor by a fixed rotation per sample instead of
      // calling cos/sin n times per harmonic.
      const cw = Math.cos(w), sw = Math.sin(w);
      let c = Math.cos(w * (i0 - start)), s2 = Math.sin(w * (i0 - start));
      let sr = 0, si = 0;
      for (let i = 0; i < n; i++) {
        const s = x[i0 + i];
        if (s !== undefined) { sr += s * c; si -= s * s2; }
        const nc = c * cw - s2 * sw;
        s2 = s2 * cw + c * sw;
        c = nc;
      }
      // The inverse FFT below divides by SIZE; scale so the reconstruction is
      // the source cycle resampled, not attenuated by SIZE/n.
      const g = SIZE / n;
      re[k] = sr * g; im[k] = si * g;
      re[SIZE - k] = sr * g; im[SIZE - k] = -si * g; // conjugate: real output
    }
    fft(re, im, true);
    const frame = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) frame[i] = re[i];
    frames.push(frame);
  }
  return frames;
}

// Single-cycle import: treat the whole clip as exactly one cycle -> one frame.
export function singleCycleFrame(x: Float32Array): Float32Array[] {
  return sliceToFrames(x, x.length);
}

// ---------- draw mode ----------
// Resample an array of drawn y-values (any length, ordered left->right across
// one cycle, range ~[-1, 1]) into a single SIZE-sample frame.
export function frameFromDrawing(points: number[]): Float32Array {
  const n = points.length;
  const frame = new Float32Array(SIZE);
  if (n === 0) return frame;
  for (let i = 0; i < SIZE; i++) {
    const src = (i / SIZE) * n;
    const i0 = Math.floor(src);
    const frac = src - i0;
    const a = points[i0 % n];
    const b = points[(i0 + 1) % n];
    frame[i] = a + frac * (b - a);
  }
  return frame;
}

// ---------- factory -> editable copy ----------
// Pull a GeneratedTable's source single-cycle frames (mip-0, full-band) back
// out as SIZE-sample Float32Arrays, so a factory table can be duplicated into
// an editable user table that re-band-limits identically via makeUserTable.
export function framesFromGenerated(t: GeneratedTable): Float32Array[] {
  const frames: Float32Array[] = [];
  for (let f = 0; f < t.frames; f++) {
    const off = (f * MIPS + 0) * SIZE;
    frames.push(t.data.slice(off, off + SIZE));
  }
  return frames;
}
