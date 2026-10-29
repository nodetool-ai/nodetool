/**
 * Image clips on the Node compositor path: `decodeStillRgba` turns a raster
 * still into the RGBA the compositor draws. Nothing else decodes a PNG or JPEG
 * for a render, and before this no test fed it one (gap G3 in
 * docs/ffmpeg-in-process-plan.md).
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createCanvas } from "@napi-rs/canvas";
import { encodeWav, sineSamples } from "@nodetool-ai/runtime/media/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { decodeStillRgba } from "../src/nodes/timeline/rawFrames.js";

let dir: string;

/** Four quadrants: red, green / blue, translucent white. */
function quadrants(width: number, height: number): ReturnType<typeof createCanvas> {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  const halfW = width / 2;
  const halfH = height / 2;
  context.fillStyle = "rgb(255,0,0)";
  context.fillRect(0, 0, halfW, halfH);
  context.fillStyle = "rgb(0,255,0)";
  context.fillRect(halfW, 0, halfW, halfH);
  context.fillStyle = "rgb(0,0,255)";
  context.fillRect(0, halfH, halfW, halfH);
  context.fillStyle = "rgba(255,255,255,0.5)";
  context.fillRect(halfW, halfH, halfW, halfH);
  return canvas;
}

/** The RGBA pixel at (x, y). */
function pixel(image: { rgba: Uint8Array; width: number }, x: number, y: number): number[] {
  const offset = (y * image.width + x) * 4;
  return [...image.rgba.subarray(offset, offset + 4)];
}

function near(actual: number[], expected: number[], tolerance: number): void {
  expect(actual).toHaveLength(expected.length);
  for (const [index, value] of expected.entries()) {
    expect(Math.abs((actual[index] ?? -1) - value)).toBeLessThanOrEqual(tolerance);
  }
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-still-decode-"));
  await fs.writeFile(path.join(dir, "quadrants.png"), quadrants(80, 40).toBuffer("image/png"));
  const opaque = createCanvas(80, 40);
  const context = opaque.getContext("2d");
  context.drawImage(quadrants(80, 40), 0, 0);
  await fs.writeFile(path.join(dir, "quadrants.jpg"), opaque.toBuffer("image/jpeg", 100));
  await fs.writeFile(
    path.join(dir, "tone.wav"),
    encodeWav(sineSamples({ sampleRate: 8000, channels: 1, durationSec: 0.1, frequency: 440 }), 8000, 1)
  );
});

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

describe("decodeStillRgba", () => {
  it("decodes a PNG at its own size with straight alpha", async () => {
    const image = await decodeStillRgba(path.join(dir, "quadrants.png"), {
      width: 200,
      height: 200
    });
    expect(image).not.toBeNull();
    expect(image!.width).toBe(80);
    expect(image!.height).toBe(40);
    expect(image!.rgba.length).toBe(80 * 40 * 4);
    near(pixel(image!, 10, 10), [255, 0, 0, 255], 0);
    near(pixel(image!, 70, 10), [0, 255, 0, 255], 0);
    near(pixel(image!, 10, 30), [0, 0, 255, 255], 0);
    // Straight alpha: half-transparent white stays white, not gray.
    near(pixel(image!, 70, 30), [255, 255, 255, 128], 1);
  });

  it("fits a still inside the frame without changing its aspect ratio", async () => {
    const image = await decodeStillRgba(path.join(dir, "quadrants.png"), {
      width: 40,
      height: 40
    });
    expect(image!.width).toBe(40);
    expect(image!.height).toBe(20);
    near(pixel(image!, 5, 5), [255, 0, 0, 255], 2);
    near(pixel(image!, 35, 15), [255, 255, 255, 128], 2);
  });

  it("decodes a JPEG", async () => {
    const image = await decodeStillRgba(path.join(dir, "quadrants.jpg"), {
      width: 80,
      height: 40
    });
    expect(image!.width).toBe(80);
    near(pixel(image!, 10, 10), [255, 0, 0, 255], 8);
    near(pixel(image!, 10, 30), [0, 0, 255, 255], 8);
    // JPEG has no alpha: the white square was drawn over black at 50%.
    near(pixel(image!, 70, 30), [128, 128, 128, 255], 8);
  });

  it("answers null for a file with no picture", async () => {
    expect(await decodeStillRgba(path.join(dir, "tone.wav"), { width: 40, height: 40 })).toBeNull();
  });
});
