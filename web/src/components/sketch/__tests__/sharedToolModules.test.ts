/**
 * Tests for shared tool modules:
 *   - modifierIntent (selectionCombineMode, captureModifiers, shapeConstraintFromRefs)
 *   - selectionFinalization (applySelectionFinalization, scheduleSelectionFinalization)
 *   - previewSession (createPreviewSession lifecycle)
 */

import {
  selectionCombineMode,
  selectionCombineModeFromSnapshot,
  captureModifiers,
  shapeConstraintFromRefs,
  type ModifierSnapshot
} from "../tools/modifierIntent";
import {
  applySelectionFinalization,
  type SelectionFinalizationParams
} from "../tools/selectionFinalization";
import {
  createPreviewSession,
  type PreviewSession
} from "../tools/previewSession";
import type { Selection, LayerTransform } from "../types";
import type { ToolContext } from "../tools/types";

// ═══════════════════════════════════════════════════════════════════════════════
// modifierIntent
// ═══════════════════════════════════════════════════════════════════════════════

describe("modifierIntent", () => {
  describe("selectionCombineMode", () => {
    it("returns 'replace' when no modifiers held", () => {
      expect(selectionCombineMode(false, false)).toBe("replace");
    });

    it("returns 'add' when shift held", () => {
      expect(selectionCombineMode(true, false)).toBe("add");
    });

    it("returns 'subtract' when alt held", () => {
      expect(selectionCombineMode(false, true)).toBe("subtract");
    });

    it("returns 'intersect' when both shift and alt held", () => {
      expect(selectionCombineMode(true, true)).toBe("intersect");
    });
  });

  describe("selectionCombineModeFromSnapshot", () => {
    it("returns 'replace' for null snapshot", () => {
      expect(selectionCombineModeFromSnapshot(null)).toBe("replace");
    });

    it("delegates to selectionCombineMode", () => {
      const snap: ModifierSnapshot = { shift: true, alt: true };
      expect(selectionCombineModeFromSnapshot(snap)).toBe("intersect");
    });
  });

  describe("captureModifiers", () => {
    it("captures current state of refs", () => {
      const shiftRef = { current: true };
      const altRef = { current: false };
      const snap = captureModifiers(shiftRef, altRef);
      expect(snap).toEqual({ shift: true, alt: false });
    });

    it("captures independently of later ref changes", () => {
      const shiftRef = { current: false };
      const altRef = { current: true };
      const snap = captureModifiers(shiftRef, altRef);
      shiftRef.current = true;
      altRef.current = false;
      expect(snap).toEqual({ shift: false, alt: true });
    });
  });

  describe("shapeConstraintFromRefs", () => {
    it("returns fromCenter and constrain from live refs", () => {
      const shiftRef = { current: true };
      const altRef = { current: true };
      const intent = shapeConstraintFromRefs(shiftRef, altRef);
      expect(intent).toEqual({ fromCenter: true, constrain: true });
    });

    it("returns false for both when no modifiers", () => {
      const shiftRef = { current: false };
      const altRef = { current: false };
      const intent = shapeConstraintFromRefs(shiftRef, altRef);
      expect(intent).toEqual({ fromCenter: false, constrain: false });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// selectionFinalization
// ═══════════════════════════════════════════════════════════════════════════════

describe("selectionFinalization", () => {
  function makeOverlay(width: number, height: number, fillValue = 255): Selection {
    const data = new Uint8ClampedArray(width * height);
    if (fillValue > 0) {
      data.fill(fillValue);
    }
    return { width, height, data };
  }

  describe("applySelectionFinalization", () => {
    it("commits selection and redraws overlay on non-empty mask", () => {
      const onSelectionChange = jest.fn();
      const drawSelectionOverlay = jest.fn();

      const result = applySelectionFinalization({
        overlay: makeOverlay(4, 4, 255),
        modifiers: null,
        currentSelection: null,
        onSelectionChange,
        drawSelectionOverlay
      });

      expect(result).toBe(true);
      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      expect(drawSelectionOverlay).toHaveBeenCalledTimes(1);
    });

    it("returns false and only redraws for empty mask", () => {
      const onSelectionChange = jest.fn();
      const drawSelectionOverlay = jest.fn();

      const result = applySelectionFinalization({
        overlay: makeOverlay(4, 4, 0),
        modifiers: null,
        currentSelection: null,
        onSelectionChange,
        drawSelectionOverlay
      });

      expect(result).toBe(false);
      expect(onSelectionChange).not.toHaveBeenCalled();
      expect(drawSelectionOverlay).toHaveBeenCalledTimes(1);
    });

    it("uses replace mode when no modifiers", () => {
      const onSelectionChange = jest.fn();
      const drawSelectionOverlay = jest.fn();
      const existing = makeOverlay(4, 4, 128);

      applySelectionFinalization({
        overlay: makeOverlay(4, 4, 255),
        modifiers: null,
        currentSelection: existing,
        onSelectionChange,
        drawSelectionOverlay
      });

      // Replace mode ignores the existing selection
      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      const committed = onSelectionChange.mock.calls[0][0] as Selection;
      expect(committed).toBeTruthy();
    });

    it("uses add mode when shift modifier is set", () => {
      const onSelectionChange = jest.fn();
      const drawSelectionOverlay = jest.fn();
      const existing = makeOverlay(4, 4, 128);

      applySelectionFinalization({
        overlay: makeOverlay(4, 4, 255),
        modifiers: { shift: true, alt: false },
        currentSelection: existing,
        onSelectionChange,
        drawSelectionOverlay
      });

      expect(onSelectionChange).toHaveBeenCalledTimes(1);
    });

    it("uses subtract mode when alt modifier is set", () => {
      const onSelectionChange = jest.fn();
      const drawSelectionOverlay = jest.fn();
      const existing = makeOverlay(4, 4, 255);

      applySelectionFinalization({
        overlay: makeOverlay(4, 4, 255),
        modifiers: { shift: false, alt: true },
        currentSelection: existing,
        onSelectionChange,
        drawSelectionOverlay
      });

      expect(onSelectionChange).toHaveBeenCalledTimes(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// previewSession
// ═══════════════════════════════════════════════════════════════════════════════

describe("previewSession", () => {
  function makeMockCtx(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      doc: {
        id: "test-doc",
        canvas: { width: 100, height: 100 },
        activeLayerId: "layer-1",
        layers: [],
        toolSettings: {} as ToolContext["doc"]["toolSettings"]
      },
      activeTool: "move",
      zoom: 1,
      pan: { x: 0, y: 0 },
      mirrorX: false,
      mirrorY: false,
      symmetryMode: "none",
      symmetryRays: 2,
      selection: null,
      displayCanvasRef: { current: null },
      overlayCanvasRef: { current: null },
      gizmoCanvasRef: { current: null },
      cursorCanvasRef: { current: null },
      containerRef: { current: null },
      layerCanvasesRef: { current: new Map() },
      mousePositionRef: { current: { x: 0, y: 0 } },
      activeStrokeRef: { current: null },
      getOrCreateLayerCanvas: jest.fn(),
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
      clearGizmo: jest.fn(),
      drawGizmo: jest.fn(),
      onZoomChange: jest.fn(),
      onPanChange: jest.fn(),
      onStrokeStart: jest.fn(),
      onStrokeEnd: jest.fn(),
      onLayerTransformChange: jest.fn(),
      screenToCanvas: jest.fn(),
      shiftHeldRef: { current: false },
      altHeldRef: { current: false },
      withMirror: jest.fn(),
      clipSelectionForOffset: jest.fn(),
      setLayerTransformPreview: jest.fn(),
      clearLayerTransformPreview: jest.fn(),
      ...overrides
    } as unknown as ToolContext;
  }

  let session: PreviewSession;

  beforeEach(() => {
    session = createPreviewSession();
  });

  it("starts inactive", () => {
    expect(session.isActive()).toBe(false);
    expect(session.state.layerId).toBeNull();
  });

  it("becomes active after start", () => {
    const ctx = makeMockCtx();
    const baseline: LayerTransform = { x: 10, y: 20 };
    session.start(ctx, "layer-1", baseline);

    expect(session.isActive()).toBe(true);
    expect(session.state.layerId).toBe("layer-1");
    expect(session.state.baselineTransform).toEqual(baseline);
    expect(ctx.onStrokeStart).toHaveBeenCalled();
  });

  it("update sets preview transform", () => {
    const ctx = makeMockCtx();
    session.start(ctx, "layer-1", { x: 0, y: 0 });

    const newTransform: LayerTransform = { x: 50, y: 30 };
    session.update(ctx, newTransform);

    expect(session.state.currentTransform).toEqual(newTransform);
    expect(ctx.setLayerTransformPreview).toHaveBeenCalledWith("layer-1", newTransform);
  });

  it("update is a no-op when not active", () => {
    const ctx = makeMockCtx();
    session.update(ctx, { x: 50, y: 30 });
    expect(ctx.setLayerTransformPreview).not.toHaveBeenCalled();
  });

  it("commit persists transform and clears preview", () => {
    const ctx = makeMockCtx();
    session.start(ctx, "layer-1", { x: 0, y: 0 });
    session.update(ctx, { x: 50, y: 30 });
    session.commit(ctx);

    expect(ctx.onLayerTransformChange).toHaveBeenCalledWith("layer-1", { x: 50, y: 30 });
    expect(ctx.clearLayerTransformPreview).toHaveBeenCalledWith("layer-1");
    expect(session.isActive()).toBe(false);
  });

  it("cancel clears preview without committing", () => {
    const ctx = makeMockCtx();
    session.start(ctx, "layer-1", { x: 0, y: 0 });
    session.update(ctx, { x: 50, y: 30 });
    session.cancel(ctx);

    expect(ctx.onLayerTransformChange).not.toHaveBeenCalled();
    expect(ctx.clearLayerTransformPreview).toHaveBeenCalledWith("layer-1");
    expect(session.isActive()).toBe(false);
  });

  it("clear resets all state", () => {
    const ctx = makeMockCtx();
    session.start(ctx, "layer-1", { x: 10, y: 20 });
    session.clear(ctx);

    expect(session.isActive()).toBe(false);
    expect(session.state.layerId).toBeNull();
    expect(ctx.clearLayerTransformPreview).toHaveBeenCalledWith("layer-1");
  });

  it("starting a new session for a different layer clears the old preview", () => {
    const ctx = makeMockCtx();
    session.start(ctx, "layer-1", { x: 0, y: 0 });
    session.start(ctx, "layer-2", { x: 10, y: 10 });

    // Should have cleared preview for layer-1
    expect(ctx.clearLayerTransformPreview).toHaveBeenCalledWith("layer-1");
    expect(session.state.layerId).toBe("layer-2");
  });

  it("commit is a no-op when not active", () => {
    const ctx = makeMockCtx();
    session.commit(ctx);
    expect(ctx.onLayerTransformChange).not.toHaveBeenCalled();
  });

  it("cancel is a no-op when not active", () => {
    const ctx = makeMockCtx();
    session.cancel(ctx);
    expect(ctx.clearLayerTransformPreview).not.toHaveBeenCalled();
  });
});
