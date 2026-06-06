import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { CanvasResizeNode } from "../src/nodes/image.js";

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

describe("CanvasResizeNode", () => {
  it("padding mode adds px on each side", async () => {
    const node = new CanvasResizeNode();
    node.assign({
      image: await makeTestImage(10, 10),
      mode: "padding",
      padding_unit: "px",
      top: 10,
      bottom: 10,
      left: 10,
      right: 10
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(30);
    expect(output.height).toBe(30);
  });

  it("scale mode doubles canvas dimensions while keeping source pixels", async () => {
    const node = new CanvasResizeNode();
    node.assign({
      image: await makeTestImage(8, 8),
      mode: "scale",
      scale: 2
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(16);
    expect(output.height).toBe(16);
  });

  it("fixed mode centers source on target canvas", async () => {
    const node = new CanvasResizeNode();
    node.assign({
      image: await makeTestImage(4, 4, 255, 0, 0),
      mode: "fixed",
      width: 8,
      height: 8
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(8);
    expect(output.height).toBe(8);

    const buf = Buffer.from(output.data as string, "base64");
    const { data, info } = await sharp(buf)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const centerIdx = (4 * info.width + 4) * info.channels;
    expect(data[centerIdx]).toBeGreaterThan(200);
    expect(data[0]).toBe(0);
  });
});
