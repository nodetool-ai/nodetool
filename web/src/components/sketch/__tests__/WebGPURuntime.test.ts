/**
 * Tests for WebGPU runtime factory and initialization helpers.
 *
 * JSDOM doesn't have WebGPU, so these tests verify:
 * - isWebGPUAvailable returns false in JSDOM
 * - createRuntime falls back to Canvas2D when WebGPU is unavailable
 * - Phase 3: createRuntime accepts onDeviceLost callback
 * - Phase 3: evaluateLayerEffects exists on both runtime prototypes
 */

import { Canvas2DRuntime } from "../rendering/Canvas2DRuntime";
import { isWebGPUAvailable, createRuntime } from "../rendering/initWebGPU";
import { WebGPURuntime } from "../rendering/WebGPURuntime";
import { createDefaultDocument, createDefaultLayer, type LayerEffect } from "../types";

describe("WebGPU initialization", () => {
  describe("isWebGPUAvailable", () => {
    it("returns false in JSDOM (no WebGPU)", () => {
      expect(isWebGPUAvailable()).toBe(false);
    });
  });

  describe("createRuntime", () => {
    it("falls back to Canvas2D when WebGPU is not available", async () => {
      const { runtime, backend } = await createRuntime();
      expect(backend).toBe("canvas2d");
      expect(runtime).toBeInstanceOf(Canvas2DRuntime);
      runtime.dispose();
    });

    it("accepts a shared layer canvas map", async () => {
      const sharedMap = new Map<string, HTMLCanvasElement>();
      const { runtime, backend } = await createRuntime(sharedMap);
      expect(backend).toBe("canvas2d");
      runtime.getOrCreateLayerCanvas("test", 64, 64);
      expect(sharedMap.has("test")).toBe(true);
      runtime.dispose();
    });

    it("accepts an onDeviceLost callback", async () => {
      const onDeviceLost = jest.fn();
      const { runtime, backend } = await createRuntime(undefined, onDeviceLost);
      expect(backend).toBe("canvas2d");
      // Canvas2D fallback doesn't call onDeviceLost (no GPU device)
      expect(onDeviceLost).not.toHaveBeenCalled();
      runtime.dispose();
    });
  });

});

describe("WebGPU layer effects", () => {
  it("keeps differently sized layer effects in their own textures until the frame is submitted", () => {
    const flags = {
      GPUShaderStage: { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 },
      GPUTextureUsage: { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, RENDER_ATTACHMENT: 16 },
      GPUBufferUsage: { COPY_DST: 8, UNIFORM: 64, STORAGE: 128 }
    };
    for (const [name, value] of Object.entries(flags)) {
      Object.defineProperty(globalThis, name, { configurable: true, value });
    }
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: { getPreferredCanvasFormat: () => "rgba8unorm" }
    });

    const beginRenderPass = jest.fn((_descriptor: GPURenderPassDescriptor) => ({
      setPipeline: jest.fn(),
      setBindGroup: jest.fn(),
      draw: jest.fn(),
      end: jest.fn()
    }));
    const copyExternalImageToTexture = jest.fn();
    const createTexture = jest.fn((descriptor: GPUTextureDescriptor) => {
      const { width, height } = descriptor.size as GPUExtent3DDict;
      return { width, height, destroy: jest.fn(), createView: () => ({ label: descriptor.label }) };
    });
    const submit = jest.fn();
    const device = {
      limits: { maxTextureDimension2D: 8192 },
      lost: new Promise(() => {}),
      createShaderModule: jest.fn(),
      createBindGroupLayout: jest.fn(),
      createPipelineLayout: jest.fn(),
      createRenderPipeline: () => ({ getBindGroupLayout: jest.fn() }),
      createSampler: jest.fn(),
      createBuffer: () => ({ destroy: jest.fn() }),
      createBindGroup: jest.fn(),
      createTexture,
      createCommandEncoder: () => ({ beginRenderPass, finish: jest.fn() }),
      queue: { copyExternalImageToTexture, writeBuffer: jest.fn(), submit }
    };
    const display = document.createElement("canvas");
    jest.spyOn(display, "getContext").mockImplementation(() => ({
      configure: jest.fn(),
      getCurrentTexture: () => ({ createView: jest.fn() })
    }) as unknown as GPUCanvasContext);
    const runtime = new WebGPURuntime(device as unknown as GPUDevice);
    try {
      const doc = createDefaultDocument(32, 32);
      const first = doc.layers[0];
      const second = createDefaultLayer("Second", "raster", 16, 32);
      doc.layers.push(second);
      for (const layer of doc.layers) {
        const { width, height } = layer.contentBounds;
        runtime.getOrCreateLayerCanvas(layer.id, width, height);
        layer.effects = [{ type: "exposure", enabled: true, params: { exposureStops: 1 } }];
      }
      const filteredTextures = () => createTexture.mock.results
        .map((result) => result.value)
        .filter((texture) => texture?.createView().label?.startsWith("sketch-layer-effects-"));
      const filterPasses = () => beginRenderPass.mock.calls
        .filter(([descriptor]) => descriptor.label === "sketch-layer-effects").length;

      runtime.compositeToDisplay(display, doc, null, null);
      expect(copyExternalImageToTexture).toHaveBeenCalledTimes(2);
      expect(filterPasses()).toBe(2);
      expect(filteredTextures().map((texture) => texture?.width)).toEqual([32, 16]);
      expect(filteredTextures().every((texture) => !texture?.destroy.mock.calls.length)).toBe(true);
      expect(submit).toHaveBeenCalledTimes(1);

      runtime.compositeToDisplay(display, doc, null, null);
      expect(copyExternalImageToTexture).toHaveBeenCalledTimes(2);
      expect(filterPasses()).toBe(2);

      runtime.invalidateLayer(first.id);
      runtime.compositeToDisplay(display, doc, null, null);
      expect(copyExternalImageToTexture).toHaveBeenCalledTimes(3);
      expect(filterPasses()).toBe(3);

      const buffer = document.createElement("canvas");
      buffer.width = buffer.height = 32;
      buffer.getContext("2d");
      const stroke = { layerId: first.id, buffer, opacity: 1, compositeOp: "source-over" as const };
      runtime.compositeToDisplay(display, doc, null, stroke);
      runtime.compositeToDisplay(display, doc, null, stroke);
      expect(copyExternalImageToTexture).toHaveBeenCalledTimes(5);
      expect(filterPasses()).toBe(5);

      runtime.compositeToDisplay(display, doc, null, null);
      expect(copyExternalImageToTexture).toHaveBeenCalledTimes(5);
      expect(filterPasses()).toBe(6);
    } finally {
      runtime.dispose();
      Reflect.deleteProperty(navigator, "gpu");
      for (const name of Object.keys(flags)) Reflect.deleteProperty(globalThis, name);
    }
  });
});

describe("Canvas2DRuntime evaluateLayerEffects", () => {
  let runtime: Canvas2DRuntime;
  let sourceCanvas: HTMLCanvasElement;

  beforeEach(() => {
    runtime = new Canvas2DRuntime();
    sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 64;
    sourceCanvas.height = 64;
    const ctx = sourceCanvas.getContext("2d")!;
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, 64, 64);
  });

  afterEach(() => {
    runtime.dispose();
  });

  it("returns source unchanged when effects is empty", () => {
    const result = runtime.evaluateLayerEffects("layer1", sourceCanvas, []);
    expect(result.surface).toBe(sourceCanvas);
    expect(result.workingSpace).toBe("srgb");
    expect(result.dynamicRange).toBe("sdr");
  });

  it("returns source unchanged when effects is undefined-like", () => {
    const result = runtime.evaluateLayerEffects(
      "layer1",
      sourceCanvas,
      null
    );
    expect(result.surface).toBe(sourceCanvas);
  });

  it("returns source unchanged when all effects are disabled", () => {
    const result = runtime.evaluateLayerEffects("layer1", sourceCanvas, [
      { type: "brightness_contrast", enabled: false, params: { brightness: 0.5, contrast: 0 } }
    ]);
    expect(result.surface).toBe(sourceCanvas);
  });

  it("returns a different canvas when effects are enabled", () => {
    const result = runtime.evaluateLayerEffects("layer1", sourceCanvas, [
      { type: "brightness_contrast", enabled: true, params: { brightness: 0.5, contrast: 0 } }
    ]);
    expect(result.surface).not.toBe(sourceCanvas);
    expect(result.surface.width).toBe(64);
    expect(result.surface.height).toBe(64);
    expect(result.workingSpace).toBe("srgb");
    expect(result.dynamicRange).toBe("sdr");
  });

  it("applies hue_saturation effects", () => {
    const result = runtime.evaluateLayerEffects("layer1", sourceCanvas, [
      { type: "hue_saturation", enabled: true, params: { hueDegrees: 90, saturation: 0.5, lightness: 0 } }
    ]);
    expect(result.surface).not.toBe(sourceCanvas);
    expect(result.surface.width).toBe(64);
  });

  it("applies exposure effects", () => {
    const result = runtime.evaluateLayerEffects("layer1", sourceCanvas, [
      { type: "exposure", enabled: true, params: { exposureStops: 1.0 } }
    ]);
    expect(result.surface).not.toBe(sourceCanvas);
    expect(result.surface.width).toBe(64);
  });

  it("ignores an effect type outside the union", () => {
    // A document saved by an older build can carry an effect type this build no
    // longer knows, so the cast is the case under test rather than a type hole.
    const retired = {
      type: "tonemap",
      enabled: true,
      params: { operator: "aces" }
    } as unknown as LayerEffect;
    const result = runtime.evaluateLayerEffects("layer1", sourceCanvas, [
      retired
    ]);
    expect(result.surface).toBe(sourceCanvas);
  });

  it("chains multiple enabled effects", () => {
    const result = runtime.evaluateLayerEffects("layer1", sourceCanvas, [
      { type: "brightness_contrast", enabled: true, params: { brightness: 0.2, contrast: 0.1 } },
      { type: "hue_saturation", enabled: true, params: { hueDegrees: 45, saturation: 0, lightness: 0 } }
    ]);
    expect(result.surface).not.toBe(sourceCanvas);
  });

  it("returns source when all params are zero (no-op)", () => {
    const result = runtime.evaluateLayerEffects("layer1", sourceCanvas, [
      { type: "brightness_contrast", enabled: true, params: { brightness: 0, contrast: 0 } }
    ]);
    // brightness=0 and contrast=0 produce no filter parts
    expect(result.surface).toBe(sourceCanvas);
  });
});
