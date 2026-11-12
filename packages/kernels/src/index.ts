/**
 * The NodeTool kernel library: the per-sample and per-pixel loops of batch
 * and streaming nodes, in C++ (`native/kernels`). A node keeps its type,
 * properties and validation in TypeScript and calls these functions for the
 * loop (rule N7 of docs/plans/graph-runner-realtime.md).
 *
 * `loadKernels()` picks the host once per process: the graph runner's native
 * `kernels` capability when the code runs inside the runner, otherwise the
 * embedded WebAssembly build of the same sources (Node and the browser).
 */
import {
  NT_ERR_ARGS,
  NT_OK,
  type KernelArg,
  type KernelBackend
} from "./backend.js";
import { KERNELS_WASM_BASE64 } from "./generated/kernels-wasm.js";
import { decodeBase64, instantiateWasmKernels } from "./wasm.js";

export type { KernelArg, KernelBackend } from "./backend.js";
export { NT_ERR_ARGS, NT_OK } from "./backend.js";

/* ── Constants of kernels.h ─────────────────────────────────────────── */

export const BIQUAD_TYPES = {
  lowpass: 0,
  highpass: 1,
  bandpass: 2,
  lowshelf: 3,
  highshelf: 4,
  peaking: 5
} as const;
export type BiquadType = keyof typeof BIQUAD_TYPES;

export const WAVEFORMS = {
  sine: 0,
  saw: 1,
  square: 2,
  triangle: 3,
  noise: 4
} as const;
export type Waveform = keyof typeof WAVEFORMS;

/** Lengths of the state arrays the streaming kernels carry across calls. */
export const STATE_LEN = {
  biquad: 4,
  oscillator: 2,
  lfo: 2,
  adsr: 3,
  sampleHold: 2
} as const;

/** A biquad's {b0, b1, b2, a1, a2}, normalized by a0. */
export type BiquadCoeffs = Float64Array;

/* ── Parameters ─────────────────────────────────────────────────────── */

export interface CompressParams {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  autoGain: boolean;
}

export interface LimiterParams {
  thresholdDb: number;
  releaseMs: number;
  autoGain: boolean;
}

export interface ReverbParams {
  roomScale: number;
  damping: number;
  wetLevel: number;
  dryLevel: number;
}

export interface NoiseGateParams {
  thresholdDb: number;
  attackMs: number;
  releaseMs: number;
}

export interface PhaserParams {
  rateHz: number;
  depth: number;
  centreFrequencyHz: number;
  feedback: number;
  mix: number;
}

export interface DelayParams {
  delaySeconds: number;
  feedback: number;
  mix: number;
}

export interface OscillatorParams {
  waveform: Waveform;
  frequency: number;
  amplitude: number;
  pulseWidth: number;
  fmAmount: number;
}

export interface LfoParams {
  waveform: Exclude<Waveform, "noise">;
  rateHz: number;
  depth: number;
  offset: number;
}

export interface AdsrParams {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/* ── Argument checks ────────────────────────────────────────────────── */

/** The largest grid of imageAdaptiveContrast (NT_IMAGE_MAX_GRID). */
export const MAX_ADAPTIVE_GRID = 256;

function positiveInt(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 0xffffffff) {
    throw new RangeError(`${what} must be an integer from 1 to 2^32 - 1, got ${value}`);
  }
  return value;
}

/** Throws unless `array` holds at least `length` elements. */
function atLeast<T extends { length: number }>(array: T, length: number, what: string): T {
  if (array.length < length) {
    throw new RangeError(`${what} holds ${array.length} elements, ${length} required`);
  }
  return array;
}

function rgbaIn(rgba: Uint8Array, width: number, height: number): Uint8Array {
  positiveInt(width, "width");
  positiveInt(height, "height");
  return atLeast(rgba, width * height * 4, "rgba");
}

/* ── The typed API ──────────────────────────────────────────────────── */

/**
 * Every kernel. Image functions take straight-alpha RGBA8 and return a new
 * buffer with alpha copied. Audio functions take interleaved float32 and
 * return a new buffer. A `state` argument is a Float64Array the caller owns
 * and passes again with the next chunk.
 */
export class Kernels {
  constructor(readonly backend: KernelBackend) {}

  private run(name: string, args: readonly KernelArg[]): void {
    const status = this.backend.call(name, args);
    if (status !== NT_OK) {
      throw new Error(
        `Kernel ${name} rejected its arguments (status ${status === NT_ERR_ARGS ? "NT_ERR_ARGS" : status})`
      );
    }
  }

  // Image enhance

  imageAutoContrast(rgba: Uint8Array, width: number, height: number, cutoffPercent: number): Uint8Array {
    rgbaIn(rgba, width, height);
    const out = new Uint8Array(width * height * 4);
    this.run("nt_image_auto_contrast", [{ in: rgba }, { out }, width, height, cutoffPercent]);
    return out;
  }

  imageEqualize(rgba: Uint8Array, width: number, height: number): Uint8Array {
    rgbaIn(rgba, width, height);
    const out = new Uint8Array(width * height * 4);
    this.run("nt_image_equalize", [{ in: rgba }, { out }, width, height]);
    return out;
  }

  imageAdaptiveContrast(
    rgba: Uint8Array,
    width: number,
    height: number,
    clipLimit: number,
    gridSize: number
  ): Uint8Array {
    rgbaIn(rgba, width, height);
    const out = new Uint8Array(width * height * 4);
    this.run("nt_image_adaptive_contrast", [
      { in: rgba }, { out }, width, height, clipLimit, Math.min(positiveInt(gridSize, "gridSize"), MAX_ADAPTIVE_GRID)
    ]);
    return out;
  }

  imageRankFilter(rgba: Uint8Array, width: number, height: number, size: number, rank: number): Uint8Array {
    rgbaIn(rgba, width, height);
    const out = new Uint8Array(width * height * 4);
    this.run("nt_image_rank_filter", [
      { in: rgba }, { out }, width, height, Math.min(Math.max(0, Math.floor(size)), 25), Math.min(Math.max(0, Math.floor(rank)), 0xffffffff)
    ]);
    return out;
  }

  // Signal utilities

  /** samples * scale + offset, in a new buffer. */
  scaleOffset(samples: Float32Array, scale: number, offset = 0): Float32Array {
    const out = new Float32Array(samples.length);
    this.backend.call("nt_signal_scale_offset", [{ in: samples }, { out }, samples.length, scale, offset]);
    return out;
  }

  /** acc += level * input, in place. `input` has at least acc.length samples. */
  mixAdd(acc: Float32Array, input: Float32Array, level: number): void {
    atLeast(input, acc.length, "input");
    this.backend.call("nt_signal_mix_add", [{ inout: acc }, { in: input }, acc.length, level]);
  }

  /** Channel `index` of interleaved samples. Returns `samples` itself when mono. */
  extractChannel(samples: Float32Array, channels: number, index = 0): Float32Array {
    if (positiveInt(channels, "channels") === 1) return samples;
    if (!Number.isInteger(index) || index < 0 || index >= channels) {
      throw new RangeError(`channel index ${index} is outside 0..${channels - 1}`);
    }
    const frames = Math.floor(samples.length / channels);
    const out = new Float32Array(frames);
    this.run("nt_signal_extract_channel", [{ in: samples }, { out }, frames, channels, index]);
    return out;
  }

  // Audio effects

  private effect(name: string, samples: Float32Array, channels: number, params: readonly number[]): Float32Array {
    positiveInt(channels, "channels");
    const frames = Math.floor(samples.length / channels);
    const out = new Float32Array(frames * channels);
    this.run(name, [{ in: samples }, { out }, frames, channels, ...params]);
    return out;
  }

  bitcrush(samples: Float32Array, channels: number, bitDepth: number, reduction: number): Float32Array {
    return this.effect("nt_audio_bitcrush", samples, channels, [bitDepth, Math.max(1, Math.floor(reduction))]);
  }

  compress(samples: Float32Array, channels: number, sampleRate: number, p: CompressParams): Float32Array {
    return this.effect("nt_audio_compress", samples, channels, [
      sampleRate, p.thresholdDb, p.ratio, p.attackMs, p.releaseMs, p.autoGain ? 1 : 0
    ]);
  }

  distortion(samples: Float32Array, driveDb: number): Float32Array {
    const out = new Float32Array(samples.length);
    this.backend.call("nt_audio_distortion", [{ in: samples }, { out }, samples.length, driveDb]);
    return out;
  }

  limiter(samples: Float32Array, channels: number, sampleRate: number, p: LimiterParams): Float32Array {
    return this.effect("nt_audio_limiter", samples, channels, [
      sampleRate, p.thresholdDb, p.releaseMs, p.autoGain ? 1 : 0
    ]);
  }

  reverb(samples: Float32Array, channels: number, sampleRate: number, p: ReverbParams): Float32Array {
    return this.effect("nt_audio_reverb", samples, channels, [
      sampleRate, p.roomScale, p.damping, p.wetLevel, p.dryLevel
    ]);
  }

  noiseGate(samples: Float32Array, channels: number, sampleRate: number, p: NoiseGateParams): Float32Array {
    return this.effect("nt_audio_noise_gate", samples, channels, [
      sampleRate, p.thresholdDb, p.attackMs, p.releaseMs
    ]);
  }

  phaser(samples: Float32Array, channels: number, sampleRate: number, p: PhaserParams): Float32Array {
    return this.effect("nt_audio_phaser", samples, channels, [
      sampleRate, p.rateHz, p.depth, p.centreFrequencyHz, p.feedback, p.mix
    ]);
  }

  /** The input followed by four echoes of the delay. */
  delay(samples: Float32Array, channels: number, sampleRate: number, p: DelayParams): Float32Array {
    positiveInt(channels, "channels");
    const frames = Math.floor(samples.length / channels);
    const outFrames = this.backend.call("nt_audio_delay_output_frames", [frames, sampleRate, p.delaySeconds]);
    const out = new Float32Array(outFrames * channels);
    this.run("nt_audio_delay", [
      { in: samples }, { out }, frames, channels, sampleRate, p.delaySeconds, p.feedback, p.mix
    ]);
    return out;
  }

  // Biquad filters

  /**
   * Biquad coefficients. `rbj` is the Audio-EQ-Cookbook design of the
   * streaming filters. `webaudio` is the BiquadFilterNode design, where
   * lowpass and highpass Q is in dB and the shelves ignore Q.
   */
  biquadDesign(
    design: "rbj" | "webaudio",
    type: BiquadType,
    sampleRate: number,
    frequency: number,
    q: number,
    gainDb = 0
  ): BiquadCoeffs {
    const coeffs = new Float64Array(5);
    this.run(design === "rbj" ? "nt_biquad_design_rbj" : "nt_biquad_design_webaudio", [
      BIQUAD_TYPES[type], sampleRate, frequency, q, gainDb, { out: coeffs }
    ]);
    return coeffs;
  }

  /** State for `channels` channels of nt_biquad_process and nt_vcf_process. */
  createBiquadState(channels: number): Float64Array {
    return new Float64Array(STATE_LEN.biquad * Math.max(1, channels));
  }

  /** Filters interleaved samples, carrying `state` across calls. */
  biquadProcess(coeffs: BiquadCoeffs, state: Float64Array, samples: Float32Array, channels: number): Float32Array {
    positiveInt(channels, "channels");
    atLeast(coeffs, 5, "coeffs");
    atLeast(state, STATE_LEN.biquad * channels, "state");
    const frames = Math.floor(samples.length / channels);
    const out = new Float32Array(frames * channels);
    this.backend.call("nt_biquad_process", [{ in: coeffs }, { inout: state }, { in: samples }, { out }, frames, channels]);
    return out;
  }

  /**
   * A cutoff-modulated RBJ filter. The cutoff is recomputed every 64 frames
   * from `cv` (frame-aligned, mono) when given.
   */
  vcf(
    state: Float64Array,
    type: "lowpass" | "highpass",
    sampleRate: number,
    cutoffHz: number,
    q: number,
    cvAmount: number,
    cv: Float32Array | undefined,
    samples: Float32Array,
    channels: number
  ): Float32Array {
    positiveInt(channels, "channels");
    atLeast(state, STATE_LEN.biquad * channels, "state");
    const frames = Math.floor(samples.length / channels);
    if (cv) atLeast(cv, frames, "cv");
    const out = new Float32Array(frames * channels);
    this.run("nt_vcf_process", [
      { inout: state }, BIQUAD_TYPES[type], sampleRate, cutoffHz, q, cvAmount,
      cv ? { in: cv } : null, { in: samples }, { out }, frames, channels
    ]);
    return out;
  }

  // Modular synthesis

  /** Oscillator state. `seed` starts the noise generator (a uint32). */
  createOscillatorState(seed: number): Float64Array {
    return new Float64Array([0, seed >>> 0]);
  }

  oscillator(
    state: Float64Array,
    p: OscillatorParams,
    sampleRate: number,
    count: number,
    pitch?: Float32Array,
    fm?: Float32Array
  ): Float32Array {
    atLeast(state, STATE_LEN.oscillator, "state");
    if (pitch) atLeast(pitch, count, "pitch");
    if (fm) atLeast(fm, count, "fm");
    const out = new Float32Array(count);
    this.backend.call("nt_osc_process", [
      { inout: state }, WAVEFORMS[p.waveform], p.frequency, p.amplitude, p.pulseWidth, p.fmAmount,
      sampleRate, pitch ? { in: pitch } : null, fm ? { in: fm } : null, { out }, count
    ]);
    return out;
  }

  lfo(state: Float64Array, p: LfoParams, sampleRate: number, count: number, clock?: Float32Array): Float32Array {
    atLeast(state, STATE_LEN.lfo, "state");
    if (clock) atLeast(clock, count, "clock");
    const out = new Float32Array(count);
    this.backend.call("nt_lfo_process", [
      { inout: state }, WAVEFORMS[p.waveform], p.rateHz, p.depth, p.offset, sampleRate,
      clock ? { in: clock } : null, { out }, count
    ]);
    return out;
  }

  adsr(state: Float64Array, p: AdsrParams, sampleRate: number, gate: Float32Array): Float32Array {
    atLeast(state, STATE_LEN.adsr, "state");
    const out = new Float32Array(gate.length);
    this.backend.call("nt_adsr_process", [
      { inout: state }, p.attack, p.decay, p.sustain, p.release, sampleRate, { in: gate }, { out }, gate.length
    ]);
    return out;
  }

  /** The gate pattern from absolute frame `startFrame`. */
  gate(startFrame: number, onSeconds: number, offSeconds: number, amplitude: number, sampleRate: number, count: number): Float32Array {
    const out = new Float32Array(count);
    this.backend.call("nt_gate_process", [startFrame, onSeconds, offSeconds, amplitude, sampleRate, { out }, count]);
    return out;
  }

  /** samples * gain * max(0, cv[frame]); a level of 1 without `cv`. */
  vca(samples: Float32Array, cv: Float32Array | undefined, channels: number, gain: number): Float32Array {
    positiveInt(channels, "channels");
    const frames = Math.floor(samples.length / channels);
    if (cv) atLeast(cv, frames, "cv");
    const out = new Float32Array(frames * channels);
    this.backend.call("nt_vca_process", [{ in: samples }, cv ? { in: cv } : null, { out }, frames, channels, gain]);
    return out;
  }

  sampleHold(state: Float64Array, signal: Float32Array, trigger: Float32Array | undefined): Float32Array {
    atLeast(state, STATE_LEN.sampleHold, "state");
    if (trigger) atLeast(trigger, signal.length, "trigger");
    const out = new Float32Array(signal.length);
    this.backend.call("nt_sample_hold_process", [
      { inout: state }, { in: signal }, trigger ? { in: trigger } : null, { out }, signal.length
    ]);
    return out;
  }
}

/* ── Host selection ─────────────────────────────────────────────────── */

/**
 * The graph runner's `kernels` capability (native/graph-runner,
 * src/host/kernels.cpp). `modes` holds one letter per argument: `n` number,
 * `z` null, `i` input, `o` output, `x` input and output. The host appends
 * the bytes of each `o` and `x` argument, in order, to `outputs` and returns
 * the kernel's result.
 */
interface NativeKernelHost {
  call(
    name: string,
    args: readonly (number | null | ArrayBufferView)[],
    modes: string,
    outputs: Uint8Array[]
  ): number;
}

function nativeHost(): NativeKernelHost | undefined {
  const host = (globalThis as { __host?: { kernels?: NativeKernelHost } }).__host;
  return typeof host?.kernels?.call === "function" ? host.kernels : undefined;
}

/** A KernelBackend over the graph runner's native capability. */
export function nativeKernelBackend(host: NativeKernelHost): KernelBackend {
  return {
    kind: "native",
    call(name, args) {
      let modes = "";
      const values: (number | null | ArrayBufferView)[] = [];
      const targets: (Uint8Array | Float32Array | Float64Array)[] = [];
      for (const arg of args) {
        if (typeof arg === "number") {
          modes += "n";
          values.push(arg);
        } else if (arg === null) {
          modes += "z";
          values.push(null);
        } else if ("in" in arg) {
          modes += "i";
          values.push(arg.in);
        } else if ("out" in arg) {
          modes += "o";
          values.push(arg.out);
          targets.push(arg.out);
        } else {
          modes += "x";
          values.push(arg.inout);
          targets.push(arg.inout);
        }
      }
      const outputs: Uint8Array[] = [];
      const result = host.call(name, values, modes, outputs);
      targets.forEach((target, i) => {
        new Uint8Array(target.buffer, target.byteOffset, target.byteLength).set(outputs[i]!);
      });
      return result;
    }
  };
}

let loading: Promise<Kernels> | undefined;

/** Instantiates the embedded WebAssembly build, whatever host this is. */
export async function loadWasmKernels(): Promise<Kernels> {
  return new Kernels(await instantiateWasmKernels(decodeBase64(KERNELS_WASM_BASE64)));
}

/**
 * The kernels of this process: native inside the graph runner, the
 * WebAssembly build elsewhere. Loaded once and shared.
 */
export function loadKernels(): Promise<Kernels> {
  if (!loading) {
    const host = nativeHost();
    loading = host
      ? Promise.resolve(new Kernels(nativeKernelBackend(host)))
      : loadWasmKernels();
    // A failed load is retried by the next caller instead of cached.
    loading.catch(() => {
      loading = undefined;
    });
  }
  return loading;
}
