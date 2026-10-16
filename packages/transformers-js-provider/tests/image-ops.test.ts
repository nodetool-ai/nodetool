import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPipeline: vi.fn(),
  getJanus: vi.fn(async () => ({})),
  generateJanusImage: vi.fn()
}));

vi.mock("@nodetool-ai/transformers-js-nodes", () => ({
  bytesToRawImage: vi.fn(async () => ({
    data: new Uint8Array(4),
    width: 1,
    height: 1,
    channels: 4
  })),
  getPipeline: mocks.getPipeline,
  getJanus: mocks.getJanus,
  generateJanusImage: mocks.generateJanusImage
}));

import {
  segmentImage,
  textToImage,
  toRgba,
  upscaleImage
} from "../src/image-ops.js";

function mask(value: number) {
  return { data: Uint8Array.from([value]), width: 1, height: 1, channels: 1 };
}

describe("toRgba", () => {
  it("spreads a grayscale depth map over RGB with full alpha", () => {
    const out = toRgba({
      data: Uint8Array.from([0, 200]),
      width: 2,
      height: 1,
      channels: 1
    });
    expect(Array.from(out)).toEqual([0, 0, 0, 255, 200, 200, 200, 255]);
  });

  it("adds full alpha to RGB pixels", () => {
    const out = toRgba({
      data: Uint8Array.from([1, 2, 3]),
      width: 1,
      height: 1,
      channels: 3
    });
    expect(Array.from(out)).toEqual([1, 2, 3, 255]);
  });

  it("keeps a cutout's own alpha", () => {
    const out = toRgba({
      data: Uint8Array.from([9, 8, 7, 0]),
      width: 1,
      height: 1,
      channels: 4
    });
    expect(Array.from(out)).toEqual([9, 8, 7, 0]);
  });
});

describe("segmentImage", () => {
  it("keeps unscored semantic masks and drops low-confidence ones", async () => {
    mocks.getPipeline.mockResolvedValue(async () => [
      { label: "wall", score: null, mask: mask(255) },
      { label: "cat", score: 0.9, mask: mask(255) },
      { label: "dog", score: 0.2, mask: mask(0) }
    ]);
    const masks = await segmentImage({
      image: new Uint8Array(),
      model: "seg",
      minConfidence: 0.5
    });
    expect(mocks.getPipeline).toHaveBeenCalledWith({
      task: "image-segmentation",
      model: "seg"
    });
    expect(masks.map((m) => [m.label, m.confidence, m.mimeType])).toEqual([
      ["wall", null, "image/png"],
      ["cat", 0.9, "image/png"]
    ]);
    expect(masks[0].mask.subarray(0, 4)).toEqual(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47])
    );
  });

  it("returns at most maxMasks masks", async () => {
    mocks.getPipeline.mockResolvedValue(async () => [
      { label: "a", score: 0.9, mask: mask(255) },
      { label: "b", score: 0.8, mask: mask(255) }
    ]);
    const masks = await segmentImage({
      image: new Uint8Array(),
      model: "seg",
      maxMasks: 1
    });
    expect(masks.map((m) => m.label)).toEqual(["a"]);
  });
});

describe("upscaleImage", () => {
  it("runs the image-to-image pipeline and encodes a PNG", async () => {
    mocks.getPipeline.mockResolvedValue(async () => ({
      data: new Uint8Array(2 * 2 * 3),
      width: 2,
      height: 2,
      channels: 3
    }));
    const png = await upscaleImage({ image: new Uint8Array(), model: "sr" });
    expect(mocks.getPipeline).toHaveBeenCalledWith({
      task: "image-to-image",
      model: "sr"
    });
    expect(png.subarray(0, 4)).toEqual(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
  });
});

describe("textToImage", () => {
  it("generates with Janus and encodes a PNG", async () => {
    mocks.generateJanusImage.mockResolvedValue({
      data: new Uint8Array(2 * 2 * 3),
      width: 2,
      height: 2,
      channels: 3
    });
    const png = await textToImage({ prompt: " a fox ", model: "janus" });
    expect(mocks.getJanus).toHaveBeenCalledWith("janus", undefined, undefined);
    expect(mocks.generateJanusImage).toHaveBeenCalledWith(
      expect.anything(),
      "a fox",
      undefined
    );
    expect(png.subarray(0, 4)).toEqual(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it("refuses an empty prompt", async () => {
    await expect(textToImage({ prompt: "  ", model: "janus" })).rejects.toThrow(
      "prompt is required"
    );
  });
});
