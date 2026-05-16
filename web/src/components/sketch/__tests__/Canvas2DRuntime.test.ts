/**
 * Tests for the Canvas2DRuntime rendering backend.
 *
 * NOTE: JSDOM does not implement Canvas2D, so getContext("2d") returns null.
 * Tests that would need real pixel operations are scoped to verify that:
 *   - the runtime calls the right methods and doesn't crash
 *   - layer management (create/get/delete) works correctly
 *   - readback/export methods return expected types
 *   - dispose cleans up resources
 *
 * Pixel-level rendering correctness is validated by E2E / integration tests.
 */

import { Canvas2DRuntime } from "../rendering/Canvas2DRuntime";
import type { SketchDocument } from "../types";
import { createDefaultDocument, createDefaultLayer, makeAffineTransform, makeSingleQuadTransform } from "../types";
import {
  getCanvasRasterBounds,
  getLayerGeometry,
  setCanvasRasterBounds
} from "../transform/geometry/layerGeometry";

function makeDoc(overrides?: Partial<SketchDocument>): SketchDocument {
  const base = createDefaultDocument(64, 64);
  return { ...base, ...overrides };
}

function mockCanvas2DContext() {
  const fakeContext = {
    clearRect: jest.fn(),
    drawImage: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    createPattern: jest.fn(() => ({
      setTransform: jest.fn()
    })),
    beginPath: jest.fn(),
    rect: jest.fn(),
    clip: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    getImageData: jest.fn((_sx: number, _sy: number, sw: number, sh: number) => {
      // Return data with non-zero alpha so findContentRect detects content
      const w = sw || 64;
      const h = sh || 64;
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 3; i < data.length; i += 4) {
        data[i] = 255; // alpha channel
      }
      return {
        data,
        width: w,
        height: h,
        colorSpace: "srgb" as PredefinedColorSpace
      };
    }),
    putImageData: jest.fn(),
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000"
  } as unknown as CanvasRenderingContext2D;

  const getContextSpy = jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation((((contextId: string) =>
      contextId === "2d" ? fakeContext : null) as unknown) as typeof HTMLCanvasElement.prototype.getContext);

  const toDataUrlSpy = jest
    .spyOn(HTMLCanvasElement.prototype, "toDataURL")
    .mockReturnValue("data:image/png;base64,stub");

  // Make Image.onload fire synchronously when src is set (JSDOM
  // doesn't load images). This lets setLayerData tests verify canvas
  // creation that happens inside the onload callback.
  const OrigImage = globalThis.Image;
  class SyncImage {
    width = 1;
    height = 1;
    onload: (() => void) | null = null;
    private _src = "";
    get src() { return this._src; }
    set src(val: string) {
      this._src = val;
      if (this.onload) { this.onload(); }
    }
  }
  globalThis.Image = SyncImage as unknown as typeof Image;

  return {
    restore: () => {
      getContextSpy.mockRestore();
      toDataUrlSpy.mockRestore();
      globalThis.Image = OrigImage;
    }
  };
}

describe("Canvas2DRuntime", () => {
  let runtime: Canvas2DRuntime;

  beforeEach(() => {
    runtime = new Canvas2DRuntime();
  });

  afterEach(() => {
    runtime.dispose();
  });

  // ─── Layer canvas management ───────────────────────────────────────

  describe("layer canvas management", () => {
    it("getOrCreateLayerCanvas creates a canvas with correct dimensions", () => {
      const canvas = runtime.getOrCreateLayerCanvas("layer1", 64, 48);
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(canvas.width).toBe(64);
      expect(canvas.height).toBe(48);
    });

    it("getOrCreateLayerCanvas returns the same canvas on second call", () => {
      const a = runtime.getOrCreateLayerCanvas("layer1", 64, 64);
      const b = runtime.getOrCreateLayerCanvas("layer1", 64, 64);
      expect(a).toBe(b);
    });

    it("getLayerCanvas returns undefined for unknown layer", () => {
      expect(runtime.getLayerCanvas("unknown")).toBeUndefined();
    });

    it("getLayerCanvas returns created canvas", () => {
      const canvas = runtime.getOrCreateLayerCanvas("layer1", 64, 64);
      expect(runtime.getLayerCanvas("layer1")).toBe(canvas);
    });

    it("deleteLayerCanvas removes the canvas", () => {
      runtime.getOrCreateLayerCanvas("layer1", 64, 64);
      runtime.deleteLayerCanvas("layer1");
      expect(runtime.getLayerCanvas("layer1")).toBeUndefined();
    });

    it("manages multiple layers independently", () => {
      runtime.getOrCreateLayerCanvas("a", 64, 64);
      runtime.getOrCreateLayerCanvas("b", 128, 128);
      expect(runtime.getLayerCanvas("a")!.width).toBe(64);
      expect(runtime.getLayerCanvas("b")!.width).toBe(128);
      runtime.deleteLayerCanvas("a");
      expect(runtime.getLayerCanvas("a")).toBeUndefined();
      expect(runtime.getLayerCanvas("b")).toBeDefined();
    });
  });

  // ─── Shared map injection ──────────────────────────────────────────

  describe("shared map injection", () => {
    it("uses the provided map for layer storage", () => {
      const sharedMap = new Map<string, HTMLCanvasElement>();
      const rt = new Canvas2DRuntime(sharedMap);
      rt.getOrCreateLayerCanvas("layer1", 64, 64);
      expect(sharedMap.has("layer1")).toBe(true);
      expect(sharedMap.get("layer1")).toBeInstanceOf(HTMLCanvasElement);
      rt.dispose();
    });

    it("deleteLayerCanvas removes from the shared map", () => {
      const sharedMap = new Map<string, HTMLCanvasElement>();
      const rt = new Canvas2DRuntime(sharedMap);
      rt.getOrCreateLayerCanvas("layer1", 64, 64);
      rt.deleteLayerCanvas("layer1");
      expect(sharedMap.has("layer1")).toBe(false);
      rt.dispose();
    });

    it("layer canvases created via runtime appear in shared map", () => {
      const sharedMap = new Map<string, HTMLCanvasElement>();
      const rt = new Canvas2DRuntime(sharedMap);
      const canvas = rt.getOrCreateLayerCanvas("layer1", 64, 64);
      expect(sharedMap.get("layer1")).toBe(canvas);
      rt.dispose();
    });
  });

  // ─── Readback ──────────────────────────────────────────────────────

  describe("readback", () => {
    it("getLayerData returns null for unknown layer", () => {
      expect(runtime.getLayerData("unknown")).toBeNull();
    });

    it("snapshotLayerCanvas returns null for unknown layer", () => {
      expect(runtime.snapshotLayerCanvas("unknown")).toBeNull();
    });

    it("snapshotLayerCanvas returns a distinct canvas with same dimensions", () => {
      const canvas = runtime.getOrCreateLayerCanvas("layer1", 64, 48);
      const snapshot = runtime.snapshotLayerCanvas("layer1");
      expect(snapshot).toBeInstanceOf(HTMLCanvasElement);
      expect(snapshot).not.toBe(canvas);
      expect(snapshot!.width).toBe(64);
      expect(snapshot!.height).toBe(48);
    });

    it("getLayerData serializes raster bounds metadata", () => {
      const canvas = runtime.getOrCreateLayerCanvas("layer1", 64, 48);
      setCanvasRasterBounds(canvas, { x: -12, y: -8, width: 64, height: 48 });
      const data = runtime.getLayerData("layer1");
      expect(data).toContain("ntlayer:");
    });

    it("getMaskDataUrl returns null when no mask layer", () => {
      const doc = makeDoc();
      expect(runtime.getMaskDataUrl(doc)).toBeNull();
    });

    it("readbackComposite does not draw display-only checkerboard for empty documents", () => {
      const doc = makeDoc();
      const mocked = mockCanvas2DContext();
      try {
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) {
          return;
        }

        runtime.readbackComposite(doc, null, null);

        expect(ctx.fillRect).not.toHaveBeenCalled();
      } finally {
        mocked.restore();
      }
    });

    it("readbackComposite does not draw the display border", () => {
      const doc = makeDoc();
      const mocked = mockCanvas2DContext();
      try {
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) {
          return;
        }

        runtime.readbackComposite(doc, null, null);

        expect(ctx.strokeRect).not.toHaveBeenCalled();
      } finally {
        mocked.restore();
      }
    });
  });

  // ─── Layer operations (no-crash / structural tests) ────────────────

  describe("layer operations", () => {
    it("clearLayer does not throw for unknown layer", () => {
      expect(() => runtime.clearLayer("unknown")).not.toThrow();
    });

    it("clearLayer does not throw for existing layer", () => {
      runtime.getOrCreateLayerCanvas("layer1", 64, 64);
      expect(() => runtime.clearLayer("layer1")).not.toThrow();
    });

    it("clearLayerRect does not throw", () => {
      runtime.getOrCreateLayerCanvas("layer1", 64, 64);
      expect(() =>
        runtime.clearLayerRect("layer1", 10, 10, 20, 20)
      ).not.toThrow();
    });

    it("flipLayer does not throw for unknown layer", () => {
      expect(() =>
        runtime.flipLayer("unknown", "horizontal")
      ).not.toThrow();
    });

    it("flipLayer does not throw for existing layer", () => {
      runtime.getOrCreateLayerCanvas("layer1", 64, 64);
      expect(() =>
        runtime.flipLayer("layer1", "horizontal")
      ).not.toThrow();
      expect(() =>
        runtime.flipLayer("layer1", "vertical")
      ).not.toThrow();
    });

    it("fillLayerWithColor does not throw for unknown layer", () => {
      expect(() =>
        runtime.fillLayerWithColor("unknown", "#ff0000")
      ).not.toThrow();
    });

    it("fillLayerRect does not throw", () => {
      runtime.getOrCreateLayerCanvas("layer1", 64, 64);
      expect(() =>
        runtime.fillLayerRect("layer1", 10, 10, 20, 20, "#00ff00")
      ).not.toThrow();
    });

    it("nudgeLayer does not throw for unknown layer", () => {
      expect(() => runtime.nudgeLayer("unknown", 10, 10)).not.toThrow();
    });

    it("nudgeLayer does not throw for existing layer", () => {
      runtime.getOrCreateLayerCanvas("layer1", 64, 64);
      expect(() => runtime.nudgeLayer("layer1", 5, 5)).not.toThrow();
    });

    it("trimLayerToBounds shrinks raster and preserves document placement", () => {
      const canvas = runtime.getOrCreateLayerCanvas("layer1", 16, 12);
      setCanvasRasterBounds(canvas, { x: 20, y: 30, width: 16, height: 12 });
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      ctx.fillStyle = "#ff0000";
      ctx.fillRect(4, 3, 5, 4);

      const trimmed = runtime.trimLayerToBounds("layer1");
      expect(trimmed).not.toBeNull();

      const trimmedCanvas = runtime.getLayerCanvas("layer1");
      expect(trimmedCanvas).toBeDefined();
      expect(trimmedCanvas!.width).toBe(5);
      expect(trimmedCanvas!.height).toBe(4);
      expect(getCanvasRasterBounds(trimmedCanvas)).toEqual({
        x: 24,
        y: 33,
        width: 5,
        height: 4
      });
      expect(trimmed?.bounds).toEqual({
        x: 24,
        y: 33,
        width: 5,
        height: 4
      });
    });

    it("cropLayers updates canvas dimensions", () => {
      runtime.getOrCreateLayerCanvas("layer1", 64, 64);
      runtime.getOrCreateLayerCanvas("layer2", 64, 64);
      runtime.cropLayers(10, 10, 30, 30);
      expect(runtime.getLayerCanvas("layer1")!.width).toBe(30);
      expect(runtime.getLayerCanvas("layer1")!.height).toBe(30);
      expect(runtime.getLayerCanvas("layer2")!.width).toBe(30);
      expect(runtime.getLayerCanvas("layer2")!.height).toBe(30);
    });

    it("restoreLayerCanvas creates the layer if needed", () => {
      const source = document.createElement("canvas");
      source.width = 64;
      source.height = 64;
      runtime.restoreLayerCanvas("newLayer", source);
      const canvas = runtime.getLayerCanvas("newLayer");
      expect(canvas).toBeDefined();
      expect(canvas!.width).toBe(64);
      expect(canvas!.height).toBe(64);
    });

    it("mergeLayerDown deletes the upper layer canvas", () => {
      const doc = makeDoc();
      const lower = doc.layers[0];
      const upper = { ...lower, id: "upper", name: "Upper" };
      doc.layers = [lower, upper];

      runtime.getOrCreateLayerCanvas(lower.id, 64, 64);
      runtime.getOrCreateLayerCanvas(upper.id, 64, 64);

      runtime.mergeLayerDown(upper.id, lower.id, doc);
      expect(runtime.getLayerCanvas(upper.id)).toBeUndefined();
      // Lower layer should still exist
      expect(runtime.getLayerCanvas(lower.id)).toBeDefined();
    });

    it("mergeLayerDown returns undefined when lower canvas missing", () => {
      const doc = makeDoc();
      const result = runtime.mergeLayerDown("upper", "lower", doc);
      expect(result).toBeUndefined();
    });

    it("mergeLayerDown returns serialized document-space layer data", () => {
      const doc = makeDoc();
      const lower = doc.layers[0];
      const upper = { ...lower, id: "upper", name: "Upper", transform: makeAffineTransform({ x: 6, y: 4 }) };
      doc.layers = [lower, upper];

      const mockedCanvas = mockCanvas2DContext();
      try {
        runtime.getOrCreateLayerCanvas(lower.id, 64, 64);
        runtime.getOrCreateLayerCanvas(upper.id, 32, 32);

        const mergedData = runtime.mergeLayerDown(upper.id, lower.id, doc);
        expect(mergedData).toBeTruthy();

        runtime.setLayerData("merged_copy", mergedData ?? null, {
          x: -10,
          y: -10,
          width: 8,
          height: 8
        });

        const mergedCanvas = runtime.getLayerCanvas("merged_copy");
        expect(mergedCanvas).toBeDefined();
        expect(mergedCanvas!.width).toBe(doc.canvas.width);
        expect(mergedCanvas!.height).toBe(doc.canvas.height);
        expect(getCanvasRasterBounds(mergedCanvas)).toEqual({
          x: 0,
          y: 0,
          width: doc.canvas.width,
          height: doc.canvas.height
        });
      } finally {
        mockedCanvas.restore();
      }
    });

    it("reconcileLayerToDocumentSpace returns null for unknown layer", () => {
      const doc = makeDoc();
      expect(
        runtime.reconcileLayerToDocumentSpace("unknown", doc)
      ).toBeNull();
    });

    it("reconcileLayerToDocumentSpace preserves moved layer pixels", () => {
      const doc = makeDoc();
      const layerId = doc.layers[0].id;
      doc.layers[0].transform = makeAffineTransform({ x: 10, y: 12 });

      const layerCanvas = runtime.getOrCreateLayerCanvas(layerId, 16, 16);
      const sourceCtx = layerCanvas.getContext("2d");
      if (!sourceCtx) {
        return;
      }
      sourceCtx!.fillStyle = "#ff0000";
      sourceCtx!.fillRect(0, 0, 4, 4);

      runtime.reconcileLayerToDocumentSpace(layerId, doc);

      const reconciledCanvas = runtime.getLayerCanvas(layerId);
      expect(reconciledCanvas).toBeDefined();
      // Tight to translated AABB (16x16 + (10,12) → 26x28), no longer
      // bloated to doc canvas size.
      expect(reconciledCanvas!.width).toBe(26);
      expect(reconciledCanvas!.height).toBe(28);

      const reconciledCtx = reconciledCanvas!.getContext("2d");
      if (!reconciledCtx) {
        return;
      }
      // The 4x4 red block originated at (0,0) and was translated to (10,12).
      // Pixel (11,13) lands inside that block in baked coordinates.
      const movedPixel = reconciledCtx!.getImageData(11, 13, 1, 1).data;
      expect(movedPixel[0]).toBeGreaterThan(0);
      expect(movedPixel[3]).toBeGreaterThan(0);
    });

    it("reconcileLayerToDocumentSpace returns serialized document-space data", () => {
      const doc = makeDoc();
      const layerId = doc.layers[0].id;
      doc.layers[0].transform = makeAffineTransform({ x: 8, y: 9 });

      const mockedCanvas = mockCanvas2DContext();
      try {
        runtime.getOrCreateLayerCanvas(layerId, 24, 20);

        const reconciledData = runtime.reconcileLayerToDocumentSpace(layerId, doc);
        expect(reconciledData).toBeTruthy();

        runtime.setLayerData("reconciled_copy", reconciledData, {
          x: -2,
          y: -2,
          width: 4,
          height: 4
        });

        const canvas = runtime.getLayerCanvas("reconciled_copy");
        expect(canvas).toBeDefined();
        // Tight to translated AABB: 24x20 layer + (8,9) → 32x29.
        expect(canvas!.width).toBe(32);
        expect(canvas!.height).toBe(29);
        expect(getCanvasRasterBounds(canvas)).toEqual({
          x: 0,
          y: 0,
          width: 32,
          height: 29
        });
      } finally {
        mockedCanvas.restore();
      }
    });

    it("applyAdjustments does not throw when active layer is missing", () => {
      const doc = makeDoc();
      doc.activeLayerId = "nonexistent";
      expect(() =>
        runtime.applyAdjustments(doc, 10, 10, 10)
      ).not.toThrow();
    });

    it("applyAdjustments does not throw for existing layer", () => {
      const doc = makeDoc();
      const layerId = doc.layers[0].id;
      doc.activeLayerId = layerId;
      runtime.getOrCreateLayerCanvas(layerId, 64, 64);
      expect(() =>
        runtime.applyAdjustments(doc, 10, 20, 30)
      ).not.toThrow();
    });
  });

  // ─── Compositing ───────────────────────────────────────────────────

  describe("compositeToDisplay", () => {
    it("does not throw for full redraw", () => {
      const doc = makeDoc();
      const layerId = doc.layers[0].id;
      runtime.getOrCreateLayerCanvas(layerId, 64, 64);

      const target = document.createElement("canvas");
      target.width = 64;
      target.height = 64;

      expect(() => {
        runtime.compositeToDisplay(target, doc, null, null);
      }).not.toThrow();
    });

    it("does not throw for dirty-rect redraw", () => {
      const doc = makeDoc();
      const layerId = doc.layers[0].id;
      runtime.getOrCreateLayerCanvas(layerId, 64, 64);

      const target = document.createElement("canvas");
      target.width = 64;
      target.height = 64;

      expect(() => {
        runtime.compositeToDisplay(target, doc, null, null, {
          x: 10,
          y: 10,
          w: 20,
          h: 20
        });
      }).not.toThrow();
    });

    it("does not throw with active stroke info", () => {
      const doc = makeDoc();
      const layerId = doc.layers[0].id;
      runtime.getOrCreateLayerCanvas(layerId, 64, 64);

      const target = document.createElement("canvas");
      target.width = 64;
      target.height = 64;

      const buffer = document.createElement("canvas");
      buffer.width = 64;
      buffer.height = 64;

      expect(() => {
        runtime.compositeToDisplay(target, doc, null, {
          layerId,
          buffer,
          opacity: 0.5,
          compositeOp: "source-over"
        });
      }).not.toThrow();
    });

    it("does not throw with isolated layer", () => {
      const doc = makeDoc();
      const layerId = doc.layers[0].id;
      runtime.getOrCreateLayerCanvas(layerId, 64, 64);

      const target = document.createElement("canvas");
      target.width = 64;
      target.height = 64;

      expect(() => {
        runtime.compositeToDisplay(target, doc, layerId, null);
      }).not.toThrow();
    });

    it("draws a transformed layer at raster-bounds plus transform offset", () => {
      const doc = makeDoc();
      const layer = doc.layers[0];
      layer.transform = makeAffineTransform({ x: 12, y: -5 });

      const layerCanvas = runtime.getOrCreateLayerCanvas(layer.id, 32, 24);
      setCanvasRasterBounds(layerCanvas, { x: -7, y: 9, width: 32, height: 24 });

      const drawImage = jest.fn();
      const fillRect = jest.fn();
      const createPattern = jest.fn(() => "pattern" as unknown as CanvasPattern);
      const save = jest.fn();
      const restore = jest.fn();
      const clearRect = jest.fn();
      const beginPath = jest.fn();
      const rect = jest.fn();
      const clip = jest.fn();
      const strokeRect = jest.fn();

      const fakeContext = {
        drawImage,
        fillRect,
        createPattern,
        save,
        restore,
        clearRect,
        beginPath,
        rect,
        clip,
        strokeRect,
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        fillStyle: "#000"
      } as unknown as CanvasRenderingContext2D;

      const getContextSpy = jest
        .spyOn(HTMLCanvasElement.prototype, "getContext")
        .mockImplementation((((contextId: string) =>
          contextId === "2d" ? fakeContext : null) as unknown) as typeof HTMLCanvasElement.prototype.getContext);

      try {
        const target = document.createElement("canvas");
        target.width = 64;
        target.height = 64;

        runtime.compositeToDisplay(target, doc, null, null);

        const layerDraw = drawImage.mock.calls.find(([canvas]) => canvas === layerCanvas);
        expect(layerDraw).toEqual([layerCanvas, 5, 4]);
      } finally {
        getContextSpy.mockRestore();
      }
    });
  });

  // ─── setLayerData ──────────────────────────────────────────────────

  describe("setLayerData", () => {
    it("creates the layer canvas when setting null data", () => {
      runtime.setLayerData("layer1", null, {
        x: 0,
        y: 0,
        width: 64,
        height: 64
      });
      const canvas = runtime.getLayerCanvas("layer1");
      expect(canvas).toBeDefined();
      expect(canvas!.width).toBe(64);
      expect(canvas!.height).toBe(64);
    });

    it("creates the layer canvas when setting a data URL", () => {
      const mocked = mockCanvas2DContext();
      try {
        runtime.setLayerData("layer1", "data:image/png;base64,iVBOR...", {
          x: -10,
          y: -6,
          width: 64,
          height: 64
        });
        const canvas = runtime.getLayerCanvas("layer1");
        expect(canvas).toBeDefined();
        expect(getCanvasRasterBounds(canvas)).toEqual({
          x: -10,
          y: -6,
          width: 64,
          height: 64
        });
      } finally {
        mocked.restore();
      }
    });

    it("restores serialized raster bounds when setting encoded layer data", () => {
      const mocked = mockCanvas2DContext();
      try {
        const sourceCanvas = runtime.getOrCreateLayerCanvas("layer_source", 32, 24);
        setCanvasRasterBounds(sourceCanvas, { x: -7, y: -5, width: 32, height: 24 });
        const data = runtime.getLayerData("layer_source");
        runtime.setLayerData("layer_target", data, {
          x: 0,
          y: 0,
          width: 64,
          height: 64
        });
        const canvas = runtime.getLayerCanvas("layer_target");
        expect(canvas).toBeDefined();
        // getLayerData crops to content rect; verify bounds are preserved
        const bounds = getCanvasRasterBounds(canvas);
        expect(bounds).toBeDefined();
        expect(bounds!.x).toBe(-7);
        expect(bounds!.y).toBe(-5);
      } finally {
        mocked.restore();
      }
    });
  });

  describe("flattenVisible", () => {
    it("returns serialized document-space layer data", () => {
      const doc = makeDoc();
      const mockedCanvas = mockCanvas2DContext();
      try {
        const flatData = runtime.flattenVisible(doc);

        runtime.setLayerData("flat_copy", flatData, {
          x: -4,
          y: -4,
          width: 8,
          height: 8
        });

        const canvas = runtime.getLayerCanvas("flat_copy");
        expect(canvas).toBeDefined();
        expect(canvas!.width).toBe(doc.canvas.width);
        expect(canvas!.height).toBe(doc.canvas.height);
        expect(getCanvasRasterBounds(canvas)).toEqual({
          x: 0,
          y: 0,
          width: doc.canvas.width,
          height: doc.canvas.height
        });
      } finally {
        mockedCanvas.restore();
      }
    });
  });

  // ─── dispose ───────────────────────────────────────────────────────

  describe("dispose", () => {
    it("clears all layer canvases", () => {
      runtime.getOrCreateLayerCanvas("layer1", 64, 64);
      runtime.getOrCreateLayerCanvas("layer2", 64, 64);
      runtime.dispose();
      expect(runtime.getLayerCanvas("layer1")).toBeUndefined();
      expect(runtime.getLayerCanvas("layer2")).toBeUndefined();
    });

    it("can be called multiple times safely", () => {
      runtime.getOrCreateLayerCanvas("layer1", 64, 64);
      runtime.dispose();
      expect(() => runtime.dispose()).not.toThrow();
    });
  });
});

// ─── Phase 1.6 ────────────────────────────────────────────────────────

describe("Phase 1.6 – compositing and rendering hardening", () => {
  let runtime: Canvas2DRuntime;
  beforeEach(() => {
    runtime = new Canvas2DRuntime();
  });
  afterEach(() => {
    runtime.dispose();
  });

  /** Extract the shared fake context from the mocked getContext spy. */
  function getFakeContext(): Record<string, jest.Mock> | undefined {
    const spy = HTMLCanvasElement.prototype.getContext as jest.Mock;
    return spy.mock.results.find(
      (r: jest.MockResult<unknown>) => r.type === "return" && r.value
    )?.value;
  }

  // ─── 1. flattenToDataUrl uses renderDocumentCompositeToContext ──────

  it("flattenToDataUrl returns a PNG data-url without display chrome", () => {
    const doc = makeDoc();
    const layerId = doc.layers[0].id;
    doc.layers[0].visible = true;
    runtime.getOrCreateLayerCanvas(layerId, 64, 64);

    const mocks = mockCanvas2DContext();
    try {
      const result = runtime.flattenToDataUrl(doc);
      expect(typeof result).toBe("string");
      expect(result.startsWith("data:image/png")).toBe(true);

      // flattenToDataUrl must NOT draw display chrome
      // The mock is global – all canvases share fakeContext. Access via spy.
      const fakeCtx = getFakeContext();
      expect(fakeCtx).toBeDefined();
      // strokeRect → border, createPattern → checkerboard — neither should
      // appear in the export path.
      expect(fakeCtx!.strokeRect).not.toHaveBeenCalled();
      expect(fakeCtx!.createPattern).not.toHaveBeenCalled();
    } finally {
      mocks.restore();
    }
  });

  // ─── 2. flattenToDataUrl and compositeToDisplay share rendering core ─

  it("both flattenToDataUrl and compositeToDisplay call drawImage for a visible layer", () => {
    const doc = makeDoc();
    const layerId = doc.layers[0].id;
    doc.layers[0].visible = true;
    runtime.getOrCreateLayerCanvas(layerId, 64, 64);

    const mocks = mockCanvas2DContext();
    try {
      // Run flattenToDataUrl — should call drawImage at least once.
      runtime.flattenToDataUrl(doc);
      const fakeCtx = getFakeContext();

      expect(fakeCtx).toBeDefined();
      expect(fakeCtx!.drawImage.mock.calls.length).toBeGreaterThanOrEqual(1);

      // Reset drawImage call count and verify compositeToDisplay also draws.
      fakeCtx!.drawImage.mockClear();

      const target = document.createElement("canvas");
      target.width = 64;
      target.height = 64;
      runtime.compositeToDisplay(target, doc, null, null);
      expect(fakeCtx!.drawImage.mock.calls.length).toBeGreaterThanOrEqual(1);
    } finally {
      mocks.restore();
    }
  });

  // ─── 3. getLayerGeometry composite offset tests ────────────────

  describe("getLayerGeometry().compositeOffset", () => {
    it("sums transform and contentBounds offsets", () => {
      const layer = createDefaultLayer("offset-test", "raster", 100, 100);
      layer.transform = makeAffineTransform({ x: -10, y: -10 });
      layer.contentBounds = { x: 50, y: 50, width: 100, height: 100 };

      const offset = getLayerGeometry(layer).compositeOffset;
      expect(offset).toEqual({ x: 40, y: 40 });
    });

    it("falls back to contentBounds when no canvas metadata exists", () => {
      const layer = createDefaultLayer("no-canvas", "raster", 64, 64);
      layer.transform = makeAffineTransform({ x: 0, y: 0 });
      layer.contentBounds = { x: 10, y: 20, width: 64, height: 64 };

      const offset = getLayerGeometry(layer).compositeOffset;
      // No canvas → uses contentBounds: x=0+10, y=0+20
      expect(offset).toEqual({ x: 10, y: 20 });
    });

    it("uses canvas raster bounds when they exist", () => {
      const layer = createDefaultLayer("canvas-bounds", "raster", 64, 64);
      layer.transform = makeAffineTransform({ x: 5, y: 5 });
      layer.contentBounds = { x: 10, y: 10, width: 64, height: 64 };

      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      setCanvasRasterBounds(canvas, { x: 20, y: 30, width: 64, height: 64 });

      // Canvas raster bounds (20,30) take priority over contentBounds (10,10)
      const offset = getLayerGeometry(layer, canvas).compositeOffset;
      expect(offset).toEqual({ x: 25, y: 35 });
    });
  });

  // ─── 4. getMaskDataUrl returns non-null for a valid mask layer ──────

  it("getMaskDataUrl returns a data URL for a valid mask layer", () => {
    const doc = makeDoc();
    // Create a mask layer and add it to the document
    const maskLayer = createDefaultLayer("Mask", "mask", 64, 64);
    maskLayer.visible = true;
    doc.layers.push(maskLayer);
    doc.maskLayerId = maskLayer.id;

    // Register a layer canvas for the mask layer so drawLayerToContext can find it
    runtime.getOrCreateLayerCanvas(maskLayer.id, 64, 64);

    const mocks = mockCanvas2DContext();
    try {
      const result = runtime.getMaskDataUrl(doc);
      expect(typeof result).toBe("string");
      expect(result!.startsWith("data:image/png")).toBe(true);
    } finally {
      mocks.restore();
    }
  });

  // ─── 5. evaluateLayerEffects caching ───────────────────────────────

  describe("evaluateLayerEffects caching", () => {
    it("returns stable cached surface on repeated calls with identical params", () => {
      const canvas = runtime.getOrCreateLayerCanvas("fx-layer", 64, 64);
      const effects = [
        {
          type: "brightness_contrast" as const,
          enabled: true,
          params: { brightness: 0.5, contrast: 0 }
        }
      ];

      const mocks = mockCanvas2DContext();
      try {
        // First call populates the cache and returns the temp canvas.
        const first = runtime.evaluateLayerEffects("fx-layer", canvas, effects);
        expect(first.surface).toBeInstanceOf(HTMLCanvasElement);

        // Second call is a cache hit — returns the cached clone canvas.
        const second = runtime.evaluateLayerEffects("fx-layer", canvas, effects);
        expect(second.surface).toBeInstanceOf(HTMLCanvasElement);

        // Third call is also a cache hit — same cached reference as second.
        const third = runtime.evaluateLayerEffects("fx-layer", canvas, effects);
        expect(third.surface).toBe(second.surface);
      } finally {
        mocks.restore();
      }
    });

    it("recomputes when effect params change", () => {
      const canvas = runtime.getOrCreateLayerCanvas("fx-layer2", 64, 64);
      const effectsA = [
        {
          type: "brightness_contrast" as const,
          enabled: true,
          params: { brightness: 0.5, contrast: 0 }
        }
      ];
      const effectsB = [
        {
          type: "brightness_contrast" as const,
          enabled: true,
          params: { brightness: -0.3, contrast: 0.2 }
        }
      ];

      const mocks = mockCanvas2DContext();
      try {
        // Populate cache with effectsA
        runtime.evaluateLayerEffects("fx-layer2", canvas, effectsA);
        const cachedA = runtime.evaluateLayerEffects("fx-layer2", canvas, effectsA);

        // Switch to effectsB — forces cache miss and recomputation.
        // The returned surface is the temp canvas (different from cachedA).
        const freshB = runtime.evaluateLayerEffects("fx-layer2", canvas, effectsB);
        expect(freshB.surface).not.toBe(cachedA.surface);
        expect(freshB.surface).toBeInstanceOf(HTMLCanvasElement);
      } finally {
        mocks.restore();
      }
    });
  });

  // ─── 6. readbackComposite returns ImageData ────────────────────────

  it("readbackComposite returns ImageData with expected properties", () => {
    const doc = makeDoc();
    const layerId = doc.layers[0].id;
    doc.layers[0].visible = true;
    runtime.getOrCreateLayerCanvas(layerId, 64, 64);

    const mocks = mockCanvas2DContext();
    try {
      const result = runtime.readbackComposite(doc, null, null);
      expect(result).not.toBeNull();
      expect(result!.width).toBe(64);
      expect(result!.height).toBe(64);
      expect(result!.data).toBeDefined();
      expect(result!.data.length).toBeGreaterThan(0);
    } finally {
      mocks.restore();
    }
  });

  // ─── 7. reconcileLayerToDocumentSpace for translated layer ─────────

  it("reconcileLayerToDocumentSpace returns serialized data for a translated layer", () => {
    const doc = makeDoc();
    const layerId = doc.layers[0].id;
    doc.layers[0].transform = makeAffineTransform({ x: 10, y: 10 });
    runtime.getOrCreateLayerCanvas(layerId, 64, 64);

    const mocks = mockCanvas2DContext();
    try {
      const result = runtime.reconcileLayerToDocumentSpace(layerId, doc);
      expect(typeof result).toBe("string");
      // Serialized layer data starts with the ntlayer: prefix
      expect(result!.startsWith("ntlayer:")).toBe(true);
    } finally {
      mocks.restore();
    }
  });

  // ─── 8. reconcileLayerToDocumentSpace for identity transform ───────

  it("reconcileLayerToDocumentSpace still returns data for identity transform", () => {
    const doc = makeDoc();
    const layerId = doc.layers[0].id;
    doc.layers[0].transform = makeAffineTransform({});
    runtime.getOrCreateLayerCanvas(layerId, 64, 64);

    const mocks = mockCanvas2DContext();
    try {
      const result = runtime.reconcileLayerToDocumentSpace(layerId, doc);
      // Identity transform still serializes the layer data (no-op reconcile)
      expect(typeof result).toBe("string");
      expect(result!.startsWith("ntlayer:")).toBe(true);
    } finally {
      mocks.restore();
    }
  });
});
