/**
 * End-to-end smoke for the GPU-backed `lib.image.*` nodes added in the
 * shader-pool integration. Verifies that one representative node per
 * sub-namespace (effects, keyer, mask, channel, warp, generators,
 * filter-extras) actually runs against Dawn and returns raw RGBA at the
 * right dimensions.
 *
 * Skips when no GPU is available. Inline ICD setup keeps the existing
 * compositor regression tests (which check PNG output) skipping where they
 * were.
 */

import "../../gpu/tests/setup/swiftshaderIcd.js";

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  ColorOverlayNode,
  OutlineNode,
  DropShadowNode,
  GlowNode,
  AddBlendNode
} from "@nodetool-ai/image-nodes";
import { ChromaKeyNode, LumaKeyNode } from "@nodetool-ai/image-nodes";
import {
  MaskApplyNode,
  MaskFromImageNode,
  MaskInvertNode
} from "@nodetool-ai/image-nodes";
import { ChannelShuffleNode, ChannelMergeNode } from "@nodetool-ai/image-nodes";
import {
  OffsetNode,
  PadNode,
  TileNode,
  AffineNode,
  CornerPinNode,
  PolarRemapNode,
  DisplaceNode,
  SpherizeNode
} from "@nodetool-ai/image-nodes";
import {
  LinearGradientNode,
  RadialGradientNode,
  AngularGradientNode,
  DiamondGradientNode,
  CheckerboardNode
} from "@nodetool-ai/image-nodes";
import {
  ThresholdNode,
  PixelateNode,
  GaussianBlurNode,
  UnsharpMaskNode,
  VignetteNode
} from "@nodetool-ai/image-nodes";
import {
  InvertNode,
  BrightnessContrastNode,
  HSBNode,
  ExposureNode,
  PosterizeNode,
  GradeNode,
  ChannelSplitNode
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

function expectRawRgba(output: unknown, width: number, height: number): void {
  expect(output).toBeTruthy();
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
}

describe.skipIf(!hasGpu)("lib.image.* GPU node smoke", () => {
  // ---- effects ----------------------------------------------------
  it("lib.image.effects.ColorOverlay runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(ColorOverlayNode, {
      image: { type: "image", data: png.toString("base64") },
      color: { type: "color", value: "#00ffff" },
      amount: 0.5
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.effects.Outline runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(OutlineNode, {
      image: { type: "image", data: png.toString("base64") },
      color: { type: "color", value: "#ffffff" },
      width: 2,
      threshold: 0.5
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.effects.DropShadow (recipe) runs", async () => {
    const png = await solidPng(24, 24);
    const node = makeNode(DropShadowNode, {
      image: { type: "image", data: png.toString("base64") },
      color: { type: "color", value: "#000000" },
      offset_x: 0.05,
      offset_y: 0.05,
      radius: 4,
      intensity: 0.8
    });
    expectRawRgba((await node.process()).output, 24, 24);
  });

  it("lib.image.effects.Glow (recipe) runs", async () => {
    const png = await solidPng(32, 32, { r: 255, g: 255, b: 255 });
    const node = makeNode(GlowNode, {
      image: { type: "image", data: png.toString("base64") },
      threshold: 0.5,
      softness: 0.1,
      radius: 4,
      intensity: 1
    });
    expectRawRgba((await node.process()).output, 32, 32);
  });

  it("lib.image.effects.Add (two-input) runs", async () => {
    const a = await solidPng(16, 16, { r: 128, g: 0, b: 0 });
    const b = await solidPng(16, 16, { r: 0, g: 128, b: 0 });
    const node = makeNode(AddBlendNode, {
      image: { type: "image", data: a.toString("base64") },
      over: { type: "image", data: b.toString("base64") },
      gain: 1
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  // ---- keyer ------------------------------------------------------
  it("lib.image.keyer.ChromaKey runs", async () => {
    const png = await solidPng(16, 16, { r: 0, g: 255, b: 0 });
    const node = makeNode(ChromaKeyNode, {
      image: { type: "image", data: png.toString("base64") },
      key_color: { type: "color", value: "#00ff00" },
      tolerance: 0.2,
      softness: 0.05,
      spill: 0.5
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.keyer.LumaKey runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(LumaKeyNode, {
      image: { type: "image", data: png.toString("base64") },
      low: 0.2,
      high: 0.8,
      softness: 0.05
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  // ---- mask -------------------------------------------------------
  it("lib.image.mask.FromImage runs", async () => {
    const png = await solidPng(16, 16, { r: 128, g: 64, b: 32, alpha: 200 });
    const node = makeNode(MaskFromImageNode, {
      image: { type: "image", data: png.toString("base64") },
      mode: 1,
      invert: 0
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.mask.Apply runs (two-input)", async () => {
    const png = await solidPng(16, 16);
    const mask = await solidPng(16, 16, { r: 0, g: 0, b: 0, alpha: 128 });
    const node = makeNode(MaskApplyNode, {
      image: { type: "image", data: png.toString("base64") },
      mask: { type: "image", data: mask.toString("base64") },
      invert: 0
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.mask.Invert runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(MaskInvertNode, {
      image: { type: "image", data: png.toString("base64") }
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  // ---- channel ----------------------------------------------------
  it("lib.image.channel.Shuffle (identity) runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(ChannelShuffleNode, {
      image: { type: "image", data: png.toString("base64") },
      r_from: 0,
      g_from: 1,
      b_from: 2,
      a_from: 3
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.channel.Merge runs (two-input)", async () => {
    const rgb = await solidPng(16, 16, { r: 255, g: 0, b: 0 });
    const alpha = await solidPng(16, 16, { r: 128, g: 128, b: 128, alpha: 200 });
    const node = makeNode(ChannelMergeNode, {
      image: { type: "image", data: rgb.toString("base64") },
      alpha: { type: "image", data: alpha.toString("base64") },
      alpha_channel: 3
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  // ---- warp -------------------------------------------------------
  it("lib.image.warp.Offset runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(OffsetNode, {
      image: { type: "image", data: png.toString("base64") },
      dx: 0.25,
      dy: 0,
      wrap: 1
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.warp.Pad (derived dims) enlarges by pad fractions", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(PadNode, {
      image: { type: "image", data: png.toString("base64") },
      left: 0.5,
      top: 0,
      right: 0.5,
      bottom: 0,
      color: { type: "color", value: "#00000000" }
    });
    expectRawRgba((await node.process()).output, 32, 16);
  });

  it("lib.image.warp.Tile runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(TileNode, {
      image: { type: "image", data: png.toString("base64") },
      tiles_x: 2,
      tiles_y: 2,
      wrap: 1
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.warp.Affine (identity) runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(AffineNode, {
      image: { type: "image", data: png.toString("base64") },
      target_width: 0,
      target_height: 0,
      m00: 1,
      m01: 0,
      tx: 0,
      m10: 0,
      m11: 1,
      ty: 0
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.warp.CornerPin (identity) runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(CornerPinNode, {
      image: { type: "image", data: png.toString("base64") },
      h00: 1,
      h01: 0,
      h02: 0,
      h10: 0,
      h11: 1,
      h12: 0,
      h20: 0,
      h21: 0
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.warp.PolarRemap runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(PolarRemapNode, {
      image: { type: "image", data: png.toString("base64") },
      mode: 0
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.warp.Displace (two-input) runs", async () => {
    const src = await solidPng(16, 16);
    const disp = await solidPng(16, 16, { r: 128, g: 128, b: 0 });
    const node = makeNode(DisplaceNode, {
      image: { type: "image", data: src.toString("base64") },
      displacement: { type: "image", data: disp.toString("base64") },
      amount_x: 0.05,
      amount_y: 0.05
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.warp.Spherize runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(SpherizeNode, {
      image: { type: "image", data: png.toString("base64") },
      amount: 0.5
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  // ---- generators -------------------------------------------------
  it("lib.image.draw.LinearGradient runs (zero-input)", async () => {
    const node = makeNode(LinearGradientNode, {
      width: 24,
      height: 24,
      color_a: { type: "color", value: "#000000" },
      color_b: { type: "color", value: "#ffffff" },
      angle: 45,
      midpoint: 0.5
    });
    expectRawRgba((await node.process()).output, 24, 24);
  });

  it("lib.image.draw.RadialGradient runs", async () => {
    const node = makeNode(RadialGradientNode, {
      width: 32,
      height: 32,
      color_inner: { type: "color", value: "#ffffff" },
      color_outer: { type: "color", value: "#000000" },
      radius: 0.5
    });
    expectRawRgba((await node.process()).output, 32, 32);
  });

  it("lib.image.draw.AngularGradient runs", async () => {
    const node = makeNode(AngularGradientNode, {
      width: 32,
      height: 32,
      color_a: { type: "color", value: "#000000" },
      color_b: { type: "color", value: "#ffffff" },
      rotation: 0
    });
    expectRawRgba((await node.process()).output, 32, 32);
  });

  it("lib.image.draw.DiamondGradient runs", async () => {
    const node = makeNode(DiamondGradientNode, {
      width: 32,
      height: 32,
      color_inner: { type: "color", value: "#ffffff" },
      color_outer: { type: "color", value: "#000000" },
      radius: 0.5
    });
    expectRawRgba((await node.process()).output, 32, 32);
  });

  it("lib.image.draw.Checkerboard runs", async () => {
    const node = makeNode(CheckerboardNode, {
      width: 32,
      height: 32,
      color_a: { type: "color", value: "#ffffff" },
      color_b: { type: "color", value: "#000000" },
      cell_size: 8
    });
    expectRawRgba((await node.process()).output, 32, 32);
  });

  // ---- filter extras ----------------------------------------------
  it("lib.image.filter.Threshold runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(ThresholdNode, {
      image: { type: "image", data: png.toString("base64") },
      threshold: 0.5,
      softness: 0.05
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.filter.Pixelate runs", async () => {
    const png = await solidPng(32, 32);
    const node = makeNode(PixelateNode, {
      image: { type: "image", data: png.toString("base64") },
      cell_size: 4
    });
    expectRawRgba((await node.process()).output, 32, 32);
  });

  it("lib.image.filter.GaussianBlur (separable recipe) runs", async () => {
    const png = await solidPng(32, 32);
    const node = makeNode(GaussianBlurNode, {
      image: { type: "image", data: png.toString("base64") },
      radius: 4,
      sigma: 0
    });
    expectRawRgba((await node.process()).output, 32, 32);
  });

  it("lib.image.filter.UnsharpMask runs", async () => {
    const png = await solidPng(32, 32);
    const node = makeNode(UnsharpMaskNode, {
      image: { type: "image", data: png.toString("base64") },
      amount: 1.5,
      threshold: 0
    });
    expectRawRgba((await node.process()).output, 32, 32);
  });

  it("lib.image.filter.Vignette runs", async () => {
    const png = await solidPng(32, 32);
    const node = makeNode(VignetteNode, {
      image: { type: "image", data: png.toString("base64") },
      intensity: 0.5,
      radius: 0.9,
      softness: 0.5
    });
    expectRawRgba((await node.process()).output, 32, 32);
  });

  // ---- color ------------------------------------------------------
  it("lib.image.color.Invert runs", async () => {
    const png = await solidPng(16, 16, { r: 200, g: 100, b: 50 });
    const node = makeNode(InvertNode, {
      image: { type: "image", data: png.toString("base64") },
      amount: 1
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.color.BrightnessContrast runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(BrightnessContrastNode, {
      image: { type: "image", data: png.toString("base64") },
      brightness: 0.1,
      contrast: 1.2
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.color.HSB runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(HSBNode, {
      image: { type: "image", data: png.toString("base64") },
      hue: 90,
      saturation: 1.5,
      brightness: 1
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.color.Exposure runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(ExposureNode, {
      image: { type: "image", data: png.toString("base64") },
      stops: 0.5
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.color.Posterize runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(PosterizeNode, {
      image: { type: "image", data: png.toString("base64") },
      levels: 4
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.color.Grade runs", async () => {
    const png = await solidPng(16, 16);
    const node = makeNode(GradeNode, {
      image: { type: "image", data: png.toString("base64") },
      brightness: 0.05,
      contrast: 1.1,
      saturation: 1.1,
      hue: 10,
      temperature: 0.1,
      tint: -0.05,
      shadows: 0.1,
      highlights: -0.1
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });

  it("lib.image.color.ChannelSplit runs", async () => {
    const png = await solidPng(16, 16, { r: 200, g: 100, b: 50 });
    const node = makeNode(ChannelSplitNode, {
      image: { type: "image", data: png.toString("base64") },
      mode: 0
    });
    expectRawRgba((await node.process()).output, 16, 16);
  });
});
