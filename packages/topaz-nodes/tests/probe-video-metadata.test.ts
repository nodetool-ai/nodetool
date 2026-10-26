/**
 * `probeVideoMetadata` on real media: the source description Topaz is sent
 * (size, rate, frame count, length) is the file's own.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { generateMedia } from "@nodetool-ai/runtime/media/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { probeVideoMetadata } from "../src/topaz-base.js";

let dir = "";
let clip: Uint8Array;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-topaz-probe-"));
  const file = path.join(dir, "clip.mp4");
  await generateMedia({
    outPath: file,
    video: { source: "testsrc2=size=160x90:rate=24:duration=2" },
    audio: { source: "sine=frequency=440:sample_rate=48000:duration=2" }
  });
  clip = new Uint8Array(await fs.readFile(file));
});

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

describe("probeVideoMetadata", () => {
  it("describes the source Topaz is sent", async () => {
    const meta = await probeVideoMetadata(clip, "mp4");
    expect(meta).toMatchObject({
      resolution: { width: 160, height: 90 },
      container: "mp4",
      size: clip.byteLength,
      frameCount: 48
    });
    expect(meta.frameRate).toBeCloseTo(24, 3);
    expect(Math.abs(meta.duration - 2)).toBeLessThan(0.05);
  });

  it("refuses bytes with no video stream", async () => {
    await expect(probeVideoMetadata(new Uint8Array(32).fill(1), "mp4")).rejects.toThrow();
  });
});
