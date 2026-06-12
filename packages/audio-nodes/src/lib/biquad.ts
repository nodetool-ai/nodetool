/**
 * RBJ Audio-EQ-Cookbook biquad filters, pure TypeScript.
 *
 * Serves two purposes:
 *   - Fallback for the batch filter nodes when `OfflineAudioContext` is
 *     unavailable (Web Workers in Firefox/Safari — see `lib/audio-context.ts`).
 *   - The engine for the streaming filter nodes, whose `BiquadState` carries
 *     filter memory across chunk boundaries (something a per-chunk
 *     OfflineAudioContext cannot do).
 *
 * Coefficients follow the same cookbook formulas WebAudio's
 * `BiquadFilterNode` is specified against, so parity with the WebAudio path
 * is close but not bit-exact.
 */

import { deinterleave, interleave, type WavData } from "./audio-wav.js";

export type BiquadType =
  | "lowpass"
  | "highpass"
  | "lowshelf"
  | "highshelf"
  | "peaking";

/** Filter coefficients, normalized by a0. */
export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Direct Form I delay-line state for one channel. */
export interface BiquadState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

/** WebAudio's default Q (Butterworth response for lowpass/highpass). */
export const DEFAULT_Q = Math.SQRT1_2;

/** Compute normalized biquad coefficients per the RBJ Audio-EQ-Cookbook. */
export function biquadCoeffs(
  type: BiquadType,
  sampleRate: number,
  frequency: number,
  q: number = DEFAULT_Q,
  gainDb = 0
): BiquadCoeffs {
  // Clamp to a valid digital frequency range to keep the filter stable.
  const nyquist = sampleRate / 2;
  const f = Math.min(Math.max(frequency, 1), nyquist * 0.9999);
  const w0 = (2 * Math.PI * f) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const safeQ = Math.max(q, 1e-4);
  const alpha = sinW0 / (2 * safeQ);
  const A = Math.pow(10, gainDb / 40);

  let b0: number;
  let b1: number;
  let b2: number;
  let a0: number;
  let a1: number;
  let a2: number;

  switch (type) {
    case "lowpass": {
      b0 = (1 - cosW0) / 2;
      b1 = 1 - cosW0;
      b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    }
    case "highpass": {
      b0 = (1 + cosW0) / 2;
      b1 = -(1 + cosW0);
      b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    }
    case "lowshelf": {
      const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha);
      b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
      b2 = A * (A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha);
      a0 = A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha;
      a1 = -2 * (A - 1 + (A + 1) * cosW0);
      a2 = A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha;
      break;
    }
    case "highshelf": {
      const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha);
      b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
      b2 = A * (A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha);
      a0 = A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha;
      a1 = 2 * (A - 1 - (A + 1) * cosW0);
      a2 = A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha;
      break;
    }
    case "peaking": {
      b0 = 1 + alpha * A;
      b1 = -2 * cosW0;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosW0;
      a2 = 1 - alpha / A;
      break;
    }
  }

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Fresh (all-zero) delay-line state. */
export function createBiquadState(): BiquadState {
  return { x1: 0, x2: 0, y1: 0, y2: 0 };
}

/**
 * Run a Direct Form I biquad over `input`, returning the filtered samples.
 * Mutates `state` so callers can carry filter memory across chunks.
 */
export function processBiquad(
  coeffs: BiquadCoeffs,
  state: BiquadState,
  input: Float32Array
): Float32Array {
  const { b0, b1, b2, a1, a2 } = coeffs;
  let { x1, x2, y1, y2 } = state;
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  state.x1 = x1;
  state.x2 = x2;
  state.y1 = y1;
  state.y2 = y2;
  return out;
}

/**
 * Apply a biquad filter to whole interleaved WAV data (independent state per
 * channel). Whole-buffer convenience used as the OfflineAudioContext fallback.
 */
export function applyBiquadToWav(
  wav: WavData,
  type: BiquadType,
  frequency: number,
  q: number = DEFAULT_Q,
  gainDb = 0
): WavData {
  const coeffs = biquadCoeffs(type, wav.sampleRate, frequency, q, gainDb);
  const planes = deinterleave(wav.samples, wav.numChannels);
  const filtered = planes.map((plane) =>
    processBiquad(coeffs, createBiquadState(), plane)
  );
  return {
    samples: interleave(filtered),
    sampleRate: wav.sampleRate,
    numChannels: wav.numChannels
  };
}
