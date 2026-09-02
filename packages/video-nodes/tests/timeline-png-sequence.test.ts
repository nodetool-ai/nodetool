/**
 * The `png_sequence` output (F13, T27): PNGs with straight alpha, stored in one
 * zip next to a `manifest.json`.
 *
 * The test that matters is the round trip — a frame whose left half was written
 * fully transparent has to decode with alpha 0 on that side and the colour it
 * was given on the other. Nothing here is mocked: the PNGs are encoded, the zip
 * is parsed back out of the bytes on disk, and the images are decoded again.
 *
 * The zip reader is written here rather than imported so the archive is read by
 * something that does not share the writer's assumptions: if the CRC, the sizes
 * or the central directory were wrong, this would not find the entries.
 */
import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { crc32 } from "node:zlib";

import {
  encodeRgbaPng,
  openPngSequenceEncoder,
  type PngSequenceManifest
} from "../src/nodes/timeline/pngSequence.js";

/** A frame whose left half is transparent and right half is opaque red. */
function halfTransparent(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (x < width / 2) continue; // left half stays 0,0,0,0
      rgba[i] = 255;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

/** Read a store-only zip's entries by walking its central directory. */
function readStoredZip(buffer: Buffer): Map<string, Buffer> {
  const eocd = buffer.lastIndexOf(
    Buffer.from([0x50, 0x4b, 0x05, 0x06])
  );
  if (eocd < 0) throw new Error("no end-of-central-directory record");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  const entries = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`central directory entry ${i} has a bad signature`);
    }
    const method = buffer.readUInt16LE(offset + 10);
    if (method !== 0) throw new Error(`entry ${i} is not stored`);
    const crc = buffer.readUInt32LE(offset + 16);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLen);

    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataAt = localOffset + 30 + localNameLen + localExtraLen;
    const data = buffer.subarray(dataAt, dataAt + size);
    if (crc32(data) !== crc) throw new Error(`entry "${name}" fails its CRC`);
    entries.set(name, data);

    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Decode PNG bytes and read one pixel's RGBA. */
async function pixelAt(
  png: Buffer,
  x: number,
  y: number
): Promise<[number, number, number, number]> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(x, y, 1, 1);
  return [data[0], data[1], data[2], data[3]];
}

describe("encodeRgbaPng", () => {
  it("keeps a transparent region at alpha 0 through the encode", async () => {
    const png = encodeRgbaPng(halfTransparent(8, 4), 8, 4);
    expect(await pixelAt(png, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(await pixelAt(png, 6, 1)).toEqual([255, 0, 0, 255]);
  });

  it("refuses a frame with fewer bytes than the size claims", () => {
    expect(() => encodeRgbaPng(new Uint8Array(4), 8, 4)).toThrow(
      /expected 128/
    );
  });
});

describe("openPngSequenceEncoder", () => {
  it("writes one PNG per frame plus a manifest, alpha intact", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-pngseq-"));
    const outPath = path.join(dir, "frames.zip");
    try {
      const encoder = openPngSequenceEncoder({
        outPath,
        width: 8,
        height: 4,
        fps: 12,
        alpha: true
      });
      await encoder.write(halfTransparent(8, 4));
      await encoder.write(halfTransparent(8, 4));
      await encoder.finish();

      const entries = readStoredZip(await fs.readFile(outPath));
      expect([...entries.keys()]).toEqual([
        "frame_000001.png",
        "frame_000002.png",
        "manifest.json"
      ]);

      const manifest = JSON.parse(
        entries.get("manifest.json")!.toString("utf8")
      ) as PngSequenceManifest;
      expect(manifest).toMatchObject({
        format: "png_sequence",
        fps: 12,
        width: 8,
        height: 4,
        count: 2,
        alpha: true,
        pattern: "frame_%06d.png"
      });

      const first = entries.get("frame_000001.png")!;
      expect(await pixelAt(first, 1, 1)).toEqual([0, 0, 0, 0]);
      expect(await pixelAt(first, 6, 1)).toEqual([255, 0, 0, 255]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("records alpha false when the render was opaque", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-pngseq-"));
    const outPath = path.join(dir, "frames.zip");
    try {
      const encoder = openPngSequenceEncoder({
        outPath,
        width: 2,
        height: 2,
        fps: 30,
        alpha: false
      });
      await encoder.write(new Uint8Array(2 * 2 * 4).fill(255));
      await encoder.finish();
      const entries = readStoredZip(await fs.readFile(outPath));
      const manifest = JSON.parse(
        entries.get("manifest.json")!.toString("utf8")
      ) as PngSequenceManifest;
      expect(manifest.alpha).toBe(false);
      expect(manifest.count).toBe(1);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
