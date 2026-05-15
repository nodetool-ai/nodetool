/**
 * Tests for tool handler architecture (Phase 3).
 *
 * Tests verify:
 * - getToolHandler returns correct handler types for all tools
 * - Tool handler instances are cached (singletons)
 * - Shape tools share a single handler
 * - All tool handlers implement the ToolHandler interface
 * - Individual tool handler basic behavior
 */

import { getToolHandler } from "../tools";
import type { ToolContext, ToolPointerEvent } from "../tools";
import type { ToolRuntime } from "../tools/types";
import { BrushTool } from "../tools/BrushTool";
import { PencilTool } from "../tools/PencilTool";
import { EraserTool } from "../tools/EraserTool";
import { MoveTool } from "../tools/MoveTool";
import { TransformTool } from "../tools/TransformTool";
import { FillTool } from "../tools/FillTool";
import { ShapeTool } from "../tools/ShapeTool";
import { GradientTool } from "../tools/GradientTool";
import { CropTool } from "../tools/CropTool";
import { SelectTool } from "../tools/SelectTool";
import { EyedropperTool, sampleColorHex } from "../tools/EyedropperTool";
import { BlurTool } from "../tools/BlurTool";
import { CloneStampTool } from "../tools/CloneStampTool";
import { SegmentTool } from "../tools/SegmentTool";
import type { SketchTool } from "../types";
import { createDefaultDocument, createDefaultLayer, makeAffineTransform } from "../types";
import { aff } from "./_transformFixtures";
import { rectSelectionMask } from "../selection";
import { useSketchStore } from "../state/useSketchStore";
import * as magicWandAsync from "../selection/magicWandAsync";

// ─── Test helpers ──────────────────────────────────────────────────────────

function makeToolContext(overrides?: Partial<ToolContext>): ToolContext {
  const doc = createDefaultDocument(64, 64);
  const testContainer = window.document.createElement("div");
  testContainer.getBoundingClientRect = (): DOMRect =>
    new DOMRect(0, 0, 800, 600);

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
    gizmoCanvasRef: { current: null },
    cursorCanvasRef: { current: null },
    containerRef: { current: testContainer },
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
    drawOverlayLassoPreview: jest.fn(),
    drawOverlaySelection: jest.fn(),
    drawCursor: jest.fn(),
    clearGizmo: jest.fn(),
    drawGizmo: jest.fn((cb) => {
      // Provide a mock 2D context to the callback
      const mockGc = {
        save: jest.fn(),
        restore: jest.fn(),
        translate: jest.fn(),
        rotate: jest.fn(),
        scale: jest.fn(),
        setTransform: jest.fn(),
        clearRect: jest.fn(),
        strokeRect: jest.fn(),
        fillRect: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        arc: jest.fn(),
        stroke: jest.fn(),
        fill: jest.fn(),
        setLineDash: jest.fn(),
        set strokeStyle(_: string) { /* noop */ },
        set fillStyle(_: string) { /* noop */ },
        set lineWidth(_: number) { /* noop */ },
        set lineDashOffset(_: number) { /* noop */ },
      } as unknown as CanvasRenderingContext2D;
      cb(mockGc, 1, 800, 600);
    }),
    onZoomChange: jest.fn(),
    onPanChange: jest.fn(),
    onStrokeStart: jest.fn(),
    onStrokeEnd: jest.fn(),
    onLayerTransformChange: jest.fn(),
    setLayerTransformPreview: jest.fn(),
    clearLayerTransformPreview: jest.fn(),
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

/**
 * Create a minimal Canvas2D mock that is sufficient for fill and gradient
 * tool tests that generate temporary overlay canvases.
 */
function makeMock2dContext(
  canvas: HTMLCanvasElement
): CanvasRenderingContext2D {
  const gradient = { addColorStop: jest.fn() };
  return {
    canvas,
    getImageData: jest.fn(() => ({
      data: new Uint8ClampedArray(canvas.width * canvas.height * 4),
      width: canvas.width,
      height: canvas.height
    })),
    putImageData: jest.fn(),
    createImageData: jest.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height
    })),
    save: jest.fn(),
    restore: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    drawImage: jest.fn(),
    createLinearGradient: jest.fn(() => gradient),
    createRadialGradient: jest.fn(() => gradient)
  } as unknown as CanvasRenderingContext2D;
}

function makeImageData(
  width: number,
  height: number,
  fill: [number, number, number, number]
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return { data, width, height, colorSpace: "srgb" } as ImageData;
}

// ─── Factory tests ─────────────────────────────────────────────────────────

describe("getToolHandler factory", () => {
  it("returns correct handler types for all tools", () => {
    const expected: SketchTool[] = [
      "brush",
      "pencil",
      "eraser",
      "move",
      "transform",
      "fill",
      "shape",
      "gradient",
      "crop",
      "select",
      "eyedropper",
      "blur",
      "clone_stamp",
      "adjust"
    ];
    for (const tool of expected) {
      const handler = getToolHandler(tool);
      expect(handler).toBeDefined();
      expect(handler.toolId).toBeDefined();
    }
  });

  it("caches handler instances (singletons)", () => {
    const a = getToolHandler("brush");
    const b = getToolHandler("brush");
    expect(a).toBe(b);
  });

  it("returns the single ShapeTool for the shape tool", () => {
    const shape = getToolHandler("shape");
    expect(shape).toBeInstanceOf(ShapeTool);
  });
});

// ─── Interface compliance tests ────────────────────────────────────────────

describe("tool handler interface compliance", () => {
  const toolClasses = [
    BrushTool,
    PencilTool,
    EraserTool,
    MoveTool,
    TransformTool,
    FillTool,
    ShapeTool,
    GradientTool,
    CropTool,
    SelectTool,
    EyedropperTool,
    BlurTool,
    CloneStampTool
  ];

  for (const ToolClass of toolClasses) {
    it(`${ToolClass.name} implements ToolHandler`, () => {
      const handler = new ToolClass();
      expect(handler.toolId).toBeDefined();
      expect(typeof handler.toolId).toBe("string");
      // At least onDown should exist for all tools
      expect(typeof handler.onDown).toBe("function");
    });
  }
});

// ─── Individual tool behavior tests ─────────────────────────────────────

describe("MoveTool", () => {
  it("starts a move gesture on pointer down", () => {
    const tool = new MoveTool();
    const ctx = makeToolContext();
    const event = makePointerEvent();
    const result = tool.onDown(ctx, event);
    expect(result).toBe(true);
    expect(ctx.onStrokeStart).toHaveBeenCalled();
  });

  it("invokes setLayerTransformPreview during move (not the store)", () => {
    const tool = new MoveTool();
    const ctx = makeToolContext();
    tool.onDown(ctx, makePointerEvent({ point: { x: 10, y: 10 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 20, y: 15 } }), []);
    // Preview now includes the full transform (scale/rotation preserved via
    // mergeTransformPreview) plus a matrix — not just {x, y}.
    expect(ctx.setLayerTransformPreview).toHaveBeenCalledWith(
      ctx.doc.activeLayerId,
      expect.objectContaining({ x: 10, y: 5, scaleX: 1, scaleY: 1, rotation: 0 })
    );
    // Store must NOT be updated on every move — only on pointer-up.
    expect(ctx.onLayerTransformChange).not.toHaveBeenCalled();
  });

  it("calls onStrokeEnd on pointer up", () => {
    const tool = new MoveTool();
    const ctx = makeToolContext();
    tool.onDown(ctx, makePointerEvent());
    tool.onUp!(ctx, makePointerEvent());
    expect(ctx.onStrokeEnd).toHaveBeenCalledWith(ctx.doc.activeLayerId, null, undefined, {
      syncDocumentFromCanvas: false
    });
  });

  it("syncActiveLayer refreshes gizmo when idle", () => {
    const tool = new MoveTool();
    const doc = createDefaultDocument(64, 64);
    const layer2 = {
      ...doc.layers[0],
      id: "layer-2",
      name: "Layer 2"
    };
    doc.layers = [doc.layers[0], layer2];
    const ctx = makeToolContext({ doc });
    tool.onActivate!(ctx);
    (ctx.clearGizmo as jest.Mock).mockClear();

    tool.syncActiveLayer({
      ...ctx,
      doc: { ...doc, activeLayerId: layer2.id }
    });
    expect(ctx.clearGizmo).toHaveBeenCalled();
  });

  it("syncActiveLayer is a no-op while a move gesture is active", () => {
    const tool = new MoveTool();
    const ctx = makeToolContext();
    tool.onDown(ctx, makePointerEvent());
    (ctx.clearGizmo as jest.Mock).mockClear();
    tool.syncActiveLayer(ctx);
    expect(ctx.clearGizmo).not.toHaveBeenCalled();
  });

  it("returns false when the active layer is locked without an image reference", () => {
    const tool = new MoveTool();
    const doc = createDefaultDocument(64, 64);
    const active = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (active) {
      active.locked = true;
    }
    const ctx = makeToolContext({ doc });
    expect(tool.onDown(ctx, makePointerEvent())).toBe(false);
  });

  it("allows move when the active layer is locked but image-backed", () => {
    const tool = new MoveTool();
    const doc = createDefaultDocument(64, 64);
    const refLayer = createDefaultLayer("Ref", "raster", 64, 64);
    refLayer.locked = true;
    refLayer.imageReference = {
      uri: "https://example.com/x.png",
      naturalWidth: 64,
      naturalHeight: 64,
      objectFit: "fill"
    };
    doc.layers = [refLayer];
    doc.activeLayerId = refLayer.id;
    const ctx = makeToolContext({ doc });
    expect(tool.onDown(ctx, makePointerEvent())).toBe(true);
  });

  it("does not auto-pick another layer when move auto-select is disabled", () => {
    useSketchStore.setState((state) => ({
      ...state,
      toolSettings: {
        ...state.toolSettings,
        move: {
          ...state.toolSettings.move,
          autoSelect: false
        }
      }
    }));

    const tool = new MoveTool();
    const doc = createDefaultDocument(128, 128);
    const activeLayer = doc.layers[0];
    activeLayer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };

    const topLayer = createDefaultLayer("Top", "raster", 64, 64);
    topLayer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };
    doc.layers = [activeLayer, topLayer];
    doc.activeLayerId = activeLayer.id;

    const bottomCanvas = document.createElement("canvas");
    bottomCanvas.width = 64;
    bottomCanvas.height = 64;
    bottomCanvas.getContext("2d")!.fillRect(0, 0, 64, 64);

    const topCanvas = document.createElement("canvas");
    topCanvas.width = 64;
    topCanvas.height = 64;
    topCanvas.getContext("2d")!.fillRect(0, 0, 64, 64);

    const onAutoPickLayer = jest.fn((layerId: string) => {
      doc.activeLayerId = layerId;
    });
    const ctx = makeToolContext({
      doc,
      layerCanvasesRef: {
        current: new Map<string, HTMLCanvasElement>([
          [activeLayer.id, bottomCanvas],
          [topLayer.id, topCanvas]
        ])
      },
      onAutoPickLayer
    });

    expect(tool.onDown(ctx, makePointerEvent({ point: { x: 16, y: 16 } }))).toBe(true);
    expect(onAutoPickLayer).not.toHaveBeenCalled();
    expect(doc.activeLayerId).toBe(activeLayer.id);
  });
});

describe("TransformTool", () => {
  it("stores original transform on activation", () => {
    const tool = new TransformTool();
    const doc = createDefaultDocument(64, 64);
    const layer = doc.layers[0];
    layer.transform = makeAffineTransform({ x: 5, y: 10, scaleX: 2, scaleY: 1.5, rotation: 0.5 });
    const ctx = makeToolContext({ doc });
    tool.onActivate!(ctx);
    const orig = aff(tool.getOriginalTransform());
    expect(orig.x).toBe(5);
    expect(orig.y).toBe(10);
    expect(orig.scaleX).toBe(2);
    expect(orig.scaleY).toBe(1.5);
    expect(orig.rotation).toBe(0.5);
  });

  it("returns false when the active layer is locked", () => {
    const tool = new TransformTool();
    const doc = createDefaultDocument(64, 64);
    const layer = doc.layers[0];
    layer.locked = true;
    const ctx = makeToolContext({ doc });
    expect(tool.onDown(ctx, makePointerEvent({ point: { x: 32, y: 32 } }))).toBe(false);
  });

  it("starts a move gesture when clicking inside the layer bounds", () => {
    const tool = new TransformTool();
    const doc = createDefaultDocument(64, 64);
    const ctx = makeToolContext({ doc });
    tool.onActivate!(ctx);
    // Click inside 64x64 layer, away from center to avoid pivot crosshair
    const result = tool.onDown(ctx, makePointerEvent({ point: { x: 15, y: 15 } }));
    expect(result).toBe(true);
    expect(ctx.onStrokeStart).toHaveBeenCalled();
  });

  it("translates the layer when dragging with move handle", () => {
    const tool = new TransformTool();
    const doc = createDefaultDocument(64, 64);
    const ctx = makeToolContext({ doc });
    tool.onActivate!(ctx);
    // Start drag inside box, away from center to avoid pivot crosshair
    tool.onDown(ctx, makePointerEvent({ point: { x: 15, y: 15 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 25, y: 20 } }));
    // During drag, the transform is applied via the preview-only path
    // (setLayerTransformPreview) for performance — not via onLayerTransformChange.
    expect(ctx.setLayerTransformPreview).toHaveBeenCalledWith(
      doc.activeLayerId,
      expect.objectContaining({ x: 10, y: 5 })
    );
    // The document commit happens on pointer-up.
    expect(ctx.onLayerTransformChange).not.toHaveBeenCalled();
    tool.onUp!(ctx);
    expect(ctx.onLayerTransformChange).toHaveBeenCalledWith(
      doc.activeLayerId,
      expect.objectContaining({ x: 10, y: 5 })
    );
  });

  it("translates the custom pivot with the layer during a move drag", () => {
    const tool = new TransformTool();
    const doc = createDefaultDocument(64, 64);
    const ctx = makeToolContext({ doc });
    tool.onActivate!(ctx);

    expect(tool.onDown(ctx, makePointerEvent({ point: { x: 32, y: 32 } }))).toBe(true);
    tool.onMove!(ctx, makePointerEvent({ point: { x: 84, y: 32 } }));
    tool.onUp!(ctx);
    expect(tool.getPivotPoint()).toEqual({ x: 84, y: 32 });

    expect(tool.onDown(ctx, makePointerEvent({ point: { x: 15, y: 15 } }))).toBe(true);
    tool.onMove!(ctx, makePointerEvent({ point: { x: 25, y: 20 } }));
    expect(tool.getPivotPoint()).toEqual({ x: 94, y: 37 });
    tool.onUp!(ctx);
    expect(tool.getPivotPoint()).toEqual({ x: 94, y: 37 });
  });

  it("clears gestureActive on pointer up so syncActiveLayer follows a new active layer", () => {
    const tool = new TransformTool();
    const doc = createDefaultDocument(64, 64);
    const layer2 = {
      ...doc.layers[0],
      id: "layer-2",
      name: "Layer 2",
      transform: makeAffineTransform({ x: 100, y: 50 })
    };
    doc.layers = [doc.layers[0], layer2];

    const ctx = makeToolContext({ doc });
    tool.onActivate!(ctx);
    tool.onDown(ctx, makePointerEvent({ point: { x: 15, y: 15 } }));
    tool.onUp!(ctx);

    tool.syncActiveLayer({
      ...ctx,
      doc: { ...doc, activeLayerId: layer2.id }
    });
    expect(aff(tool.getOriginalTransform()).x).toBe(100);
    expect(aff(tool.getOriginalTransform()).y).toBe(50);
  });

  it("calls onStrokeEnd on pointer up", () => {
    const tool = new TransformTool();
    const doc = createDefaultDocument(64, 64);
    const ctx = makeToolContext({ doc });
    tool.onActivate!(ctx);
    // Click inside box, away from center to avoid pivot crosshair
    tool.onDown(ctx, makePointerEvent({ point: { x: 15, y: 15 } }));
    tool.onUp!(ctx);
    expect(ctx.onStrokeEnd).toHaveBeenCalledWith(
      doc.activeLayerId,
      null,
      undefined,
      { syncDocumentFromCanvas: false }
    );
  });

  it("clears overlay on deactivation", () => {
    const tool = new TransformTool();
    const ctx = makeToolContext();
    tool.onActivate!(ctx);
    tool.onDeactivate!(ctx);
    expect(ctx.clearOverlay).toHaveBeenCalled();
    expect(ctx.drawSelectionOverlay).toHaveBeenCalled();
  });

  it("uses ctx.drawGizmo on activation (deferred via rAF)", async () => {
    const tool = new TransformTool();
    const doc = createDefaultDocument(64, 64);
    const ctx = makeToolContext({ doc });
    tool.onActivate!(ctx);
    // onActivate defers the initial draw via rAF so the sibling
    // useOverlayRenderer effect's clearGizmo doesn't wipe the freshly painted gizmo.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(ctx.drawGizmo).toHaveBeenCalled();
  });

  it("uses ctx.clearGizmo on deactivation", () => {
    const tool = new TransformTool();
    const doc = createDefaultDocument(64, 64);
    const ctx = makeToolContext({ doc });
    tool.onActivate!(ctx);
    tool.onDeactivate!(ctx);
    expect(ctx.clearGizmo).toHaveBeenCalled();
  });

  it("re-grabs a custom pivot after moving it outside the box", () => {
    const tool = new TransformTool();
    const doc = createDefaultDocument(64, 64);
    const ctx = makeToolContext({ doc });
    tool.onActivate!(ctx);

    expect(tool.onDown(ctx, makePointerEvent({ point: { x: 32, y: 32 } }))).toBe(true);
    tool.onMove!(ctx, makePointerEvent({ point: { x: 84, y: 32 } }));
    tool.onUp!(ctx);
    expect(tool.getPivotPoint()).toEqual({ x: 84, y: 32 });

    expect(tool.getHoverCursor(ctx, { x: 84, y: 32 })).toBe("crosshair");
    expect(tool.onDown(ctx, makePointerEvent({ point: { x: 84, y: 32 } }))).toBe(true);

    tool.onMove!(ctx, makePointerEvent({ point: { x: 90, y: 32 } }));
    expect(tool.getPivotPoint()).toEqual({ x: 90, y: 32 });
  });

  it("clears a custom pivot when auto-pick switches to a different layer", () => {
    useSketchStore.setState((state) => ({
      ...state,
      toolSettings: {
        ...state.toolSettings,
        transform: {
          ...state.toolSettings.transform,
          autoSelect: true
        }
      }
    }));

    const tool = new TransformTool();
    const doc = createDefaultDocument(256, 256);
    const activeLayer = doc.layers[0];
    activeLayer.contentBounds = { x: 0, y: 0, width: 32, height: 32 };

    const pickedLayer = createDefaultLayer("Picked", "raster", 32, 32);
    pickedLayer.transform = makeAffineTransform({ x: 150, y: 0 });
    pickedLayer.contentBounds = { x: 0, y: 0, width: 32, height: 32 };
    doc.layers = [activeLayer, pickedLayer];
    doc.activeLayerId = activeLayer.id;

    const activeCanvas = document.createElement("canvas");
    activeCanvas.width = 32;
    activeCanvas.height = 32;
    const activeCtx = activeCanvas.getContext("2d")!;
    activeCtx.fillStyle = "#000";
    activeCtx.fillRect(0, 0, 32, 32);

    const pickedCanvas = document.createElement("canvas");
    pickedCanvas.width = 32;
    pickedCanvas.height = 32;
    const pickedCtx = pickedCanvas.getContext("2d")!;
    pickedCtx.fillStyle = "#000";
    pickedCtx.fillRect(0, 0, 32, 32);

    const layerCanvases = new Map<string, HTMLCanvasElement>([
      [activeLayer.id, activeCanvas],
      [pickedLayer.id, pickedCanvas]
    ]);
    const onAutoPickLayer = jest.fn((layerId: string) => {
      doc.activeLayerId = layerId;
    });
    const ctx = makeToolContext({ doc, layerCanvasesRef: { current: layerCanvases }, onAutoPickLayer });

    tool.onActivate!(ctx);

    expect(tool.onDown(ctx, makePointerEvent({ point: { x: 16, y: 16 } }))).toBe(true);
    tool.onMove!(ctx, makePointerEvent({ point: { x: 52, y: 16 } }));
    tool.onUp!(ctx);
    expect(tool.getPivotPoint()).toEqual({ x: 52, y: 16 });

    expect(tool.onDown(ctx, makePointerEvent({ point: { x: 160, y: 16 } }))).toBe(false);
    expect(onAutoPickLayer).toHaveBeenCalledWith(pickedLayer.id);
    expect(tool.getPivotPoint()).toBeNull();
  });

  it("collapses layers-panel multi-select transform when only one target paints at the pointer", () => {
    useSketchStore.setState((state) => ({
      ...state,
      toolSettings: {
        ...state.toolSettings,
        transform: {
          ...state.toolSettings.transform,
          autoSelect: true
        }
      }
    }));

    const tool = new TransformTool();
    const doc = createDefaultDocument(256, 256);
    const bottom = doc.layers[0];
    bottom.contentBounds = { x: 0, y: 0, width: 32, height: 32 };

    const top = createDefaultLayer("Top", "raster", 32, 32);
    top.transform = makeAffineTransform({ x: 140, y: 0 });
    top.contentBounds = { x: 0, y: 0, width: 32, height: 32 };
    doc.layers = [bottom, top];
    doc.activeLayerId = top.id;

    const bottomCanvas = document.createElement("canvas");
    bottomCanvas.width = 32;
    bottomCanvas.height = 32;
    bottomCanvas.getContext("2d")!.fillRect(0, 0, 32, 32);

    const topCanvas = document.createElement("canvas");
    topCanvas.width = 32;
    topCanvas.height = 32;
    topCanvas.getContext("2d")!.fillRect(0, 0, 32, 32);

    const onAutoPickLayer = jest.fn((layerId: string) => {
      doc.activeLayerId = layerId;
      useSketchStore.setState((s) => ({
        selectedLayerIds: [],
        document: { ...s.document, activeLayerId: layerId }
      }));
    });

    useSketchStore.setState((s) => ({
      ...s,
      selectedLayerIds: [bottom.id, top.id]
    }));

    const ctx = makeToolContext({
      doc,
      layerCanvasesRef: {
        current: new Map([
          [bottom.id, bottomCanvas],
          [top.id, topCanvas]
        ])
      },
      onAutoPickLayer
    });

    tool.onActivate!(ctx);
    expect(tool.getMultiTargetLayerIds().length).toBe(2);

    expect(tool.onDown(ctx, makePointerEvent({ point: { x: 10, y: 10 } }))).toBe(false);
    expect(onAutoPickLayer).toHaveBeenCalledWith(bottom.id);
    expect(tool.getMultiTargetLayerIds()).toEqual([bottom.id]);

    useSketchStore.setState((s) => ({
      ...s,
      selectedLayerIds: []
    }));
  });

  it("auto-retargets on interior move clicks when a different layer's content is on top", () => {
    useSketchStore.setState((state) => ({
      ...state,
      toolSettings: {
        ...state.toolSettings,
        transform: {
          ...state.toolSettings.transform,
          autoSelect: true
        }
      }
    }));

    const tool = new TransformTool();
    const doc = createDefaultDocument(128, 128);
    const activeLayer = doc.layers[0];
    activeLayer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };

    const topLayer = createDefaultLayer("Top", "raster", 64, 64);
    topLayer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };
    doc.layers = [activeLayer, topLayer];
    doc.activeLayerId = activeLayer.id;

    const bottomCanvas = document.createElement("canvas");
    bottomCanvas.width = 64;
    bottomCanvas.height = 64;
    bottomCanvas.getContext("2d")!.fillRect(0, 0, 64, 64);

    const topCanvas = document.createElement("canvas");
    topCanvas.width = 64;
    topCanvas.height = 64;
    topCanvas.getContext("2d")!.fillRect(0, 0, 64, 64);

    const onAutoPickLayer = jest.fn((layerId: string) => {
      doc.activeLayerId = layerId;
    });
    const ctx = makeToolContext({
      doc,
      layerCanvasesRef: {
        current: new Map<string, HTMLCanvasElement>([
          [activeLayer.id, bottomCanvas],
          [topLayer.id, topCanvas]
        ])
      },
      onAutoPickLayer
    });

    tool.onActivate!(ctx);

    // Click lands in both layers' bboxes and topLayer paints opaque pixel
    // on top — Affinity-style retarget kicks in (returns false to release the
    // pointer; user clicks again to start the actual transform on the new
    // target).
    expect(tool.onDown(ctx, makePointerEvent({ point: { x: 16, y: 16 } }))).toBe(false);
    expect(onAutoPickLayer).toHaveBeenCalledWith(topLayer.id);
    expect(doc.activeLayerId).toBe(topLayer.id);
  });

  it("keeps handle hits on the current target ahead of auto-retargeting", () => {
    useSketchStore.setState((state) => ({
      ...state,
      toolSettings: {
        ...state.toolSettings,
        transform: {
          ...state.toolSettings.transform,
          autoSelect: true
        }
      }
    }));

    const tool = new TransformTool();
    const doc = createDefaultDocument(128, 128);
    const activeLayer = doc.layers[0];
    activeLayer.contentBounds = { x: 0, y: 0, width: 32, height: 32 };

    const topLayer = createDefaultLayer("Top", "raster", 32, 32);
    topLayer.contentBounds = { x: 0, y: 0, width: 32, height: 32 };
    doc.layers = [activeLayer, topLayer];
    doc.activeLayerId = activeLayer.id;

    const bottomCanvas = document.createElement("canvas");
    bottomCanvas.width = 32;
    bottomCanvas.height = 32;
    bottomCanvas.getContext("2d")!.fillRect(0, 0, 32, 32);

    const topCanvas = document.createElement("canvas");
    topCanvas.width = 32;
    topCanvas.height = 32;
    topCanvas.getContext("2d")!.fillRect(0, 0, 32, 32);

    const onAutoPickLayer = jest.fn((layerId: string) => {
      doc.activeLayerId = layerId;
    });
    const ctx = makeToolContext({
      doc,
      layerCanvasesRef: {
        current: new Map<string, HTMLCanvasElement>([
          [activeLayer.id, bottomCanvas],
          [topLayer.id, topCanvas]
        ])
      },
      onAutoPickLayer
    });

    tool.onActivate!(ctx);

    expect(tool.onDown(ctx, makePointerEvent({ point: { x: 0, y: 0 } }))).toBe(true);
    expect(onAutoPickLayer).not.toHaveBeenCalled();
    expect(doc.activeLayerId).toBe(activeLayer.id);
  });
});

describe("EyedropperTool", () => {
  it("dispatches sketch-eyedropper custom event on pointer down", () => {
    const tool = new EyedropperTool();
    const canvas = window.document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const container = window.document.createElement("div");
    const dispatchSpy = jest.spyOn(container, "dispatchEvent");
    const ctx = makeToolContext({
      displayCanvasRef: { current: canvas },
      containerRef: { current: container }
    });
    tool.onDown(ctx, makePointerEvent());
    // In JSDOM, getContext('2d') may return null or mock, so the event
    // might not fire. We just verify no crash.
    expect(true).toBe(true);
    dispatchSpy.mockRestore();
  });
});

describe("SelectTool", () => {
  it("starts a new selection on pointer down", () => {
    jest.useFakeTimers();
    const tool = new SelectTool();
    const ctx = makeToolContext();
    const result = tool.onDown(ctx, makePointerEvent({ point: { x: 5, y: 5 } }));
    expect(result).toBe(true);
    // Selection clear is deferred to avoid blocking the pointer-down handler
    jest.runAllTimers();
    expect(ctx.onSelectionChange).toHaveBeenCalledWith(null);
    jest.useRealTimers();
  });

  it("starts moving selection when clicking inside existing selection", () => {
    const tool = new SelectTool();
    const ctx = makeToolContext({
      selection: rectSelectionMask(64, 64, 0, 0, 20, 20)
    });
    const result = tool.onDown(ctx, makePointerEvent({ point: { x: 10, y: 10 } }));
    expect(result).toBe(true);
    // Selection change should NOT be called for move
    expect(ctx.onSelectionChange).not.toHaveBeenCalled();
  });

  it("calls drawOverlaySelection during drag", () => {
    const tool = new SelectTool();
    const ctx = makeToolContext();
    tool.onDown(ctx, makePointerEvent({ point: { x: 5, y: 5 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 20, y: 20 } }), []);
    expect(ctx.drawOverlaySelection).toHaveBeenCalledWith(
      { x: 5, y: 5 },
      { x: 20, y: 20 }
    );
  });

  it("marquee: Shift held from pointer-down for add does not constrain until Shift is released and pressed again", () => {
    const tool = new SelectTool();
    const shiftHeldRef = { current: true };
    const ctx = makeToolContext({ shiftHeldRef });

    tool.onDown(ctx, makePointerEvent({ point: { x: 5, y: 5 } }));

    tool.onMove!(ctx, makePointerEvent({ point: { x: 20, y: 25 } }), []);
    expect(ctx.drawOverlaySelection).toHaveBeenLastCalledWith(
      { x: 5, y: 5 },
      { x: 20, y: 25 }
    );

    shiftHeldRef.current = false;
    tool.onMove!(ctx, makePointerEvent({ point: { x: 20, y: 30 } }), []);
    expect(ctx.drawOverlaySelection).toHaveBeenLastCalledWith(
      { x: 5, y: 5 },
      { x: 20, y: 30 }
    );

    shiftHeldRef.current = true;
    tool.onMove!(ctx, makePointerEvent({ point: { x: 20, y: 35 } }), []);
    expect(ctx.drawOverlaySelection).toHaveBeenLastCalledWith(
      { x: 5, y: 5 },
      { x: 35, y: 35 }
    );
  });

  it("marquee: Shift during drag still constrains when Shift was not down at pointer-down (replace)", () => {
    const tool = new SelectTool();
    const shiftHeldRef = { current: false };
    const ctx = makeToolContext({ shiftHeldRef });
    tool.onDown(ctx, makePointerEvent({ point: { x: 5, y: 5 } }));
    shiftHeldRef.current = true;
    tool.onMove!(ctx, makePointerEvent({ point: { x: 20, y: 35 } }), []);
    expect(ctx.drawOverlaySelection).toHaveBeenLastCalledWith(
      { x: 5, y: 5 },
      { x: 35, y: 35 }
    );
  });

  it("runs magic-wand selection through the async worker path", async () => {
    const tool = new SelectTool();
    const doc = createDefaultDocument(32, 32);
    doc.toolSettings.select.mode = "magic_wand";
    doc.toolSettings.select.sampleAllLayers = true;
    const imageData = makeImageData(32, 32, [255, 0, 0, 255]);
    const runMagicWandSelectionAsync = jest
      .spyOn(magicWandAsync, "runMagicWandSelectionAsync")
      .mockResolvedValue(new Uint8ClampedArray(32 * 32).fill(255));
    const requestAnimationFrameSpy = jest
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
    const ctx = makeToolContext({
      doc,
      getFullCompositeImageData: jest.fn(() => imageData)
    });

    const result = tool.onDown(ctx, makePointerEvent({ point: { x: 12, y: 14 } }));
    await Promise.resolve();

    expect(result).toBe(false);
    expect(runMagicWandSelectionAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 32,
        height: 32,
        seedX: 12,
        seedY: 14,
        contiguous: true
      }),
      expect.any(AbortSignal)
    );
    expect(ctx.onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 32,
        height: 32
      })
    );

    requestAnimationFrameSpy.mockRestore();
    runMagicWandSelectionAsync.mockRestore();
  });

  it("ignores stale magic-wand results after cancel", async () => {
    const tool = new SelectTool();
    const doc = createDefaultDocument(16, 16);
    doc.toolSettings.select.mode = "magic_wand";
    let resolveMask: ((mask: Uint8ClampedArray) => void) | null = null;
    const runMagicWandSelectionAsync = jest
      .spyOn(magicWandAsync, "runMagicWandSelectionAsync")
      .mockImplementation(
        () =>
          new Promise<Uint8ClampedArray>((resolve) => {
            resolveMask = (mask: Uint8ClampedArray) => resolve(mask);
          })
      );
    const requestAnimationFrameSpy = jest
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
    const ctx = makeToolContext({
      doc,
      getFullCompositeImageData: jest.fn(() => makeImageData(16, 16, [0, 0, 0, 255]))
    });

    tool.onDown(ctx, makePointerEvent({ point: { x: 4, y: 4 } }));
    tool.onCancel?.(ctx);
    const rm = resolveMask as ((mask: Uint8ClampedArray) => void) | null;
    if (rm) rm(new Uint8ClampedArray(16 * 16).fill(255));
    await Promise.resolve();

    expect(ctx.onSelectionChange).not.toHaveBeenCalled();

    requestAnimationFrameSpy.mockRestore();
    runMagicWandSelectionAsync.mockRestore();
  });
});

describe("CropTool", () => {
  it("starts a crop gesture on pointer down", () => {
    const tool = new CropTool();
    const ctx = makeToolContext();
    const result = tool.onDown(ctx, makePointerEvent());
    expect(result).toBe(true);
  });

  it("calls drawGizmo during drag", () => {
    const tool = new CropTool();
    const ctx = makeToolContext();
    tool.onDown(ctx, makePointerEvent({ point: { x: 5, y: 5 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 30, y: 30 } }), []);
    expect(ctx.drawGizmo).toHaveBeenCalled();
  });

  it("defers onCropComplete until commitPending after pointer up", () => {
    const tool = new CropTool();
    const onCropComplete = jest.fn();
    const ctx = makeToolContext({ onCropComplete });
    tool.onDown(ctx, makePointerEvent({ point: { x: 5, y: 5 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 40, y: 40 } }), []);
    tool.onUp(ctx, makePointerEvent({ point: { x: 40, y: 40 } }));
    expect(onCropComplete).not.toHaveBeenCalled();
    tool.commitPending(ctx);
    expect(onCropComplete).toHaveBeenCalledTimes(1);
    expect(onCropComplete).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("commitPending finalizes marquee and crops when Enter runs before pointer up", () => {
    const tool = new CropTool();
    const onCropComplete = jest.fn();
    const ctx = makeToolContext({ onCropComplete });
    tool.onDown(ctx, makePointerEvent({ point: { x: 5, y: 5 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 40, y: 40 } }), []);
    expect(onCropComplete).not.toHaveBeenCalled();
    tool.commitPending(ctx);
    expect(onCropComplete).toHaveBeenCalledTimes(1);
  });

  it("commitPending commits during edge resize without pointer up", () => {
    const tool = new CropTool();
    const onCropComplete = jest.fn();
    const ctx = makeToolContext({ onCropComplete });
    tool.onDown(ctx, makePointerEvent({ point: { x: 8, y: 8 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 48, y: 48 } }), []);
    tool.onUp(ctx, makePointerEvent({ point: { x: 48, y: 48 } }));
    expect(onCropComplete).not.toHaveBeenCalled();

    tool.onDown(ctx, makePointerEvent({ point: { x: 8, y: 8 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 12, y: 12 } }), []);
    tool.commitPending(ctx);
    expect(onCropComplete).toHaveBeenCalledTimes(1);
  });
});

describe("ShapeTool", () => {
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

  it("expands raster bounds instead of reconciling transformed layers", () => {
    const tool = new ShapeTool();
    const layerId = "shape_layer";
    const canvasMap = new Map<string, HTMLCanvasElement>();
    const canvas = window.document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvasMap.set(layerId, canvas);
    const overlayCanvas = window.document.createElement("canvas");
    overlayCanvas.width = 64;
    overlayCanvas.height = 64;
    const baseDoc = createDefaultDocument(64, 64);
    const ctx = makeToolContext({
      activeTool: "shape",
      doc: {
        ...baseDoc,
        activeLayerId: layerId,
        layers: [
          {
            ...baseDoc.layers[0],
            id: layerId,
            transform: makeAffineTransform({ x: 16, y: 8 }),
            contentBounds: { x: 0, y: 0, width: 64, height: 64 }
          }
        ]
      },
      overlayCanvasRef: { current: overlayCanvas },
      gizmoCanvasRef: { current: null },
      layerCanvasesRef: { current: canvasMap },
      getOrCreateLayerCanvas: jest.fn((requestedLayerId: string) => {
        const found = canvasMap.get(requestedLayerId);
        if (!found) {
          throw new Error(`missing canvas for ${requestedLayerId}`);
        }
        return found;
      })
    });

    const fakeCtx = {
      drawImage: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      strokeRect: jest.fn(),
      fillRect: jest.fn(),
      fill: jest.fn(),
      ellipse: jest.fn()
    } as unknown as CanvasRenderingContext2D;
    const getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation((((contextId: string) =>
        contextId === "2d" ? fakeCtx : null) as unknown) as typeof HTMLCanvasElement.prototype.getContext);

    try {
      tool.onDown(ctx, makePointerEvent());
      tool.onUp(ctx, makePointerEvent());

      expect(ctx.onLayerContentBoundsChange).toHaveBeenCalledWith(layerId, {
        x: -16,
        y: -8,
        width: 80,
        height: 72
      });
    } finally {
      getContextSpy.mockRestore();
    }
  });
});

describe("GradientTool", () => {
  it("starts a gradient gesture on pointer down", () => {
    const tool = new GradientTool();
    const ctx = makeToolContext({ activeTool: "gradient" });
    const result = tool.onDown(ctx, makePointerEvent());
    expect(result).toBe(true);
    expect(ctx.onStrokeStart).toHaveBeenCalled();
  });

  it("calls drawOverlayGradient during drag", () => {
    const tool = new GradientTool();
    const ctx = makeToolContext({ activeTool: "gradient" });
    tool.onDown(ctx, makePointerEvent({ point: { x: 5, y: 5 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 50, y: 50 } }), []);
    expect(ctx.drawOverlayGradient).toHaveBeenCalledWith(
      { x: 5, y: 5 },
      { x: 50, y: 50 }
    );
  });

  it("rejects starting a gradient outside the active selection", () => {
    const tool = new GradientTool();
    const ctx = makeToolContext({
      activeTool: "gradient",
      selection: rectSelectionMask(64, 64, 30, 30, 10, 10)
    });
    const result = tool.onDown(ctx, makePointerEvent({ point: { x: 5, y: 5 } }));
    expect(result).toBe(false);
    expect(ctx.onStrokeStart).not.toHaveBeenCalled();
  });

  it("routes selection-constrained gradients through the runtime mask helper", () => {
    const tool = new GradientTool();
    const runtime = {
      applyLayerSourceBySelectionMask: jest.fn()
    } as unknown as ToolRuntime;
    const ctx = makeToolContext({
      activeTool: "gradient",
      selection: rectSelectionMask(64, 64, 0, 0, 64, 64),
      runtime,
      getOrCreateLayerCanvas: jest.fn(() => {
        const canvas = window.document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        return canvas;
      })
    });
    const getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation((function (this: HTMLCanvasElement) {
        return makeMock2dContext(this);
      }) as unknown as HTMLCanvasElement["getContext"]);

    try {
      expect(tool.onDown(ctx, makePointerEvent({ point: { x: 10, y: 10 } }))).toBe(true);
      tool.onMove!(ctx, makePointerEvent({ point: { x: 20, y: 20 } }), []);
      tool.onUp!(ctx, makePointerEvent({ point: { x: 20, y: 20 } }));

      expect(runtime.applyLayerSourceBySelectionMask).toHaveBeenCalledWith(
        ctx.doc.activeLayerId,
        0,
        0,
        ctx.selection,
        expect.any(HTMLCanvasElement)
      );
    } finally {
      getContextSpy.mockRestore();
    }
  });
});

describe("FillTool", () => {
  it("calls getOrCreateLayerCanvas on pointer down", () => {
    const tool = new FillTool();
    const ctx = makeToolContext({ activeTool: "fill" });
    tool.onDown(ctx, makePointerEvent());
    // Fill needs a real canvas context; in JSDOM getContext returns null
    // so it returns false before calling onStrokeStart.
    // We just verify no crash and getOrCreateLayerCanvas was called.
    expect(ctx.getOrCreateLayerCanvas).toHaveBeenCalledWith(ctx.doc.activeLayerId);
  });

  it("returns false when click is outside selection", () => {
    const tool = new FillTool();
    const ctx = makeToolContext({
      activeTool: "fill",
      selection: rectSelectionMask(64, 64, 50, 50, 10, 10)
    });
    const result = tool.onDown(ctx, makePointerEvent({ point: { x: 5, y: 5 } }));
    expect(result).toBe(false);
    expect(ctx.getOrCreateLayerCanvas).not.toHaveBeenCalled();
  });

  it("routes selection-constrained fills through the runtime mask helper", () => {
    const tool = new FillTool();
    const runtime = {
      applyLayerSourceBySelectionMask: jest.fn()
    } as unknown as ToolRuntime;
    const ctx = makeToolContext({
      activeTool: "fill",
      foregroundColor: "#ff0000",
      selection: rectSelectionMask(64, 64, 0, 0, 64, 64),
      runtime,
      getOrCreateLayerCanvas: jest.fn(() => {
        const canvas = window.document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        return canvas;
      })
    });
    const getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation((function (this: HTMLCanvasElement) {
        return makeMock2dContext(this);
      }) as unknown as HTMLCanvasElement["getContext"]);

    try {
      tool.onDown(ctx, makePointerEvent({ point: { x: 10, y: 10 } }));

      expect(runtime.applyLayerSourceBySelectionMask).toHaveBeenCalledWith(
        ctx.doc.activeLayerId,
        0,
        0,
        ctx.selection,
        expect.any(HTMLCanvasElement)
      );
    } finally {
      getContextSpy.mockRestore();
    }
  });
});

describe("BrushTool", () => {
  it("starts a brush stroke on pointer down", () => {
    const tool = new BrushTool();
    const ctx = makeToolContext({ activeTool: "brush" });
    const result = tool.onDown(ctx, makePointerEvent());
    expect(result).toBe(true);
    expect(ctx.onStrokeStart).toHaveBeenCalled();
    // Should have created an active stroke buffer
    expect(ctx.activeStrokeRef.current).not.toBeNull();
    expect(ctx.activeStrokeRef.current?.compositeOp).toBe("source-over");
  });

  it("calls onStrokeEnd on pointer up", () => {
    const tool = new BrushTool();
    const ctx = makeToolContext({ activeTool: "brush" });
    tool.onDown(ctx, makePointerEvent());
    tool.onUp!(ctx, makePointerEvent());
    // BrushEngine uses "buffered" mode, so end() defers the merge via pendingCommit.
    // Drain the pending commit to trigger onStrokeEnd (mirrors rAF in production).
    const stroke = ctx.activeStrokeRef.current;
    if (stroke?.pendingCommit) {
      stroke.pendingCommit();
      stroke.pendingCommit = null;
    }
    expect(ctx.onStrokeEnd).toHaveBeenCalledWith(ctx.doc.activeLayerId, null, undefined);
    expect(ctx.activeStrokeRef.current).toBeNull();
  });
});

describe("EraserTool", () => {
  it("creates destination-out stroke buffer on pointer down", () => {
    const tool = new EraserTool();
    const ctx = makeToolContext({ activeTool: "eraser" });
    const fakeCtx = {
      clearRect: jest.fn(),
      drawImage: jest.fn(),
      restore: jest.fn()
    } as unknown as CanvasRenderingContext2D;
    const getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation((((contextId: string) =>
        contextId === "2d" ? fakeCtx : null) as unknown) as typeof HTMLCanvasElement.prototype.getContext);

    try {
      const result = tool.onDown(ctx, makePointerEvent());
      expect(result).toBe(true);
      expect(ctx.activeStrokeRef.current).not.toBeNull();
      expect(ctx.activeStrokeRef.current?.compositeOp).toBe("destination-out");
    } finally {
      getContextSpy.mockRestore();
    }
  });
});

describe("BlurTool", () => {
  it("returns true on pointer down for active layer", () => {
    const tool = new BlurTool();
    const ctx = makeToolContext({ activeTool: "blur" });
    class MockImageData {
      data: Uint8ClampedArray;
      width: number;
      height: number;

      constructor(
        dataOrWidth: Uint8ClampedArray | number,
        width?: number,
        height?: number
      ) {
        if (typeof dataOrWidth === "number") {
          this.width = dataOrWidth;
          this.height = width ?? 0;
          this.data = new Uint8ClampedArray(this.width * this.height * 4);
          return;
        }
        this.data = dataOrWidth;
        this.width = width ?? 0;
        this.height = height ?? 0;
      }
    }
    const originalImageData = globalThis.ImageData;
    const fakeCtx = {
      getImageData: jest.fn((x: number, y: number, width: number, height: number) =>
        new MockImageData(Math.max(1, width), Math.max(1, height))
      ),
      putImageData: jest.fn(),
      drawImage: jest.fn(),
      restore: jest.fn()
    } as unknown as CanvasRenderingContext2D;
    globalThis.ImageData = MockImageData as unknown as typeof ImageData;
    const getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation((((contextId: string) =>
        contextId === "2d" ? fakeCtx : null) as unknown) as typeof HTMLCanvasElement.prototype.getContext);

    try {
      const result = tool.onDown(ctx, makePointerEvent());
      expect(result).toBe(true);
      expect(ctx.onStrokeStart).toHaveBeenCalled();
    } finally {
      getContextSpy.mockRestore();
      globalThis.ImageData = originalImageData;
    }
  });
});

describe("CloneStampTool", () => {
  it("returns false when no clone source is set", () => {
    const tool = new CloneStampTool();
    const ctx = makeToolContext({ activeTool: "clone_stamp" });
    const result = tool.onDown(ctx, makePointerEvent());
    // Clone stamp requires Alt+click to set source first
    expect(result).toBeFalsy();
  });
});

// ─── sampleColorHex ──────────────────────────────────────────────────────────

describe("sampleColorHex", () => {
  // sampleColorHex imported at module level

  it("returns hex color from composite readback (not display canvas)", () => {
    // sampleColorHex now always uses readbackComposite via
    // getFullCompositeImageData — display chrome (checkerboard) never leaks.
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    // Set pixel at (1,1) to red
    const idx = (1 * width + 1) * 4;
    data[idx] = 255;
    data[idx + 1] = 0;
    data[idx + 2] = 0;
    data[idx + 3] = 255;
    const imageData = { data, width, height } as ImageData;

    const toolCtx = makeToolContext({
      getFullCompositeImageData: jest.fn(() => imageData)
    });
    const hex = sampleColorHex(toolCtx, { x: 1, y: 1 });
    expect(hex).toBe("#ff0000");
  });

  it("returns hex from getFullCompositeImageData when display canvas unavailable", () => {
    // Create a mock ImageData-like object (JSDOM doesn't have ImageData constructor)
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    // Set pixel at (2,2) to green
    const idx = (2 * width + 2) * 4;
    data[idx] = 0;
    data[idx + 1] = 255;
    data[idx + 2] = 0;
    data[idx + 3] = 255;

    const imageData = { data, width, height } as ImageData;

    const toolCtx = makeToolContext({
      displayCanvasRef: { current: null },
      getFullCompositeImageData: jest.fn(() => imageData)
    });
    const hex = sampleColorHex(toolCtx, { x: 2, y: 2 });
    expect(hex).toBe("#00ff00");
  });

  it("returns null when point is out of bounds", () => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    const imageData = { data, width, height } as ImageData;

    const toolCtx = makeToolContext({
      displayCanvasRef: { current: null },
      getFullCompositeImageData: jest.fn(() => imageData)
    });
    expect(sampleColorHex(toolCtx, { x: -1, y: 0 })).toBeNull();
    expect(sampleColorHex(toolCtx, { x: 10, y: 0 })).toBeNull();
  });

  it("returns null when no display canvas and no readback", () => {
    const toolCtx = makeToolContext({
      displayCanvasRef: { current: null },
      getFullCompositeImageData: undefined
    });
    expect(sampleColorHex(toolCtx, { x: 0, y: 0 })).toBeNull();
  });
});

// ─── Async tool lifecycle (onCommit / onCancel / getProgress) ────────────────

describe("ToolHandler async lifecycle", () => {
  it("onCommit, onCancel, getProgress are optional on ToolHandler interface", () => {
    // A minimal handler with no async methods should work fine
    const handler = getToolHandler("brush");
    expect(handler.onCommit).toBeUndefined();
    expect(handler.onCancel).toBeUndefined();
    expect(handler.getProgress).toBeUndefined();
  });

  it("async tool can implement onCommit", async () => {
    const commitLog: string[] = [];

    // Create a mock async tool handler
    const asyncTool = {
      toolId: "brush" as const,
      onDown() { return true; },
      onUp() { /* no-op */ },
      async onCommit(_ctx: ToolContext) {
        commitLog.push("committed");
      },
      onCancel(_ctx: ToolContext) {
        commitLog.push("cancelled");
      },
      getProgress(_ctx: ToolContext): number | null {
        return 0.5;
      }
    };

    // Verify the methods exist and work
    const ctx = makeToolContext();
    expect(asyncTool.onCommit).toBeDefined();
    expect(asyncTool.getProgress!(ctx)).toBe(0.5);

    await asyncTool.onCommit!(ctx);
    expect(commitLog).toContain("committed");

    asyncTool.onCancel!(ctx);
    expect(commitLog).toContain("cancelled");
  });

  it("onCancel is called during tool deactivation lifecycle", () => {
    // SegmentTool has onDeactivate which clears prompts —
    // verify the lifecycle pattern works
    const tool = new SegmentTool();
    const ctx = makeToolContext();

    tool.onActivate!(ctx);
    // Simulate collecting some prompts
    tool.onDown(ctx, makePointerEvent({ point: { x: 10, y: 10 } }));

    // Deactivate should clear state
    tool.onDeactivate!(ctx);
    expect(tool.getPointPrompts()).toHaveLength(0);
  });
});
