/**
 * Segmentation feature tests.
 *
 * Covers:
 * - Segmentation types and defaults
 * - SegmentTool handler (point prompts, box prompts, overlay, lifecycle)
 * - Tool factory registration
 * - SAM service stub
 * - Layer group creation from segmentation results
 * - Settings panel label
 */

import { act } from "@testing-library/react";
import {
  createDefaultDocument,
  DEFAULT_SEGMENT_SETTINGS,
  DEFAULT_TOOL_SETTINGS,
  createDefaultGroupLayer,
  createDefaultLayer,
  generateLayerId
} from "../types";
import type {
  SegmentSettings,
  SegmentPointPrompt,
  SegmentBoxPrompt,
  SegmentationMask,
  SegmentationResult,
  SegmentationStatus,
  SegmentPromptMode
} from "../types";
import { SegmentTool } from "../tools/SegmentTool";
import { getToolHandler } from "../tools";
import { SamServiceStub, getSamService, setSamService } from "../sam";
import type { SamModelInfo } from "../sam";
import { getToolSettingsLabel } from "../ToolSettingsPanels";
import { useSketchStore } from "../state";

// ─── Segmentation Types & Defaults ────────────────────────────────────────────

describe("Segmentation types and defaults", () => {
  it("DEFAULT_SEGMENT_SETTINGS has expected shape", () => {
    expect(DEFAULT_SEGMENT_SETTINGS).toEqual({
      promptMode: "point",
      maxObjects: 5,
      minObjectSize: 100,
      confidenceThreshold: 0.5
    });
  });

  it("DEFAULT_TOOL_SETTINGS includes segment settings", () => {
    expect(DEFAULT_TOOL_SETTINGS.segment).toBeDefined();
    expect(DEFAULT_TOOL_SETTINGS.segment).toEqual(DEFAULT_SEGMENT_SETTINGS);
  });

  it("createDefaultDocument includes segment tool settings", () => {
    const doc = createDefaultDocument();
    expect(doc.toolSettings.segment).toBeDefined();
    expect(doc.toolSettings.segment.promptMode).toBe("point");
    expect(doc.toolSettings.segment.maxObjects).toBe(5);
  });

  it("SegmentPromptMode accepts point and box", () => {
    const modes: SegmentPromptMode[] = ["point", "box"];
    expect(modes).toHaveLength(2);
  });

  it("SegmentationStatus covers all states", () => {
    const statuses: SegmentationStatus[] = [
      "idle",
      "checking-model",
      "encoding",
      "inferring",
      "previewing",
      "applying",
      "error"
    ];
    expect(statuses).toHaveLength(7);
  });

  it("SegmentSettings interface works with partial updates", () => {
    const settings: SegmentSettings = { ...DEFAULT_SEGMENT_SETTINGS };
    const partial: Partial<SegmentSettings> = { maxObjects: 10 };
    const merged = { ...settings, ...partial };
    expect(merged.maxObjects).toBe(10);
    expect(merged.promptMode).toBe("point");
  });
});

// ─── SegmentTool Handler ──────────────────────────────────────────────────────

function makeToolContext(overrides?: Record<string, unknown>) {
  const doc = createDefaultDocument(64, 64);
  doc.toolSettings.segment = { ...DEFAULT_SEGMENT_SETTINGS };

  return {
    doc,
    activeTool: "segment" as const,
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
    invalidateLayer: jest.fn(),
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
    drawOverlayLassoPreview: jest.fn(),
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
    screenToCanvas: jest.fn((_x: number, _y: number) => ({ x: _x, y: _y })),
    shiftHeldRef: { current: false },
    altHeldRef: { current: false },
    withMirror: jest.fn(),
    clipSelectionForOffset: jest.fn(),
    ...overrides
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makePointerEvent(overrides?: Record<string, unknown>) {
  return {
    point: { x: 10, y: 20 },
    pressure: 0.5,
    nativeEvent: {
      clientX: 10,
      clientY: 20,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    },
    ...overrides
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("SegmentTool", () => {
  it("has correct toolId", () => {
    const tool = new SegmentTool();
    expect(tool.toolId).toBe("segment");
  });

  it("is returned by getToolHandler factory", () => {
    const handler = getToolHandler("segment");
    expect(handler).toBeDefined();
    expect(handler.toolId).toBe("segment");
  });

  it("factory returns cached singleton", () => {
    const a = getToolHandler("segment");
    const b = getToolHandler("segment");
    expect(a).toBe(b);
  });

  describe("point mode", () => {
    it("adds positive point prompt on click", () => {
      const tool = new SegmentTool();
      const ctx = makeToolContext();

      const result = tool.onDown(ctx, makePointerEvent({ point: { x: 15, y: 25 } }));
      expect(result).toBe(true);

      const points = tool.getPointPrompts();
      expect(points).toHaveLength(1);
      expect(points[0]).toEqual({ x: 15, y: 25, label: "positive" });
    });

    it("adds negative point prompt on Alt+click", () => {
      const tool = new SegmentTool();
      const ctx = makeToolContext();
      ctx.altHeldRef.current = true;

      tool.onDown(ctx, makePointerEvent({ point: { x: 30, y: 40 } }));

      const points = tool.getPointPrompts();
      expect(points).toHaveLength(1);
      expect(points[0]).toEqual({ x: 30, y: 40, label: "negative" });
    });

    it("accumulates multiple point prompts", () => {
      const tool = new SegmentTool();
      const ctx = makeToolContext();

      tool.onDown(ctx, makePointerEvent({ point: { x: 10, y: 10 } }));
      tool.onDown(ctx, makePointerEvent({ point: { x: 20, y: 20 } }));
      ctx.altHeldRef.current = true;
      tool.onDown(ctx, makePointerEvent({ point: { x: 30, y: 30 } }));

      const points = tool.getPointPrompts();
      expect(points).toHaveLength(3);
      expect(points[0].label).toBe("positive");
      expect(points[1].label).toBe("positive");
      expect(points[2].label).toBe("negative");
    });

    it("notifies callback on prompt change", () => {
      const tool = new SegmentTool();
      const ctx = makeToolContext();
      const callback = jest.fn();
      tool.onPromptsChanged = callback;

      tool.onDown(ctx, makePointerEvent({ point: { x: 5, y: 5 } }));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        [{ x: 5, y: 5, label: "positive" }],
        null
      );
    });
  });

  describe("box mode", () => {
    it("creates box prompt from drag", () => {
      const tool = new SegmentTool();
      const ctx = makeToolContext();
      ctx.doc.toolSettings.segment.promptMode = "box";

      tool.onDown(ctx, makePointerEvent({ point: { x: 10, y: 10 } }));
      tool.onMove!(ctx, makePointerEvent({ point: { x: 50, y: 50 } }), []);
      tool.onUp!(ctx, makePointerEvent({ point: { x: 50, y: 50 } }));

      const box = tool.getBoxPrompt();
      expect(box).toEqual({ x: 10, y: 10, width: 40, height: 40 });
    });

    it("normalizes box when dragging in reverse direction", () => {
      const tool = new SegmentTool();
      const ctx = makeToolContext();
      ctx.doc.toolSettings.segment.promptMode = "box";

      tool.onDown(ctx, makePointerEvent({ point: { x: 50, y: 50 } }));
      tool.onMove!(ctx, makePointerEvent({ point: { x: 10, y: 20 } }), []);
      tool.onUp!(ctx, makePointerEvent({ point: { x: 10, y: 20 } }));

      const box = tool.getBoxPrompt();
      expect(box).toEqual({ x: 10, y: 20, width: 40, height: 30 });
    });

    it("ignores tiny boxes (< 3px)", () => {
      const tool = new SegmentTool();
      const ctx = makeToolContext();
      ctx.doc.toolSettings.segment.promptMode = "box";

      tool.onDown(ctx, makePointerEvent({ point: { x: 10, y: 10 } }));
      tool.onMove!(ctx, makePointerEvent({ point: { x: 11, y: 11 } }), []);
      tool.onUp!(ctx, makePointerEvent({ point: { x: 11, y: 11 } }));

      expect(tool.getBoxPrompt()).toBeNull();
    });

    it("does not move when not dragging", () => {
      const tool = new SegmentTool();
      const ctx = makeToolContext();
      ctx.doc.toolSettings.segment.promptMode = "box";

      // Move without down — should do nothing
      tool.onMove!(ctx, makePointerEvent({ point: { x: 50, y: 50 } }), []);
      expect(tool.getBoxPrompt()).toBeNull();
    });
  });

  describe("lifecycle", () => {
    it("clears prompts on activate", () => {
      const tool = new SegmentTool();
      const ctx = makeToolContext();

      // Add some prompts
      tool.onDown(ctx, makePointerEvent());

      // Activate clears
      tool.onActivate!(ctx);
      expect(tool.getPointPrompts()).toHaveLength(0);
      expect(tool.getBoxPrompt()).toBeNull();
    });

    it("clears prompts on deactivate", () => {
      const tool = new SegmentTool();
      const ctx = makeToolContext();

      tool.onDown(ctx, makePointerEvent());
      tool.onDeactivate!(ctx);
      expect(tool.getPointPrompts()).toHaveLength(0);
    });

    it("clearPrompts resets all state", () => {
      const tool = new SegmentTool();
      const ctx = makeToolContext();

      tool.onDown(ctx, makePointerEvent());
      ctx.doc.toolSettings.segment.promptMode = "box";
      tool.onDown(ctx, makePointerEvent({ point: { x: 5, y: 5 } }));
      tool.onMove!(ctx, makePointerEvent({ point: { x: 55, y: 55 } }), []);
      tool.onUp!(ctx, makePointerEvent({ point: { x: 55, y: 55 } }));

      tool.clearPrompts();
      expect(tool.getPointPrompts()).toHaveLength(0);
      expect(tool.getBoxPrompt()).toBeNull();
    });
  });
});

// ─── SAM Service Stub ─────────────────────────────────────────────────────────

describe("SamServiceStub", () => {
  it("reports model as not-installed", async () => {
    const service = new SamServiceStub();
    const info = await service.checkModelAvailability();
    expect(info.status).toBe("not-installed");
    expect(info.modelId).toBe("facebook/sam2-hiera-large");
    expect(info.modelName).toBe("SAM 2 (Hiera Large)");
  });

  it("returns empty masks from runSegmentation", async () => {
    const service = new SamServiceStub();
    const response = await service.runSegmentation({
      imageDataUrl: "data:image/png;base64,iVBOR",
      pointPrompts: [{ x: 10, y: 10, label: "positive" }],
      boxPrompt: null,
      settings: DEFAULT_SEGMENT_SETTINGS
    });
    expect(response.masks).toEqual([]);
  });

  it("getSamService returns a service instance", () => {
    const service = getSamService();
    expect(service).toBeDefined();
    expect(service.checkModelAvailability).toBeDefined();
    expect(service.runSegmentation).toBeDefined();
  });

  it("setSamService overrides the singleton", async () => {
    const custom = {
      checkModelAvailability: jest.fn().mockResolvedValue({
        status: "available" as const,
        modelId: "test-model",
        modelName: "Test Model"
      }),
      runSegmentation: jest.fn().mockResolvedValue({ masks: [] })
    };

    setSamService(custom);
    const service = getSamService();
    const info = await service.checkModelAvailability();
    expect(info.status).toBe("available");

    // Restore default
    setSamService(new SamServiceStub());
  });
});

// ─── Layer Creation from Segmentation ─────────────────────────────────────────

describe("Layer creation from segmentation results", () => {
  beforeEach(() => {
    act(() => {
      useSketchStore.getState().resetDocument();
    });
  });

  it("createDefaultGroupLayer works for segmentation groups", () => {
    const group = createDefaultGroupLayer("Segmented Objects");
    expect(group.type).toBe("group");
    expect(group.name).toBe("Segmented Objects");
    expect(group.visible).toBe(true);
    expect(group.collapsed).toBe(false);
  });

  it("createDefaultLayer works for segmentation cutout layers", () => {
    const layer = createDefaultLayer("Object 1", "raster", 512, 512);
    expect(layer.type).toBe("raster");
    expect(layer.name).toBe("Object 1");
    expect(layer.contentBounds.width).toBe(512);
  });

  it("segmentation layers can be parented to a group", () => {
    const group = createDefaultGroupLayer("Segmented Objects");
    const child = createDefaultLayer("Object 1", "raster", 512, 512);
    child.parentId = group.id;

    expect(child.parentId).toBe(group.id);
  });

  it("multiple segmentation layers with unique IDs", () => {
    const layers = Array.from({ length: 5 }, (_, i) => {
      const layer = createDefaultLayer(`Object ${i + 1}`, "raster", 256, 256);
      layer.id = generateLayerId();
      return layer;
    });

    const ids = new Set(layers.map((l) => l.id));
    expect(ids.size).toBe(5);
  });

  it("segmentation layers can be inserted into document", () => {
    const store = useSketchStore.getState();
    const doc = store.document;
    const initialCount = doc.layers.length;

    const group = createDefaultGroupLayer("Segmented Objects");
    const child = createDefaultLayer("Object 1", "raster", doc.canvas.width, doc.canvas.height);
    child.parentId = group.id;

    act(() => {
      store.setDocument({
        ...doc,
        layers: [...doc.layers, group, child],
        activeLayerId: child.id
      });
    });

    const updatedDoc = useSketchStore.getState().document;
    expect(updatedDoc.layers).toHaveLength(initialCount + 2);
    expect(updatedDoc.activeLayerId).toBe(child.id);
  });
});

// ─── Tool Settings Label ──────────────────────────────────────────────────────

describe("ToolSettingsPanel label for segment", () => {
  it("returns 'Segment' for segment tool", () => {
    expect(getToolSettingsLabel("segment")).toBe("Segment");
  });
});

// ─── Store segment settings ───────────────────────────────────────────────────

describe("Store segment settings", () => {
  beforeEach(() => {
    act(() => {
      useSketchStore.getState().resetDocument();
    });
  });

  it("can set segment tool as active", () => {
    act(() => {
      useSketchStore.getState().setActiveTool("segment");
    });
    expect(useSketchStore.getState().activeTool).toBe("segment");
  });

  it("segment settings survive document normalization", () => {
    const doc = createDefaultDocument();
    doc.toolSettings.segment.maxObjects = 10;
    doc.toolSettings.segment.confidenceThreshold = 0.8;

    act(() => {
      useSketchStore.getState().setDocument(doc);
    });

    const stored = useSketchStore.getState().document;
    expect(stored.toolSettings.segment.maxObjects).toBe(10);
    expect(stored.toolSettings.segment.confidenceThreshold).toBe(0.8);
  });
});
