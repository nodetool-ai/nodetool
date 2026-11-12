import { beforeAll, describe, expect, it } from "vitest";
import { loadWasmKernels, type Kernels } from "../src/index.js";
let k: Kernels;
beforeAll(async () => {
  k = await loadWasmKernels();
});
const rate = 44100;
const samples = Float32Array.from(
  { length: 8194 },
  (_, i) => Math.sin(i * 0.19) * 0.8
);
const compress = {
  thresholdDb: -18,
  ratio: 4,
  attackMs: 10,
  releaseMs: 100,
  autoGain: true
};
const limiter = { thresholdDb: -3, releaseMs: 50, autoGain: false };
const gate = { thresholdDb: -20, attackMs: 1, releaseMs: 50 };
const phaser = {
  rateHz: 0.5,
  depth: 0.7,
  centreFrequencyHz: 1000,
  feedback: 0.3,
  mix: 0.5
};
const reverb = { roomScale: 0.5, damping: 0.5, wetLevel: 0.3, dryLevel: 0.7 };
const delay = { delaySeconds: 0.013, feedback: 0.5, mix: 0.5 };
const cases = [
  {
    name: "bitcrush",
    create: () => k.createBitcrushState(2, rate),
    block: (s: Float64Array, x: Float32Array) => k.bitcrushBlock(s, x, 2, 8, 7),
    clip: () => k.bitcrush(samples, 2, 8, 7)
  },
  {
    name: "compress",
    create: () => k.createCompressState(2, rate),
    block: (s: Float64Array, x: Float32Array) =>
      k.compressBlock(s, x, 2, rate, compress),
    clip: () => k.compress(samples, 2, rate, compress)
  },
  {
    name: "limiter",
    create: () => k.createLimiterState(2, rate),
    block: (s: Float64Array, x: Float32Array) =>
      k.limiterBlock(s, x, 2, rate, limiter),
    clip: () => k.limiter(samples, 2, rate, limiter)
  },
  {
    name: "noise gate",
    create: () => k.createNoiseGateState(2, rate),
    block: (s: Float64Array, x: Float32Array) =>
      k.noiseGateBlock(s, x, 2, rate, gate),
    clip: () => k.noiseGate(samples, 2, rate, gate)
  },
  {
    name: "phaser",
    create: () => k.createPhaserState(2, rate),
    block: (s: Float64Array, x: Float32Array) =>
      k.phaserBlock(s, x, 2, rate, phaser),
    clip: () => k.phaser(samples, 2, rate, phaser)
  },
  {
    name: "reverb",
    create: () => k.createReverbState(2, rate),
    block: (s: Float64Array, x: Float32Array) =>
      k.reverbBlock(s, x, 2, rate, reverb),
    clip: () => k.reverb(samples, 2, rate, reverb)
  },
  {
    name: "delay",
    create: () => k.createDelayState(2, rate, delay.delaySeconds),
    block: (s: Float64Array, x: Float32Array) =>
      k.delayBlock(s, x, 2, rate, delay),
    clip: () => k.delay(samples, 2, rate, delay).subarray(0, samples.length)
  }
];
describe("stateful effects", () => {
  for (const effect of cases) {
    it(`${effect.name} preserves samples across arbitrary frame boundaries`, () => {
      const expected = effect.clip();
      for (const frames of [1, 127, 128, 1024, 193]) {
        const state = effect.create();
        const actual = new Float32Array(samples.length);
        for (let start = 0; start < samples.length; start += frames * 2) {
          actual.set(
            effect.block(state, samples.subarray(start, start + frames * 2)),
            start
          );
        }
        expect(actual).toEqual(expected);
      }
    });
  }
  it("rejects short state buffers and delays above the streaming bound", () => {
    expect(() =>
      k.compressBlock(new Float64Array(0), samples, 2, rate, compress)
    ).toThrow(/state/);
    expect(() => k.createDelayState(2, rate, 2.01)).toThrow();
    expect(
      k.delay(samples, 2, rate, { ...delay, delaySeconds: 2.01 }).length
    ).toBeGreaterThan(samples.length);
  });
});
it("resamples a 1 kHz sine with more than 60 dB SNR away from boundaries", () => {
  const input = Float32Array.from({ length: 48000 }, (_, i) =>
    Math.sin((2 * Math.PI * 1000 * i) / 48000)
  );
  const output = k.resample(input, 1, 48000, rate);
  expect(output.length).toBe(rate);
  let power = 0,
    error = 0;
  for (let i = 128; i < output.length - 128; i++) {
    const reference = Math.sin((2 * Math.PI * 1000 * i) / rate);
    power += reference * reference;
    error += (output[i] - reference) ** 2;
  }
  expect(10 * Math.log10(power / error)).toBeGreaterThan(60);
  expect(k.resample(input, 1, 48000, 48000)).toBe(input);
  expect(k.resample(new Float32Array(0), 1, 48000, rate).length).toBe(0);
  expect(k.resample(input.subarray(0, 127), 1, 48000, rate).length).toBe(
    Math.round((127 * rate) / 48000)
  );
});
