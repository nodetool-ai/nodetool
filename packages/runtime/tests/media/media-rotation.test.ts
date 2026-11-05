import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openRgbaFrameReader, probeMedia, transcodeVideo, transformMedia } from "../../src/media/index.js";
import { readRgbaFrames, writeRgbaVideo } from "../../src/media/testing.js";

const rotations = [
  { angle: 90, matrix: [0, 65536, 0, -65536, 0, 0, 0, 0, 1073741824], corners: [160, 40, 220, 100] },
  { angle: 180, matrix: [-65536, 0, 0, 0, -65536, 0, 0, 0, 1073741824], corners: [220, 160, 100, 40] },
  { angle: 270, matrix: [0, -65536, 0, 65536, 0, 0, 0, 0, 1073741824], corners: [100, 220, 40, 160] }
];
const spec = { codec: "libx264", pixelFormat: "yuv420p", options: { crf: "0" } };
let dir: string;
const file = (name: string): string => path.join(dir, name);

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-media-rotation-"));
  const rgba = new Uint8Array(64 * 48 * 4);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 64; x++) {
      const level = 40 + (x >= 32 ? 60 : 0) + (y >= 24 ? 120 : 0);
      rgba.set([level, level, level, 255], (y * 64 + x) * 4);
    }
  }
  await writeRgbaVideo({
    outPath: file("source.mp4"), width: 64, height: 48, fps: 2, frames: 2,
    frameAt: () => rgba, spec
  });
  const source = await fs.readFile(file("source.mp4"));
  const tkhd = source.indexOf("tkhd");
  expect(tkhd).toBeGreaterThan(0);
  expect(source[tkhd + 4]).toBe(0);
  for (const { angle, matrix } of rotations) {
    const rotated = Buffer.from(source);
    matrix.forEach((value, index) => rotated.writeInt32BE(value, tkhd + 44 + index * 4));
    await fs.writeFile(file(`${angle}.mp4`), rotated);
  }
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function expectCorners(rgba: Uint8Array, width: number, height: number, expected: number[]): void {
  const coordinates = [[width / 4, height / 4], [width * 3 / 4, height / 4],
    [width / 4, height * 3 / 4], [width * 3 / 4, height * 3 / 4]];
  coordinates.forEach(([x, y], index) => {
    expect(Math.abs(rgba[(y! * width + x!) * 4]! - expected[index]!)).toBeLessThanOrEqual(3);
  });
}

describe("video display rotation", () => {
  it.each(rotations)("renders $angle degrees into transcoded pixels", async ({ angle, corners }) => {
    const width = angle === 180 ? 64 : 48;
    const height = angle === 180 ? 48 : 64;
    expect((await probeMedia(file(`${angle}.mp4`))).video).toMatchObject({
      width: 64, height: 48, displayWidth: width, displayHeight: height, rotation: angle
    });
    const outPath = file(`transcoded-${angle}.mp4`);
    await transcodeVideo({ inputPath: file(`${angle}.mp4`), outPath, spec });
    expect((await probeMedia(outPath)).video).toMatchObject({
      width, height, displayWidth: width, displayHeight: height, rotation: 0
    });
    const frames = await readRgbaFrames(outPath, { width, height });
    expect(frames).toHaveLength(2);
    expectCorners(frames[0]!, width, height, corners);
  });

  it("orients pixels before a filter-complex crop", async () => {
    const outPath = file("cropped.mp4");
    await transformMedia({
      inputs: [{ filePath: file("90.mp4") }], outPath,
      video: { graph: "[0:v]crop=24:32:0:0[out]", output: "out" },
      audio: null, videoEncoder: spec
    });
    const frames = await readRgbaFrames(outPath, { width: 24, height: 32 });
    expectCorners(frames[0]!, 24, 32, [160, 160, 160, 160]);
  });

  it("returns display dimensions and oriented pixels to RGBA readers", async () => {
    const reader = await openRgbaFrameReader({ filePath: file("90.mp4"), filter: "format=rgba" });
    expect(reader).not.toBeNull();
    try {
      const frame = await reader!.next();
      expect(frame).toMatchObject({ width: 48, height: 64 });
      expectCorners(frame!.rgba, 48, 64, [160, 40, 220, 100]);
    } finally {
      await reader!.close();
    }
  });

  it("preserves the display matrix and coded dimensions when copying packets", async () => {
    const outPath = file("copied.mp4");
    await transformMedia({
      inputs: [{ filePath: file("90.mp4") }], outPath,
      video: { copy: 0 }, audio: null
    });
    expect((await probeMedia(outPath)).video).toMatchObject({
      width: 64, height: 48, displayWidth: 48, displayHeight: 64, rotation: 90
    });
  });
});
