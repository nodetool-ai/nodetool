/**
 * The 32-bit float WAV of music mode take assets: the writer, the direct
 * reader, and libav reading the writer's output bit for bit (AL-1, MR11).
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeAudioToPcm, probeMedia } from "@nodetool-ai/runtime/media";
import { encodeWav } from "@nodetool-ai/runtime/media/testing";

import { encodeFloatWav, readFloatWav, readWavInfo } from "../src/lib/float-wav.js";
import { decodeMusicPcm } from "../src/session/music-generation.js";

function ramp(frames: number): Float32Array {
  const samples = new Float32Array(frames * 2);
  for (let index = 0; index < samples.length; index += 1) {
    // Values past full scale too: float holds them without clipping.
    samples[index] = Math.sin(index * 0.001) * 1.5 + (index % 2 ? 1e-7 : -1e-7);
  }
  return samples;
}

function sameBits(a: Float32Array, b: Float32Array): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

describe("float WAV", () => {
  it("round-trips samples bit for bit through the writer and the reader", () => {
    const samples = ramp(4801);
    const bytes = encodeFloatWav(samples, 48000, 2);
    expect(readWavInfo(bytes)).toMatchObject({
      format: 3,
      channels: 2,
      sampleRate: 48000,
      bitsPerSample: 32,
      dataBytes: samples.length * 4
    });
    expect(sameBits(readFloatWav(bytes, 48000, 2)!, samples)).toBe(true);
  });

  it("reads the samples of a Node Buffer, not the bytes before them", () => {
    // Asset storage hands back a Buffer, and Buffer#slice is a view, not a
    // copy. A take read from storage must not start with its own header, nor
    // with whatever else shares the Buffer's memory.
    const samples = ramp(4801);
    const encoded = encodeFloatWav(samples, 48000, 2);
    const pool = Buffer.alloc(encoded.length + 13, 0x5a);
    pool.set(encoded, 13);
    const stored = pool.subarray(13);
    expect(stored.byteOffset).toBe(13);
    expect(sameBits(readFloatWav(stored, 48000, 2)!, samples)).toBe(true);
    expect(sameBits(readFloatWav(Buffer.from(encoded), 48000, 2)!, samples)).toBe(true);
  });

  it("reads nothing directly from another format, rate or layout", () => {
    const pcm16 = encodeWav(new Float32Array(200), 48000, 2);
    expect(readWavInfo(pcm16)?.format).toBe(1);
    expect(readFloatWav(pcm16, 48000, 2)).toBeNull();
    expect(readFloatWav(encodeFloatWav(new Float32Array(200), 44100, 2), 48000, 2)).toBeNull();
    expect(readFloatWav(encodeFloatWav(new Float32Array(200), 48000, 1), 48000, 2)).toBeNull();
    expect(readWavInfo(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("is read by libav at 48 kHz without changing a sample", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "float-wav-"));
    try {
      const samples = ramp(48000);
      const file = path.join(dir, "take.wav");
      await fs.writeFile(file, encodeFloatWav(samples, 48000, 2));
      const probe = await probeMedia(file);
      expect(probe.audio).toMatchObject({ sampleRate: 48000, channels: 2 });
      const pcm = await decodeAudioToPcm(file, { sampleRate: 48000, channels: 2 });
      expect(sameBits(pcm.samples, samples)).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("decodeMusicPcm", () => {
  it("reads a 48 kHz stereo float WAV without libav and without resampling", async () => {
    const samples = ramp(1000);
    const decoded = await decodeMusicPcm(encodeFloatWav(samples, 48000, 2));
    expect(decoded.resampled).toBe(false);
    expect(sameBits(decoded.samples, samples)).toBe(true);
  });

  it("resamples another rate and layout to 48 kHz stereo once", async () => {
    const mono = new Float32Array(44100).map((_, index) => 0.5 * Math.sin(index * 0.05));
    const decoded = await decodeMusicPcm(encodeWav(mono, 44100, 1));
    expect(decoded.resampled).toBe(true);
    expect(Math.abs(decoded.samples.length / 2 - 48000)).toBeLessThanOrEqual(1);
  });

  it("decodes a 16-bit WAV already at 48 kHz stereo with no resample flag", async () => {
    const decoded = await decodeMusicPcm(encodeWav(new Float32Array(9600).fill(0.25), 48000, 2));
    expect(decoded.resampled).toBe(false);
    expect(decoded.samples.length).toBe(9600);
    expect(decoded.samples[100]).toBeCloseTo(0.25, 4);
  });
});
