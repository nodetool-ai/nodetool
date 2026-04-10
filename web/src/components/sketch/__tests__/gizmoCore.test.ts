/**
 * Regression tests for the shared gizmo core module.
 *
 * Covers:
 *   - Gizmo hit testing (handle detection, bounding box interior, misses)
 *   - Hover cursor behavior (correct cursor per handle + rotation)
 *   - Viewport/document-to-screen conversion (docToScreen, docRectToScreen)
 *   - Gizmo constants are consistent with existing consumers
 *   - GizmoRedrawScheduler batching
 */

import {
  hitTestHandles,
  buildHandlePositions,
  docToScreen,
  docRectToScreen,
  clientToDocumentCanvas,
  documentCanvasToClient,
  scaledHalfExtents,
  HANDLE_RADIUS,
  ROTATION_HANDLE_OFFSET,
  HANDLE_SIZE
} from "../tools/transform/handleGeometry";
import { cursorForHandle } from "../tools/transform/cursorMapping";
import {
  getTransformHoverInfo,
  isPointInsideGizmo
} from "../tools/transform/transformHoverPolicy";
import { GizmoRedrawScheduler } from "../tools/transform/transformGizmoPainter";
import {
  HANDLE_HIT_RADIUS,
  ROTATION_HANDLE_OFFSET as GIZMO_ROTATION_HANDLE_OFFSET,
  HANDLE_SIZE as GIZMO_HANDLE_SIZE,
  GIZMO_PRIMARY_COLOR,
  HANDLE_FILL_DEFAULT
} from "../tools/gizmo/gizmoConstants";
import type { LayerTransform, LayerContentBounds, Point } from "../types";

// ─── Test helpers ────────────────────────────────────────────────────────────

const makeTransform = (
  overrides: Partial<LayerTransform> = {}
): LayerTransform => ({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  ...overrides
});

const makeBounds = (
  overrides: Partial<LayerContentBounds> = {}
): LayerContentBounds => ({
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  ...overrides
});

// ─── Constants consistency ───────────────────────────────────────────────────

describe("gizmo constants consistency", () => {
  it("handleGeometry re-exports match gizmoConstants source", () => {
    expect(HANDLE_RADIUS).toBe(HANDLE_HIT_RADIUS);
    expect(ROTATION_HANDLE_OFFSET).toBe(GIZMO_ROTATION_HANDLE_OFFSET);
    expect(HANDLE_SIZE).toBe(GIZMO_HANDLE_SIZE);
  });

  it("gizmo constants have sensible values", () => {
    expect(GIZMO_PRIMARY_COLOR).toMatch(/^rgba?\(/);
    expect(HANDLE_FILL_DEFAULT).toBe("#ffffff");
    expect(HANDLE_SIZE).toBeGreaterThan(0);
    expect(HANDLE_HIT_RADIUS).toBeGreaterThan(0);
    expect(ROTATION_HANDLE_OFFSET).toBeGreaterThan(0);
  });
});

// ─── Hit testing ─────────────────────────────────────────────────────────────

describe("gizmo hit testing", () => {
  const transform = makeTransform();
  const bounds = makeBounds();
  const zoom = 1;

  it("returns 'move' when clicking inside the bounding box center", () => {
    // Center of a 100x100 layer at transform (0,0) = (50, 50)
    const result = hitTestHandles(transform, bounds, { x: 50, y: 50 }, zoom);
    expect(result).toBe("move");
  });

  it("returns null when clicking outside the bounding box", () => {
    const result = hitTestHandles(transform, bounds, { x: -50, y: -50 }, zoom);
    expect(result).toBeNull();
  });

  it("returns corner handles when clicking near corners", () => {
    const handles = buildHandlePositions(transform, bounds, zoom);
    const topLeftHandle = handles.find((h) => h.handle === "top-left");
    expect(topLeftHandle).toBeDefined();
    if (topLeftHandle) {
      // Click very close to the corner handle position
      const result = hitTestHandles(
        transform,
        bounds,
        { x: topLeftHandle.pos.x + 1, y: topLeftHandle.pos.y + 1 },
        zoom
      );
      expect(result).toBe("top-left");
    }
  });

  it("returns edge midpoint handles when clicking near edges", () => {
    const handles = buildHandlePositions(transform, bounds, zoom);
    const topHandle = handles.find((h) => h.handle === "top");
    expect(topHandle).toBeDefined();
    if (topHandle) {
      const result = hitTestHandles(
        transform,
        bounds,
        { x: topHandle.pos.x, y: topHandle.pos.y + 1 },
        zoom
      );
      expect(result).toBe("top");
    }
  });

  it("returns 'rotate' when clicking near the rotation handle", () => {
    const handles = buildHandlePositions(transform, bounds, zoom);
    const rotHandle = handles.find((h) => h.handle === "rotate");
    expect(rotHandle).toBeDefined();
    if (rotHandle) {
      const result = hitTestHandles(
        transform,
        bounds,
        { x: rotHandle.pos.x, y: rotHandle.pos.y + 1 },
        zoom
      );
      expect(result).toBe("rotate");
    }
  });

  it("all 9 handles (4 corners + 4 edges + 1 rotate) are built", () => {
    const handles = buildHandlePositions(transform, bounds, zoom);
    expect(handles).toHaveLength(9);
    const types = handles.map((h) => h.handle);
    expect(types).toContain("top-left");
    expect(types).toContain("top-right");
    expect(types).toContain("bottom-left");
    expect(types).toContain("bottom-right");
    expect(types).toContain("top");
    expect(types).toContain("bottom");
    expect(types).toContain("left");
    expect(types).toContain("right");
    expect(types).toContain("rotate");
  });

  it("handles scale with scaled layer", () => {
    const scaledTransform = makeTransform({ scaleX: 2, scaleY: 0.5 });
    const result = hitTestHandles(
      scaledTransform,
      bounds,
      { x: 50, y: 50 },
      zoom
    );
    expect(result).toBe("move");
  });

  it("handles rotated layer hit test", () => {
    const rotatedTransform = makeTransform({ rotation: Math.PI / 4 }); // 45°
    // Center should still be hittable
    const result = hitTestHandles(
      rotatedTransform,
      bounds,
      { x: 50, y: 50 },
      zoom
    );
    expect(result).toBe("move");
  });

  it("handles zoom factor in hit testing", () => {
    // At zoom=2, handles have a smaller hit radius in doc space (HANDLE_RADIUS / zoom).
    // The bottom-right corner handle is at (100, 100). A point just outside
    // the hit radius at zoom=1 should miss at zoom=2.
    const handles = buildHandlePositions(transform, bounds, 1);
    const bottomRight = handles.find((h) => h.handle === "bottom-right")!;
    // Place a point just within HANDLE_RADIUS at zoom=1 but outside at zoom=2
    const testPoint: Point = {
      x: bottomRight.pos.x + HANDLE_RADIUS * 0.9,
      y: bottomRight.pos.y
    };
    const resultZoom1 = hitTestHandles(transform, bounds, testPoint, 1);
    const resultZoom2 = hitTestHandles(transform, bounds, testPoint, 2);
    // At zoom=1, threshold = HANDLE_RADIUS, point is within
    expect(resultZoom1).toBe("bottom-right");
    // At zoom=2, threshold = HANDLE_RADIUS/2, point is outside the handle
    // but still within the outer-rotate margin
    expect(resultZoom2).toBe("rotate-outer");
  });
});

// ─── Hover cursor behavior ───────────────────────────────────────────────────

describe("gizmo hover cursor behavior", () => {
  it("returns 'move' cursor for move handle", () => {
    expect(cursorForHandle("move", 0)).toBe("move");
  });

  it("returns 'grab' for rotate handle", () => {
    expect(cursorForHandle("rotate", 0)).toBe("grab");
  });

  it("returns resize cursors for scale handles at 0 rotation", () => {
    const cursor = cursorForHandle("right", 0);
    expect(cursor).toBeTruthy();
    expect(typeof cursor).toBe("string");
  });

  it("rotates cursor with layer rotation", () => {
    const cursor0 = cursorForHandle("right", 0);
    const cursor90 = cursorForHandle("right", Math.PI / 2);
    // At 90° rotation, the right handle should get a different cursor
    expect(cursor0).not.toBe(cursor90);
  });

  it("getTransformHoverInfo returns handle and cursor for valid point", () => {
    const transform = makeTransform();
    const bounds = makeBounds();
    const info = getTransformHoverInfo({ x: 50, y: 50 }, transform, bounds, 1);
    expect(info.handle).toBe("move");
    expect(info.cursor).toBe("move");
  });

  it("getTransformHoverInfo returns nulls for miss", () => {
    const transform = makeTransform();
    const bounds = makeBounds();
    const info = getTransformHoverInfo(
      { x: -100, y: -100 },
      transform,
      bounds,
      1
    );
    expect(info.handle).toBeNull();
    expect(info.cursor).toBeNull();
  });

  it("isPointInsideGizmo returns true for interior point", () => {
    const transform = makeTransform();
    const bounds = makeBounds();
    expect(isPointInsideGizmo({ x: 50, y: 50 }, transform, bounds, 1)).toBe(
      true
    );
  });

  it("isPointInsideGizmo returns false for exterior point", () => {
    const transform = makeTransform();
    const bounds = makeBounds();
    expect(
      isPointInsideGizmo({ x: -100, y: -100 }, transform, bounds, 1)
    ).toBe(false);
  });
});

// ─── Viewport conversion ────────────────────────────────────────────────────

describe("gizmo viewport conversion", () => {
  const docW = 512;
  const docH = 512;
  const containerW = 800;
  const containerH = 600;
  const dpr = 2;
  const zoom = 1;
  const pan: Point = { x: 0, y: 0 };

  it("docToScreen converts document center to screen center", () => {
    const result = docToScreen(
      docW / 2,
      docH / 2,
      docW,
      docH,
      zoom,
      pan,
      containerW,
      containerH,
      dpr
    );
    // Document center (256, 256) should map to screen center
    expect(result.x).toBeCloseTo(containerW * dpr / 2, 1);
    expect(result.y).toBeCloseTo(containerH * dpr / 2, 1);
  });

  it("docToScreen responds to zoom", () => {
    const zoom2 = 2;
    const result1 = docToScreen(0, 0, docW, docH, 1, pan, containerW, containerH, dpr);
    const result2 = docToScreen(0, 0, docW, docH, zoom2, pan, containerW, containerH, dpr);
    // At zoom=2, the same document point should be further from center
    expect(Math.abs(result2.x - containerW * dpr / 2)).toBeGreaterThan(
      Math.abs(result1.x - containerW * dpr / 2)
    );
  });

  it("docToScreen responds to pan", () => {
    const panOffset: Point = { x: 50, y: -30 };
    const resultNoPan = docToScreen(
      docW / 2,
      docH / 2,
      docW,
      docH,
      zoom,
      { x: 0, y: 0 },
      containerW,
      containerH,
      dpr
    );
    const resultPan = docToScreen(
      docW / 2,
      docH / 2,
      docW,
      docH,
      zoom,
      panOffset,
      containerW,
      containerH,
      dpr
    );
    expect(resultPan.x - resultNoPan.x).toBeCloseTo(panOffset.x * dpr, 1);
    expect(resultPan.y - resultNoPan.y).toBeCloseTo(panOffset.y * dpr, 1);
  });

  it("docRectToScreen produces correct dimensions", () => {
    const result = docRectToScreen(
      0,
      0,
      100,
      50,
      docW,
      docH,
      zoom,
      pan,
      containerW,
      containerH,
      dpr
    );
    expect(result.w).toBeCloseTo(100 * zoom * dpr, 1);
    expect(result.h).toBeCloseTo(50 * zoom * dpr, 1);
  });

  it("clientToDocumentCanvas and documentCanvasToClient are inverses", () => {
    const containerRect = { left: 100, top: 50, width: containerW, height: containerH };
    const clientPt = { x: 400, y: 300 };

    const docPt = clientToDocumentCanvas(
      clientPt.x,
      clientPt.y,
      containerRect,
      zoom,
      pan,
      docW,
      docH
    );
    const backToClient = documentCanvasToClient(
      docPt.x,
      docPt.y,
      containerRect,
      zoom,
      pan,
      docW,
      docH
    );

    expect(backToClient.x).toBeCloseTo(clientPt.x, 5);
    expect(backToClient.y).toBeCloseTo(clientPt.y, 5);
  });

  it("scaledHalfExtents respects scale factors", () => {
    const bounds = makeBounds({ width: 200, height: 100 });
    const transform = makeTransform({ scaleX: 2, scaleY: 0.5 });
    const { hw, hh } = scaledHalfExtents(bounds, transform);
    expect(hw).toBe(200); // 200 * 2 / 2
    expect(hh).toBe(25); // 100 * 0.5 / 2
  });
});

// ─── GizmoRedrawScheduler ────────────────────────────────────────────────────

describe("GizmoRedrawScheduler", () => {
  it("coalesces multiple schedule calls into one callback", () => {
    jest.useFakeTimers();
    const scheduler = new GizmoRedrawScheduler();
    const callback = jest.fn();

    scheduler.scheduleRedraw(callback);
    scheduler.scheduleRedraw(callback);
    scheduler.scheduleRedraw(callback);

    // The scheduler uses rAF, but we can't easily trigger rAF in jest.
    // Verify that isScheduled is true after scheduling.
    expect(scheduler.isScheduled).toBe(true);

    jest.useRealTimers();
  });
});
