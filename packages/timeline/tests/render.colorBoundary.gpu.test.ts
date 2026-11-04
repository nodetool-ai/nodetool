import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { expect, it } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { openRgbaFrameReader, openVideoFrameEncoder } from "@nodetool-ai/runtime/media";
import { HeadlessFrameCompositor } from "../src/render/frameCompositor.js";

const width = 256;
const height = 16;

async function encode(path: string, rgba: Uint8Array, png: boolean): Promise<void> {
  if (png) {
    // Same canvas writer used by the server PNG-sequence boundary.
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    const image = context.createImageData(width, height);
    image.data.set(rgba);
    context.putImageData(image, 0, 0);
    await writeFile(path, canvas.toBuffer("image/png"));
    return;
  }
  const encoder = await openVideoFrameEncoder({
    outPath: path, width, height, fps: 24, input: "rgba",
    spec: {
      codec: "libx264", pixelFormat: "yuv420p",
      filter: "scale=out_color_matrix=bt709:out_range=tv",
      options: { preset: "veryfast", colorspace: "bt709", color_primaries: "bt709", color_trc: "bt709" }
    }
  });
  try {
    await encoder.write(rgba);
    await encoder.finish();
  } catch (error) {
    await encoder.abort();
    throw error;
  }
}

async function decode(path: string): Promise<Uint8Array> {
  const reader = await openRgbaFrameReader({
    filePath: path,
    filter: `scale=${width}:${height}:flags=accurate_rnd+full_chroma_int,format=rgba`,
    readAhead: 1
  });
  if (!reader) throw new Error("Fixture has no video stream");
  try {
    const frame = await reader.next();
    if (!frame) throw new Error("Fixture has no decoded frame");
    return frame.rgba;
  } finally {
    await reader.close();
  }
}

for (const png of [true, false]) {
  it(`preserves decoded SDR ${png ? "PNG ramps and low alpha" : "H.264 ramps"} through rendering and delivery`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "timeline-color-boundary-"));
    const extension = png ? "png" : "mp4";
    const renderer = new HeadlessFrameCompositor(await getNodeGPUDevice(), width, height);
    try {
      const source = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          source.set([x, png && y > 7 ? 255 - x : x, png && y > 7 ? Math.floor(x / 2) : x, png && y > 7 ? [1, 2, 8, 16, 32, 64, 128, 255][y - 8]! : 255], (y * width + x) * 4);
        }
      }
      const input = join(directory, `input.${extension}`);
      await encode(input, source, png);
      const decoded = await decode(input);
      // Decoder/codec error is measured before rendering, not charged to the GPU.
      for (let i = 0; i < source.length; i++) {
        const alpha = source[Math.floor(i / 4) * 4 + 3]!;
        const allowance = png ? (i % 4 === 3 || alpha === 255 ? 0 : Math.ceil(127.5 / alpha)) : 5;
        expect(Math.abs(decoded[i]! - source[i]!)).toBeLessThanOrEqual(allowance);
      }
      const rendered = await renderer.renderFrame([{
        id: "fixture", source: { rgba: decoded, width, height },
        opacity: 1, blendMode: "normal", zIndex: 0
      }], [], { alpha: png });
      const expected = new Uint8Array(decoded);
      for (let i = 0; i < expected.length; i += 4) {
        const alpha = decoded[i + 3]!;
        for (let channel = 0; channel < 3; channel++) {
          // Existing RGBA8 accumulation quantizes premultiplied encoded samples.
          expected[i + channel] = Math.round(Math.round(decoded[i + channel]! * alpha / 255) * 255 / alpha);
          expect(Math.abs(rendered[i + channel]! - expected[i + channel]!)).toBeLessThanOrEqual(1);
        }
        expect(rendered[i + 3]).toBe(alpha);
      }
      const actualPath = join(directory, `rendered.${extension}`);
      const referencePath = join(directory, `reference.${extension}`);
      await encode(actualPath, rendered, png);
      await encode(referencePath, expected, png);
      const actualDelivery = await decode(actualPath);
      const referenceDelivery = await decode(referencePath);
      // Same delivery encoder on both branches isolates codec loss from rendering.
      for (let i = 0; i < actualDelivery.length; i++) {
        expect(Math.abs(actualDelivery[i]! - referenceDelivery[i]!)).toBeLessThanOrEqual(1);
        const alpha = rendered[Math.floor(i / 4) * 4 + 3]!;
        const codecAllowance = png ? (i % 4 === 3 || alpha === 255 ? 0 : Math.ceil(127.5 / alpha)) : 5;
        expect(Math.abs(actualDelivery[i]! - rendered[i]!)).toBeLessThanOrEqual(codecAllowance);
      }
    } finally {
      renderer.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
}
