/**
 * The bake's mux on real frames: PNGs in, a seekable video out, with the
 * alpha plane kept for the transparent format.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  inspectMedia,
  meanRgba,
  readRgbaFrames,
  solidRgba,
  videoPacketInfo,
  writeRgbaVideo
} from "@nodetool-ai/runtime/media/testing";
import { pngFrames } from "@nodetool-ai/runtime/media";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bakeVideoFormat, muxPngSequenceToVideo } from "../src/bake.js";
import { blenderTestContext, type BlenderTestContext } from "./context.js";

let dir = "";
let helper: BlenderTestContext;

/** PNG frames of one gray level each, cut from a lossless clip by libav. */
async function grayPngs(levels: number[], alpha: number): Promise<Uint8Array[]> {
  const file = path.join(dir, `levels-${alpha}.mkv`);
  await writeRgbaVideo({
    outPath: file,
    width: 32,
    height: 24,
    fps: 1,
    frames: levels.length,
    frameAt: (i) => solidRgba(32, 24, [levels[i]!, levels[i]!, levels[i]!, alpha])
  });
  const frames: Uint8Array[] = [];
  for await (const png of pngFrames({ filePath: file, alpha: true })) frames.push(png);
  return frames;
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-bake-mux-"));
  helper = blenderTestContext();
});

afterAll(async () => {
  await helper.cleanup();
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

describe("muxPngSequenceToVideo", () => {
  it("writes an opaque bake as H.264 with a keyframe every second", async () => {
    const levels = Array.from({ length: 30 }, (_, i) => 20 + i * 6);
    const bytes = await muxPngSequenceToVideo(
      helper.context,
      await grayPngs(levels, 255),
      10,
      bakeVideoFormat(false),
      { timeoutMs: 60_000 }
    );
    const file = path.join(dir, "bake.mp4");
    await fs.writeFile(file, bytes);
    const report = await inspectMedia(file);
    expect(report.video).toMatchObject({ codec: "avc", width: 32, height: 24 });
    expect(report.frameTimes).toHaveLength(30);
    const keyframes = (await videoPacketInfo(file)).filter((packet) => packet.key).map((p) => p.pts);
    // x264 may cut a keyframe early, never late.
    expect(keyframes[0]).toBe(0);
    const gaps = keyframes.slice(1).map((t, i) => t - keyframes[i]!);
    expect(Math.max(...gaps, 2.9 - keyframes.at(-1)!)).toBeLessThanOrEqual(1);
    const read = (await readRgbaFrames(file, { width: 32, height: 24 })).map((rgba) =>
      Math.round(meanRgba(rgba)[0])
    );
    read.forEach((level, i) => expect(Math.abs(level - levels[i]!)).toBeLessThanOrEqual(4));
  });

  it("keeps the alpha plane in a transparent bake", async () => {
    const bytes = await muxPngSequenceToVideo(
      helper.context,
      await grayPngs([100, 150], 128),
      2,
      bakeVideoFormat(true),
      { timeoutMs: 60_000 }
    );
    const file = path.join(dir, "bake.webm");
    await fs.writeFile(file, bytes);
    const report = await inspectMedia(file);
    expect(report.video).toMatchObject({ codec: "vp9", alpha: true });
    expect(report.frameTimes).toHaveLength(2);
  });
});
