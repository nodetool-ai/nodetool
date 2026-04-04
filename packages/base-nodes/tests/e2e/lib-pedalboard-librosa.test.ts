import { describe, expect, it } from "vitest";
import {
  BitcrushNode,
  CompressNode,
  DistortionNode,
  LimiterNode,
  ReverbNode,
  NoiseGateNode,
  PhaserNode,
  STFTNode,
  MelSpectrogramNode,
  MFCCNode,
  ChromaSTFTNode,
  SpectralCentroidNode,
  SpectralContrastNode,
  GriffinLimNode,
  DetectOnsetsNode,
  SegmentAudioByOnsetsNode
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

// ── Librosa spectral nodes ────────────────────────────────────────

describe("lib.librosa spectral analysis", () => {
  // Use longer audio so STFT produces frames (need >= n_fft samples)
  const audio = makeTestAudio(0.5, 440);

  it("STFT returns NdArray output with data", async () => {
    const node = new STFTNode();
    node.assign({
      audio,
      n_fft: 2048,
      hop_length: 512
    });
    const result = await node.process();
    const output = result.output as { data: number[][] };
    expect(output).toHaveProperty("data");
    expect(Array.isArray(output.data)).toBe(true);
    expect(output.data.length).toBeGreaterThan(0);
    // Each row is a frequency bin with frame values
    expect(Array.isArray(output.data[0])).toBe(true);
    expect(output.data[0].length).toBeGreaterThan(0);
  });

  it("MelSpectrogram returns 2D array with n_mels rows", async () => {
    const nMels = 64;
    const node = new MelSpectrogramNode();
    node.assign({
      audio,
      n_fft: 2048,
      hop_length: 512,
      n_mels: nMels,
      fmin: 0,
      fmax: 8000
    });
    const result = await node.process();
    const output = result.output as { data: number[][] };
    expect(output.data.length).toBe(nMels);
  });

  it("MFCC returns 2D array with n_mfcc rows", async () => {
    const nMfcc = 13;
    const node = new MFCCNode();
    node.assign({
      audio,
      n_mfcc: nMfcc,
      n_fft: 2048,
      hop_length: 512
    });
    const result = await node.process();
    const output = result.output as { data: number[][] };
    expect(output.data.length).toBe(nMfcc);
  });

  it("ChromaSTFT returns 12 chroma bins", async () => {
    const node = new ChromaSTFTNode();
    node.assign({
      audio,
      n_fft: 2048,
      hop_length: 512
    });
    const result = await node.process();
    const output = result.output as { data: number[][] };
    expect(output.data.length).toBe(12);
  });

  it("SpectralCentroid returns array of numbers", async () => {
    const node = new SpectralCentroidNode();
    node.assign({
      audio,
      n_fft: 2048,
      hop_length: 512
    });
    const result = await node.process();
    const output = result.output as { data: number[] };
    expect(Array.isArray(output.data)).toBe(true);
    expect(output.data.length).toBeGreaterThan(0);
    // Centroid should be a positive frequency value
    expect(output.data[0]).toBeGreaterThan(0);
  });

  it("SpectralContrast returns 7 bands", async () => {
    const node = new SpectralContrastNode();
    node.assign({
      audio,
      n_fft: 2048,
      hop_length: 512
    });
    const result = await node.process();
    const output = result.output as { data: number[][] };
    expect(output.data.length).toBe(7);
  });

  it("GriffinLim produces output with data", async () => {
    const node = new GriffinLimNode();
    node.assign({
      magnitude_spectrogram: {
        data: [
          [1, 2],
          [3, 4]
        ]
      }
    });
    const result = await node.process();
    const output = result.output as { data: unknown[] };
    expect(output).toHaveProperty("data");
  });

  it("DetectOnsets returns array of onset times", async () => {
    // Create audio with a sharp transient to trigger onset detection
    const sampleRate = 22050;
    const numSamples = Math.floor(sampleRate * 1.0);
    const buffer = Buffer.alloc(44 + numSamples * 2);
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
    // Silence then burst pattern to create onsets
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let sample = 0;
      // Create bursts at 0.2s and 0.6s
      if ((t > 0.2 && t < 0.3) || (t > 0.6 && t < 0.7)) {
        sample = Math.sin((2 * Math.PI * 1000 * i) / sampleRate) * 0.8;
      }
      buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
    }
    const burstAudio = {
      type: "audio",
      uri: "",
      data: buffer.toString("base64")
    };

    const node = new DetectOnsetsNode();
    node.assign({
      audio: burstAudio,
      hop_length: 512
    });
    const result = await node.process();
    const output = result.output as { data: number[] };
    expect(Array.isArray(output.data)).toBe(true);
    // Should detect at least one onset
    expect(output.data.length).toBeGreaterThanOrEqual(1);
    // Onset times should be positive numbers
    for (const t of output.data) {
      expect(t).toBeGreaterThan(0);
    }
  });

  it("SegmentAudioByOnsets segments audio at given times", async () => {
    const node = new SegmentAudioByOnsetsNode();
    node.assign({
      audio,
      onsets: { data: [0.0, 0.2] },
      min_segment_length: 0.05
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>[];
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeGreaterThan(0);
    // Each segment should have data
    for (const seg of output) {
      expect(seg).toHaveProperty("data");
      expect(typeof seg.data).toBe("string");
    }
  });

  it("STFT returns empty data for audio without data", async () => {
    const node = new STFTNode();
    node.assign({
      audio: {}
    });
    const result = await node.process();
    const output = result.output as { data: unknown[] };
    expect(output.data).toEqual([]);
  });

  it("SpectralCentroid returns empty data for audio without data", async () => {
    const node = new SpectralCentroidNode();
    node.assign({
      audio: {}
    });
    const result = await node.process();
    const output = result.output as { data: unknown[] };
    expect(output.data).toEqual([]);
  });
});
