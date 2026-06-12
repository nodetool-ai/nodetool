/**
 * Pure DSP cores for the modular synthesis nodes — oscillator waveforms and
 * the ADSR envelope state machine. No streaming, no I/O: everything here is
 * a per-sample function over plain numbers, unit-testable in isolation.
 */

export type Waveform = "sine" | "saw" | "square" | "triangle" | "noise";

/**
 * One oscillator sample for `phase` ∈ [0, 1). Naive (non-bandlimited)
 * waveforms — saw/square alias above a few kHz; polyBLEP is a follow-up.
 */
export function oscSample(
  wave: Waveform,
  phase: number,
  pulseWidth = 0.5
): number {
  switch (wave) {
    case "sine":
      return Math.sin(2 * Math.PI * phase);
    case "saw":
      return 2 * phase - 1;
    case "square":
      return phase < pulseWidth ? 1 : -1;
    case "triangle":
      return 1 - 4 * Math.abs(phase - 0.5);
    case "noise":
      return Math.random() * 2 - 1;
  }
}

// ── ADSR ───────────────────────────────────────────────────────────

export type AdsrStage = "idle" | "attack" | "decay" | "sustain" | "release";

/**
 * Per-sample one-pole coefficients. Exponential segments (vs linear) cost
 * the same per sample, give click-free analog-style curves, and make
 * retrigger-from-current-level automatic — the pole just pulls the env
 * from wherever it is toward the new target.
 */
export interface AdsrParams {
  attackCoeff: number;
  decayCoeff: number;
  releaseCoeff: number;
  sustain: number;
}

export interface AdsrState {
  stage: AdsrStage;
  env: number;
  /** Previous sample's gate level (for edge detection). */
  gateWasHigh: boolean;
}

/** Gate threshold: a CV sample ≥ 0.5 counts as gate-high. */
export const GATE_THRESHOLD = 0.5;

/**
 * The attack pole drives toward this overshoot target and switches to decay
 * at 1.0, so the named attack time is roughly met instead of asymptoting.
 */
const ATTACK_TARGET = 1.3;

/** One-pole coefficient for a segment of `seconds` at `sampleRate`. */
export function adsrCoeff(seconds: number, sampleRate: number): number {
  return 1 - Math.exp(-1 / Math.max(1, seconds * sampleRate));
}

export function createAdsrState(): AdsrState {
  return { stage: "idle", env: 0, gateWasHigh: false };
}

/**
 * Advance the envelope by one sample given the current gate level. Mutates
 * `state`; returns the new envelope value. Gate edges (rising → attack
 * retrigger from the current level, falling → release) are detected here,
 * so calling this per sample inside a chunk gives sample-accurate timing.
 */
export function adsrStep(
  state: AdsrState,
  gateHigh: boolean,
  params: AdsrParams
): number {
  if (gateHigh && !state.gateWasHigh) {
    state.stage = "attack";
  } else if (!gateHigh && state.gateWasHigh) {
    state.stage = "release";
  }
  state.gateWasHigh = gateHigh;

  switch (state.stage) {
    case "attack": {
      state.env += params.attackCoeff * (ATTACK_TARGET - state.env);
      if (state.env >= 1) {
        state.env = 1;
        state.stage = "decay";
      }
      break;
    }
    case "decay": {
      state.env += params.decayCoeff * (params.sustain - state.env);
      if (Math.abs(state.env - params.sustain) < 1e-4) {
        state.env = params.sustain;
        state.stage = "sustain";
      }
      break;
    }
    case "sustain": {
      state.env = params.sustain;
      break;
    }
    case "release": {
      state.env += params.releaseCoeff * (0 - state.env);
      if (state.env < 1e-5) {
        state.env = 0;
        state.stage = "idle";
      }
      break;
    }
    case "idle": {
      state.env = 0;
      break;
    }
  }
  return state.env;
}
