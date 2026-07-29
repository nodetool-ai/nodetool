// CanvasResize pads/crops on the GPU shader pool — load the SwiftShader ICD so
// a CPU WebGPU device is available in CI.
import "../../gpu/tests/setup/swiftshaderIcd.js";
import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { SaveImageFileImageNode, CanvasResizeNode } from "../src/nodes/image.js";

async function makeTestImage(
  w = 4,
  h = 4,
  r = 128,
  g = 64,
  b = 32
): Promise<Record<string, unknown>> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: { r, g, b } }
  })
    .png()
    .toBuffer();
  return {
    type: "image",
    data: buf.toString("base64"),
    uri: "",
    width: w,
    height: h
  };
}

describe("SaveImageFileImageNode output contract", () => {
  it("returns an image-typed output plus the path string", async () => {
    const dir = await mkdtemp(join(tmpdir(), "save-image-test-"));
    try {
      const node = new SaveImageFileImageNode();
      node.assign({
        image: await makeTestImage(6, 6, 10, 20, 30),
        folder: dir,
        filename: "out.png",
        overwrite: true
      });
      const result = await node.process();

      // path is a plain string pointing at the written file.
      const path = result.path as string;
      expect(typeof path).toBe("string");
      expect(path).toBe(join(dir, "out.png"));
      const onDisk = await readFile(path);
      expect(onDisk.length).toBeGreaterThan(0);

      // output is a proper image ref (not the bare path string): carries bytes,
      // a file:// uri, mime, and dimensions — mirroring LoadImageFile.
      const output = result.output as Record<string, unknown>;
      expect(output.type).toBe("image");
      expect(typeof output.data).toBe("string");
      expect(output.uri).toBe(`file://${path}`);
      expect(output.mimeType).toBe("image/png");
      expect(output.width).toBe(6);
      expect(output.height).toBe(6);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("CanvasResizeNode fixed mode smaller than source", () => {
  it("crops centrally so the output is exactly the requested dimensions", async () => {
    const node = new CanvasResizeNode();
    node.assign({
      image: await makeTestImage(20, 20, 255, 0, 0),
      mode: "fixed",
      width: 8,
      height: 8
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(8);
    expect(output.height).toBe(8);
  });

  it("crops one axis and pads the other when the canvas is mixed", async () => {
    const node = new CanvasResizeNode();
    node.assign({
      image: await makeTestImage(20, 4, 0, 255, 0),
      mode: "fixed",
      width: 8, // smaller than source width (crop)
      height: 12 // larger than source height (pad)
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(8);
    expect(output.height).toBe(12);
  });
});
