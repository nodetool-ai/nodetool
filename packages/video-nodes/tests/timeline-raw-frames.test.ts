/**
 * The compositor's decode and encode ends on real media: frames come out of
 * a clip in order and at the size asked for, skipped indices are dropped
 * rather than shifting later frames, the last frame is held past the end,
 * and the encoder writes every frame with the arguments `outputFormats.ts`
 * chose.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  inspectMedia,
  meanRgba,
  readRgbaFrames,
  solidRgba,
  writeRgbaVideo
} from "@nodetool-ai/runtime/media/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  defaultEncoderArgs,
  encoderSpecFromArgs,
  fitWithin,
  openFrameEncoder,
  openVideoFrameStream
} from "../src/nodes/timeline/rawFrames.js";
import { resolveTimelineOutput } from "../src/nodes/timeline/outputFormats.js";

const SIZE = { width: 8, height: 6 };
const FPS = 10;
let dir = "";
let clip = "";

/** Frame `i` of the fixture is gray level `i * 20`. */
const grayAt = (index: number): number => index * 20;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-raw-frames-"));
  clip = path.join(dir, "gray.mkv");
  await writeRgbaVideo({
    outPath: clip,
    ...SIZE,
    fps: FPS,
    frames: 5,
    frameAt: (index) => solidRgba(SIZE.width, SIZE.height, [grayAt(index), grayAt(index), grayAt(index), 255])
  });
});

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

function stream(startSec = 0) {
  return openVideoFrameStream({ filePath: clip, size: SIZE, fps: FPS, startSec, speed: 1 });
}

const gray = (frame: Uint8Array | null): number => (frame ? meanRgba(frame)[0] : -1);

describe("fitWithin", () => {
  it("shrinks a source to fit the frame, keeping its aspect", () => {
    expect(fitWithin({ width: 3840, height: 2160 }, { width: 1920, height: 1080 })).toEqual({
      width: 1920,
      height: 1080
    });
    expect(fitWithin({ width: 1000, height: 1000 }, { width: 1920, height: 1080 })).toEqual({
      width: 1000,
      height: 1000
    });
  });

  it("never upscales — a small source stays its own size", () => {
    expect(fitWithin({ width: 320, height: 240 }, { width: 1920, height: 1080 })).toEqual({
      width: 320,
      height: 240
    });
  });
});

describe("openVideoFrameStream", () => {
  it("hands out each frame in order at the requested size", async () => {
    const frames = stream();
    try {
      for (let index = 0; index < 5; index++) {
        const frame = await frames.frameAt(index);
        expect(frame).toHaveLength(SIZE.width * SIZE.height * 4);
        expect(gray(frame)).toBe(grayAt(index));
      }
    } finally {
      frames.close();
    }
  });

  it("drops the frames of a skipped index instead of desyncing", async () => {
    const frames = stream();
    try {
      // Frames 0 and 1 are never asked for (the layer was skipped).
      expect(gray(await frames.frameAt(2))).toBe(grayAt(2));
      expect(gray(await frames.frameAt(3))).toBe(grayAt(3));
    } finally {
      frames.close();
    }
  });

  it("holds the last frame once the source runs out", async () => {
    const frames = stream();
    try {
      expect(gray(await frames.frameAt(4))).toBe(grayAt(4));
      expect(gray(await frames.frameAt(9))).toBe(grayAt(4));
    } finally {
      frames.close();
    }
  });

  it("starts at the in point", async () => {
    const frames = stream(0.2);
    try {
      expect(gray(await frames.frameAt(0))).toBe(grayAt(2));
    } finally {
      frames.close();
    }
  });

  it("reports a file it cannot decode", async () => {
    const broken = path.join(dir, "broken.mp4");
    await fs.writeFile(broken, "not a video");
    const frames = openVideoFrameStream({
      filePath: broken,
      size: SIZE,
      fps: FPS,
      startSec: 0,
      speed: 1
    });
    await expect(frames.frameAt(0)).rejects.toThrow();
    frames.close();
  });
});

describe("encoderSpecFromArgs", () => {
  it("defaults to H.264 at yuv420p, converted to BT.709 and tagged", () => {
    expect(encoderSpecFromArgs(defaultEncoderArgs())).toEqual({
      codec: "libx264",
      pixelFormat: "yuv420p",
      filter: "scale=out_color_matrix=bt709:out_range=tv",
      options: {
        preset: "veryfast",
        colorspace: "bt709",
        color_primaries: "bt709",
        color_trc: "bt709"
      }
    });
  });

  it("reads the alpha-carrying ProRes arguments", () => {
    const spec = encoderSpecFromArgs(
      resolveTimelineOutput({ format: "mov", alpha: true, bitrate: 5_000_000 }).encoderArgs
    );
    expect(spec).toMatchObject({
      codec: "prores_ks",
      pixelFormat: "yuva444p10le",
      options: { profile: "4444", b: "5000000" }
    });
  });
});

describe("openFrameEncoder", () => {
  it("writes each composited frame and finalizes the file", async () => {
    const outPath = path.join(dir, "out.mp4");
    const encoder = openFrameEncoder({ outPath, ...SIZE, fps: FPS });
    for (let index = 0; index < 5; index++) {
      await encoder.write(solidRgba(SIZE.width, SIZE.height, [grayAt(index), grayAt(index), grayAt(index), 255]));
    }
    await encoder.finish();
    const report = await inspectMedia(outPath);
    expect(report.video).toMatchObject({ codec: "avc", ...SIZE });
    expect(report.frameTimes).toHaveLength(5);
    const frames = await readRgbaFrames(outPath, SIZE);
    expect(frames.map((frame) => Math.round(gray(frame) / 20))).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps alpha through VP9 at yuva420p", async () => {
    const outPath = path.join(dir, "alpha.webm");
    const encoder = openFrameEncoder({
      outPath,
      width: 16,
      height: 16,
      fps: FPS,
      encoderArgs: resolveTimelineOutput({ format: "webm", alpha: true }).encoderArgs
    });
    await encoder.write(solidRgba(16, 16, [255, 255, 255, 0]));
    await encoder.finish();
    const report = await inspectMedia(outPath);
    expect(report.video?.codec).toBe("vp9");
  });

  it("fails when the encoder cannot be opened", async () => {
    const encoder = openFrameEncoder({
      outPath: path.join(dir, "bad.mp4"),
      ...SIZE,
      fps: FPS,
      encoderArgs: ["-c:v", "no_such_encoder", "-pix_fmt", "yuv420p"]
    });
    await expect(encoder.write(solidRgba(SIZE.width, SIZE.height, [0, 0, 0, 255]))).rejects.toThrow(
      /no_such_encoder/
    );
    encoder.abort();
  });

  it("refuses writes after an abort", async () => {
    const encoder = openFrameEncoder({ outPath: path.join(dir, "aborted.mp4"), ...SIZE, fps: FPS });
    await encoder.write(solidRgba(SIZE.width, SIZE.height, [0, 0, 0, 255]));
    encoder.abort();
    await expect(encoder.write(solidRgba(SIZE.width, SIZE.height, [0, 0, 0, 255]))).rejects.toThrow(
      /aborted/
    );
  });
});
