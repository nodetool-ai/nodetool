import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { generateMedia } from "../src/media/testing.js";
import { mp4DurationSeconds } from "../src/providers/video-duration.js";
import { probeVideoDurationSeconds } from "../src/providers/video-frames.js";

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  for (let index = 0; index < 4; index += 1) {
    out[4 + index] = type.charCodeAt(index);
  }
  out.set(payload, 8);
  return out;
}

function mvhdV0(timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(100);
  const view = new DataView(payload.buffer);
  view.setUint8(0, 0);
  view.setUint32(12, timescale);
  view.setUint32(16, duration);
  return box("mvhd", payload);
}

function mvhdV1(timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(112);
  const view = new DataView(payload.buffer);
  view.setUint8(0, 1);
  view.setUint32(20, timescale);
  view.setUint32(24, Math.floor(duration / 2 ** 32));
  view.setUint32(28, duration >>> 0);
  return box("mvhd", payload);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const ftyp = box("ftyp", new Uint8Array(16));
const mdat = box("mdat", new Uint8Array(64));

describe("mp4DurationSeconds", () => {
  it("reads the length a model actually delivered", () => {
    const file = concat(ftyp, mdat, box("moov", mvhdV0(1000, 5184)));
    expect(mp4DurationSeconds(file)).toBeCloseTo(5.184, 5);
  });

  it("reads a 64-bit movie header", () => {
    const file = concat(ftyp, box("moov", mvhdV1(600, 3110)));
    expect(mp4DurationSeconds(file)).toBeCloseTo(3110 / 600, 5);
  });

  it("finds a moov that sits after the payload", () => {
    const file = concat(ftyp, mdat, mdat, box("moov", mvhdV0(24, 125)));
    expect(mp4DurationSeconds(file)).toBeCloseTo(125 / 24, 5);
  });

  it("returns null rather than zero for bytes it cannot read", () => {
    expect(mp4DurationSeconds(new Uint8Array(0))).toBeNull();
    expect(mp4DurationSeconds(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
    expect(mp4DurationSeconds(concat(ftyp, mdat))).toBeNull();
    expect(
      mp4DurationSeconds(concat(ftyp, box("moov", new Uint8Array(8))))
    ).toBeNull();
    expect(
      mp4DurationSeconds(concat(ftyp, box("moov", mvhdV0(1000, 0))))
    ).toBeNull();
  });

  it("does not loop forever on a box that declares an impossible size", () => {
    const bad = new Uint8Array(16);
    new DataView(bad.buffer).setUint32(0, 2);
    expect(mp4DurationSeconds(bad)).toBeNull();
  });
});

describe("probeVideoDurationSeconds", () => {
  it("reads a container the MP4 parser does not", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "nodetool-vduration-test-"));
    try {
      const file = path.join(dir, "clip.webm");
      await generateMedia({
        outPath: file,
        video: {
          source: "testsrc2=size=32x24:rate=10:duration=1.5",
          codec: "libvpx-vp9",
          options: { deadline: "realtime", "cpu-used": "8" }
        }
      });
      const bytes = new Uint8Array(await readFile(file));
      expect(mp4DurationSeconds(bytes)).toBeNull();
      const seconds = await probeVideoDurationSeconds(bytes, new AbortController().signal);
      expect(seconds).not.toBeNull();
      expect(Math.abs(seconds! - 1.5)).toBeLessThan(0.05);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("answers null for bytes that are no video", async () => {
    expect(
      await probeVideoDurationSeconds(new Uint8Array(64).fill(3), new AbortController().signal)
    ).toBeNull();
  });

  it("does not return an MP4 header duration after cancellation", async () => {
    const file = concat(ftyp, box("moov", mvhdV0(1000, 5184)));
    const controller = new AbortController();
    controller.abort();

    await expect(
      probeVideoDurationSeconds(file, controller.signal)
    ).rejects.toThrow();
  });
});
