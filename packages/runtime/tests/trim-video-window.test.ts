/**
 * `trimVideoWindow` against real media: every caller mocks it, so this is the
 * only check that the window it returns is the one asked for.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { trimVideoWindow } from "../src/trim-video-window.js";
import {
  encodeWav,
  inspectMedia,
  meanRgba,
  readPcm,
  readRgbaFrames,
  rmsBetween,
  sineSamples,
  solidRgba,
  writeRgbaVideo
} from "../src/media/testing.js";
import { muxAudioWithVideoCopy, openFilterComplex } from "../src/media/index.js";

const FPS = 10;
const FRAMES = 30;
const SIZE = 32;
let dir: string;
let source: Uint8Array;

/** Frame `i` is gray level `i * 8`, so a frame names its own source index. */
const grayOf = (index: number): number => index * 8;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-trim-window-"));
  const video = path.join(dir, "video.mp4");
  await writeRgbaVideo({
    outPath: video,
    width: SIZE,
    height: SIZE,
    fps: FPS,
    frames: FRAMES,
    frameAt: (index) => solidRgba(SIZE, SIZE, [grayOf(index), grayOf(index), grayOf(index), 255]),
    spec: {
      codec: "libx264",
      pixelFormat: "yuv420p",
      options: { preset: "veryfast", qp: "0", g: "10" }
    }
  });
  // A tone that is silent before 1 s and loud after it.
  const tone = sineSamples({ sampleRate: 48000, channels: 1, durationSec: 3, frequency: 440 });
  tone.fill(0, 0, 48000);
  const wav = path.join(dir, "tone.wav");
  await fs.writeFile(wav, encodeWav(tone, 48000, 1));
  const audio = await openFilterComplex({
    inputs: [{ filePath: wav, kind: "audio", label: "0:a" }],
    graph: "[0:a]anull[out]",
    output: "out",
    outputKind: "audio"
  });
  const muxed = path.join(dir, "source.mp4");
  try {
    await muxAudioWithVideoCopy({
      videoPath: video,
      audio: audio.frames(),
      outPath: muxed,
      codec: "aac",
      sampleRate: 48000
    });
  } finally {
    await audio.close();
  }
  source = new Uint8Array(await fs.readFile(muxed));
});

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

describe("trimVideoWindow", () => {
  it("returns the requested window as an MP4 that starts at zero", async () => {
    const window = await trimVideoWindow(source, 500, 1500);
    const out = path.join(dir, "window.mp4");
    await fs.writeFile(out, window);

    const report = await inspectMedia(out);
    expect(report.video?.codec).toBe("avc");
    expect(report.audio?.codec).toBe("aac");
    expect(report.frameTimes[0]).toBeCloseTo(0, 2);
    expect(report.frameTimes).toHaveLength(10);
    expect(report.durationSec).toBeGreaterThan(0.95);
    expect(report.durationSec).toBeLessThan(1.1);

    const frames = await readRgbaFrames(out, { width: SIZE, height: SIZE });
    // The first frame is source frame 5, the last source frame 14.
    expect(meanRgba(frames[0]!)[0]).toBeCloseTo(grayOf(5), -1);
    expect(meanRgba(frames.at(-1)!)[0]).toBeCloseTo(grayOf(14), -1);

    // The tone starts at source 1 s, which is window 0.5 s.
    const pcm = await readPcm(out, { sampleRate: 48000, channels: 1 });
    expect(rmsBetween(pcm, 0.05, 0.4)).toBeLessThan(0.01);
    expect(rmsBetween(pcm, 0.6, 0.95)).toBeGreaterThan(0.25);
  });

  it("refuses an empty or inverted window", async () => {
    await expect(trimVideoWindow(source, 1000, 1000)).rejects.toThrow(/positive finite range/);
    await expect(trimVideoWindow(new Uint8Array(), 0, 1000)).rejects.toThrow(
      /positive finite range/
    );
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(trimVideoWindow(source, 0, 1000, controller.signal)).rejects.toThrow();
  });
});
