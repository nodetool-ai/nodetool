import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { ResizeImageNode } from "../src/nodes/image.js";

async function makeTestImage(w = 100, h = 50): Promise<Record<string, unknown>> {
  const buf = await sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 200, g: 100, b: 50 }
    }
  })
    .png()
    .toBuffer();
  return { type: "image", data: buf.toString("base64"), uri: "", width: w, height: h };
}

async function outputSize(output: Record<string, unknown>): Promise<{ w: number; h: number }> {
  const data = output.data as string;
  const meta = await sharp(Buffer.from(data, "base64")).metadata();
  return { w: meta.width ?? 0, h: meta.height ?? 0 };
}

describe("ResizeImageNode", () => {
  it("scales by factor in scale mode", async () => {
    const node = new ResizeImageNode();
    node.assign({ image: await makeTestImage(100, 50), mode: "scale", scale: 2 });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    const { w, h } = await outputSize(output);
    expect(w).toBe(200);
    expect(h).toBe(100);
  });

  it("sets exact dimensions in dimensions mode", async () => {
    const node = new ResizeImageNode();
    node.assign({
      image: await makeTestImage(100, 50),
      mode: "dimensions",
      width: 64,
      height: 32
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    const { w, h } = await outputSize(output);
    expect(w).toBe(64);
    expect(h).toBe(32);
  });

  it("fits inside box preserving aspect in fit mode", async () => {
    const node = new ResizeImageNode();
    node.assign({
      image: await makeTestImage(100, 50),
      mode: "fit",
      width: 200,
      height: 200
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    const { w, h } = await outputSize(output);
    expect(w).toBe(200);
    expect(h).toBe(100);
  });
});
