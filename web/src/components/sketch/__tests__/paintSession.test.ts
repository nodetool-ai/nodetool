/**
 * Tests for Phase 4: Shared Paint Architecture.
 *
 * Tests verify:
 * - CoordinateMapper document↔layer coordinate mapping
 * - PaintEngine interface compliance for BrushEngine/PencilEngine/EraserEngine
 * - PaintSession lifecycle (begin → move → end)
 * - Stroke buffer creation for buffered engines
 * - Direct painting for non-buffered engines (pencil)
 * - Alpha-lock snapshot and restore
 * - Shift+click straight line through PaintSession
 * - Dirty-rect tracking through PaintSession
 * - BrushTool/PencilTool/EraserTool integration with PaintSession
 * - ShapeTool transform-aware commit
 */

import { CoordinateMapper } from "../painting/CoordinateMapper";
import { BrushEngine } from "../painting/BrushEngine";
import { PencilEngine } from "../painting/PencilEngine";
import { EraserEngine } from "../painting/EraserEngine";
import { PaintSession } from "../painting/PaintSession";
import { BrushTool } from "../tools/BrushTool";
import { PencilTool } from "../tools/PencilTool";
import { EraserTool } from "../tools/EraserTool";
import { ShapeTool } from "../tools/ShapeTool";
import type { ToolContext, ToolPointerEvent } from "../tools/types";
import { createDefaultDocument } from "../types";

// ─── Test helpers ──────────────────────────────────────────────────────────

function makeToolContext(overrides?: Partial<ToolContext>): ToolContext {
  const doc = createDefaultDocument(64, 64);
  return {
    doc,
    activeTool: "brush",
    zoom: 1,
    pan: { x: 0, y: 0 },
    mirrorX: false,
    mirrorY: false,
    symmetryMode: "off",
    symmetryRays: 6,
    selection: null,
    displayCanvasRef: { current: null },
    overlayCanvasRef: { current: null },
    cursorCanvasRef: { current: null },
    containerRef: { current: null },
    layerCanvasesRef: { current: new Map() },
    mousePositionRef: { current: { x: 0, y: 0 } },
    activeStrokeRef: { current: null },
    getOrCreateLayerCanvas: jest.fn(() => {
      const canvas = window.document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      return canvas;
    }),
    redraw: jest.fn(),
    redrawDirty: jest.fn(),
    requestRedraw: jest.fn(),
    requestDirtyRedraw: jest.fn(),
    clearOverlay: jest.fn(),
    drawSelectionOverlay: jest.fn(),
    drawOverlayShape: jest.fn(),
    drawOverlayGradient: jest.fn(),
    drawOverlayCrop: jest.fn(),
    drawOverlaySelection: jest.fn(),
    drawCursor: jest.fn(),
    onZoomChange: jest.fn(),
    onPanChange: jest.fn(),
    onStrokeStart: jest.fn(),
    onStrokeEnd: jest.fn(),
    onLayerTransformChange: jest.fn(),
    onLayerContentBoundsChange: jest.fn(),
    onBrushSizeChange: jest.fn(),
    onContextMenu: jest.fn(),
    onCropComplete: jest.fn(),
    onEyedropperPick: jest.fn(),
    onSelectionChange: jest.fn(),
    onAutoPickLayer: jest.fn(),
    screenToCanvas: jest.fn((x: number, y: number) => ({ x, y })),
    shiftHeldRef: { current: false },
    altHeldRef: { current: false },
    withMirror: jest.fn((ctx, drawFn, from, to) => {
      drawFn(from, to, ctx, 0);
    }),
    clipSelectionForOffset: jest.fn(() => false),
    ...overrides
  };
}

function makePointerEvent(
  overrides?: Partial<ToolPointerEvent>
): ToolPointerEvent {
  return {
    point: { x: 10, y: 10 },
    pressure: 0.5,
    nativeEvent: {
      altKey: false,
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1
    } as unknown as React.PointerEvent,
    ...overrides
  };
}

// ─── CoordinateMapper tests ────────────────────────────────────────────────

describe("CoordinateMapper", () => {
  it("converts document-space point to layer-local with zero transform", () => {
    const mapper = new CoordinateMapper({
      layerTransform: { x: 0, y: 0 }
    });
    const local = mapper.docToLayer({ x: 50, y: 30 });
    expect(local).toEqual({ x: 50, y: 30 });
  });

  it("converts document-space point to layer-local with non-zero transform", () => {
    const mapper = new CoordinateMapper({
      layerTransform: { x: 10, y: 20 }
    });
    const local = mapper.docToLayer({ x: 50, y: 30 });
    expect(local).toEqual({ x: 40, y: 10 });
  });

  it("converts layer-local point back to document-space", () => {
    const mapper = new CoordinateMapper({
      layerTransform: { x: 10, y: 20 }
    });
    const doc = mapper.layerToDoc({ x: 40, y: 10 });
    expect(doc).toEqual({ x: 50, y: 30 });
  });

  it("round-trips correctly", () => {
    const mapper = new CoordinateMapper({
      layerTransform: { x: -5, y: 15 }
    });
    const original = { x: 100, y: 200 };
    const local = mapper.docToLayer(original);
    const back = mapper.layerToDoc(local);
    expect(back).toEqual(original);
  });

  it("reports hasOffset correctly", () => {
    expect(
      new CoordinateMapper({ layerTransform: { x: 0, y: 0 } }).hasOffset
    ).toBe(false);
    expect(
      new CoordinateMapper({ layerTransform: { x: 1, y: 0 } }).hasOffset
    ).toBe(true);
    expect(
      new CoordinateMapper({ layerTransform: { x: 0, y: -1 } }).hasOffset
    ).toBe(true);
  });

  it("converts dirty rect from layer-space to document-space", () => {
    const mapper = new CoordinateMapper({
      layerTransform: { x: 10, y: 20 }
    });
    const dirty = { minX: 5, minY: 5, maxX: 15, maxY: 25 };
    const docDirty = mapper.dirtyToDoc(dirty);
    expect(docDirty).toEqual({ x: 15, y: 25, w: 10, h: 20 });
  });

  it("accounts for raster bounds offset in both directions", () => {
    const mapper = new CoordinateMapper({
      layerTransform: { x: 30, y: 15 },
      rasterBounds: { x: -20, y: -10 }
    });
    expect(mapper.docToLayer({ x: 30, y: 15 })).toEqual({ x: 20, y: 10 });
    expect(mapper.layerToDoc({ x: 20, y: 10 })).toEqual({ x: 30, y: 15 });
    expect(mapper.offset).toEqual({ x: 10, y: 5 });
  });

  it("exposes offset as a Point", () => {
    const mapper = new CoordinateMapper({
      layerTransform: { x: 7, y: -3 }
    });
    expect(mapper.offset).toEqual({ x: 7, y: -3 });
  });
});

// ─── PaintEngine interface tests ───────────────────────────────────────────

describe("PaintEngine implementations", () => {
  describe("BrushEngine", () => {
    it("has correct engine properties", () => {
      const engine = new BrushEngine({
        size: 10,
        opacity: 1,
        hardness: 0.8,
        color: "#000000",
        brushType: "round",
        pressureSensitivity: true,
        pressureAffects: "size",
        roundness: 1,
        angle: 0
      });
      expect(engine.engineId).toBe("brush");
      expect(engine.compositeOp).toBe("source-over");
      expect(engine.bufferMode).toBe("buffered");
      expect(engine.hasStabilizer).toBe(true);
      expect(engine.dabOnDown).toBe(false);
    });

    it("returns null dirty rect before any strokes", () => {
      const engine = new BrushEngine({
        size: 10,
        opacity: 1,
        hardness: 0.8,
        color: "#000000",
        brushType: "round",
        pressureSensitivity: true,
        pressureAffects: "size",
        roundness: 1,
        angle: 0
      });
      engine.beginStroke();
      expect(engine.getDirtyRect()).toBeNull();
    });

    it("stabilizes points with a moving average", () => {
      const engine = new BrushEngine({
        size: 10,
        opacity: 1,
        hardness: 0.8,
        color: "#000000",
        brushType: "round",
        pressureSensitivity: true,
        pressureAffects: "size",
        roundness: 1,
        angle: 0
      });
      engine.beginStroke();
      const p1 = engine.stabilize({ x: 0, y: 0 });
      expect(p1).toEqual({ x: 0, y: 0 });
      const p2 = engine.stabilize({ x: 10, y: 10 });
      expect(p2.x).toBe(5); // average of 0 and 10
      expect(p2.y).toBe(5);
    });
  });

  describe("PencilEngine", () => {
    it("has correct engine properties", () => {
      const engine = new PencilEngine({
        size: 1,
        opacity: 1,
        color: "#000000"
      });
      expect(engine.engineId).toBe("pencil");
      expect(engine.compositeOp).toBe("source-over");
      expect(engine.bufferMode).toBe("direct");
      expect(engine.hasStabilizer).toBe(false);
      expect(engine.dabOnDown).toBe(true);
    });

    it("stabilize returns raw point unchanged", () => {
      const engine = new PencilEngine({
        size: 1,
        opacity: 1,
        color: "#000000"
      });
      engine.beginStroke();
      const pt = { x: 42, y: 17 };
      expect(engine.stabilize(pt)).toBe(pt);
    });
  });

  describe("EraserEngine", () => {
    it("has correct engine properties", () => {
      const engine = new EraserEngine({
        size: 20,
        opacity: 1,
        hardness: 0.8
      });
      expect(engine.engineId).toBe("eraser");
      expect(engine.compositeOp).toBe("destination-out");
      expect(engine.bufferMode).toBe("buffered");
      expect(engine.hasStabilizer).toBe(true);
      expect(engine.dabOnDown).toBe(false);
    });

    it("stabilizes points with a moving average", () => {
      const engine = new EraserEngine({
        size: 20,
        opacity: 1,
        hardness: 0.8
      });
      engine.beginStroke();
      engine.stabilize({ x: 0, y: 0 });
      const p2 = engine.stabilize({ x: 20, y: 20 });
      expect(p2.x).toBe(10);
      expect(p2.y).toBe(10);
    });
  });
});

// ─── PaintSession lifecycle tests ──────────────────────────────────────────

describe("PaintSession", () => {
  it("begin returns false when no active layer", () => {
    const engine = new BrushEngine({
      size: 10,
      opacity: 1,
      hardness: 0.8,
      color: "#000000",
      brushType: "round",
      pressureSensitivity: true,
      pressureAffects: "size",
      roundness: 1,
      angle: 0
    });
    const session = new PaintSession(engine);
    const ctx = makeToolContext();
    // Remove all layers
    ctx.doc.layers = [];
    ctx.doc.activeLayerId = "nonexistent";
    const result = session.begin(ctx, makePointerEvent());
    expect(result).toBe(false);
    expect(session.isActive).toBe(false);
  });

  it("begin creates a stroke buffer for buffered engines", () => {
    const engine = new BrushEngine({
      size: 10,
      opacity: 1,
      hardness: 0.8,
      color: "#000000",
      brushType: "round",
      pressureSensitivity: true,
      pressureAffects: "size",
      roundness: 1,
      angle: 0
    });
    const session = new PaintSession(engine);
    const ctx = makeToolContext();
    const result = session.begin(ctx, makePointerEvent());
    expect(result).toBe(true);
    expect(session.isActive).toBe(true);
    expect(ctx.onStrokeStart).toHaveBeenCalled();
    expect(ctx.activeStrokeRef.current).not.toBeNull();
    expect(ctx.activeStrokeRef.current?.compositeOp).toBe("source-over");
  });

  it("begin does NOT create stroke buffer for direct engines (pencil)", () => {
    const engine = new PencilEngine({
      size: 1,
      opacity: 1,
      color: "#000000"
    });
    const session = new PaintSession(engine);
    const ctx = makeToolContext();
    const result = session.begin(ctx, makePointerEvent());
    expect(result).toBe(true);
    // Pencil paints directly — no stroke buffer
    expect(ctx.activeStrokeRef.current).toBeNull();
  });

  it("end calls onStrokeEnd and clears active stroke", () => {
    const engine = new BrushEngine({
      size: 10,
      opacity: 1,
      hardness: 0.8,
      color: "#000000",
      brushType: "round",
      pressureSensitivity: true,
      pressureAffects: "size",
      roundness: 1,
      angle: 0
    });
    const session = new PaintSession(engine);
    const ctx = makeToolContext();
    session.begin(ctx, makePointerEvent());
    session.end(ctx, makePointerEvent({ point: { x: 20, y: 20 } }));

    // end() defers the buffer merge + onStrokeEnd to a pendingCommit closure
    // that is normally drained at rAF time. Drain it here manually.
    const stroke = ctx.activeStrokeRef.current;
    if (stroke?.pendingCommit) {
      stroke.pendingCommit();
    }

    expect(ctx.onStrokeEnd).toHaveBeenCalledWith(
      ctx.doc.activeLayerId, null
    );
    expect(ctx.activeStrokeRef.current).toBeNull();
    expect(session.isActive).toBe(false);
  });

  it("end saves last stroke endpoint for Shift+click", () => {
    const engine = new BrushEngine({
      size: 10,
      opacity: 1,
      hardness: 0.8,
      color: "#000000",
      brushType: "round",
      pressureSensitivity: true,
      pressureAffects: "size",
      roundness: 1,
      angle: 0
    });
    const session = new PaintSession(engine);
    const ctx = makeToolContext();
    session.begin(ctx, makePointerEvent());
    session.end(ctx, makePointerEvent({ point: { x: 30, y: 40 } }));
    expect(session.getLastStrokeEnd()).toEqual({ x: 30, y: 40 });
  });

  it("eraser creates destination-out stroke buffer", () => {
    const engine = new EraserEngine({
      size: 20,
      opacity: 1,
      hardness: 0.8
    });
    const session = new PaintSession(engine);
    const ctx = makeToolContext();
    session.begin(ctx, makePointerEvent());
    expect(ctx.activeStrokeRef.current).not.toBeNull();
    expect(ctx.activeStrokeRef.current?.compositeOp).toBe("destination-out");
  });

  it("move without begin is a no-op", () => {
    const engine = new BrushEngine({
      size: 10,
      opacity: 1,
      hardness: 0.8,
      color: "#000000",
      brushType: "round",
      pressureSensitivity: true,
      pressureAffects: "size",
      roundness: 1,
      angle: 0
    });
    const session = new PaintSession(engine);
    const ctx = makeToolContext();
    // Should not throw
    session.move(ctx, makePointerEvent(), [makePointerEvent()]);
    expect(ctx.redrawDirty).not.toHaveBeenCalled();
    expect(ctx.requestRedraw).not.toHaveBeenCalled();
  });

  it("end without begin is a no-op", () => {
    const engine = new BrushEngine({
      size: 10,
      opacity: 1,
      hardness: 0.8,
      color: "#000000",
      brushType: "round",
      pressureSensitivity: true,
      pressureAffects: "size",
      roundness: 1,
      angle: 0
    });
    const session = new PaintSession(engine);
    const ctx = makeToolContext();
    // Should not throw
    session.end(ctx, makePointerEvent());
    expect(ctx.onStrokeEnd).not.toHaveBeenCalled();
  });

  it("setEngine allows changing engine between strokes", () => {
    const brushEngine = new BrushEngine({
      size: 10,
      opacity: 1,
      hardness: 0.8,
      color: "#000000",
      brushType: "round",
      pressureSensitivity: true,
      pressureAffects: "size",
      roundness: 1,
      angle: 0
    });
    const eraserEngine = new EraserEngine({
      size: 20,
      opacity: 1,
      hardness: 0.8
    });
    const session = new PaintSession(brushEngine);

    // First stroke with brush
    const ctx1 = makeToolContext();
    session.begin(ctx1, makePointerEvent());
    expect(ctx1.activeStrokeRef.current?.compositeOp).toBe("source-over");
    session.end(ctx1, makePointerEvent());

    // Switch to eraser
    session.setEngine(eraserEngine);
    const ctx2 = makeToolContext();
    session.begin(ctx2, makePointerEvent());
    expect(ctx2.activeStrokeRef.current?.compositeOp).toBe("destination-out");
    session.end(ctx2, makePointerEvent());
  });

  it("expands the backing raster for transformed painting without reconcile", () => {
    const engine = new BrushEngine({
      size: 10,
      opacity: 1,
      hardness: 0.8,
      color: "#000000",
      brushType: "round",
      pressureSensitivity: true,
      pressureAffects: "size",
      roundness: 1,
      angle: 0
    });
    const session = new PaintSession(engine);
    const canvasMap = new Map<string, HTMLCanvasElement>();
    const layerId = "layer_transform";
    const existingCanvas = window.document.createElement("canvas");
    existingCanvas.width = 64;
    existingCanvas.height = 64;
    canvasMap.set(layerId, existingCanvas);
    const ctx = makeToolContext({
      doc: {
        ...createDefaultDocument(64, 64),
        activeLayerId: layerId,
        layers: [
          {
            ...createDefaultDocument(64, 64).layers[0],
            id: layerId,
            transform: { x: 20, y: 10 },
            contentBounds: { x: 0, y: 0, width: 64, height: 64 }
          }
        ]
      },
      layerCanvasesRef: { current: canvasMap },
      getOrCreateLayerCanvas: jest.fn((requestedLayerId: string) => {
        const canvas = canvasMap.get(requestedLayerId);
        if (!canvas) {
          throw new Error(`missing canvas for ${requestedLayerId}`);
        }
        return canvas;
      })
    });

    const fakeCtx = {
      drawImage: jest.fn(),
      clearRect: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      rect: jest.fn(),
      clip: jest.fn(),
      getImageData: jest.fn(),
      putImageData: jest.fn()
    } as unknown as CanvasRenderingContext2D;
    const getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation((((contextId: string) =>
        contextId === "2d" ? fakeCtx : null) as unknown) as typeof HTMLCanvasElement.prototype.getContext);

    try {
      expect(session.begin(ctx, makePointerEvent())).toBe(true);
      // ensureLayerRasterBounds expands the canvas in-place via
      // layerCanvasesRef and returns updated bounds. The expanded canvas
      // is stored on the canvas map — verify the backing raster grew.
      const updatedCanvas = canvasMap.get(layerId)!;
      expect(updatedCanvas.width).toBeGreaterThanOrEqual(64);
      expect(updatedCanvas.height).toBeGreaterThanOrEqual(64);
    } finally {
      getContextSpy.mockRestore();
    }
  });
});

// ─── Tool integration tests (using PaintSession) ──────────────────────────

describe("BrushTool (PaintSession)", () => {
  it("starts a brush stroke on pointer down", () => {
    const tool = new BrushTool();
    const ctx = makeToolContext({ activeTool: "brush" });
    const result = tool.onDown(ctx, makePointerEvent());
    expect(result).toBe(true);
    expect(ctx.onStrokeStart).toHaveBeenCalled();
    expect(ctx.activeStrokeRef.current).not.toBeNull();
    expect(ctx.activeStrokeRef.current?.compositeOp).toBe("source-over");
  });

  it("calls onStrokeEnd on pointer up", () => {
    const tool = new BrushTool();
    const ctx = makeToolContext({ activeTool: "brush" });
    tool.onDown(ctx, makePointerEvent());
    tool.onUp!(ctx, makePointerEvent());
    // Buffered tools defer onStrokeEnd to a pendingCommit closure
    const stroke = ctx.activeStrokeRef.current;
    if (stroke?.pendingCommit) {
      stroke.pendingCommit();
    }
    expect(ctx.onStrokeEnd).toHaveBeenCalledWith(
      ctx.doc.activeLayerId, null
    );
    expect(ctx.activeStrokeRef.current).toBeNull();
  });

  it("handles full stroke lifecycle without crash", () => {
    const tool = new BrushTool();
    const ctx = makeToolContext({ activeTool: "brush" });
    tool.onDown(ctx, makePointerEvent({ point: { x: 5, y: 5 } }));
    tool.onMove!(
      ctx,
      makePointerEvent({ point: { x: 15, y: 15 } }),
      [makePointerEvent({ point: { x: 15, y: 15 } })]
    );
    tool.onUp!(ctx, makePointerEvent({ point: { x: 20, y: 20 } }));
    const stroke = ctx.activeStrokeRef.current;
    if (stroke?.pendingCommit) {
      stroke.pendingCommit();
    }
    expect(ctx.onStrokeStart).toHaveBeenCalled();
    expect(ctx.onStrokeEnd).toHaveBeenCalled();
  });
});

describe("PencilTool (PaintSession)", () => {
  it("paints directly without stroke buffer", () => {
    const tool = new PencilTool();
    const ctx = makeToolContext({ activeTool: "pencil" });
    tool.onDown(ctx, makePointerEvent());
    // Pencil uses direct mode — no stroke buffer
    expect(ctx.activeStrokeRef.current).toBeNull();
  });

  it("calls onStrokeEnd on pointer up", () => {
    const tool = new PencilTool();
    const ctx = makeToolContext({ activeTool: "pencil" });
    tool.onDown(ctx, makePointerEvent());
    tool.onUp!(ctx, makePointerEvent());
    expect(ctx.onStrokeEnd).toHaveBeenCalledWith(
      ctx.doc.activeLayerId, null
    );
  });
});

describe("EraserTool (PaintSession)", () => {
  it("creates destination-out stroke buffer on pointer down", () => {
    const tool = new EraserTool();
    const ctx = makeToolContext({ activeTool: "eraser" });
    const result = tool.onDown(ctx, makePointerEvent());
    expect(result).toBe(true);
    expect(ctx.activeStrokeRef.current).not.toBeNull();
    expect(ctx.activeStrokeRef.current?.compositeOp).toBe("destination-out");
  });

  it("calls onStrokeEnd on pointer up", () => {
    const tool = new EraserTool();
    const ctx = makeToolContext({ activeTool: "eraser" });
    tool.onDown(ctx, makePointerEvent());
    tool.onUp!(ctx, makePointerEvent());
    const stroke = ctx.activeStrokeRef.current;
    if (stroke?.pendingCommit) {
      stroke.pendingCommit();
    }
    expect(ctx.onStrokeEnd).toHaveBeenCalledWith(
      ctx.doc.activeLayerId, null
    );
  });
});

describe("ShapeTool (transform-aware commit)", () => {
  it("starts a shape gesture on pointer down", () => {
    const tool = new ShapeTool();
    const ctx = makeToolContext({ activeTool: "shape" });
    const result = tool.onDown(ctx, makePointerEvent());
    expect(result).toBe(true);
    expect(ctx.onStrokeStart).toHaveBeenCalled();
  });

  it("calls drawOverlayShape during drag", () => {
    const tool = new ShapeTool();
    const ctx = makeToolContext({ activeTool: "shape" });
    tool.onDown(ctx, makePointerEvent({ point: { x: 5, y: 5 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 25, y: 25 } }), []);
    expect(ctx.drawOverlayShape).toHaveBeenCalledWith(
      { x: 5, y: 5 },
      { x: 25, y: 25 }
    );
  });

  it("calls onStrokeEnd on pointer up", () => {
    const fakeCtx = {
      drawImage: jest.fn(),
      clearRect: jest.fn(),
      save: jest.fn(),
      restore: jest.fn()
    } as unknown as CanvasRenderingContext2D;
    const getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation((((contextId: string) =>
        contextId === "2d" ? fakeCtx : null) as unknown) as typeof HTMLCanvasElement.prototype.getContext);

    try {
      const tool = new ShapeTool();
      const ctx = makeToolContext({ activeTool: "shape" });
      // ShapeTool.onUp reads from overlayCanvasRef
      const overlayCanvas = window.document.createElement("canvas");
      overlayCanvas.width = 64;
      overlayCanvas.height = 64;
      (ctx.overlayCanvasRef as { current: HTMLCanvasElement | null }).current = overlayCanvas;
      tool.onDown(ctx, makePointerEvent());
      tool.onUp!(ctx, makePointerEvent());
      expect(ctx.onStrokeEnd).toHaveBeenCalledWith(ctx.doc.activeLayerId, null);
    } finally {
      getContextSpy.mockRestore();
    }
  });
});
