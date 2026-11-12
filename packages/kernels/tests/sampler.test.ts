import { beforeAll, describe, expect, it } from "vitest";
import {
  loadWasmKernels,
  MAX_SAMPLER_VOICES,
  type Kernels,
  type SamplerParams
} from "../src/index.js";

let k: Kernels;
beforeAll(async () => {
  k = await loadWasmKernels();
});

const params: SamplerParams = {
  mode: "one_shot",
  rate: 1,
  attackFrames: 0,
  releaseFrames: 0,
  gain: 1
};

/** A clip that ends at zero, so a voice that reaches the end leaves no decay. */
const clip = Float32Array.from({ length: 300 }, (_, i) =>
  i === 299 ? 0 : Math.sin(i * 0.37) * 0.6
);

/** A gate that is high for ten frames at each start frame. */
function gateAt(frames: number, starts: readonly number[]): Float32Array {
  const gate = new Float32Array(frames);
  for (const start of starts) gate.fill(1, start, start + 10);
  return gate;
}

describe("sampler", () => {
  it("copies the clip at a rate of 1 and reports the end", () => {
    const state = k.createSamplerState(4, 1);
    const block = k.sampler(state, 4, clip, 1, 512, params);
    expect(block.samples.subarray(0, 300)).toEqual(clip);
    expect(block.samples.subarray(300).every((s) => s === 0)).toBe(true);
    expect(block.active).toBe(0);
  });

  it("plays voices together and keeps the pitch of each trigger", () => {
    const frames = 512;
    const gate = gateAt(frames, [0, 100]);
    const pitch = new Float32Array(frames);
    pitch.fill(1, 100);
    const state = k.createSamplerState(4, 1);
    const { samples } = k.sampler(state, 4, clip, 1, frames, params, gate, pitch);
    for (let i = 0; i < 250; i++) {
      // The second voice starts at frame 100, one octave up.
      const second = i >= 100 ? clip[(i - 100) * 2] : 0;
      expect(samples[i]).toBeCloseTo(clip[i] + second, 6);
    }
  });

  it("gives the same samples and state for any chunking", () => {
    const frames = 2048;
    const gate = Float32Array.from({ length: frames }, (_, i) =>
      i % 97 < 31 ? 1 : 0
    );
    const pitch = Float32Array.from(
      { length: frames },
      (_, i) => ((Math.floor(i / 97) % 5) - 2) * 0.37
    );
    const stereo = Float32Array.from({ length: 2 * 211 }, (_, i) =>
      Math.sin(i * 0.61)
    );
    for (const mode of ["one_shot", "gated", "loop"] as const) {
      const p = { ...params, mode, rate: 0.75, attackFrames: 12, releaseFrames: 40 };
      const wholeState = k.createSamplerState(3, 2);
      const whole = k.sampler(wholeState, 3, stereo, 2, frames, p, gate, pitch);
      const chunkState = k.createSamplerState(3, 2);
      const chunked = new Float32Array(frames * 2);
      let active = 0;
      for (let start = 0; start < frames; ) {
        const count = Math.min(1 + (start % 61), frames - start);
        const block = k.sampler(
          chunkState, 3, stereo, 2, count, p,
          gate.subarray(start, start + count),
          pitch.subarray(start, start + count)
        );
        chunked.set(block.samples, start * 2);
        active = block.active;
        start += count;
      }
      expect(chunked).toEqual(whole.samples);
      expect(chunkState).toEqual(wholeState);
      expect(active).toBe(whole.active);
      expect(whole.samples.some((s) => s !== 0)).toBe(true);
    }
  });

  it("rejects a state of the wrong size and invalid voice counts", () => {
    expect(() => k.createSamplerState(0, 1)).toThrow(RangeError);
    expect(() => k.createSamplerState(MAX_SAMPLER_VOICES + 1, 1)).toThrow(RangeError);
    const state = k.createSamplerState(2, 1);
    expect(() => k.sampler(state, 4, clip, 1, 16, params)).toThrow(RangeError);
    expect(() => k.sampler(state, 2, clip, 1, 16, params, new Float32Array(8))).toThrow(RangeError);
  });
});
