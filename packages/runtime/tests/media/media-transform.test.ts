/**
 * transformMedia, concatCopy and pngFrames against generated media. Nothing
 * here runs the ffmpeg or ffprobe binaries.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { concatCopy, openVideoFrameEncoder, pngFrames, transformMedia } from "../../src/media/index.js";
import {
  generateMedia,
  inspectMedia,
  meanRgba,
  readPcm,
  readRgbaFrames,
  rmsBetween,
  solidRgba,
  writeRgbaVideo
} from "../../src/media/testing.js";

let dir: string;
const file = (name: string): string => path.join(dir, name);

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-media-transform-"));
  await generateMedia({
    outPath: file("av.mp4"),
    video: { source: "testsrc2=size=96x64:rate=24:duration=2", options: { g: "12", bf: "2" } },
    audio: { source: "sine=frequency=440:sample_rate=48000:duration=2" }
  });
  await generateMedia({
    outPath: file("silent.mp4"),
    video: { source: "color=c=red:size=96x64:rate=24:duration=1" }
  });
  await generateMedia({
    outPath: file("long-audio.m4a"),
    audio: { source: "sine=frequency=220:sample_rate=48000:duration=5" }
  });
  // Gray level k*20 on frame k: frame identity survives the trip.
  await writeRgbaVideo({
    outPath: file("gray.mkv"),
    width: 32,
    height: 24,
    fps: 10,
    frames: 10,
    frameAt: (k) => solidRgba(32, 24, [k * 20, k * 20, k * 20, 255])
  });
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("transformMedia", () => {
  it("filters the video and copies the audio, as -vf with -c:a copy", async () => {
    await transformMedia({
      inputs: [{ filePath: file("av.mp4") }],
      outPath: file("scaled.mp4"),
      video: { filter: "scale=48:32" },
      audio: { copy: 0 }
    });
    const report = await inspectMedia(file("scaled.mp4"));
    expect(report.video).toMatchObject({ codec: "avc", width: 48, height: 32 });
    expect(report.audio).toMatchObject({ codec: "aac", sampleRate: 48000 });
    expect(report.frameTimes).toHaveLength(48);
    expect(report.durationSec).toBeCloseTo(2, 1);
  });

  it("runs a two-input graph for each stream, as -filter_complex with -map", async () => {
    await transformMedia({
      inputs: [{ filePath: file("av.mp4") }, { filePath: file("silent.mp4") }],
      outPath: file("overlay.mp4"),
      video: { graph: "[1:v]scale=24:16[ov];[0:v][ov]overlay=0:0[outv]", output: "outv" },
      audio: { filter: "volume=0.5" }
    });
    const frames = await readRgbaFrames(file("overlay.mp4"), { width: 96, height: 64 });
    expect(frames).toHaveLength(48);
    // The top-left corner is the red overlay.
    const corner = await readRgbaFrames(file("overlay.mp4"), { width: 96, height: 64 });
    const pixel = corner[0]!.subarray(0, 4);
    expect(pixel[0]).toBeGreaterThan(200);
    expect(pixel[1]).toBeLessThan(60);
    const audio = await readPcm(file("overlay.mp4"), { sampleRate: 48000, channels: 1 });
    const source = await readPcm(file("av.mp4"), { sampleRate: 48000, channels: 1 });
    expect(rmsBetween(audio, 0.5, 1.5) / rmsBetween(source, 0.5, 1.5)).toBeCloseTo(0.5, 1);
  });

  it("ends a one-frame input in a graph without ending the graph", async () => {
    await writeRgbaVideo({
      outPath: file("one-frame.mkv"),
      width: 24,
      height: 16,
      fps: 24,
      frames: 1,
      frameAt: () => solidRgba(24, 16, [255, 0, 0, 255])
    });
    await transformMedia({
      inputs: [{ filePath: file("av.mp4") }, { filePath: file("one-frame.mkv") }],
      outPath: file("overlay-still.mp4"),
      video: { graph: "[0:v][1:v]overlay=0:0[outv]", output: "outv" },
      audio: null
    });
    // overlay repeats the last frame of an ended input: every main frame survives.
    expect((await inspectMedia(file("overlay-still.mp4"))).frameTimes).toHaveLength(48);
  });

  it("throws when a graph names a stream an input lacks", async () => {
    await expect(
      transformMedia({
        inputs: [{ filePath: file("av.mp4") }, { filePath: file("silent.mp4") }],
        outPath: file("missing.mp4"),
        video: null,
        audio: { graph: "[0:a][1:a]amix=inputs=2[a]", output: "a" }
      })
    ).rejects.toThrow(/has no audio stream/);
  });

  it("leaves out a missing optional stream", async () => {
    await transformMedia({
      inputs: [{ filePath: file("silent.mp4") }],
      outPath: file("optional.mp4"),
      video: { filter: "hflip" },
      audio: { copy: 0, optional: true }
    });
    const report = await inspectMedia(file("optional.mp4"));
    expect(report.video).not.toBeNull();
    expect(report.audio).toBeNull();
  });

  it("ends an endless padded track with the picture, as apad with -shortest", async () => {
    await transformMedia({
      inputs: [{ filePath: file("silent.mp4") }, { filePath: file("long-audio.m4a") }],
      outPath: file("shortest.mp4"),
      video: { copy: 0 },
      audio: { graph: "[1:a]volume=1,apad[a]", output: "a" },
      shortest: true
    });
    const report = await inspectMedia(file("shortest.mp4"));
    expect(report.durationSec).toBeGreaterThan(0.95);
    expect(report.durationSec).toBeLessThan(1.1);
    expect(report.audio).not.toBeNull();
  });

  it("copies from the keyframe at or before the seek, up to -to", async () => {
    // Keyframes every 12 frames (0.5 s): a seek to 0.7 s starts at 0.5 s.
    await transformMedia({
      inputs: [{ filePath: file("av.mp4"), seekSec: 0.7, toSec: 1.5 }],
      outPath: file("copy-trim.mp4"),
      video: { copy: 0 },
      audio: { copy: 0, optional: true }
    });
    const report = await inspectMedia(file("copy-trim.mp4"));
    expect(report.frameTimes[0]).toBeCloseTo(0, 3);
    expect(report.frameTimes).toHaveLength(24);
    expect(report.audio).not.toBeNull();
  });

  it("cuts exactly when filtering a seeked input", async () => {
    await transformMedia({
      inputs: [{ filePath: file("gray.mkv"), seekSec: 0.3, toSec: 0.6 }],
      outPath: file("exact.mkv"),
      video: { filter: "null" },
      audio: null,
      videoEncoder: { codec: "ffv1", pixelFormat: "bgr0" }
    });
    const frames = await readRgbaFrames(file("exact.mkv"), { width: 32, height: 24 });
    expect(frames.map((rgba) => Math.round(meanRgba(rgba)[0]))).toEqual([60, 80, 100]);
  });
});

describe("concurrent encodes", () => {
  it("finish when there are more of them than libuv pool threads", async () => {
    // Each muxer's native write holds a pool thread while its JS callback
    // runs. With async fs calls in the callback, as many muxers as the pool
    // has threads (4 by default) waited on each other forever.
    const outputs = Array.from({ length: 6 }, (_, i) => file(`concurrent-${i}.mp4`));
    await Promise.all(
      outputs.map((outPath) =>
        transformMedia({
          inputs: [{ filePath: file("av.mp4") }],
          outPath,
          video: { filter: "scale=48:32" },
          audio: { filter: "volume=0.5" }
        })
      )
    );
    for (const outPath of outputs) {
      expect((await inspectMedia(outPath)).frameTimes).toHaveLength(48);
    }
  }, 60_000);
});

describe("concatCopy", () => {
  it("joins matching files end to end without re-encoding", async () => {
    await concatCopy({
      inputPaths: [file("av.mp4"), file("av.mp4")],
      outPath: file("joined.mp4")
    });
    const report = await inspectMedia(file("joined.mp4"));
    expect(report.frameTimes).toHaveLength(96);
    expect(report.durationSec).toBeCloseTo(4, 1);
    const gaps = report.frameTimes.slice(1).map((t, i) => t - report.frameTimes[i]!);
    expect(Math.max(...gaps)).toBeLessThan(0.05);
  });
});

describe("pngFrames", () => {
  it("encodes the frames a select filter passes as PNG files", async () => {
    const pngs: Uint8Array[] = [];
    for await (const png of pngFrames({
      filePath: file("gray.mkv"),
      filter: "select='between(n,2,4)'"
    })) {
      pngs.push(png);
    }
    expect(pngs).toHaveLength(3);
    const levels = await Promise.all(
      pngs.map(async (png) => {
        const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
        expect(info).toMatchObject({ width: 32, height: 24, channels: 3 });
        return data[0];
      })
    );
    expect(levels).toEqual([40, 60, 80]);
  });

  it("starts at the frame shown at the seek time", async () => {
    const pngs: Uint8Array[] = [];
    for await (const png of pngFrames({ filePath: file("gray.mkv"), seekSec: 0.5, limit: 1 })) {
      pngs.push(png);
    }
    expect(pngs).toHaveLength(1);
    const { data } = await sharp(pngs[0]!).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBe(100);
  });
});

describe("openVideoFrameEncoder with image input", () => {
  it("decodes every PNG on its own", async () => {
    // One libav PNG decoder context carries the previous image's last row into
    // the next image's first row, which added each frame onto the last
    // (0, 50, 150, 44 for these four).
    const pngs = await Promise.all(
      [0, 1, 2, 3].map((k) =>
        sharp(Buffer.from(solidRgba(32, 24, [k * 50, k * 50, k * 50, 255])), {
          raw: { width: 32, height: 24, channels: 4 }
        })
          .png()
          .toBuffer()
      )
    );
    const encoder = await openVideoFrameEncoder({
      outPath: file("png-seq.mkv"),
      fps: 4,
      input: "png",
      spec: { codec: "ffv1", pixelFormat: "bgra" }
    });
    for (const png of pngs) await encoder.write(new Uint8Array(png));
    await encoder.finish();
    const frames = await readRgbaFrames(file("png-seq.mkv"), { width: 32, height: 24 });
    expect(frames.map((rgba) => Math.round(meanRgba(rgba)[0]))).toEqual([0, 50, 100, 150]);
  });

  it("takes JPEG and WebP files too", async () => {
    const raw = { raw: { width: 32, height: 24, channels: 4 as const } };
    const images = [
      await sharp(Buffer.from(solidRgba(32, 24, [200, 200, 200, 255])), raw).jpeg().toBuffer(),
      await sharp(Buffer.from(solidRgba(32, 24, [100, 100, 100, 255])), raw).webp({ lossless: true }).toBuffer()
    ];
    const encoder = await openVideoFrameEncoder({
      outPath: file("mixed-images.mkv"),
      fps: 2,
      input: "png",
      spec: { codec: "ffv1", pixelFormat: "bgra" }
    });
    for (const image of images) await encoder.write(new Uint8Array(image));
    await encoder.finish();
    const frames = await readRgbaFrames(file("mixed-images.mkv"), { width: 32, height: 24 });
    const levels = frames.map((rgba) => Math.round(meanRgba(rgba)[0]));
    expect(Math.abs(levels[0]! - 200)).toBeLessThanOrEqual(3);
    expect(levels[1]).toBe(100);
  });
});
