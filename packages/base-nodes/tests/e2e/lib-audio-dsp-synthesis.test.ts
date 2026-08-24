import { describe, expect, it } from "vitest";
import {
  GainNode_,
  DelayNode_,
  HighPassFilterNode,
  LowPassFilterNode,
  HighShelfFilterNode,
  LowShelfFilterNode,
  PeakFilterNode
} from "../../src/index.js";
import { parseWavBytes, toBytes, type WavData } from "@nodetool-ai/audio-nodes";

// ── Helper: create a minimal WAV audio ref ──────────────────────────
function makeAudioRef(
  samples: Float32Array,
  sampleRate = 44100,
  numChannels = 1
): { uri: string; data: string } {
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 0x7fff), 44 + i * 2);
  }
  return { uri: "", data: buffer.toString("base64") };
}

const SR = 8000;

// Short sine wave (440 Hz, 0.05s at 8000 Hz sample rate)
function makeShortSine(amplitude = 0.5): { uri: string; data: string } {
  const dur = 0.05;
  const n = Math.floor(SR * dur);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / SR);
  }
  return makeAudioRef(samples, SR);
}

/** 0.25 s of two equal-amplitude tones, so a filter's effect on each is visible. */
function makeTwoTone(lowHz: number, highHz: number): { uri: string; data: string } {
  const n = Math.floor(SR * 0.25);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] =
      0.4 * Math.sin((2 * Math.PI * lowHz * i) / SR) +
      0.4 * Math.sin((2 * Math.PI * highHz * i) / SR);
  }
  return makeAudioRef(samples, SR);
}

// The measurement window: past the filter's startup transient, and a whole
// number of cycles of every tone used below (100/1000/2000 Hz over 0.1 s), so
// Goertzel reads one tone without the other leaking into it.
const WINDOW_FROM = 1200;
const WINDOW_TO = 2000;

/** Decode an AudioRef back to interleaved PCM so its content can be asserted. */
function decode(ref: { data?: Uint8Array | string }): WavData {
  const wav = parseWavBytes(toBytes(ref.data));
  if (!wav) {
    throw new Error("audio ref is not decodable WAV");
  }
  return wav;
}

function decodeOutput(res: Record<string, unknown>): WavData {
  return decode(res.output as { data?: Uint8Array | string });
}

function peak(samples: Float32Array, from = 0, to = samples.length): number {
  let max = 0;
  for (let i = from; i < to; i++) {
    max = Math.max(max, Math.abs(samples[i]));
  }
  return max;
}

/** Amplitude of `freq` in the measurement window, by Goertzel. */
function amplitudeAt(samples: Float32Array, freq: number): number {
  const w = (2 * Math.PI * freq) / SR;
  let re = 0;
  let im = 0;
  for (let i = WINDOW_FROM; i < WINDOW_TO; i++) {
    re += samples[i] * Math.cos(w * i);
    im += samples[i] * Math.sin(w * i);
  }
  return (2 * Math.hypot(re, im)) / (WINDOW_TO - WINDOW_FROM);
}

interface FilterNode {
  assign(props: Record<string, unknown>): void;
  process(): Promise<Record<string, unknown>>;
}

/**
 * Run a filter node over a two-tone signal and report what it did to each
 * tone, as an output/input amplitude ratio.
 */
async function toneGains(
  node: FilterNode,
  lowHz: number,
  highHz: number,
  props: Record<string, unknown>
): Promise<{ low: number; high: number }> {
  const audio = makeTwoTone(lowHz, highHz);
  const input = decode(audio).samples;
  node.assign({ audio, ...props });
  const out = decodeOutput(await node.process()).samples;
  return {
    low: amplitudeAt(out, lowHz) / amplitudeAt(input, lowHz),
    high: amplitudeAt(out, highHz) / amplitudeAt(input, highHz)
  };
}

// ── Audio filter nodes ──────────────────────────────────────────────

describe("GainNode_", () => {
  it("scales the peak by the requested decibels", async () => {
    const audio = makeShortSine(0.25);
    for (const gainDb of [0, 6, -12]) {
      const node = new GainNode_();
      node.assign({ audio, gain_db: gainDb });
      const out = decodeOutput(await node.process());
      expect(peak(out.samples)).toBeCloseTo(0.25 * Math.pow(10, gainDb / 20), 2);
    }
  });

  it("throws when no audio data", async () => {
    const node = new GainNode_();
    node.assign({ audio: {}, gain_db: 6 });
    await expect(node.process()).rejects.toThrow("No audio connected");
  });
});

describe("DelayNode_", () => {
  it("appends an echo tail and blends it against the dry signal", async () => {
    const audio = makeShortSine();
    const inputFrames = decode(audio).samples.length;
    const delaySamples = Math.floor(0.01 * SR);
    const node = new DelayNode_();
    node.assign({
      audio,
      delay_seconds: 0.01,
      feedback: 0.3,
      mix: 0.5
    });
    const out = decodeOutput(await node.process()).samples;

    // Four delay periods of room for the echoes to decay in.
    expect(out.length).toBe(inputFrames + delaySamples * 4);
    // Past the end of the input there is no dry signal left, so whatever is
    // there is echo — silence here means the delay line produced nothing.
    expect(peak(out, inputFrames, out.length)).toBeGreaterThan(0.1);
    // The first delay period is dry-only, halved by mix=0.5.
    expect(peak(out, 0, delaySamples)).toBeCloseTo(0.25, 2);
  });
});

// The thresholds below are deliberately loose: `applyFilter` prefers WebAudio's
// biquad and falls back to the pure-JS one, and the two agree on the direction
// and rough size of each response but not on the exact figure.

describe("HighPassFilterNode", () => {
  it("attenuates below the cutoff and passes above it", async () => {
    const gains = await toneGains(
      new HighPassFilterNode(),
      100,
      2000,
      { cutoff_frequency_hz: 800 }
    );
    expect(gains.low).toBeLessThan(0.1);
    expect(gains.high).toBeGreaterThan(0.8);
  });
});

describe("LowPassFilterNode", () => {
  it("attenuates above the cutoff and passes below it", async () => {
    const gains = await toneGains(
      new LowPassFilterNode(),
      100,
      2000,
      { cutoff_frequency_hz: 800 }
    );
    expect(gains.high).toBeLessThan(0.3);
    expect(gains.low).toBeGreaterThan(0.8);
  });
});

describe("HighShelfFilterNode", () => {
  it("boosts above the corner by the shelf gain", async () => {
    const gains = await toneGains(
      new HighShelfFilterNode(),
      100,
      2000,
      { cutoff_frequency_hz: 1000, gain_db: 12 }
    );
    // +12 dB is a factor of ~4; both filter paths reach at least 2.5.
    expect(gains.high).toBeGreaterThan(2.5);
    expect(gains.high).toBeGreaterThan(gains.low * 3);
  });
});

describe("LowShelfFilterNode", () => {
  it("cuts below the corner by the shelf gain", async () => {
    const gains = await toneGains(
      new LowShelfFilterNode(),
      100,
      2000,
      { cutoff_frequency_hz: 200, gain_db: -12 }
    );
    expect(gains.low).toBeLessThan(0.5);
    expect(gains.high).toBeGreaterThan(0.8);
  });
});

describe("PeakFilterNode", () => {
  it("boosts the band around its centre frequency", async () => {
    const gains = await toneGains(
      new PeakFilterNode(),
      100,
      1000,
      { cutoff_frequency_hz: 1000, q_factor: 2.0, gain_db: 12 }
    );
    expect(gains.high).toBeGreaterThan(2);
    expect(gains.high).toBeGreaterThan(gains.low * 2.5);
  });

  it("leaves the signal alone at 0 dB gain", async () => {
    const gains = await toneGains(
      new PeakFilterNode(),
      100,
      1000,
      { cutoff_frequency_hz: 1000, q_factor: 2.0, gain_db: 0 }
    );
    expect(gains.low).toBeCloseTo(1, 1);
    expect(gains.high).toBeCloseTo(1, 1);
  });
});

