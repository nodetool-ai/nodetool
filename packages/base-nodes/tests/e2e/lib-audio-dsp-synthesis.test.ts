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

// Short sine wave for filter tests (440 Hz, 0.05s at 8000 Hz sample rate)
function makeShortSine(): { uri: string; data: string } {
  const sr = 8000;
  const dur = 0.05;
  const n = Math.floor(sr * dur);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr);
  }
  return makeAudioRef(samples, sr);
}

// ── Audio filter nodes ──────────────────────────────────────────────

describe("GainNode_", () => {
  it("returns audio ref with data when given valid audio", async () => {
    const audio = makeShortSine();
    const node = new GainNode_();
    node.assign({ audio, gain_db: 0 });
    const res = await node.process();
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("passes through when no audio data", async () => {
    const node = new GainNode_();
    node.assign({ audio: {}, gain_db: 6 });
    const res = await node.process();
    expect(res.output).toEqual({});
  });
});

describe("DelayNode_", () => {
  it("produces output longer than input (extra echoes)", async () => {
    const audio = makeShortSine();
    const node = new DelayNode_();
    node.assign({
      audio,
      delay_seconds: 0.01,
      feedback: 0.3,
      mix: 0.5
    });
    const res = await node.process();
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
    // Delay output should be longer due to echo tail
    expect(out.data.length).toBeGreaterThan(audio.data.length);
  });
});

describe("HighPassFilterNode", () => {
  it("returns audio ref with data", async () => {
    const audio = makeShortSine();
    const node = new HighPassFilterNode();
    node.assign({ audio, cutoff_frequency_hz: 200 });
    const res = await node.process();
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
    expect(out.data.length).toBeGreaterThan(0);
  });
});

describe("LowPassFilterNode", () => {
  it("returns audio ref with data", async () => {
    const audio = makeShortSine();
    const node = new LowPassFilterNode();
    node.assign({ audio, cutoff_frequency_hz: 2000 });
    const res = await node.process();
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
  });
});

describe("HighShelfFilterNode", () => {
  it("returns audio ref with data", async () => {
    const audio = makeShortSine();
    const node = new HighShelfFilterNode();
    node.assign({ audio, cutoff_frequency_hz: 3000, gain_db: 6 });
    const res = await node.process();
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
  });
});

describe("LowShelfFilterNode", () => {
  it("returns audio ref with data", async () => {
    const audio = makeShortSine();
    const node = new LowShelfFilterNode();
    node.assign({ audio, cutoff_frequency_hz: 300, gain_db: -3 });
    const res = await node.process();
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
  });
});

describe("PeakFilterNode", () => {
  it("returns audio ref with data", async () => {
    const audio = makeShortSine();
    const node = new PeakFilterNode();
    node.assign({ audio, cutoff_frequency_hz: 1000, q_factor: 2.0 });
    const res = await node.process();
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
  });
});

