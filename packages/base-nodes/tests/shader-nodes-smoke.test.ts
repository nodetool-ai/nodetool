/**
 * End-to-end smoke for the shader pool nodes (`shader.*`). Verifies that
 * a representative subset of nodes — one per kind of contract (single-pass
 * fragment, single-pass compute, two-pass blur, recipe, source generator,
 * derived-dimensions transform) — actually runs against Dawn and returns a
 * non-empty rawRGBA `ImageRef` of the right size.
 *
 * Skips when no GPU is available (CI without `webgpu` npm package or no
 * adapter). The shader-pool unit tests (`packages/gpu/tests/*`) already
 * cover metadata / I/O contracts without a device.
 */

// Register SwiftShader's Vulkan ICD before any module that touches Dawn loads
// (Dawn calls vkCreateInstance on adapter request, which reads the env vars
// at that moment). This is per-file so the existing compositor tests' stale
// PNG expectations don't start failing under SwiftShader.
import "../../gpu/tests/setup/swiftshaderIcd.js";

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  ColorInvertNode,
  ColorHsbNode
} from "../src/nodes/lib-shader-color.js";
import {
  BlurGaussianNode,
  PixelateNode,
  GlowNode
} from "../src/nodes/lib-shader-filters.js";
import { ChromaKeyNode } from "../src/nodes/lib-shader-keyer.js";
import { MaskFromImageNode } from "../src/nodes/lib-shader-mask.js";
import {
  SolidNode,
  CheckerboardNode
} from "../src/nodes/lib-shader-sources.js";
import {
  ColorOverlayNode,
  DropShadowNode
} from "../src/nodes/lib-shader-mixer.js";
import {
  MirrorNode,
  ResizeNode,
  Rotate90Node,
  CropNode,
  PadNode
} from "../src/nodes/lib-shader-transform.js";

async function gpuAvailable(): Promise<boolean> {
  try {
    const spec = "webgpu";
    const dawn = (await import(spec)) as {
      create?: (flags: string[]) => {
        requestAdapter: () => Promise<unknown>;
      };
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
  rgb: { r: number; g: number; b: number; alpha?: number } = { r: 255, g: 0, b: 0, alpha: 255 }
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

function makeNode<T extends new () => any>(NodeClass: T, props: Record<string, unknown>): InstanceType<T> {
  const inst = new NodeClass();
  for (const [k, v] of Object.entries(props)) {
    (inst as any)[k] = v;
  }
  return inst as InstanceType<T>;
}

function expectRawRgba(output: unknown, width: number, height: number): void {
  expect(output, "shader node returned an output").toBeTruthy();
  const ref = output as { type?: string; data?: unknown; width?: number; height?: number; mimeType?: string };
  expect(ref.type).toBe("image");
  expect(ref.mimeType).toBe("image/x-raw-rgba");
  expect(ref.width).toBe(width);
  expect(ref.height).toBe(height);
  const data = ref.data as Uint8Array;
  expect(data).toBeInstanceOf(Uint8Array);
  expect(data.length).toBe(width * height * 4);
}

describe.skipIf(!hasGpu)("shader.* node smoke (Dawn GPU)", () => {
  it("color.invert (fragment, mask slot) — runs and returns same dims as source", async () => {
    const png = await solidPng(16, 16, { r: 200, g: 100, b: 50 });
    const node = makeNode(ColorInvertNode, {
      image: { type: "image", data: png.toString("base64") },
      amount: 1
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 16, 16);
  });

  it("color.hsb (fragment, mask slot) — runs at non-trivial dims", async () => {
    const png = await solidPng(32, 24);
    const node = makeNode(ColorHsbNode, {
      image: { type: "image", data: png.toString("base64") },
      hue: 90,
      saturation: 1,
      brightness: 1
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 32, 24);
  });

  it("filters.blur (two-pass compute) — H + V pass via the runner", async () => {
    const png = await solidPng(20, 20, { r: 255, g: 255, b: 255 });
    const node = makeNode(BlurGaussianNode, {
      image: { type: "image", data: png.toString("base64") },
      radius: 4,
      sigma: 0
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 20, 20);
  });

  it("filters.pixelate (fragment) — runs", async () => {
    const png = await solidPng(64, 64);
    const node = makeNode(PixelateNode, {
      image: { type: "image", data: png.toString("base64") },
      block_size: 8
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 64, 64);
  });

  it("filters.glow (recipe) — four passes via RecipeRunner", async () => {
    const png = await solidPng(32, 32, { r: 255, g: 255, b: 255 });
    const node = makeNode(GlowNode, {
      image: { type: "image", data: png.toString("base64") },
      threshold: 0.5,
      softness: 0.1,
      radius: 4,
      intensity: 1
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 32, 32);
  });

  it("keyer.chroma_key (compute) — runs against a green frame", async () => {
    const png = await solidPng(16, 16, { r: 0, g: 255, b: 0 });
    const node = makeNode(ChromaKeyNode, {
      image: { type: "image", data: png.toString("base64") },
      key_color: { type: "color", value: "#00ff00" },
      tolerance: 0.2,
      softness: 0.05,
      spill: 0.5
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 16, 16);
  });

  it("mask.from_image (fragment) — extracts a single channel into alpha", async () => {
    const png = await solidPng(16, 16, { r: 128, g: 64, b: 32, alpha: 200 });
    const node = makeNode(MaskFromImageNode, {
      image: { type: "image", data: png.toString("base64") },
      mode: 1,
      invert: 0
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 16, 16);
  });

  it("sources.solid (zero-input source) — fills host-specified dims", async () => {
    const node = makeNode(SolidNode, {
      width: 24,
      height: 18,
      color: { type: "color", value: "#3366ff" }
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 24, 18);
  });

  it("sources.checkerboard (zero-input) — paints pattern", async () => {
    const node = makeNode(CheckerboardNode, {
      width: 32,
      height: 32,
      color_a: { type: "color", value: "#ffffff" },
      color_b: { type: "color", value: "#000000" },
      cell_size: 8
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 32, 32);
  });

  it("mixer.color_overlay (fragment) — runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(ColorOverlayNode, {
      image: { type: "image", data: png.toString("base64") },
      color: { type: "color", value: "#00ffff" },
      amount: 0.5
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 16, 16);
  });

  it("mixer.drop_shadow (recipe) — runs the four-pass DAG", async () => {
    const png = await solidPng(24, 24);
    const node = makeNode(DropShadowNode, {
      image: { type: "image", data: png.toString("base64") },
      color: { type: "color", value: "#000000" },
      offset_x: 0.05,
      offset_y: 0.05,
      radius: 4,
      intensity: 0.8
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 24, 24);
  });

  it("transform.mirror (fragment, same-as:source)", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(MirrorNode, {
      image: { type: "image", data: png.toString("base64") },
      axes: 1
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 16, 16);
  });

  it("transform.resize (host-specified dims) — emits target size", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(ResizeNode, {
      image: { type: "image", data: png.toString("base64") },
      target_width: 32,
      target_height: 24,
      mode: 1
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 32, 24);
  });

  it("transform.rotate90 (derived dims, nearest sampler) — swaps W/H for 90°", async () => {
    const png = await solidPng(16, 32);
    const node = makeNode(Rotate90Node, {
      image: { type: "image", data: png.toString("base64") },
      turns: 1
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 32, 16);
  });

  it("transform.crop (derived dims) — emits crop-rect-sized output", async () => {
    const png = await solidPng(32, 32);
    const node = makeNode(CropNode, {
      image: { type: "image", data: png.toString("base64") },
      origin_x: 0.25,
      origin_y: 0.25,
      width: 0.5,
      height: 0.5
    });
    const { output } = (await node.process()) as { output: unknown };
    expectRawRgba(output, 16, 16);
  });

  it("transform.pad (derived dims) — enlarges by pad fractions", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(PadNode, {
      image: { type: "image", data: png.toString("base64") },
      left: 0.5,
      top: 0,
      right: 0.5,
      bottom: 0,
      fill: { type: "color", value: "#00000000" }
    });
    const { output } = (await node.process()) as { output: unknown };
    // 1 + 0.5 + 0.5 = 2× width, height unchanged.
    expectRawRgba(output, 32, 16);
  });
});
