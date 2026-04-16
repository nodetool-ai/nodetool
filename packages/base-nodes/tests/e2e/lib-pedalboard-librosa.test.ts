import { describe, expect, it } from "vitest";
import {
  BitcrushNode,
  CompressNode,
  DistortionNode,
  LimiterNode,
  ReverbNode,
  NoiseGateNode,
  PhaserNode
} from "../../src/index.js";

// ── Test audio helper ─────────────────────────────────────────────

function makeTestAudio(durationSec = 0.5, freq = 440): Record<string, unknown> {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = Buffer.alloc(44 + numSamples * 2);
  // WAV header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  // Generate sine wave
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    buffer.writeInt16LE(Math.round(sample * 32767 * 0.5), 44 + i * 2);
  }
  return { type: "audio", uri: "", data: buffer.toString("base64") };
}

// ── Pedalboard nodes ──────────────────────────────────────────────

describe("lib.pedalboard audio effects", () => {
  const audio = makeTestAudio();

  it("Bitcrush produces audio output with data", async () => {
    const node = new BitcrushNode();
    node.assign({
      audio,
      bit_depth: 8,
      sample_rate_reduction: 2
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
    expect(typeof output.data).toBe("string");
    expect((output.data as string).length).toBeGreaterThan(0);
  });

  it("Distortion produces audio output with data", async () => {
    const node = new DistortionNode();
    node.assign({
      audio,
      drive_db: 20
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
    expect(typeof output.data).toBe("string");
    expect((output.data as string).length).toBeGreaterThan(0);
  });

  it("Limiter produces audio output with data", async () => {
    const node = new LimiterNode();
    node.assign({
      audio,
      threshold_db: -6,
      release_ms: 100
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
    expect(typeof output.data).toBe("string");
  });

  it("Compress produces audio output with data", async () => {
    const node = new CompressNode();
    node.assign({
      audio,
      threshold: -10,
      ratio: 4,
      attack: 5,
      release: 50
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
    expect(typeof output.data).toBe("string");
  });

  it("Reverb produces audio output with data", async () => {
    const node = new ReverbNode();
    node.assign({
      audio,
      room_scale: 0.5,
      damping: 0.5,
      wet_level: 0.3,
      dry_level: 0.7
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
    expect(typeof output.data).toBe("string");
  });

  it("NoiseGate produces audio output with data", async () => {
    const node = new NoiseGateNode();
    node.assign({ audio });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
    expect(typeof output.data).toBe("string");
  });

  it("Phaser produces audio output with data", async () => {
    const node = new PhaserNode();
    node.assign({ audio });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("data");
    expect(typeof output.data).toBe("string");
  });
});
