/**
 * Tests for the rendering module barrel exports and runtime interface.
 */
import { Canvas2DRuntime } from "../rendering/Canvas2DRuntime";
import type { SketchRuntime, ActiveStrokeInfo, DirtyRect } from "../rendering/types";

describe("rendering module exports", () => {
  it("exports Canvas2DRuntime class", () => {
    expect(typeof Canvas2DRuntime).toBe("function");
  });

  it("Canvas2DRuntime implements SketchRuntime interface", () => {
    const runtime: SketchRuntime = new Canvas2DRuntime();
    // Verify all interface methods exist
    expect(typeof runtime.getOrCreateLayerCanvas).toBe("function");
    expect(typeof runtime.getLayerCanvas).toBe("function");
    expect(typeof runtime.deleteLayerCanvas).toBe("function");
    expect(typeof runtime.compositeToDisplay).toBe("function");
    expect(typeof runtime.getLayerData).toBe("function");
    expect(typeof runtime.snapshotLayerCanvas).toBe("function");
    expect(typeof runtime.flattenToDataUrl).toBe("function");
    expect(typeof runtime.getMaskDataUrl).toBe("function");
    expect(typeof runtime.flattenVisible).toBe("function");
    expect(typeof runtime.setLayerData).toBe("function");
    expect(typeof runtime.restoreLayerCanvas).toBe("function");
    expect(typeof runtime.clearLayer).toBe("function");
    expect(typeof runtime.clearLayerRect).toBe("function");
    expect(typeof runtime.flipLayer).toBe("function");
    expect(typeof runtime.fillLayerWithColor).toBe("function");
    expect(typeof runtime.fillLayerRect).toBe("function");
    expect(typeof runtime.nudgeLayer).toBe("function");
    expect(typeof runtime.mergeLayerDown).toBe("function");
    expect(typeof runtime.cropLayers).toBe("function");
    expect(typeof runtime.applyAdjustments).toBe("function");
    expect(typeof runtime.reconcileLayerToDocumentSpace).toBe("function");
    expect(typeof runtime.dispose).toBe("function");
    runtime.dispose();
  });

  it("SketchRuntime types are importable (compile-time check)", () => {
    // These type assertions verify the types are usable.
    const stroke: ActiveStrokeInfo = {
      layerId: "layer1",
      buffer: document.createElement("canvas"),
      opacity: 1,
      compositeOp: "source-over"
    };
    expect(stroke.layerId).toBe("layer1");

    const rect: DirtyRect = { x: 0, y: 0, w: 10, h: 10 };
    expect(rect.w).toBe(10);
  });
});
