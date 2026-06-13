import { describe, it, expect } from "vitest";
import {
  applyBiquadToWav,
  biquadCoeffs,
  createBiquadState,
  processBiquad,
  DEFAULT_Q
} from "@nodetool-ai/audio-nodes";

const SAMPLE_RATE = 16000;

/** RMS over the tail of a buffer (skips the filter settling transient). */
function tailRms(samples: Float32Array, skip = 256): number {
  let sum = 0;
  for (let i = skip; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (samples.length - skip));
}

describe("biquadCoeffs + processBiquad frequency response", () => {
  it("lowpass passes DC and attenuates Nyquist", () => {
    const coeffs = biquadCoeffs("lowpass", SAMPLE_RATE, 1000, DEFAULT_Q);

    const dc = new Float32Array(2048).fill(1);
    const dcOut = processBiquad(coeffs, createBiquadState(), dc);
    expect(tailRms(dcOut)).toBeCloseTo(1, 2);

    const nyquist = new Float32Array(2048);
    for (let i = 0; i < nyquist.length; i++) nyquist[i] = i % 2 === 0 ? 1 : -1;
    const nyquistOut = processBiquad(coeffs, createBiquadState(), nyquist);
    expect(tailRms(nyquistOut)).toBeLessThan(0.05);
  });

  it("highpass attenuates DC and passes Nyquist", () => {
    const coeffs = biquadCoeffs("highpass", SAMPLE_RATE, 1000, DEFAULT_Q);

    const dc = new Float32Array(2048).fill(1);
    const dcOut = processBiquad(coeffs, createBiquadState(), dc);
    expect(tailRms(dcOut)).toBeLessThan(0.05);

    const nyquist = new Float32Array(2048);
    for (let i = 0; i < nyquist.length; i++) nyquist[i] = i % 2 === 0 ? 1 : -1;
    const nyquistOut = processBiquad(coeffs, createBiquadState(), nyquist);
    expect(tailRms(nyquistOut)).toBeCloseTo(1, 2);
  });
});

describe("biquad state carry across chunks", () => {
  // The contract the streaming filter nodes depend on: filtering a signal in
  // chunks with a shared state must equal filtering it in one pass.
  it("8 chunks of 512 with shared state equal a single 4096-sample pass", () => {
    const input = new Float32Array(4096);
    // Deterministic pseudo-random signal (no test flakiness).
    let seed = 12345;
    for (let i = 0; i < input.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      input[i] = (seed / 0x7fffffff) * 2 - 1;
    }

    const coeffs = biquadCoeffs("lowpass", SAMPLE_RATE, 2000, DEFAULT_Q);

    const single = processBiquad(coeffs, createBiquadState(), input);

    const chunked = new Float32Array(input.length);
    const state = createBiquadState();
    for (let start = 0; start < input.length; start += 512) {
      const out = processBiquad(
        coeffs,
        state,
        input.subarray(start, start + 512)
      );
      chunked.set(out, start);
    }

    for (let i = 0; i < input.length; i++) {
      expect(Math.abs(single[i] - chunked[i])).toBeLessThan(1e-6);
    }
  });
});

describe("applyBiquadToWav", () => {
  it("filters interleaved stereo with independent per-channel state", () => {
    const frames = 2048;
    const samples = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      samples[i * 2] = 1; // left: DC
      samples[i * 2 + 1] = i % 2 === 0 ? 1 : -1; // right: Nyquist
    }
    const out = applyBiquadToWav(
      { samples, sampleRate: SAMPLE_RATE, numChannels: 2 },
      "lowpass",
      1000,
      DEFAULT_Q,
      0
    );
    expect(out.numChannels).toBe(2);
    expect(out.samples.length).toBe(samples.length);

    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      left[i] = out.samples[i * 2];
      right[i] = out.samples[i * 2 + 1];
    }
    expect(tailRms(left)).toBeCloseTo(1, 2);
    expect(tailRms(right)).toBeLessThan(0.05);
  });
});
