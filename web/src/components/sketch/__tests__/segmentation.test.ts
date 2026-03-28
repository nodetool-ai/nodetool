/**
 * Segmentation feature tests.
 *
 * Covers:
 * - Segmentation types and defaults
 * - SegmentTool handler (point prompts, box prompts, auto mode, overlay, lifecycle)
 * - Tool factory registration
 * - SAM service stub
 * - Layer group creation from segmentation results
 * - Layer metadata (segmentationMeta)
 * - Source layer action (keep, hide, lock)
 * - Mask overlay utilities
 * - Keyboard shortcuts
 * - Settings panel label
 */

import { act } from "@testing-library/react";
import {
  createDefaultDocument,
  DEFAULT_SEGMENT_SETTINGS,
  DEFAULT_TOOL_SETTINGS,
  createDefaultGroupLayer,
  createDefaultLayer,
  generateLayerId,
  normalizeSketchDocument
} from "../types";
import type {
  SegmentSettings,
  SegmentPointPrompt,
  SegmentBoxPrompt,
  SegmentationMask,
  SegmentationResult,
  SegmentationStatus,
  SegmentPromptMode,
  SegmentSourceLayerAction,
  SegmentationLayerMeta
} from "../types";
import { SegmentTool } from "../tools/SegmentTool";
import { getToolHandler } from "../tools";
import { SamServiceStub, getSamService, setSamService } from "../sam";
import {
  getMaskOverlayColor,
  getMaskOutlineColor,
  generateSegmentationRunId
} from "../sam";
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
      confidenceThreshold: 0.5,
      sourceLayerAction: "keep",
      maskFeather: 0,
      outputCutouts: true
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

  it("SegmentPromptMode accepts point, box, and auto", () => {
    const modes: SegmentPromptMode[] = ["point", "box", "auto"];
    expect(modes).toHaveLength(3);
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

  it("new segment settings fields survive normalization", () => {
    const doc = createDefaultDocument();
    doc.toolSettings.segment.sourceLayerAction = "hide";
    doc.toolSettings.segment.maskFeather = 5;
    doc.toolSettings.segment.outputCutouts = false;

    act(() => {
      useSketchStore.getState().setDocument(doc);
    });

    const stored = useSketchStore.getState().document;
    expect(stored.toolSettings.segment.sourceLayerAction).toBe("hide");
    expect(stored.toolSettings.segment.maskFeather).toBe(5);
    expect(stored.toolSettings.segment.outputCutouts).toBe(false);
  });

  it("setSegmentSettings updates individual fields", () => {
    act(() => {
      useSketchStore.getState().setSegmentSettings({ maskFeather: 10 });
    });

    const stored = useSketchStore.getState().document;
    expect(stored.toolSettings.segment.maskFeather).toBe(10);
    expect(stored.toolSettings.segment.promptMode).toBe("point");
  });
});

// ─── Auto Prompt Mode ─────────────────────────────────────────────────────────

describe("SegmentTool auto mode", () => {
  it("triggers notifyPromptsChanged on click in auto mode", () => {
    const tool = new SegmentTool();
    const ctx = makeToolContext();
    ctx.doc.toolSettings.segment.promptMode = "auto";
    const callback = jest.fn();
    tool.onPromptsChanged = callback;

    const result = tool.onDown(ctx, makePointerEvent({ point: { x: 50, y: 50 } }));
    expect(result).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not collect point prompts in auto mode", () => {
    const tool = new SegmentTool();
    const ctx = makeToolContext();
    ctx.doc.toolSettings.segment.promptMode = "auto";

    tool.onDown(ctx, makePointerEvent({ point: { x: 50, y: 50 } }));
    expect(tool.getPointPrompts()).toHaveLength(0);
  });
});

// ─── Source Layer Action ──────────────────────────────────────────────────────

describe("Source layer action types", () => {
  it("SegmentSourceLayerAction accepts keep, hide, and lock", () => {
    const actions: SegmentSourceLayerAction[] = ["keep", "hide", "lock"];
    expect(actions).toHaveLength(3);
  });

  it("DEFAULT_SEGMENT_SETTINGS defaults to keep", () => {
    expect(DEFAULT_SEGMENT_SETTINGS.sourceLayerAction).toBe("keep");
  });
});

// ─── Segmentation Layer Metadata ──────────────────────────────────────────────

describe("Layer segmentation metadata", () => {
  it("layers can store segmentationMeta", () => {
    const layer = createDefaultLayer("Object 1", "raster", 512, 512);
    const meta: SegmentationLayerMeta = {
      segmentationRunId: "seg_123",
      sourceLayerId: "layer_0",
      modelId: "facebook/sam2-hiera-large",
      confidence: 0.95,
      maskIndex: 0
    };
    layer.segmentationMeta = meta;

    expect(layer.segmentationMeta).toBeDefined();
    expect(layer.segmentationMeta!.segmentationRunId).toBe("seg_123");
    expect(layer.segmentationMeta!.confidence).toBe(0.95);
    expect(layer.segmentationMeta!.maskIndex).toBe(0);
  });

  it("segmentationMeta is preserved through document normalization", () => {
    const doc = createDefaultDocument(64, 64);
    const layer = doc.layers[0];
    layer.segmentationMeta = {
      segmentationRunId: "seg_456",
      sourceLayerId: "layer_0",
      modelId: "test-model",
      confidence: 0.8,
      maskIndex: 1
    };

    const normalized = normalizeSketchDocument(doc);
    const normalizedLayer = normalized.layers.find((l) => l.id === layer.id);
    expect(normalizedLayer?.segmentationMeta).toBeDefined();
    expect(normalizedLayer?.segmentationMeta?.segmentationRunId).toBe("seg_456");
    expect(normalizedLayer?.segmentationMeta?.confidence).toBe(0.8);
  });

  it("layers without segmentationMeta default to undefined", () => {
    const layer = createDefaultLayer("Normal Layer", "raster", 256, 256);
    expect(layer.segmentationMeta).toBeUndefined();
  });
});

// ─── SegmentationResult with runId ────────────────────────────────────────────

describe("SegmentationResult with runId", () => {
  it("includes runId and modelId fields", () => {
    const result: SegmentationResult = {
      runId: "seg_test_123",
      sourceLayerId: "layer_0",
      masks: [],
      timestamp: Date.now(),
      modelId: "facebook/sam2-hiera-large"
    };
    expect(result.runId).toBe("seg_test_123");
    expect(result.modelId).toBe("facebook/sam2-hiera-large");
  });
});

// ─── Mask Overlay Utilities ───────────────────────────────────────────────────

describe("Mask overlay utilities", () => {
  it("getMaskOverlayColor returns distinct colors for different indices", () => {
    const c0 = getMaskOverlayColor(0);
    const c1 = getMaskOverlayColor(1);
    const c2 = getMaskOverlayColor(2);
    expect(c0).not.toBe(c1);
    expect(c1).not.toBe(c2);
  });

  it("getMaskOverlayColor wraps around for large indices", () => {
    const c0 = getMaskOverlayColor(0);
    const c8 = getMaskOverlayColor(8);
    expect(c0).toBe(c8);
  });

  it("getMaskOutlineColor returns colors matching overlay palette", () => {
    const outline = getMaskOutlineColor(0);
    expect(outline).toBeTruthy();
    expect(outline).toContain("rgba");
  });

  it("generateSegmentationRunId returns unique IDs", () => {
    const id1 = generateSegmentationRunId();
    const id2 = generateSegmentationRunId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^seg_/);
    expect(id2).toMatch(/^seg_/);
  });
});

// ─── New Segment Settings Fields ──────────────────────────────────────────────

describe("Extended segment settings", () => {
  it("maskFeather defaults to 0", () => {
    expect(DEFAULT_SEGMENT_SETTINGS.maskFeather).toBe(0);
  });

  it("outputCutouts defaults to true", () => {
    expect(DEFAULT_SEGMENT_SETTINGS.outputCutouts).toBe(true);
  });

  it("sourceLayerAction defaults to keep", () => {
    expect(DEFAULT_SEGMENT_SETTINGS.sourceLayerAction).toBe("keep");
  });

  it("settings partial update preserves existing fields", () => {
    const settings: SegmentSettings = { ...DEFAULT_SEGMENT_SETTINGS };
    const partial: Partial<SegmentSettings> = { 
      maskFeather: 5, 
      sourceLayerAction: "lock" 
    };
    const merged = { ...settings, ...partial };
    expect(merged.maskFeather).toBe(5);
    expect(merged.sourceLayerAction).toBe("lock");
    expect(merged.promptMode).toBe("point");
    expect(merged.maxObjects).toBe(5);
    expect(merged.outputCutouts).toBe(true);
  });

  it("old documents without new fields get defaults from normalize", () => {
    const doc = createDefaultDocument();
    // Simulate old document missing new fields by deleting them
    const toolSettings = doc.toolSettings.segment as Record<string, unknown>;
    delete toolSettings.sourceLayerAction;
    delete toolSettings.maskFeather;
    delete toolSettings.outputCutouts;

    const normalized = normalizeSketchDocument(doc);
    expect(normalized.toolSettings.segment.sourceLayerAction).toBe("keep");
    expect(normalized.toolSettings.segment.maskFeather).toBe(0);
    expect(normalized.toolSettings.segment.outputCutouts).toBe(true);
  });
});

// ─── SamServiceFal ────────────────────────────────────────────────────────────

describe("SamServiceFal", () => {
  it("can be instantiated", () => {
    const { SamServiceFal: Fal } = require("../sam/SamServiceFal");
    const service = new Fal();
    expect(service).toBeDefined();
    expect(service.checkModelAvailability).toBeDefined();
    expect(service.runSegmentation).toBeDefined();
  });

  it("reports not-installed when no FAL_API_KEY", async () => {
    const { SamServiceFal: Fal } = require("../sam/SamServiceFal");
    const service = new Fal();
    const info = await service.checkModelAvailability();
    // In test environment, secrets store returns no key
    expect(info.status).toBe("not-installed");
    expect(info.errorMessage).toBeDefined();
    expect(info.errorMessage).toContain("FAL_API_KEY");
  });

  it("can be set via setSamService", () => {
    const { SamServiceFal: Fal } = require("../sam/SamServiceFal");
    const service = new Fal();
    setSamService(service);
    const retrieved = getSamService();
    expect(retrieved).toBe(service);
    // Restore stub
    setSamService(new SamServiceStub());
  });
});

// ─── Large Image Guardrails ───────────────────────────────────────────────────

describe("Image resize guardrails", () => {
  it("MAX_INFERENCE_DIMENSION is exported and positive", () => {
    const { MAX_INFERENCE_DIMENSION: maxDim } = require("../sam/SamServiceFal");
    expect(maxDim).toBeGreaterThan(0);
    expect(maxDim).toBe(2048);
  });

  it("resizeForInference is exported", () => {
    const { resizeForInference } = require("../sam/SamServiceFal");
    expect(typeof resizeForInference).toBe("function");
  });
});

// ─── Mask Preview Drawing ─────────────────────────────────────────────────────

describe("Mask preview overlay", () => {
  it("drawMaskBoundsOverlay is callable", () => {
    const { drawMaskBoundsOverlay } = require("../sam/segmentMaskOverlay");
    expect(typeof drawMaskBoundsOverlay).toBe("function");
  });

  it("drawMaskBoundsOverlay handles empty masks array", () => {
    // Create a mock 2d context that doesn't throw
    const mockCtx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      font: "",
      textBaseline: "",
      fillRect: jest.fn(),
      strokeRect: jest.fn(),
      fillText: jest.fn()
    };

    const { drawMaskBoundsOverlay } = require("../sam/segmentMaskOverlay");
    // Should not throw with empty masks
    drawMaskBoundsOverlay(mockCtx as unknown as CanvasRenderingContext2D, [], 1.0);
    expect(mockCtx.fillRect).not.toHaveBeenCalled();
  });

  it("drawMaskBoundsOverlay calls fillRect for each mask", () => {
    const mockCtx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      font: "",
      textBaseline: "",
      fillRect: jest.fn(),
      strokeRect: jest.fn(),
      fillText: jest.fn()
    };

    const { drawMaskBoundsOverlay } = require("../sam/segmentMaskOverlay");
    const masks = [
      { bounds: { x: 10, y: 10, width: 30, height: 30 }, label: "Object 1" },
      { bounds: { x: 50, y: 50, width: 20, height: 20 }, label: "Object 2" }
    ];

    drawMaskBoundsOverlay(mockCtx as unknown as CanvasRenderingContext2D, masks, 1.0);

    // Should call fillRect 2 times (one per mask)
    expect(mockCtx.fillRect).toHaveBeenCalledTimes(2);
    // Should call strokeRect 2 times
    expect(mockCtx.strokeRect).toHaveBeenCalledTimes(2);
    // Should call fillText 2 times for labels
    expect(mockCtx.fillText).toHaveBeenCalledTimes(2);
  });

  it("drawMaskBoundsOverlay adjusts line width by zoom", () => {
    const mockCtx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      font: "",
      textBaseline: "",
      fillRect: jest.fn(),
      strokeRect: jest.fn(),
      fillText: jest.fn()
    };

    const { drawMaskBoundsOverlay } = require("../sam/segmentMaskOverlay");
    const masks = [{ bounds: { x: 0, y: 0, width: 50, height: 50 } }];

    drawMaskBoundsOverlay(mockCtx as unknown as CanvasRenderingContext2D, masks, 2.0);
    // Line width should be 2/zoom = 1
    expect(mockCtx.lineWidth).toBe(1);
  });
});

// ─── Cutout Generation ────────────────────────────────────────────────────────

describe("Cutout generation with feathering", () => {
  it("generateCutoutDataUrl is exported", () => {
    const { generateCutoutDataUrl } = require("../sam/segmentMaskOverlay");
    expect(typeof generateCutoutDataUrl).toBe("function");
  });

  // Note: generateCutoutDataUrl requires Image loading which doesn't work in jsdom.
  // Full integration tests should be run in an E2E environment.
});

// ─── SketchCanvasRef.getOverlayCanvas ─────────────────────────────────────────

describe("SketchCanvasRef interface", () => {
  it("getOverlayCanvas is part of the SketchCanvasRef interface", () => {
    // Type check: ensure the method exists on the interface
    // This is a compile-time check; runtime test verifies the shape
    const mockRef: import("../SketchCanvas").SketchCanvasRef = {
      getLayerData: jest.fn(),
      setLayerData: jest.fn(),
      reconcileLayerToDocumentSpace: jest.fn(),
      trimLayerToBounds: jest.fn(),
      snapshotLayerCanvas: jest.fn(),
      restoreLayerCanvas: jest.fn(),
      flattenToDataUrl: jest.fn(),
      getMaskDataUrl: jest.fn(),
      clearLayer: jest.fn(),
      clearLayerRect: jest.fn(),
      flipLayer: jest.fn(),
      mergeLayerDown: jest.fn(),
      flattenVisible: jest.fn(),
      cropCanvas: jest.fn(),
      applyAdjustments: jest.fn(),
      fillLayerWithColor: jest.fn(),
      fillLayerRect: jest.fn(),
      clearLayerBySelectionMask: jest.fn(),
      fillLayerBySelectionMask: jest.fn(),
      nudgeLayer: jest.fn(),
      redrawDisplay: jest.fn(),
      drainPendingStrokeCommit: jest.fn(),
      getOverlayCanvas: jest.fn().mockReturnValue(null)
    };

    expect(mockRef.getOverlayCanvas).toBeDefined();
    expect(mockRef.getOverlayCanvas()).toBeNull();
  });
});
