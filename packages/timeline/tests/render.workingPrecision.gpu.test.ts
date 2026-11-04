import { expect, it } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { HeadlessFrameCompositor, type FrameLayer } from "../src/render/frameCompositor.js";

it("keeps default and explicit RGBA8 byte delivery identical", async () => {
  const device = await getNodeGPUDevice();
  const implicit = new HeadlessFrameCompositor(device, 1, 1);
  const explicit = new HeadlessFrameCompositor(device, 1, 1, { workingFormat: "rgba8unorm" });
  const layer: FrameLayer = { id: "source", source: { rgba: new Uint8Array([160, 80, 40, 128]), width: 1, height: 1 }, opacity: 1, blendMode: "normal", zIndex: 0 };
  try {
    const baseline = await implicit.renderFrame([layer]);
    expect(baseline).toEqual(await explicit.renderFrame([layer]));
    expect(Array.from(baseline)).toEqual([80, 40, 20, 255]);
  } finally {
    implicit.dispose();
    explicit.dispose();
  }
});


it("opts into FP16 accumulation and keeps byte delivery and versioned source uploads", async () => {
  const device = await getNodeGPUDevice();
  const renderer = new HeadlessFrameCompositor(device, 1, 1, { workingFormat: "rgba16float" });
  const layer: FrameLayer = { id: "source", source: { rgba: new Uint8Array([160, 80, 40, 255]), width: 1, height: 1, version: "" }, opacity: 1, blendMode: "normal", zIndex: 0 };
  device.pushErrorScope("validation");
  try {
    expect(Array.from(await renderer.renderFrame([layer]))).toEqual([160, 80, 40, 255]);
    layer.source = { rgba: new Uint8Array([40, 80, 160, 255]), width: 1, height: 1, version: "next" };
    expect(Array.from(await renderer.renderFrame([layer]))).toEqual([40, 80, 160, 255]);
    layer.source = { rgba: new Uint8Array([20, 60, 100, 255, 20, 60, 100, 255]), width: 2, height: 1, version: "next" };
    expect(Array.from(await renderer.renderFrame([layer]))).toEqual([20, 60, 100, 255]);
    layer.crop = { left: 0.5, right: 0, top: 0, bottom: 0 };
    expect(Array.from(await renderer.renderFrame([layer]))).toEqual([20, 60, 100, 255]);
    expect((await renderer.renderFrame([])).length).toBe(4);
  } finally {
    renderer.dispose();
    expect(await device.popErrorScope()).toBeNull();
  }
});
