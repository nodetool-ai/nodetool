import { beforeAll, describe, expect, it } from "vitest";
import { loadWasmKernels, type Kernels } from "../src/index.js";

const SAMPLE_RATE = 16000;
const BUTTERWORTH_Q = Math.SQRT1_2;

let k: Kernels;
beforeAll(async () => {
  k = await loadWasmKernels();
});

/** RMS over the tail of a buffer (skips the filter settling transient). */
function tailRms(samples: Float32Array, skip = 256): number {
  let sum = 0;
  for (let i = skip; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (samples.length - skip));
}

const dc = () => new Float32Array(2048).fill(1);
const nyquist = () => new Float32Array(2048).map((_, i) => (i % 2 === 0 ? 1 : -1));

describe("RBJ biquad frequency response", () => {
  it("lowpass passes DC and attenuates Nyquist", () => {
    const coeffs = k.biquadDesign("rbj", "lowpass", SAMPLE_RATE, 1000, BUTTERWORTH_Q);
    expect(tailRms(k.biquadProcess(coeffs, k.createBiquadState(1), dc(), 1))).toBeCloseTo(1, 2);
    expect(tailRms(k.biquadProcess(coeffs, k.createBiquadState(1), nyquist(), 1))).toBeLessThan(0.05);
  });

  it("highpass attenuates DC and passes Nyquist", () => {
    const coeffs = k.biquadDesign("rbj", "highpass", SAMPLE_RATE, 1000, BUTTERWORTH_Q);
    expect(tailRms(k.biquadProcess(coeffs, k.createBiquadState(1), dc(), 1))).toBeLessThan(0.05);
    expect(tailRms(k.biquadProcess(coeffs, k.createBiquadState(1), nyquist(), 1))).toBeCloseTo(1, 2);
  });

  it("rejects bandpass, which the RBJ design does not support", () => {
    expect(() => k.biquadDesign("rbj", "bandpass", SAMPLE_RATE, 1000, 1)).toThrow(/NT_ERR_ARGS/);
  });
});

describe("biquad state", () => {
  // The contract the streaming filter nodes depend on: filtering a signal in
  // chunks with a shared state must equal filtering it in one pass.
  it("8 chunks of 512 with shared state equal a single 4096-sample pass", () => {
    const input = new Float32Array(4096);
    let seed = 12345;
    for (let i = 0; i < input.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      input[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    const coeffs = k.biquadDesign("rbj", "lowpass", SAMPLE_RATE, 2000, BUTTERWORTH_Q);
    const single = k.biquadProcess(coeffs, k.createBiquadState(1), input, 1);
    const chunked = new Float32Array(input.length);
    const state = k.createBiquadState(1);
    for (let start = 0; start < input.length; start += 512) {
      chunked.set(k.biquadProcess(coeffs, state, input.subarray(start, start + 512), 1), start);
    }
    expect(chunked).toEqual(single);
  });

  it("filters interleaved stereo with independent per-channel state", () => {
    const frames = 2048;
    const samples = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      samples[i * 2] = 1;
      samples[i * 2 + 1] = i % 2 === 0 ? 1 : -1;
    }
    const coeffs = k.biquadDesign("rbj", "lowpass", SAMPLE_RATE, 1000, BUTTERWORTH_Q);
    const out = k.biquadProcess(coeffs, k.createBiquadState(2), samples, 2);
    expect(out.length).toBe(samples.length);
    expect(tailRms(k.extractChannel(out, 2, 0))).toBeCloseTo(1, 2);
    expect(tailRms(k.extractChannel(out, 2, 1))).toBeLessThan(0.05);
  });
});
