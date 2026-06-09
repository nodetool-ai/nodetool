/**
 * GPU migration coverage for the `nodetool.image.*` transform nodes that moved
 * off sharp onto the shader pool (Crop, Resize, Scale, Fit, …). Verifies each
 * returns raw-RGBA at the correct dimensions, and that Crop samples the right
 * region. Skips when no GPU (Dawn/SwiftShader) is available.
 */

import "../../gpu/tests/setup/swiftshaderIcd.js";

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  CropNode,
  ResizeNode,
  ScaleNode,
  FitNode,
  BlurNode,
  RotateAndFlipNode,
  PasteNode
} from "@nodetool-ai/image-nodes";

async function gpuAvailable(): Promise<boolean> {
  try {
    const spec = "webgpu";
    const dawn = (await import(spec)) as {
      create?: (flags: string[]) => { requestAdapter: () => Promise<unknown> };
    };
    const gpu = dawn.create?.([]);
    const adapter = await gpu?.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

const hasGpu = await gpuAvailable();

async function solidPng(
  w: number,
  h: number,
  rgb = { r: 255, g: 0, b: 0, alpha: 255 }
): Promise<Buffer> {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: rgb.r, g: rgb.g, b: rgb.b, alpha: (rgb.alpha ?? 255) / 255 }
    }
  })
    .png()
    .toBuffer();
}

/** Left half red, right half blue — for verifying crop samples the right region. */
async function twoTonePng(w: number, h: number): Promise<Buffer> {
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const left = x < w / 2;
      px[i] = left ? 255 : 0;
      px[i + 1] = 0;
      px[i + 2] = left ? 0 : 255;
      px[i + 3] = 255;
    }
  }
  return sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

function makeNode<T extends new () => unknown>(
  NodeClass: T,
  props: Record<string, unknown>
): InstanceType<T> {
  const inst = new NodeClass();
  for (const [k, v] of Object.entries(props)) {
    (inst as Record<string, unknown>)[k] = v;
  }
  return inst as InstanceType<T>;
}

function expectRawRgba(output: unknown, width: number, height: number): Uint8Array {
  const ref = output as {
    type?: string;
    data?: unknown;
    width?: number;
    height?: number;
    mimeType?: string;
  };
  expect(ref.type).toBe("image");
  expect(ref.mimeType).toBe("image/x-raw-rgba");
  expect(ref.width).toBe(width);
  expect(ref.height).toBe(height);
  const data = ref.data as Uint8Array;
  expect(data).toBeInstanceOf(Uint8Array);
  expect(data.length).toBe(width * height * 4);
  return data;
}

const imageRefOf = (png: Buffer) => ({
  type: "image",
  data: png.toString("base64")
});

describe.skipIf(!hasGpu)("nodetool.image.* transform GPU migration", () => {
  it("Resize outputs raw-RGBA at the target dimensions", async () => {
    const node = makeNode(ResizeNode, {
      image: imageRefOf(await solidPng(16, 16)),
      width: 32,
      height: 24
    });
    expectRawRgba((await node.process()).output, 32, 24);
  });

  it("Scale multiplies source dimensions", async () => {
    const node = makeNode(ScaleNode, {
      image: imageRefOf(await solidPng(20, 10)),
      scale: 2
    });
    expectRawRgba((await node.process()).output, 40, 20);
  });

  it("Fit preserves aspect ratio inside the target box", async () => {
    // 16x16 fit into 8x32 → ratio = min(0.5, 2) = 0.5 → 8x8.
    const node = makeNode(FitNode, {
      image: imageRefOf(await solidPng(16, 16)),
      width: 8,
      height: 32
    });
    expectRawRgba((await node.process()).output, 8, 8);
  });

  it("Crop outputs the requested sub-rectangle and samples the right region", async () => {
    const node = makeNode(CropNode, {
      image: imageRefOf(await twoTonePng(16, 16)),
      left: 8,
      top: 0,
      right: 16,
      bottom: 16
    });
    const data = expectRawRgba((await node.process()).output, 8, 16);
    // The right half of the source is blue (0,0,255) — every cropped pixel
    // should be blue, confirming the crop origin/extent mapped correctly.
    let blue = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 40 && data[i + 2] > 200) blue++;
    }
    expect(blue).toBe(8 * 16);
  });

  it("Crop falls through to the input when source has no pixels", async () => {
    const ref = { type: "image", data: "" };
    const node = makeNode(CropNode, { image: ref, left: 0, top: 0, right: 4, bottom: 4 });
    expect((await node.process()).output).toBe(ref);
  });

  it("Blur (gaussian) preserves dimensions", async () => {
    const node = makeNode(BlurNode, {
      image: imageRefOf(await solidPng(16, 16)),
      blur_type: "gaussian",
      size: 20
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("Blur (motion) preserves dimensions", async () => {
    const node = makeNode(BlurNode, {
      image: imageRefOf(await solidPng(16, 16)),
      blur_type: "motion",
      size: 30
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("RotateAndFlip horizontal flip mirrors left/right", async () => {
    // Source left half red, right half blue → after H-flip top-left is blue.
    const node = makeNode(RotateAndFlipNode, {
      image: imageRefOf(await twoTonePng(16, 16)),
      angle: 0,
      flip_horizontal: true,
      flip_vertical: false
    });
    const data = expectRawRgba((await node.process()).output, 16, 16);
    expect(data[0]).toBeLessThan(40); // R low
    expect(data[2]).toBeGreaterThan(200); // B high
  });

  it("RotateAndFlip 90° swaps width/height", async () => {
    const node = makeNode(RotateAndFlipNode, {
      image: imageRefOf(await solidPng(20, 10)),
      angle: 90,
      flip_horizontal: false,
      flip_vertical: false
    });
    expectRawRgba((await node.process()).output, 10, 20);
  });

  it("Paste composites the overlay at the given offset over the base", async () => {
    const node = makeNode(PasteNode, {
      image: imageRefOf(await solidPng(16, 16, { r: 255, g: 0, b: 0, alpha: 255 })),
      paste: imageRefOf(await solidPng(8, 8, { r: 0, g: 0, b: 255, alpha: 255 })),
      left: 4,
      top: 4
    });
    const data = expectRawRgba((await node.process()).output, 16, 16);
    const at = (x: number, y: number) => (y * 16 + x) * 4;
    // Inside the pasted region → blue.
    const p = at(6, 6);
    expect(data[p]).toBeLessThan(40);
    expect(data[p + 2]).toBeGreaterThan(200);
    // Outside the pasted region → original red base.
    const q = at(0, 0);
    expect(data[q]).toBeGreaterThan(200);
    expect(data[q + 2]).toBeLessThan(40);
  });

  it("RotateAndFlip arbitrary angle expands the canvas with transparent corners", async () => {
    const node = makeNode(RotateAndFlipNode, {
      image: imageRefOf(await solidPng(16, 16, { r: 255, g: 0, b: 0, alpha: 255 })),
      angle: 45,
      flip_horizontal: false,
      flip_vertical: false
    });
    const out = (await node.process()).output as {
      width: number;
      height: number;
      data: Uint8Array;
    };
    // 16×16 rotated 45° → bbox ≈ 23×23.
    expect(out.width).toBeGreaterThan(16);
    expect(out.height).toBeGreaterThan(16);
    expect(out.mimeType).toBe("image/x-raw-rgba");
    // Top-left corner falls outside the rotated square → transparent.
    expect(out.data[3]).toBe(0);
  });
});
