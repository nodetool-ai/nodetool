import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { openFrameEncoder, openSourceFrameStream, openVideoFrameStream } from "../src/nodes/timeline/rawFrames.js";

const WIDTH = 320;
const HEIGHT = 180;
const FPS = 30;
const FRAMES = 60;
const grayOf = (index: number): number => 24 + index * 3;
let directory = "";
let clipPath = "";
let losslessClipPath = "";
let mismatchedClipPath = "";

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-reverse-window-"));
  clipPath = path.join(directory, "gop.mp4");
  const encoder = openFrameEncoder({
    outPath: clipPath,
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    encoderArgs: ["-c:v", "libx264", "-preset", "ultrafast", "-g", "15", "-pix_fmt", "yuv420p"]
  });
  const frame = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let index = 0; index < FRAMES; index++) {
    const gray = grayOf(index);
    for (let i = 0; i < frame.length; i += 4) frame.set([gray, gray, gray, 255], i);
    await encoder.write(frame);
  }
  await encoder.finish();

  losslessClipPath = path.join(directory, "fractional.mkv");
  const losslessEncoder = openFrameEncoder({
    outPath: losslessClipPath,
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    encoderArgs: ["-c:v", "ffv1", "-level", "3", "-pix_fmt", "bgra"]
  });
  for (let index = 0; index < FRAMES; index++) {
    const gray = index * 4;
    for (let i = 0; i < frame.length; i += 4) frame.set([gray, gray, gray, 255], i);
    await losslessEncoder.write(frame);
  }
  await losslessEncoder.finish();

  mismatchedClipPath = path.join(directory, "source-24fps.mkv");
  const mismatchedEncoder = openFrameEncoder({
    outPath: mismatchedClipPath,
    width: WIDTH,
    height: HEIGHT,
    fps: 24,
    encoderArgs: ["-c:v", "ffv1", "-level", "3", "-pix_fmt", "bgra"]
  });
  for (let index = 0; index < 48; index++) {
    const gray = index * 4;
    for (let i = 0; i < frame.length; i += 4) frame.set([gray, gray, gray, 255], i);
    await mismatchedEncoder.write(frame);
  }
  await mismatchedEncoder.finish();
}, 60_000);

afterAll(async () => {
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

describe("reverse source windows", () => {
  it("returns every descending H.264 frame with bounded decoder reopens", async () => {
    const stream = openSourceFrameStream({
      filePath: clipPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: FPS,
      startSec: (FRAMES - 1) / FPS
    });
    const started = performance.now();
    let peakRss = process.memoryUsage().rss;
    let peakWindowBytes = 0;
    try {
      for (let index = FRAMES - 1; index >= 0; index--) {
        const pixels = await stream.frameAtSourceSec(index / FPS);
        expect(pixels).not.toBeNull();
        const center = ((HEIGHT / 2) * WIDTH + WIDTH / 2) * 4;
        expect(Math.abs(pixels![center]! - grayOf(index))).toBeLessThanOrEqual(2);
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
        peakWindowBytes = Math.max(peakWindowBytes, stream.reverseWindowBytes);
      }
      if (process.env.S8_BENCH === "1") {
        process.stdout.write(JSON.stringify({
          frames: FRAMES,
          elapsedMs: Math.round(performance.now() - started),
          reopens: stream.reopens,
          peakWindowBytes,
          peakRssBytes: peakRss
        }) + "\n");
      }
      expect(stream.reopens).toBeLessThan(10);
    } finally {
      stream.close();
    }
  }, 120_000);

  it("respects the byte cap across many reverse windows", async () => {
    const frameBytes = WIDTH * HEIGHT * 4;
    const stream = openSourceFrameStream({
      filePath: clipPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: FPS,
      startSec: (FRAMES - 1) / FPS,
      maxWindowBytes: frameBytes * 3,
      maxWindowMs: 2000
    });
    try {
      for (let index = FRAMES - 1; index >= 0; index--) {
        const pixels = await stream.frameAtSourceSec(index / FPS);
        const center = ((HEIGHT / 2) * WIDTH + WIDTH / 2) * 4;
        expect(Math.abs(pixels![center]! - grayOf(index))).toBeLessThanOrEqual(2);
        expect(stream.reverseWindowBytes).toBeLessThanOrEqual(frameBytes * 3);
      }
      expect(stream.reopens).toBeLessThan(FRAMES / 2);
    } finally {
      stream.close();
    }
    expect(stream.reverseWindowBytes).toBe(0);
  }, 120_000);

  it("respects the duration cap and stops a pending window on close", async () => {
    const frameBytes = WIDTH * HEIGHT * 4;
    const stream = openSourceFrameStream({
      filePath: clipPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: FPS,
      startSec: (FRAMES - 1) / FPS,
      maxWindowBytes: frameBytes * 20,
      maxWindowMs: 40
    });
    try {
      await stream.frameAtSourceSec((FRAMES - 1) / FPS);
      await stream.frameAtSourceSec((FRAMES - 2) / FPS);
      expect(stream.reverseWindowBytes).toBeLessThanOrEqual(frameBytes * 2);
      const pending = stream.frameAtSourceSec((FRAMES - 4) / FPS);
      stream.close();
      expect(await pending).toBeNull();
      expect(stream.reverseWindowBytes).toBe(0);
      expect(await stream.frameAtSourceSec(0)).toBeNull();
    } finally {
      stream.close();
    }
  }, 60_000);

  it("stops a pending frame request while probing source timestamps", async () => {
    const stream = openSourceFrameStream({
      filePath: clipPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: FPS,
      startSec: 1
    });
    const pending = stream.frameAtSourceSec(1);
    stream.close();
    expect(await pending).toBeNull();
    expect(stream.reverseWindowBytes).toBe(0);
  }, 60_000);

  it("matches a fresh seek across reverse, hold, and forward requests", async () => {
    const times = [1.9, 1.8, 1.8, 1.7, 1.75, 1.6, 1.9];
    const stream = openSourceFrameStream({
      filePath: clipPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: FPS,
      startSec: times[0]!
    });
    try {
      for (const time of times) {
        const reference = openSourceFrameStream({
          filePath: clipPath,
          size: { width: WIDTH, height: HEIGHT },
          fps: FPS,
          startSec: time
        });
        try {
          const actual = await stream.frameAtSourceSec(time);
          const expected = await reference.frameAtSourceSec(time);
          const center = ((HEIGHT / 2) * WIDTH + WIDTH / 2) * 4;
          expect(actual![center]).toBe(expected![center]);
        } finally {
          reference.close();
        }
      }
    } finally {
      stream.close();
    }
  }, 60_000);

  it("matches fresh seeks at fractional descending source times", async () => {
    const times = [1.93, 1.87, 1.813, 1.75, 1.69, 1.63, 1.57, 1.51, 1.45, 1.39, 1.33, 1.27, 1.21];
    const stream = openSourceFrameStream({
      filePath: losslessClipPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: FPS,
      startSec: times[0]!
    });
    const center = ((HEIGHT / 2) * WIDTH + WIDTH / 2) * 4;
    const observed: Array<{ time: number; gray: number }> = [];
    try {
      for (const time of times) {
        const fresh = openVideoFrameStream({
          filePath: losslessClipPath,
          size: { width: WIDTH, height: HEIGHT },
          fps: FPS,
          startSec: time,
          speed: 1
        });
        try {
          const actual = await stream.frameAtSourceSec(time);
          const expected = await fresh.frameAt(0);
          expect(actual?.[center], `source time ${time}s`).toBe(expected?.[center]);
          observed.push({ time, gray: actual?.[center] ?? -1 });
        } finally {
          fresh.close();
        }
      }
      expect(stream.reopens).toBe(times.length - 1);
      expect(stream.reverseWindowBytes).toBe(0);
      if (process.env.S8_BENCH === "1") {
        process.stdout.write(JSON.stringify({ fractionalTimes: observed, reopens: stream.reopens, reverseWindowBytes: stream.reverseWindowBytes }) + "\n");
      }
    } finally {
      stream.close();
    }
  }, 60_000);

  it("matches fresh seeks when the source is 24 fps and the timeline is 30 fps", async () => {
    const times = [1.73, 1.7, 1.69, 1.63, 1.6, 1.57, 1.51, 1.45, 1.39, 1.33, 1.27, 1.21];
    const stream = openSourceFrameStream({
      filePath: mismatchedClipPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: FPS,
      startSec: times[0]!
    });
    const center = ((HEIGHT / 2) * WIDTH + WIDTH / 2) * 4;
    try {
      for (const time of times) {
        const fresh = openVideoFrameStream({
          filePath: mismatchedClipPath,
          size: { width: WIDTH, height: HEIGHT },
          fps: FPS,
          startSec: time,
          speed: 1
        });
        try {
          const actual = await stream.frameAtSourceSec(time);
          const expected = await fresh.frameAt(0);
          expect(actual?.[center], `source time ${time}s`).toBe(expected?.[center]);
        } finally {
          fresh.close();
        }
      }
    } finally {
      stream.close();
    }
  }, 60_000);

  it("uses fresh seeks at fractional source-frame boundaries", async () => {
    const times = [5 / 24, 0.167, 0.1251, 0.125, 0.042, 0.0418, 1 / 24];
    const stream = openSourceFrameStream({
      filePath: mismatchedClipPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: 24,
      startSec: times[0]!
    });
    const center = ((HEIGHT / 2) * WIDTH + WIDTH / 2) * 4;
    try {
      for (const time of times) {
        const fresh = openVideoFrameStream({
          filePath: mismatchedClipPath,
          size: { width: WIDTH, height: HEIGHT },
          fps: 24,
          startSec: time,
          speed: 1
        });
        try {
          const actual = await stream.frameAtSourceSec(time);
          const expected = await fresh.frameAt(0);
          expect(actual?.[center], `source time ${time}s`).toBe(expected?.[center]);
        } finally {
          fresh.close();
        }
      }
      expect(stream.reverseWindowBytes).toBe(0);
    } finally {
      stream.close();
    }
  }, 60_000);

  it("reopens after a forward seek exhausts a reverse window", async () => {
    const times = [1.9, 1.8, 1.7, 1.9, 1.7];
    const stream = openSourceFrameStream({
      filePath: clipPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: FPS,
      startSec: times[0]!
    });
    try {
      const center = ((HEIGHT / 2) * WIDTH + WIDTH / 2) * 4;
      for (const time of times) {
        const pixels = await stream.frameAtSourceSec(time);
        expect(pixels).not.toBeNull();
        expect(Math.abs(pixels![center]! - grayOf(Math.round(time * FPS)))).toBeLessThanOrEqual(2);
      }
    } finally {
      stream.close();
    }
  }, 60_000);

  it("keeps a 4K reverse window under the default byte cap", async () => {
    const width = 3840;
    const height = 2160;
    const frames = 5;
    const outPath = path.join(directory, "reverse-4k.mp4");
    const encoder = openFrameEncoder({
      outPath,
      width,
      height,
      fps: FPS,
      encoderArgs: ["-c:v", "libx264", "-preset", "ultrafast", "-g", "2", "-pix_fmt", "yuv420p"]
    });
    const rgba = new Uint8Array(width * height * 4);
    for (let index = 0; index < frames; index++) {
      const gray = 32 + index * 32;
      for (let i = 0; i < rgba.length; i += 4) rgba.set([gray, gray, gray, 255], i);
      await encoder.write(rgba);
    }
    await encoder.finish();

    const stream = openSourceFrameStream({
      filePath: outPath,
      size: { width, height },
      fps: FPS,
      startSec: (frames - 1) / FPS
    });
    let peakBytes = 0;
    try {
      const center = ((height / 2) * width + width / 2) * 4;
      for (let index = frames - 1; index >= 0; index--) {
        const pixels = await stream.frameAtSourceSec(index / FPS);
        expect(Math.abs(pixels![center]! - (32 + index * 32))).toBeLessThanOrEqual(2);
        peakBytes = Math.max(peakBytes, stream.reverseWindowBytes);
      }
      expect(stream.reopens).toBe(1);
      expect(peakBytes).toBeLessThanOrEqual(128 * 1024 * 1024);
      if (process.env.S8_BENCH === "1") {
        process.stdout.write(JSON.stringify({
          resolution: "3840x2160",
          frames,
          peakWindowBytes: peakBytes,
          reopens: stream.reopens
        }) + "\n");
      }
    } finally {
      stream.close();
    }
  }, 120_000);
});
