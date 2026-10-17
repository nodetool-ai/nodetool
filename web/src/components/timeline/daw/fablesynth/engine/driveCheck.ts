// Shared metrics for the drive-oversampler tests (WT-1, BL-1, DR-1 worklets).
// Same definitions as juce/test/drive_os_check.h.
import { fft } from './wavetables';

function powerSpectrum(x: Float32Array): Float64Array {
  const n = x.length;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / (n - 1);
    const w = 0.35875 - 0.48829 * Math.cos(t) + 0.14128 * Math.cos(2 * t) - 0.01168 * Math.cos(3 * t);
    re[i] = x[i] * w;
  }
  fft(re, im, false);
  const p = new Float64Array(n >> 1);
  for (let k = 0; k < p.length; k++) p[k] = re[k] * re[k] + im[k] * im[k];
  return p;
}

/**
 * Inharmonic energy 20 Hz - 16 kHz relative to the strongest harmonic's lobe,
 * in dB. Bins within 8 of a harmonic are masked, so only distortion products
 * that fold back count. `mask` widens that window (bins) for sources whose
 * own amplitude envelope puts skirts around every harmonic.
 */
export function inharmonicDb(x: Float32Array, sampleRate: number, f0: number, mask = 8): number {
  const p = powerSpectrum(x);
  const half = p.length, bin = sampleRate / x.length;
  const harm = new Uint8Array(half);
  for (let h = 1; h * f0 < sampleRate / 2; h++) {
    const c = Math.round((h * f0) / bin);
    for (let k = Math.max(0, c - mask); k <= Math.min(half - 1, c + mask); k++) harm[k] = 1;
  }
  let best = 0, bestK = 1, lobe = 0, inh = 0;
  for (let k = 1; k < half; k++) if (harm[k] && p[k] > best) { best = p[k]; bestK = k; }
  for (let k = Math.max(0, bestK - 8); k <= Math.min(half - 1, bestK + 8); k++) lobe += p[k];
  for (let k = Math.ceil(20 / bin); k < half && k * bin <= 16000; k++) if (!harm[k]) inh += p[k];
  return 10 * Math.log10(Math.max(inh, 1e-30) / lobe);
}

/**
 * Drive-on vs drive-off gain across the harmonics of f0, in dB, after removing
 * a smooth quadratic trend in frequency. Both renders hold the same note at a
 * level small enough for the saturator to act as a pure gain, so the ratio is
 * the gain of the drive stage alone. A smooth trend is allowed; periodic
 * notches from a dry path misaligned with the oversampled path are not.
 * Returns the largest residual.
 */
export function gainRippleDb(off: Float32Array, on: Float32Array, sampleRate: number, f0: number): number {
  const a = powerSpectrum(off), b = powerSpectrum(on);
  const bin = sampleRate / off.length;
  let top = 0;
  for (const v of a) top = Math.max(top, v);
  const fx: number[] = [], dy: number[] = [];
  for (let h = 1; h * f0 <= 16000; h++) {
    const c = Math.round((h * f0) / bin);
    let k = c;
    for (let q = Math.max(1, c - 2); q <= Math.min(a.length - 1, c + 2); q++) if (a[q] > a[k]) k = q;
    if (a[k] < top * 1e-7) continue; // harmonic below -70 dB re the loudest
    const d = 10 * Math.log10(b[k] / a[k]);
    if (!Number.isFinite(d)) return 1e9;
    fx.push((h * f0) / 16000); dy.push(d);
  }
  if (fx.length < 8) return 1e9;
  const S = [0, 0, 0, 0, 0], T = [0, 0, 0];
  for (let i = 0; i < fx.length; i++) {
    let xp = 1;
    for (let j = 0; j < 5; j++) { S[j] += xp; if (j < 3) T[j] += xp * dy[i]; xp *= fx[i]; }
  }
  const M = [[S[0], S[1], S[2], T[0]], [S[1], S[2], S[3], T[1]], [S[2], S[3], S[4], T[2]]];
  for (let i = 0; i < 3; i++) {
    for (let r = i + 1; r < 3; r++) {
      const f = M[r][i] / M[i][i];
      for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c];
    }
  }
  const co = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = M[i][3];
    for (let c = i + 1; c < 3; c++) s -= M[i][c] * co[c];
    co[i] = s / M[i][i];
  }
  let worst = 0;
  for (let i = 0; i < fx.length; i++) {
    worst = Math.max(worst, Math.abs(dy[i] - (co[0] + co[1] * fx[i] + co[2] * fx[i] * fx[i])));
  }
  return worst;
}
