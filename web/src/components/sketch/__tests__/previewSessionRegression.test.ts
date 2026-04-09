/**
 * Regression tests for preview-session cancel/supersede/stale-session cleanup.
 *
 * These tests verify that:
 *   1. Cancelling a preview does not leave stale preview state
 *   2. Starting a new session properly supersedes the old one
 *   3. Rapid start/cancel cycles don't leak preview state
 *   4. Deactivating a tool properly clears all preview state
 *   5. Commit after cancel is a no-op
 */

import { createPreviewSession, type PreviewSession } from "../tools/previewSession";
import type { LayerTransform } from "../types";
import type { ToolContext } from "../tools/types";

function makeMockCtx(): ToolContext {
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
    clearLayerTransformPreview: jest.fn()
  } as unknown as ToolContext;
}

describe("previewSession — cancel/supersede/stale-session regression", () => {
  let session: PreviewSession;

  beforeEach(() => {
    session = createPreviewSession();
  });

  it("cancel does not leave stale preview state", () => {
    const ctx = makeMockCtx();
    session.start(ctx, "layer-1", { x: 0, y: 0 });
    session.update(ctx, { x: 100, y: 100 });
    session.cancel(ctx);

    // After cancel: session is inactive, no further updates should apply
    expect(session.isActive()).toBe(false);
    expect(session.state.layerId).toBe("layer-1"); // layerId still set for reference
    expect(ctx.clearLayerTransformPreview).toHaveBeenCalledWith("layer-1");

    // Further updates should be no-ops
    (ctx.setLayerTransformPreview as jest.Mock).mockClear();
    session.update(ctx, { x: 200, y: 200 });
    expect(ctx.setLayerTransformPreview).not.toHaveBeenCalled();
  });

  it("supersede: new session on same layer clears previous properly", () => {
    const ctx = makeMockCtx();
    // First session
    session.start(ctx, "layer-1", { x: 0, y: 0 });
    session.update(ctx, { x: 50, y: 50 });

    // Start new session on same layer — should not trigger clearLayerTransformPreview
    // since it's the same layer
    (ctx.clearLayerTransformPreview as jest.Mock).mockClear();
    session.start(ctx, "layer-1", { x: 0, y: 0 });

    // No clear needed for same layer
    expect(ctx.clearLayerTransformPreview).not.toHaveBeenCalled();
    expect(session.state.baselineTransform).toEqual({ x: 0, y: 0 });
    expect(session.isActive()).toBe(true);
  });

  it("supersede: new session on different layer clears old layer preview", () => {
    const ctx = makeMockCtx();
    session.start(ctx, "layer-1", { x: 0, y: 0 });
    session.update(ctx, { x: 50, y: 50 });

    (ctx.clearLayerTransformPreview as jest.Mock).mockClear();
    session.start(ctx, "layer-2", { x: 10, y: 10 });

    // Old preview for layer-1 should be cleared
    expect(ctx.clearLayerTransformPreview).toHaveBeenCalledWith("layer-1");
    expect(session.state.layerId).toBe("layer-2");
  });

  it("rapid start/cancel cycles don't leak preview state", () => {
    const ctx = makeMockCtx();

    for (let i = 0; i < 10; i++) {
      session.start(ctx, `layer-${i}`, { x: i, y: i });
      session.update(ctx, { x: i * 10, y: i * 10 });
      session.cancel(ctx);
    }

    expect(session.isActive()).toBe(false);
    // The last clearLayerTransformPreview should have been called for the last layer
    expect(ctx.clearLayerTransformPreview).toHaveBeenLastCalledWith("layer-9");
  });

  it("deactivate (clear) properly cleans up all state", () => {
    const ctx = makeMockCtx();
    session.start(ctx, "layer-1", { x: 5, y: 10, scaleX: 2, scaleY: 2 });
    session.update(ctx, { x: 50, y: 100, scaleX: 2, scaleY: 2 });

    session.clear(ctx);

    expect(session.isActive()).toBe(false);
    expect(session.state.layerId).toBeNull();
    expect(session.state.baselineTransform).toEqual({ x: 0, y: 0 });
    expect(session.state.currentTransform).toEqual({ x: 0, y: 0 });
    expect(ctx.clearLayerTransformPreview).toHaveBeenCalledWith("layer-1");
  });

  it("commit after cancel is a no-op", () => {
    const ctx = makeMockCtx();
    session.start(ctx, "layer-1", { x: 0, y: 0 });
    session.update(ctx, { x: 100, y: 100 });
    session.cancel(ctx);

    (ctx.onLayerTransformChange as jest.Mock).mockClear();
    session.commit(ctx);

    expect(ctx.onLayerTransformChange).not.toHaveBeenCalled();
  });

  it("cancel after commit is a no-op", () => {
    const ctx = makeMockCtx();
    session.start(ctx, "layer-1", { x: 0, y: 0 });
    session.update(ctx, { x: 100, y: 100 });
    session.commit(ctx);

    (ctx.clearLayerTransformPreview as jest.Mock).mockClear();
    session.cancel(ctx);

    // clearLayerTransformPreview should NOT be called again
    expect(ctx.clearLayerTransformPreview).not.toHaveBeenCalled();
  });

  it("double-commit is a no-op", () => {
    const ctx = makeMockCtx();
    session.start(ctx, "layer-1", { x: 0, y: 0 });
    session.update(ctx, { x: 100, y: 100 });
    session.commit(ctx);

    (ctx.onLayerTransformChange as jest.Mock).mockClear();
    session.commit(ctx);

    expect(ctx.onLayerTransformChange).not.toHaveBeenCalled();
  });

  it("clear after cancel cleans up remaining state", () => {
    const ctx = makeMockCtx();
    session.start(ctx, "layer-1", { x: 0, y: 0 });
    session.cancel(ctx);

    // layerId is still set after cancel (for reference), clear removes it
    session.clear(ctx);
    expect(session.state.layerId).toBeNull();
  });

  it("start clears old layer preview even when session is inactive", () => {
    const ctx = makeMockCtx();
    session.start(ctx, "layer-1", { x: 0, y: 0 });
    session.cancel(ctx);
    // Session is now inactive but layerId is still "layer-1"

    (ctx.clearLayerTransformPreview as jest.Mock).mockClear();
    session.start(ctx, "layer-2", { x: 10, y: 10 });

    // Old preview for layer-1 should be cleared even though session was inactive
    expect(ctx.clearLayerTransformPreview).toHaveBeenCalledWith("layer-1");
    expect(session.state.layerId).toBe("layer-2");
  });
});
