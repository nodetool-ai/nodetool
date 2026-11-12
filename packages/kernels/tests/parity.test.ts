/**
 * Parity of each kernel (the WebAssembly build) with the TypeScript loop it
 * replaced (tests/reference.ts). Image kernels must be byte-equal. Audio
 * kernels must be equal up to AUDIO_TOLERANCE.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PCM_FORMATS, loadWasmKernels, type Kernels } from "../src/index.js";
import * as ref from "./reference.js";

/**
 * Largest absolute difference of an audio sample, in float32 full scale.
 * Measured 0 for every kernel: the module's math library and V8's give the
 * same results on these inputs.
 */
const AUDIO_TOLERANCE = 0;

let k: Kernels;
beforeAll(async () => {
  k = await loadWasmKernels();
});

/** A deterministic PRNG, so a failure reproduces. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function image(w: number, h: number, seed: number, levels = 256): Uint8Array {
  const r = rng(seed);
  const out = new Uint8Array(w * h * 4);
  // A gradient with noise, so histograms are neither flat nor single-valued.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const base = ((x + y * (c + 1)) * 255) / (w + h * 3);
        out[i + c] = Math.min(levels - 1, Math.floor(base * 0.6 + r() * 80));
      }
      out[i + 3] = Math.floor(r() * 256);
    }
  }
  return out;
}

/** Noise under a loud swept sine, interleaved, with silent stretches. */
function signal(frames: number, channels: number, seed: number): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(frames * channels);
  for (let i = 0; i < frames; i++) {
    const envelope = Math.floor(i / 2000) % 3 === 2 ? 0 : 1;
    for (let c = 0; c < channels; c++) {
      const sweep = Math.sin((i * i * 0.00002 + c) * 0.5) * 0.9;
      out[i * channels + c] = envelope * (sweep + (r() - 0.5) * 0.2);
    }
  }
  return out;
}

function maxDiff(a: Float32Array, b: Float32Array): number {
  expect(a.length).toBe(b.length);
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (!(d <= max)) max = Number.isNaN(d) ? Infinity : d;
  }
  return max;
}

const FRAMES = 12000;
const CHANNELS = 2;
const RATES = [24000, 44100];

describe("image enhance kernels", () => {
  const sizes: [number, number][] = [[1, 1], [7, 5], [64, 48], [123, 77]];

  it("AutoContrast is byte-equal", () => {
    for (const [w, h] of sizes) {
      const src = image(w, h, w * 31 + h);
      for (const cutoff of [0, 1, 5, 20, 49]) {
        expect(k.imageAutoContrast(src, w, h, cutoff)).toEqual(ref.autoContrast(src, w, h, cutoff));
      }
    }
  });

  it("Equalize is byte-equal", () => {
    for (const [w, h] of sizes) {
      const src = image(w, h, w + h * 17, 200);
      expect(k.imageEqualize(src, w, h)).toEqual(ref.equalize(src, w, h));
    }
  });

  it("AdaptiveContrast is byte-equal", () => {
    for (const [w, h] of sizes) {
      const src = image(w, h, w * h);
      for (const [clip, grid] of [[2, 8], [0, 1], [100, 3], [2, 64], [4.5, 7]] as const) {
        expect(k.imageAdaptiveContrast(src, w, h, clip, grid)).toEqual(
          ref.adaptiveContrast(src, w, h, clip, grid)
        );
      }
    }
  });

  it("RankFilter is byte-equal on both the gather and the histogram path", () => {
    const [w, h] = [41, 29];
    const src = image(w, h, 99);
    for (const size of [1, 3, 4, 7, 8, 13, 25]) {
      for (const rank of [0, 3, 40, 512]) {
        expect(k.imageRankFilter(src, w, h, size, rank)).toEqual(ref.rankFilter(src, w, h, size, rank));
      }
    }
  });
});

describe("audio effect kernels", () => {
  const cases: [string, (s: Float32Array, sr: number) => [Float32Array, Float32Array]][] = [
    ["Bitcrush", (s, sr) => [
      k.bitcrush(s, CHANNELS, 4, 3),
      ref.perChannel(s, CHANNELS, sr, (ch) => ref.bitcrush(ch, 4, 3))
    ]],
    ["Bitcrush at bit depth 1", (s, sr) => [
      k.bitcrush(s, CHANNELS, 1, 1),
      ref.perChannel(s, CHANNELS, sr, (ch) => ref.bitcrush(ch, 1, 1))
    ]],
    ["Compress", (s, sr) => [
      k.compress(s, CHANNELS, sr, { thresholdDb: -20, ratio: 4, attackMs: 5, releaseMs: 50, autoGain: true }),
      ref.perChannel(s, CHANNELS, sr, (ch, r) => ref.compress(ch, r, -20, 4, 5, 50, true))
    ]],
    ["Compress without auto gain", (s, sr) => [
      k.compress(s, CHANNELS, sr, { thresholdDb: -6, ratio: 20, attackMs: 0.1, releaseMs: 1000, autoGain: false }),
      ref.perChannel(s, CHANNELS, sr, (ch, r) => ref.compress(ch, r, -6, 20, 0.1, 1000, false))
    ]],
    ["Distortion", (s) => [k.distortion(s, 25), ref.perChannel(s, CHANNELS, 1, (ch) => ref.distortion(ch, 25))]],
    ["Limiter", (s, sr) => [
      k.limiter(s, CHANNELS, sr, { thresholdDb: -2, releaseMs: 250, autoGain: true }),
      ref.perChannel(s, CHANNELS, sr, (ch, r) => ref.limiter(ch, r, -2, 250, true))
    ]],
    ["Reverb", (s, sr) => [
      k.reverb(s, CHANNELS, sr, { roomScale: 0.5, damping: 0.5, wetLevel: 0.33, dryLevel: 0.4 }),
      ref.perChannel(s, CHANNELS, sr, (ch, r) => ref.reverb(ch, r, 0.5, 0.5, 0.33, 0.4))
    ]],
    ["NoiseGate", (s, sr) => [
      k.noiseGate(s, CHANNELS, sr, { thresholdDb: -30, attackMs: 1, releaseMs: 100 }),
      ref.perChannel(s, CHANNELS, sr, (ch, r) => ref.noiseGate(ch, r, -30, 1, 100))
    ]],
    ["Phaser", (s, sr) => [
      k.phaser(s, CHANNELS, sr, { rateHz: 1, depth: 0.5, centreFrequencyHz: 1300, feedback: -0.5, mix: 0.5 }),
      ref.perChannel(s, CHANNELS, sr, (ch, r) => ref.phaser(ch, r, 1, 0.5, 1300, -0.5, 0.5))
    ]],
    ["Delay", (s, sr) => [
      k.delay(s, CHANNELS, sr, { delaySeconds: 0.05, feedback: 0.5, mix: 0.4 }),
      ref.delay(s, CHANNELS, sr, 0.05, 0.5, 0.4)
    ]],
    ["Gain", (s) => {
      const factor = Math.pow(10, -6 / 20);
      return [k.scaleOffset(s, factor), s.map((v) => v * factor)];
    }]
  ];

  for (const [name, run] of cases) {
    it(`${name} matches the TypeScript loop`, () => {
      for (const sr of RATES) {
        const [got, want] = run(signal(FRAMES, CHANNELS, sr), sr);
        expect(maxDiff(got, want)).toBeLessThanOrEqual(AUDIO_TOLERANCE);
      }
    });
  }
});

describe("filter and synthesis kernels", () => {
  it("the RBJ design and the biquad loop match lib/biquad.ts across chunks", () => {
    for (const type of ["lowpass", "highpass", "lowshelf", "highshelf", "peaking"] as const) {
      const s = signal(FRAMES, 1, 5);
      const coeffs = k.biquadDesign("rbj", type, 24000, 900, 0.9, 6);
      expect(Array.from(coeffs)).toEqual(ref.biquadCoeffs(type, 24000, 900, 0.9, 6));
      const state = k.createBiquadState(1);
      const refState = [0, 0, 0, 0];
      const got = new Float32Array(FRAMES);
      const want = new Float32Array(FRAMES);
      for (let start = 0; start < FRAMES; start += 512) {
        const chunk = s.subarray(start, start + 512);
        got.set(k.biquadProcess(coeffs, state, chunk, 1), start);
        want.set(ref.processBiquad(ref.biquadCoeffs(type, 24000, 900, 0.9, 6), refState, chunk), start);
      }
      expect(maxDiff(got, want)).toBe(0);
    }
  });

  it("the oscillator matches the TypeScript phase accumulator", () => {
    for (const waveform of ["sine", "saw", "square", "triangle"] as const) {
      const pitch = new Float32Array(2048).map((_, i) => Math.sin(i / 300));
      const state = k.createOscillatorState(1);
      const got = k.oscillator(state, { waveform, frequency: 220, amplitude: 0.5, pulseWidth: 0.3, fmAmount: 0 }, 24000, 2048, pitch);
      let phase = 0;
      const want = new Float32Array(2048);
      for (let i = 0; i < 2048; i++) {
        const freq = 220 * Math.pow(2, pitch[i]) * (1 + 0 * 0);
        const f = Math.min(Math.max(freq, 0), 24000 / 2 - 1e-6);
        want[i] = 0.5 * ref.oscSample(waveform, phase, 0.3);
        phase = (phase + f / 24000) % 1;
      }
      expect(maxDiff(got, want)).toBeLessThanOrEqual(AUDIO_TOLERANCE);
    }
  });

  it("the ADSR matches adsrStep", () => {
    const gate = new Float32Array(6000).map((_, i) => (i % 2500 < 1500 ? 1 : 0));
    const params = { attack: 0.01, decay: 0.02, sustain: 0.5, release: 0.03 };
    const got = new Float32Array(6000);
    const state = new Float64Array(3);
    for (let start = 0; start < 6000; start += 512) {
      got.set(k.adsr(state, params, 24000, gate.subarray(start, start + 512)), start);
    }
    const refState: ref.AdsrState = { stage: "idle", env: 0, gateWasHigh: false };
    const coeffs = {
      attackCoeff: ref.adsrCoeff(0.01, 24000),
      decayCoeff: ref.adsrCoeff(0.02, 24000),
      releaseCoeff: ref.adsrCoeff(0.03, 24000),
      sustain: 0.5
    };
    const want = gate.map((g) => ref.adsrStep(refState, g >= 0.5, coeffs));
    expect(maxDiff(got, want)).toBeLessThanOrEqual(AUDIO_TOLERANCE);
  });

  it("the LFO resets its phase on a clock edge", () => {
    const clock = new Float32Array(1000).map((_, i) => (i % 250 < 10 ? 1 : 0));
    const out = k.lfo(new Float64Array(2), { waveform: "saw", rateHz: 3, depth: 1, offset: 0 }, 1000, 1000, clock);
    expect(out[0]).toBe(-1);
    expect(out[250]).toBe(-1);
    expect(out[249]).toBeGreaterThan(out[248]);
  });

  it("the VCA and sample & hold follow their CV", () => {
    const audio = new Float32Array([1, -1, 1, -1]);
    expect(Array.from(k.vca(audio, new Float32Array([0.5, -2]), 2, 2))).toEqual([1, -1, 0, -0]);
    const held = k.sampleHold(new Float64Array(2), new Float32Array([1, 2, 3, 4]), new Float32Array([0, 1, 1, 0]));
    expect(Array.from(held)).toEqual([0, 2, 2, 2]);
  });
});

describe("PCM codec kernels", () => {
  const r = rng(11);
  // Random bytes cover every integer code, and the float bytes include NaN
  // and infinities.
  const bytes = new Uint8Array(4 * 3 * 1001);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(r() * 256);

  it("decode is bit-equal with the DataView loop for every WAV format", () => {
    const cases = [
      [PCM_FORMATS.u8, 8, false],
      [PCM_FORMATS.s16, 16, false],
      [PCM_FORMATS.s24, 24, false],
      [PCM_FORMATS.s32, 32, false],
      [PCM_FORMATS.f32, 32, true]
    ] as const;
    for (const [format, bits, isFloat] of cases) {
      const want = ref.pcmDecode(bytes, bits, isFloat);
      const got = k.pcmDecode(bytes, format);
      expect(got.length).toBe(want.length);
      expect(new Uint32Array(got.buffer)).toEqual(new Uint32Array(want.buffer));
    }
  });

  it("decode ignores a trailing partial sample", () => {
    expect(k.pcmDecode(new Uint8Array([0xff, 0x7f, 0x01]), PCM_FORMATS.s16)).toEqual(new Float32Array([1]));
  });

  it("16-bit encode is byte-equal with the DataView loop", () => {
    const samples = new Float32Array(20000);
    for (let i = 0; i < samples.length; i++) samples[i] = (r() - 0.5) * 2.4;
    // Halves of the 32767 scale, clipping, -0, NaN and infinities.
    samples.set([0.5, -0.5, 1, -1, 1.0000001, -1.0000001, -0, NaN, Infinity, -Infinity, 1 / 65534, -1 / 65534]);
    expect(k.pcm16Encode(samples)).toEqual(ref.pcm16Encode(samples));
  });

  it("16-bit encode writes into a view and leaves the rest of its buffer", () => {
    const wav = new Uint8Array(8).fill(9);
    k.pcm16Encode(new Float32Array([1, -1]), wav.subarray(2, 6));
    expect(Array.from(wav)).toEqual([9, 9, 0xff, 0x7f, 0x01, 0x80, 9, 9]);
    expect(() => k.pcm16Encode(new Float32Array(3), new Uint8Array(8))).toThrow(RangeError);
  });
});

describe("argument checks", () => {
  it("rejects buffers shorter than the call reads", () => {
    expect(() => k.imageEqualize(new Uint8Array(15), 2, 2)).toThrow(RangeError);
    expect(() => k.oscillator(k.createOscillatorState(1), {
      waveform: "sine", frequency: 1, amplitude: 1, pulseWidth: 0.5, fmAmount: 0
    }, 24000, 64, new Float32Array(63))).toThrow(/pitch/);
    expect(() => k.biquadProcess(new Float64Array(5), new Float64Array(4), new Float32Array(8), 2)).toThrow(/state/);
    expect(() => k.mixAdd(new Float32Array(4), new Float32Array(3), 1)).toThrow(/input/);
  });

  it("rejects channel counts that are not positive integers", () => {
    for (const channels of [0, -1, 1.5, Number.NaN]) {
      expect(() => k.bitcrush(new Float32Array(4), channels, 8, 1)).toThrow(/channels/);
    }
  });

  it("rejects a delay past the kernel's maximum", () => {
    expect(() => k.delay(new Float32Array(4), 1, 1000, { delaySeconds: 61, feedback: 0, mix: 1 })).toThrow(/NT_ERR_ARGS/);
  });
});
