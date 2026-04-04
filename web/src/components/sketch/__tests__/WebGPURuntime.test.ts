/**
 * Tests for WebGPU runtime factory and initialization helpers.
 *
 * JSDOM doesn't have WebGPU, so these tests verify:
 * - isWebGPUAvailable returns false in JSDOM
 * - createRuntime falls back to Canvas2D when WebGPU is unavailable
 * - WebGPURuntime class exists and has correct shape
 * - Phase 3: createRuntime accepts onDeviceLost callback
 * - Phase 3: evaluateLayerEffects exists on both runtime prototypes
 */

import { Canvas2DRuntime } from "../rendering/Canvas2DRuntime";
import { WebGPURuntime } from "../rendering/WebGPURuntime";
import { isWebGPUAvailable, createRuntime } from "../rendering/initWebGPU";

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

  describe("WebGPURuntime class shape", () => {
    it("exists as a named export", () => {
      expect(WebGPURuntime).toBeDefined();
      expect(typeof WebGPURuntime).toBe("function");
    });

    it("implements the SketchRuntime interface (method existence check)", () => {
      const proto = WebGPURuntime.prototype;
      // Layer canvas management
      expect(typeof proto.getOrCreateLayerCanvas).toBe("function");
      expect(typeof proto.getLayerCanvas).toBe("function");
      expect(typeof proto.deleteLayerCanvas).toBe("function");
      expect(typeof proto.invalidateLayer).toBe("function");
      // Compositing
      expect(typeof proto.compositeToDisplay).toBe("function");
      // Readback
      expect(typeof proto.getLayerData).toBe("function");
      expect(typeof proto.snapshotLayerCanvas).toBe("function");
      expect(typeof proto.flattenToDataUrl).toBe("function");
      expect(typeof proto.getMaskDataUrl).toBe("function");
      expect(typeof proto.flattenVisible).toBe("function");
      // Layer operations
      expect(typeof proto.setLayerData).toBe("function");
      expect(typeof proto.restoreLayerCanvas).toBe("function");
      expect(typeof proto.clearLayer).toBe("function");
      expect(typeof proto.clearLayerRect).toBe("function");
      expect(typeof proto.flipLayer).toBe("function");
      expect(typeof proto.fillLayerWithColor).toBe("function");
      expect(typeof proto.fillLayerRect).toBe("function");
      expect(typeof proto.clearLayerBySelectionMask).toBe("function");
      expect(typeof proto.fillLayerBySelectionMask).toBe("function");
      expect(typeof proto.nudgeLayer).toBe("function");
      expect(typeof proto.trimLayerToBounds).toBe("function");
      expect(typeof proto.mergeLayerDown).toBe("function");
      expect(typeof proto.cropLayers).toBe("function");
      expect(typeof proto.applyAdjustments).toBe("function");
      expect(typeof proto.reconcileLayerToDocumentSpace).toBe("function");
      // Effects evaluation (Phase 3)
      expect(typeof proto.evaluateLayerEffects).toBe("function");
      // Lifecycle
      expect(typeof proto.dispose).toBe("function");
    });
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
    expect(result).toBe(sourceCanvas);
  });

  it("returns source unchanged when effects is undefined-like", () => {
    const result = runtime.evaluateLayerEffects(
      "layer1",
      sourceCanvas,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      null as any
    );
    expect(result).toBe(sourceCanvas);
  });

  it("returns source unchanged when all effects are disabled", () => {
    const result = runtime.evaluateLayerEffects("layer1", sourceCanvas, [
      { type: "brightness_contrast", enabled: false, params: { brightness: 0.5, contrast: 0 } }
    ]);
    expect(result).toBe(sourceCanvas);
  });

  it("returns a different canvas when effects are enabled", () => {
    const result = runtime.evaluateLayerEffects("layer1", sourceCanvas, [
      { type: "brightness_contrast", enabled: true, params: { brightness: 0.5, contrast: 0 } }
    ]);
    expect(result).not.toBe(sourceCanvas);
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
  });

  it("applies hue_saturation effects", () => {
    const result = runtime.evaluateLayerEffects("layer1", sourceCanvas, [
      { type: "hue_saturation", enabled: true, params: { hueDegrees: 90, saturation: 0.5, lightness: 0 } }
    ]);
    expect(result).not.toBe(sourceCanvas);
    expect(result.width).toBe(64);
  });

  it("applies exposure effects", () => {
    const result = runtime.evaluateLayerEffects("layer1", sourceCanvas, [
      { type: "exposure", enabled: true, params: { exposureStops: 1.0 } }
    ]);
    expect(result).not.toBe(sourceCanvas);
    expect(result.width).toBe(64);
  });

  it("throws for unsupported effect types in development", () => {
    // curves/tonemap/bloom are not yet implemented — they must fail loudly
    // in dev mode so unsupported effects never silently no-op.
    expect(() => {
      runtime.evaluateLayerEffects("layer1", sourceCanvas, [
        { type: "curves", enabled: true, params: { rgb: [] } }
      ]);
    }).toThrow(/not yet implemented/);
  });

  it("chains multiple enabled effects", () => {
    const result = runtime.evaluateLayerEffects("layer1", sourceCanvas, [
      { type: "brightness_contrast", enabled: true, params: { brightness: 0.2, contrast: 0.1 } },
      { type: "hue_saturation", enabled: true, params: { hueDegrees: 45, saturation: 0, lightness: 0 } }
    ]);
    expect(result).not.toBe(sourceCanvas);
  });

  it("returns source when all params are zero (no-op)", () => {
    const result = runtime.evaluateLayerEffects("layer1", sourceCanvas, [
      { type: "brightness_contrast", enabled: true, params: { brightness: 0, contrast: 0 } }
    ]);
    // brightness=0 and contrast=0 produce no filter parts
    expect(result).toBe(sourceCanvas);
  });
});
