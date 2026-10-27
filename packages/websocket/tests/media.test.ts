/**
 * The WAV the extract-audio route stores, on real files.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  generateMedia,
  inspectMedia,
  readPcm,
  rmsBetween
} from "@nodetool-ai/runtime/media/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { extractAudio } from "../src/lib/media.js";

let dir: string;
let withAudio: string;
let silent: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-ws-media-"));
  withAudio = path.join(dir, "with-audio.mp4");
  silent = path.join(dir, "silent.mp4");
  await generateMedia({
    outPath: withAudio,
    video: { source: "testsrc=size=32x32:rate=10:duration=2" },
    audio: { source: "sine=frequency=440:sample_rate=44100:duration=2" }
  });
  await generateMedia({
    outPath: silent,
    video: { source: "testsrc=size=32x32:rate=10:duration=1.5" }
  });
});

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

describe("extractAudio", () => {
  it("writes 16-bit WAV at the source rate and returns its length", async () => {
    const wav = path.join(dir, "audio.wav");
    const { durationMs } = await extractAudio(withAudio, wav);
    const bytes = await fs.readFile(wav);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    // fmt chunk: PCM (1), 16 bits per sample.
    expect(bytes.readUInt16LE(20)).toBe(1);
    expect(bytes.readUInt16LE(34)).toBe(16);
    const report = await inspectMedia(wav);
    expect(report.audio).toMatchObject({ sampleRate: 44100, channels: 1 });
    expect(Math.abs((durationMs ?? 0) - 2000)).toBeLessThanOrEqual(60);
    const pcm = await readPcm(wav, { sampleRate: 44100 });
    // lavfi's sine plays at 1/8 of full scale: RMS 0.088.
    expect(rmsBetween(pcm, 0.2, 1.8)).toBeGreaterThan(0.05);
  });

  it("fails on a file with no audio", async () => {
    await expect(extractAudio(silent, path.join(dir, "none.wav"))).rejects.toThrow();
  });
});
