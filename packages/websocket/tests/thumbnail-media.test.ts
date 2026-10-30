/**
 * What the video and audio thumbnails show: the frame one second in (the
 * first frame of a shorter clip), and a waveform drawn where the sound is.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { InMemoryStorageAdapter, type StorageAdapter } from "@nodetool-ai/storage";
import {
  encodeWav,
  sineSamples,
  solidRgba,
  writeRgbaVideo
} from "@nodetool-ai/runtime/media/testing";

const mocks = vi.hoisted(() => ({ adapter: null as StorageAdapter | null }));
vi.mock("@nodetool-ai/asset-services/storage", () => ({
  getAssetAdapter: () => mocks.adapter
}));

import { storeAssetWithThumbnail } from "../src/lib/thumbnail.js";

const USER = "user-1";
const ASSET = "0192a7f3c4e5b6d7a8f9e0c1b2d3e4f5";
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** An H.264 clip whose frame `i` is gray level `i * 10`, at 10 fps. */
async function grayClip(width: number, height: number, frames: number): Promise<Uint8Array> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "thumb-media-"));
  dirs.push(dir);
  const file = path.join(dir, "clip.mp4");
  await writeRgbaVideo({
    outPath: file,
    width,
    height,
    fps: 10,
    frames,
    frameAt: (i) => solidRgba(width, height, [i * 10, i * 10, i * 10, 255]),
    spec: { codec: "libx264", pixelFormat: "yuv420p", options: { qp: "0" } }
  });
  return new Uint8Array(await fs.readFile(file));
}

/** Store `bytes` as an asset and return its decoded thumbnail. */
async function thumbnail(
  bytes: Uint8Array,
  fileName: string,
  contentType: string
): Promise<{ data: Buffer; width: number; height: number }> {
  const adapter = new InMemoryStorageAdapter();
  mocks.adapter = adapter;
  await storeAssetWithThumbnail(USER, ASSET, fileName, bytes, contentType);
  const jpeg = await adapter.retrieve(adapter.uriForKey(`${USER}/${ASSET}_thumb.jpg`));
  expect(jpeg).not.toBeNull();
  const { data, info } = await sharp(Buffer.from(jpeg!))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function meanOf(data: Buffer, channel: number): number {
  let sum = 0;
  for (let i = channel; i < data.length; i += 3) sum += data[i] ?? 0;
  return sum / (data.length / 3);
}

describe("video thumbnails", () => {
  it("shows the frame one second in", async () => {
    const thumb = await thumbnail(await grayClip(64, 48, 30), "clip.mp4", "video/mp4");
    expect(thumb.width).toBe(64);
    expect(thumb.height).toBe(48);
    // Frame 10 is gray 100.
    expect(Math.abs(meanOf(thumb.data, 0) - 100)).toBeLessThan(4);
  });

  it("falls back to the first frame of a clip shorter than a second", async () => {
    const thumb = await thumbnail(await grayClip(64, 48, 5), "short.mp4", "video/mp4");
    expect(meanOf(thumb.data, 0)).toBeLessThan(4);
  });

  it("scales a wide source to 512 px across with an even height", async () => {
    const thumb = await thumbnail(await grayClip(1000, 300, 12), "wide.mp4", "video/mp4");
    expect(thumb.width).toBe(512);
    expect(thumb.height).toBe(154);
  });
});

describe("audio thumbnails", () => {
  it("draws a 512x256 waveform where the sound is and leaves silence dark", async () => {
    const samples = sineSamples({
      sampleRate: 8000,
      channels: 1,
      durationSec: 2,
      frequency: 440,
      amplitude: 0.9
    });
    // Silent first half.
    samples.fill(0, 0, 8000);
    const thumb = await thumbnail(encodeWav(samples, 8000, 1), "take.wav", "audio/wav");
    expect(thumb.width).toBe(512);
    expect(thumb.height).toBe(256);
    const columnBlue = (x: number): number => {
      let sum = 0;
      for (let y = 0; y < thumb.height; y++) sum += thumb.data[(y * thumb.width + x) * 3 + 2] ?? 0;
      return sum / thumb.height;
    };
    // The loud half fills most of each column with the 0x4a90e2 trace.
    expect(columnBlue(400)).toBeGreaterThan(120);
    expect(columnBlue(100)).toBeLessThan(20);
  });
});
