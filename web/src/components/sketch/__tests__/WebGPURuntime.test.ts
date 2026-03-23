/**
 * Tests for WebGPU runtime factory and initialization helpers.
 *
 * JSDOM doesn't have WebGPU, so these tests verify:
 * - isWebGPUAvailable returns false in JSDOM
 * - createRuntime falls back to Canvas2D when WebGPU is unavailable
 * - WebGPURuntime class exists and has correct shape
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
      expect(typeof proto.nudgeLayer).toBe("function");
      expect(typeof proto.mergeLayerDown).toBe("function");
      expect(typeof proto.cropLayers).toBe("function");
      expect(typeof proto.applyAdjustments).toBe("function");
      expect(typeof proto.reconcileLayerToDocumentSpace).toBe("function");
      // Lifecycle
      expect(typeof proto.dispose).toBe("function");
    });
  });
});
