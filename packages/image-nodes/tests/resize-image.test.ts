import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import {
  FitNode,
  ResizeImageNode,
  ResizeNode,
  ScaleNode
} from "../src/nodes/image.js";

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
  const width = Number(output.width ?? 0);
  const height = Number(output.height ?? 0);
  if (width > 0 && height > 0) {
    return { w: width, h: height };
  }
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

  it("preserves height when width is 0 in dimensions mode", async () => {
    const node = new ResizeImageNode();
    node.assign({
      image: await makeTestImage(100, 50),
      mode: "dimensions",
      width: 0,
      height: 80
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    const { w, h } = await outputSize(output);
    expect(w).toBe(160);
    expect(h).toBe(80);
  });
});

describe("deprecated resize nodes", () => {
  it("emit deprecated metadata with replacement node type", () => {
    for (const NodeClass of [ScaleNode, ResizeNode, FitNode]) {
      const meta = getNodeMetadata(NodeClass);
      expect(meta.deprecated).toBe(true);
      expect(meta.replaced_by).toBe("nodetool.image.ResizeImage");
    }
  });

  it("still process identically to unified node for scale", async () => {
    const image = await makeTestImage(100, 50);
    const legacy = new ScaleNode();
    legacy.assign({ image, scale: 2 });
    const unified = new ResizeImageNode();
    unified.assign({ image, mode: "scale", scale: 2 });

    const legacyOut = (await legacy.process()).output as Record<string, unknown>;
    const unifiedOut = (await unified.process()).output as Record<string, unknown>;
    expect(await outputSize(legacyOut)).toEqual(await outputSize(unifiedOut));
  });
});
