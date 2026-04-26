import { describe, expect, it } from "vitest";
import { loadAudioSamples } from "../src/transformers-base.js";

/**
 * Build a 16-bit PCM WAV file in-memory at the given sample rate / channel
 * count, with the given Float32 samples (interleaved if multi-channel).
 */
function buildWav(
  samples: Float32Array,
  sampleRate: number,
  numChannels: number
): Uint8Array {
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
  buffer.writeUInt16LE(1, 20); // PCM
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
  return new Uint8Array(buffer);
}

function refFromBytes(bytes: Uint8Array) {
  return { data: Buffer.from(bytes).toString("base64") };
}

describe("loadAudioSamples (Node-friendly WAV decode)", () => {
  it("decodes a mono 16-bit WAV at the requested sample rate without resampling", async () => {
    // 0.1s of mono samples at 16kHz — already at the target rate.
    const len = 1600;
    const input = new Float32Array(len);
    for (let i = 0; i < len; i++) input[i] = Math.sin(i * 0.1);
    const wav = buildWav(input, 16000, 1);

    const out = await loadAudioSamples(refFromBytes(wav), 16000);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(len);
    // Round-trip through 16-bit quantization is approximate, not bit-exact.
    expect(out[100]).toBeCloseTo(input[100], 3);
  });

  it("resamples 44.1kHz mono down to 16kHz", async () => {
    const len = 4410; // 0.1s at 44.1k
    const input = new Float32Array(len);
    for (let i = 0; i < len; i++) input[i] = 0.5;
    const wav = buildWav(input, 44100, 1);

    const out = await loadAudioSamples(refFromBytes(wav), 16000);
    // Constant input → constant output regardless of resampling strategy.
    expect(out.length).toBeGreaterThan(1500);
    expect(out.length).toBeLessThan(1700); // ~1600
    expect(out[100]).toBeCloseTo(0.5, 2);
  });

  it("mixes stereo to mono by averaging channels", async () => {
    // Two interleaved frames: L=1.0, R=-1.0 → mono should average to 0.
    const interleaved = new Float32Array([1.0, -1.0, 0.5, -0.5, 0.25, -0.25]);
    const wav = buildWav(interleaved, 16000, 2);

    const out = await loadAudioSamples(refFromBytes(wav), 16000);
    expect(out.length).toBe(3);
    // Each pair averages to ~0 (modulo 16-bit quantization noise).
    expect(out[0]).toBeCloseTo(0, 3);
    expect(out[1]).toBeCloseTo(0, 3);
    expect(out[2]).toBeCloseTo(0, 3);
  });

  it("falls back to ffmpeg for non-WAV input and throws an actionable error if ffmpeg fails or is missing", async () => {
    // 5 bytes of garbage: definitely not WAV, definitely not decodable by ffmpeg.
    // Either ffmpeg surfaces a decode error or — if ffmpeg isn't on PATH at
    // all — we throw the install-hint error instead. Both paths are correct.
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    await expect(loadAudioSamples(refFromBytes(garbage), 16000)).rejects.toThrow(
      /ffmpeg/i
    );
  });

  it("throws on empty input", async () => {
    await expect(loadAudioSamples(refFromBytes(new Uint8Array()), 16000))
      .rejects.toThrow(/empty/);
  });
});
