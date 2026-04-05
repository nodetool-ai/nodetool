import {
  getLayerRasterBounds,
  getCanvasRasterBounds,
  setCanvasRasterBounds,
  getEffectiveLayerRasterBounds,
  getLayerCompositeOffset,
  getDocumentViewportLayerBounds,
  unionLayerBounds,
  ensureLayerRasterBounds
} from "../painting/layerBounds";
import type { Layer, LayerContentBounds, SketchDocument } from "../types";
import type { ToolContext } from "../tools/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type LayerLike = {
  contentBounds?: Partial<LayerContentBounds>;
  transform?: { x?: number; y?: number };
};

function makeLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: "layer-1",
    name: "Layer 1",
    type: "raster",
    visible: true,
    opacity: 1,
    locked: false,
    alphaLock: false,
    blendMode: "normal",
    data: null,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    contentBounds: { x: 0, y: 0, width: 64, height: 64 },
    effects: [],
    ...overrides
  } as Layer;
}

function makeDoc(
  overrides: Partial<SketchDocument> = {}
): SketchDocument {
  return {
    version: 1,
    canvas: { width: 512, height: 512, backgroundColor: "#ffffff" },
    layers: [makeLayer()],
    activeLayerId: "layer-1",
    maskLayerId: null,
    toolSettings: {} as SketchDocument["toolSettings"],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    ...overrides
  } as SketchDocument;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function makeMockToolContext(
  initialCanvases?: Map<string, HTMLCanvasElement>
): ToolContext {
  const map = initialCanvases ?? new Map<string, HTMLCanvasElement>();
  return {
    getOrCreateLayerCanvas: jest.fn((id: string) => {
      let c = map.get(id);
      if (!c) {
        c = makeCanvas(64, 64);
        map.set(id, c);
      }
      return c;
    }),
    layerCanvasesRef: { current: map },
    invalidateLayer: jest.fn()
  } as unknown as ToolContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("layerBounds", () => {
  // -----------------------------------------------------------------------
  // setCanvasRasterBounds / getCanvasRasterBounds round-trip
  // -----------------------------------------------------------------------
  describe("setCanvasRasterBounds / getCanvasRasterBounds", () => {
    it("returns null for a plain canvas without metadata", () => {
      const c = makeCanvas(100, 100);
      expect(getCanvasRasterBounds(c)).toBeNull();
    });

    it("returns null for null/undefined canvas", () => {
      expect(getCanvasRasterBounds(null)).toBeNull();
      expect(getCanvasRasterBounds(undefined)).toBeNull();
    });

    it("round-trips bounds metadata on a canvas element", () => {
      const c = makeCanvas(200, 200);
      const bounds: LayerContentBounds = { x: 10, y: 20, width: 100, height: 50 };
      setCanvasRasterBounds(c, bounds);
      expect(getCanvasRasterBounds(c)).toEqual(bounds);
    });

    it("overwrites previous bounds on the same canvas", () => {
      const c = makeCanvas(200, 200);
      setCanvasRasterBounds(c, { x: 0, y: 0, width: 50, height: 50 });
      const updated: LayerContentBounds = { x: 5, y: 5, width: 80, height: 80 };
      setCanvasRasterBounds(c, updated);
      expect(getCanvasRasterBounds(c)).toEqual(updated);
    });
  });

  // -----------------------------------------------------------------------
  // getLayerRasterBounds
  // -----------------------------------------------------------------------
  describe("getLayerRasterBounds", () => {
    it("extracts and rounds contentBounds from layer", () => {
      const layer: LayerLike = {
        contentBounds: { x: 1.7, y: 2.3, width: 99.5, height: 50.1 }
      };
      const result = getLayerRasterBounds(layer);
      expect(result).toEqual({ x: 2, y: 2, width: 100, height: 50 });
    });

    it("falls back to 1×1 when contentBounds is missing", () => {
      const result = getLayerRasterBounds({});
      expect(result).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    });

    it("uses provided fallbackSize when contentBounds is missing", () => {
      const result = getLayerRasterBounds({}, { width: 256, height: 128 });
      expect(result).toEqual({ x: 0, y: 0, width: 256, height: 128 });
    });

    it("uses fallback for zero dimensions", () => {
      const layer: LayerLike = {
        contentBounds: { x: 0, y: 0, width: 0, height: 0 }
      };
      const result = getLayerRasterBounds(layer, { width: 32, height: 32 });
      expect(result).toEqual({ x: 0, y: 0, width: 32, height: 32 });
    });

    it("uses fallback for negative dimensions", () => {
      const layer: LayerLike = {
        contentBounds: { x: 5, y: 5, width: -10, height: -20 }
      };
      const result = getLayerRasterBounds(layer, { width: 64, height: 64 });
      expect(result).toEqual({ x: 5, y: 5, width: 64, height: 64 });
    });

    it("uses fallback for NaN dimensions", () => {
      const layer: LayerLike = {
        contentBounds: { x: 0, y: 0, width: NaN, height: Infinity }
      };
      const result = getLayerRasterBounds(layer, { width: 10, height: 10 });
      expect(result).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    });

    it("preserves valid dimensions alongside invalid ones", () => {
      const layer: LayerLike = {
        contentBounds: { x: 3, y: 7, width: 100, height: 0 }
      };
      const result = getLayerRasterBounds(layer, { width: 50, height: 50 });
      expect(result).toEqual({ x: 3, y: 7, width: 100, height: 50 });
    });
  });

  // -----------------------------------------------------------------------
  // getEffectiveLayerRasterBounds
  // -----------------------------------------------------------------------
  describe("getEffectiveLayerRasterBounds", () => {
    it("prefers canvas metadata when available", () => {
      const c = makeCanvas(200, 200);
      const meta: LayerContentBounds = { x: 5, y: 10, width: 80, height: 60 };
      setCanvasRasterBounds(c, meta);
      const layer: LayerLike = {
        contentBounds: { x: 0, y: 0, width: 999, height: 999 }
      };
      expect(getEffectiveLayerRasterBounds(layer, c)).toEqual(meta);
    });

    it("falls back to canvas dimensions when no metadata", () => {
      const c = makeCanvas(128, 64);
      const layer: LayerLike = {};
      const result = getEffectiveLayerRasterBounds(layer, c);
      expect(result).toEqual({ x: 0, y: 0, width: 128, height: 64 });
    });

    it("falls back to layer contentBounds when no canvas", () => {
      const layer: LayerLike = {
        contentBounds: { x: 10, y: 20, width: 300, height: 150 }
      };
      const result = getEffectiveLayerRasterBounds(layer);
      expect(result).toEqual({ x: 10, y: 20, width: 300, height: 150 });
    });

    it("falls back to fallbackSize when no canvas and no contentBounds", () => {
      const result = getEffectiveLayerRasterBounds(
        {},
        null,
        { width: 256, height: 256 }
      );
      expect(result).toEqual({ x: 0, y: 0, width: 256, height: 256 });
    });

    it("falls back to 1×1 with no canvas, no contentBounds, no fallbackSize", () => {
      const result = getEffectiveLayerRasterBounds({});
      expect(result).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    });
  });

  // -----------------------------------------------------------------------
  // unionLayerBounds
  // -----------------------------------------------------------------------
  describe("unionLayerBounds", () => {
    it("unions disjoint bounds", () => {
      const a: LayerContentBounds = { x: 0, y: 0, width: 10, height: 10 };
      const b: LayerContentBounds = { x: 20, y: 30, width: 10, height: 10 };
      const result = unionLayerBounds(a, b);
      expect(result).toEqual({ x: 0, y: 0, width: 30, height: 40 });
    });

    it("unions overlapping bounds", () => {
      const a: LayerContentBounds = { x: 0, y: 0, width: 20, height: 20 };
      const b: LayerContentBounds = { x: 10, y: 10, width: 20, height: 20 };
      const result = unionLayerBounds(a, b);
      expect(result).toEqual({ x: 0, y: 0, width: 30, height: 30 });
    });

    it("returns outer bounds when one is contained in the other", () => {
      const outer: LayerContentBounds = { x: 0, y: 0, width: 100, height: 100 };
      const inner: LayerContentBounds = { x: 10, y: 10, width: 20, height: 20 };
      expect(unionLayerBounds(outer, inner)).toEqual(outer);
      expect(unionLayerBounds(inner, outer)).toEqual(outer);
    });

    it("returns the same bounds for identical inputs", () => {
      const bounds: LayerContentBounds = { x: 5, y: 5, width: 50, height: 50 };
      expect(unionLayerBounds(bounds, bounds)).toEqual(bounds);
    });

    it("handles negative origin coordinates", () => {
      const a: LayerContentBounds = { x: -10, y: -20, width: 30, height: 40 };
      const b: LayerContentBounds = { x: 5, y: 5, width: 10, height: 10 };
      const result = unionLayerBounds(a, b);
      expect(result).toEqual({ x: -10, y: -20, width: 30, height: 40 });
    });

    it("enforces minimum 1×1 size", () => {
      const a: LayerContentBounds = { x: 5, y: 5, width: 1, height: 1 };
      const b: LayerContentBounds = { x: 5, y: 5, width: 1, height: 1 };
      const result = unionLayerBounds(a, b);
      expect(result.width).toBeGreaterThanOrEqual(1);
      expect(result.height).toBeGreaterThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // getDocumentViewportLayerBounds
  // -----------------------------------------------------------------------
  describe("getDocumentViewportLayerBounds", () => {
    it("returns inverted transform with document dimensions", () => {
      const layer = makeLayer({
        transform: { x: 100, y: 50, scaleX: 1, scaleY: 1, rotation: 0 }
      });
      const doc = makeDoc();
      const result = getDocumentViewportLayerBounds(layer, doc);
      expect(result).toEqual({ x: -100, y: -50, width: 512, height: 512 });
    });

    it("returns zero offset when layer has no transform offset", () => {
      const layer = makeLayer({
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
      });
      const doc = makeDoc();
      const result = getDocumentViewportLayerBounds(layer, doc);
      expect(result.x).toBe(-0);
      expect(result.y).toBe(-0);
      expect(result.width).toBe(512);
      expect(result.height).toBe(512);
    });

    it("uses different document dimensions", () => {
      const layer = makeLayer({
        transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 }
      });
      const doc = makeDoc({
        canvas: { width: 1024, height: 768, backgroundColor: "#000000" }
      });
      const result = getDocumentViewportLayerBounds(layer, doc);
      expect(result).toEqual({ x: -10, y: -20, width: 1024, height: 768 });
    });
  });

  // -----------------------------------------------------------------------
  // getLayerCompositeOffset
  // -----------------------------------------------------------------------
  describe("getLayerCompositeOffset", () => {
    it("combines transform and contentBounds origin", () => {
      const layer: LayerLike = {
        transform: { x: 100, y: 200 },
        contentBounds: { x: 10, y: 20, width: 50, height: 50 }
      };
      const offset = getLayerCompositeOffset(layer);
      expect(offset).toEqual({ x: 110, y: 220 });
    });

    it("returns bounds origin when transform is absent", () => {
      const layer: LayerLike = {
        contentBounds: { x: 15, y: 25, width: 50, height: 50 }
      };
      const offset = getLayerCompositeOffset(layer);
      expect(offset).toEqual({ x: 15, y: 25 });
    });

    it("returns transform only when contentBounds is absent", () => {
      const layer: LayerLike = { transform: { x: 30, y: 40 } };
      const offset = getLayerCompositeOffset(layer);
      expect(offset).toEqual({ x: 30, y: 40 });
    });

    it("returns zero offset when both are absent", () => {
      const offset = getLayerCompositeOffset({});
      expect(offset).toEqual({ x: 0, y: 0 });
    });

    it("uses canvas metadata bounds when provided", () => {
      const c = makeCanvas(100, 100);
      setCanvasRasterBounds(c, { x: 5, y: 10, width: 100, height: 100 });
      const layer: LayerLike = {
        transform: { x: 50, y: 60 },
        contentBounds: { x: 0, y: 0, width: 64, height: 64 }
      };
      const offset = getLayerCompositeOffset(layer, undefined, c);
      expect(offset).toEqual({ x: 55, y: 70 });
    });
  });

  // -----------------------------------------------------------------------
  // ensureLayerRasterBounds
  // -----------------------------------------------------------------------
  describe("ensureLayerRasterBounds", () => {
    it("returns current bounds when already large enough (no-op)", () => {
      const existingCanvas = makeCanvas(100, 100);
      setCanvasRasterBounds(existingCanvas, {
        x: 0, y: 0, width: 100, height: 100
      });
      const canvasMap = new Map<string, HTMLCanvasElement>([
        ["layer-1", existingCanvas]
      ]);
      const ctx = makeMockToolContext(canvasMap);
      const layer = makeLayer();

      const required: LayerContentBounds = { x: 10, y: 10, width: 50, height: 50 };
      const result = ensureLayerRasterBounds(ctx, layer, required);

      expect(result).toEqual({ x: 0, y: 0, width: 100, height: 100 });
      // Canvas in the map should still be the same one
      expect(canvasMap.get("layer-1")).toBe(existingCanvas);
      expect(ctx.invalidateLayer).not.toHaveBeenCalled();
    });

    it("expands canvas when required bounds exceed current", () => {
      const existingCanvas = makeCanvas(50, 50);
      setCanvasRasterBounds(existingCanvas, {
        x: 0, y: 0, width: 50, height: 50
      });
      const canvasMap = new Map<string, HTMLCanvasElement>([
        ["layer-1", existingCanvas]
      ]);
      const ctx = makeMockToolContext(canvasMap);
      const layer = makeLayer();

      const required: LayerContentBounds = { x: -20, y: -10, width: 100, height: 80 };
      const result = ensureLayerRasterBounds(ctx, layer, required);

      // Union of {0,0,50,50} and {-20,-10,100,80}: min(-20,0)=-20, min(-10,0)=-10
      // max(50,80)=80, max(50,70)=70 → width=100, height=80
      expect(result.x).toBe(-20);
      expect(result.y).toBe(-10);
      expect(result.width).toBe(100);
      expect(result.height).toBe(80);

      // A new canvas should replace the old one
      const newCanvas = canvasMap.get("layer-1");
      expect(newCanvas).not.toBe(existingCanvas);
      expect(newCanvas!.width).toBe(100);
      expect(newCanvas!.height).toBe(80);

      // Metadata should be set on the new canvas
      expect(getCanvasRasterBounds(newCanvas!)).toEqual(result);

      // Should have called invalidateLayer
      expect(ctx.invalidateLayer).toHaveBeenCalledWith("layer-1");
    });

    it("creates initial canvas via getOrCreateLayerCanvas when none exists", () => {
      const ctx = makeMockToolContext();
      const layer = makeLayer();

      const required: LayerContentBounds = { x: 0, y: 0, width: 128, height: 128 };
      const result = ensureLayerRasterBounds(ctx, layer, required);

      expect(ctx.getOrCreateLayerCanvas).toHaveBeenCalledWith("layer-1");
      // The initial canvas is 64×64, required is 128×128 → expansion
      expect(result.width).toBe(128);
      expect(result.height).toBe(128);
    });

    it("preserves content during expansion by drawing old canvas at correct offset", () => {
      const existingCanvas = makeCanvas(40, 40);
      setCanvasRasterBounds(existingCanvas, {
        x: 10, y: 10, width: 40, height: 40
      });
      const canvasMap = new Map<string, HTMLCanvasElement>([
        ["layer-1", existingCanvas]
      ]);
      const ctx = makeMockToolContext(canvasMap);
      const layer = makeLayer();

      // Spy on drawImage to verify content preservation
      const drawImageCalls: Array<{
        source: HTMLCanvasElement;
        dx: number;
        dy: number;
      }> = [];
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      const getContextSpy = jest
        .spyOn(HTMLCanvasElement.prototype, "getContext")
        .mockImplementation(function (
          this: HTMLCanvasElement,
          contextId: string,
          ...args: unknown[]
        ) {
          const realCtx = origGetContext.call(this, contextId, ...args);
          if (realCtx && contextId === "2d") {
            const origDrawImage = (realCtx as CanvasRenderingContext2D).drawImage;
            (realCtx as CanvasRenderingContext2D).drawImage = function (
              source: CanvasImageSource,
              dx: number,
              dy: number
            ) {
              drawImageCalls.push({
                source: source as HTMLCanvasElement,
                dx,
                dy
              });
              return origDrawImage.call(this, source, dx, dy);
            };
          }
          return realCtx;
        } as typeof origGetContext);

      try {
        const required: LayerContentBounds = {
          x: -10, y: -10, width: 30, height: 30
        };
        const result = ensureLayerRasterBounds(ctx, layer, required);

        // Union: min(-10,10)=-10, min(-10,10)=-10, max(50,20)=50, max(50,20)=50
        // width=60, height=60
        expect(result).toEqual({ x: -10, y: -10, width: 60, height: 60 });

        // Verify drawImage was called to copy old content
        expect(drawImageCalls.length).toBeGreaterThanOrEqual(1);
        const call = drawImageCalls[drawImageCalls.length - 1];
        expect(call.source).toBe(existingCanvas);
        // old origin (10,10) - new origin (-10,-10) = 20, 20
        expect(call.dx).toBe(20);
        expect(call.dy).toBe(20);
      } finally {
        getContextSpy.mockRestore();
      }
    });
  });
});
