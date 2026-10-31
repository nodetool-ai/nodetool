/**
 * decodeAudioToWav on a format WebAudio cannot read: the WebM/Opus a browser
 * MediaRecorder writes. The fallback decodes it at its own rate and layout.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { generateMedia } from "@nodetool-ai/runtime/media/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { decodeAudioToWav } from "../src/lib/audio-wav.js";

let dir = "";

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-audio-libav-"));
});

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

describe("decodeAudioToWav fallback", () => {
  it("decodes stereo WebM/Opus at the source rate without a downmix", async () => {
    const file = path.join(dir, "tone.webm");
    await generateMedia({
      outPath: file,
      audio: {
        source: "aevalsrc=0.125*sin(2*PI*440*t)|0.125*sin(2*PI*660*t):s=48000:d=1",
        codec: "libopus"
      }
    });
    const wav = await decodeAudioToWav(new Uint8Array(await fs.readFile(file)));
    expect(wav.sampleRate).toBe(48000);
    expect(wav.numChannels).toBe(2);
    const frames = wav.samples.length / 2;
    expect(Math.abs(frames - 48000)).toBeLessThan(2000);
    let sum = 0;
    for (let i = 20000; i < 60000; i++) sum += wav.samples[i]! ** 2;
    // lavfi's sine is 1/8 full scale: RMS 0.088.
    expect(Math.sqrt(sum / 40000)).toBeGreaterThan(0.07);
  });

  it("refuses bytes that are no audio", async () => {
    await expect(decodeAudioToWav(new Uint8Array(4096).fill(3))).rejects.toThrow(
      /Could not decode audio/
    );
  });
});
