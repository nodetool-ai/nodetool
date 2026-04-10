/**
 * Regression tests for advanced transform modes:
 *
 *   1. Outer-rotate zone: clicking/dragging just outside the bounding box
 *      triggers rotation (returns "rotate-outer").
 *   2. Pivot handle: hit-testing, dragging, and snapping the user-adjustable
 *      pivot point to stable anchor positions.
 *   3. Pivot-aware rotation: computeRotateTransform uses a custom pivot
 *      instead of always the layer center.
 *   4. Cursor mapping: new handle types produce correct cursors.
 *   5. computeTransformForHandle dispatcher: "rotate-outer" and "pivot"
 *      are dispatched correctly.
 */

import {
  hitTestHandles,
  buildHandlePositions,
  rotatePoint,
  dist,
  getPivotAnchorPoints,
  snapPivotToAnchor,
  HANDLE_RADIUS,
  OUTER_ROTATE_MARGIN
} from "../tools/transform/handleGeometry";
import { cursorForHandle } from "../tools/transform/cursorMapping";
import {
  computeRotateTransform,
  computeTransformForHandle
} from "../tools/transform/computeTransform";
import { getTransformHoverInfo } from "../tools/transform/transformHoverPolicy";
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

// ─── 1. Outer-rotate zone ────────────────────────────────────────────────────

describe("outer-rotate zone hit testing", () => {
  const transform = makeTransform();
  const bounds = makeBounds();
  const zoom = 1;

  it("returns 'rotate-outer' for a point just outside the bounding box", () => {
    // Bounding box for identity 100×100 layer: (0,0)→(100,100), center at (50,50).
    // A point just outside the top-right corner area, away from handles.
    const outerMargin = OUTER_ROTATE_MARGIN / zoom;
    const pt: Point = { x: 100 + outerMargin * 0.5, y: 25 }; // y=25 avoids edge/corner handles
    const result = hitTestHandles(transform, bounds, pt, zoom);
    expect(result).toBe("rotate-outer");
  });

  it("returns null for a point well outside the outer-rotate margin", () => {
    const outerMargin = OUTER_ROTATE_MARGIN / zoom;
    const pt: Point = { x: 100 + outerMargin + 10, y: 25 };
    const result = hitTestHandles(transform, bounds, pt, zoom);
    expect(result).toBeNull();
  });

  it("returns 'rotate-outer' above the top edge (not on the rotation handle)", () => {
    // The rotation handle is at (50, 0 - ROTATION_HANDLE_OFFSET). Points between
    // the top edge and the rotation handle that don't hit the rotation handle
    // should still return rotate-outer.
    const pt: Point = { x: 20, y: -5 }; // Just above the top edge, off to the side
    const result = hitTestHandles(transform, bounds, pt, zoom);
    expect(result).toBe("rotate-outer");
  });

  it("outer-rotate zone respects zoom scaling", () => {
    const highZoom = 4;
    const outerMargin = OUTER_ROTATE_MARGIN / highZoom; // 4px in doc space
    // A point 3px outside the right edge — within margin at zoom=4
    const pt: Point = { x: 100 + outerMargin * 0.75, y: 50 };
    const result = hitTestHandles(transform, bounds, pt, highZoom);
    expect(result).toBe("rotate-outer");
  });

  it("outer-rotate zone works with rotated layers", () => {
    const rotated = makeTransform({ rotation: Math.PI / 4 }); // 45°
    // The center is at (50, 50). After 45° rotation, the box is diamond-shaped.
    // Place a point outside one of the "flat" sides of the rotated box.
    // In un-rotated space: just outside the bottom edge, away from handles.
    const outerMargin = OUTER_ROTATE_MARGIN;
    const pt: Point = { x: 25, y: 100 + outerMargin * 0.5 };
    // Rotate this point by 45° around center (50, 50)
    const ptRotated = rotatePoint(pt.x, pt.y, 50, 50, Math.PI / 4);
    const result = hitTestHandles(rotated, makeBounds(), ptRotated, 1);
    expect(result).toBe("rotate-outer");
  });

  it("'move' takes priority over 'rotate-outer' inside the box", () => {
    // The center of the bounding box should always return "move", never "rotate-outer"
    const result = hitTestHandles(transform, bounds, { x: 50, y: 50 }, zoom);
    expect(result).toBe("move");
  });

  it("scale handles take priority over rotate-outer near edges", () => {
    // The right edge midpoint handle should still be detected
    const handles = buildHandlePositions(transform, bounds, zoom);
    const rightHandle = handles.find((h) => h.handle === "right")!;
    const result = hitTestHandles(
      transform,
      bounds,
      { x: rightHandle.pos.x, y: rightHandle.pos.y },
      zoom
    );
    expect(result).toBe("right");
  });
});

// ─── 2. Pivot handle hit testing ─────────────────────────────────────────────

describe("pivot handle hit testing", () => {
  const transform = makeTransform();
  const bounds = makeBounds();
  const zoom = 1;

  it("returns 'pivot' when clicking on the pivot point", () => {
    const pivotPoint: Point = { x: 30, y: 30 };
    const result = hitTestHandles(transform, bounds, { x: 30, y: 30 }, zoom, pivotPoint);
    expect(result).toBe("pivot");
  });

  it("returns 'pivot' within the hit radius of the pivot point", () => {
    const pivotPoint: Point = { x: 30, y: 30 };
    const nearby: Point = { x: 30 + HANDLE_RADIUS * 0.5, y: 30 };
    const result = hitTestHandles(transform, bounds, nearby, zoom, pivotPoint);
    expect(result).toBe("pivot");
  });

  it("pivot has higher priority than other handles", () => {
    // Place pivot right at the center (where "move" would normally be returned)
    const pivotPoint: Point = { x: 50, y: 50 };
    const result = hitTestHandles(transform, bounds, { x: 50, y: 50 }, zoom, pivotPoint);
    expect(result).toBe("pivot");
  });

  it("returns normal handle when pivot is not provided", () => {
    const result = hitTestHandles(transform, bounds, { x: 50, y: 50 }, zoom);
    expect(result).toBe("move");
  });

  it("returns normal handle when pivot is null", () => {
    const result = hitTestHandles(transform, bounds, { x: 50, y: 50 }, zoom, null);
    expect(result).toBe("move");
  });

  it("returns 'rotate-outer' even when pivot exists but is far away", () => {
    const pivotPoint: Point = { x: 200, y: 200 }; // far from gizmo
    const outerMargin = OUTER_ROTATE_MARGIN;
    const pt: Point = { x: 100 + outerMargin * 0.5, y: 25 }; // avoid edge handles
    const result = hitTestHandles(transform, bounds, pt, zoom, pivotPoint);
    expect(result).toBe("rotate-outer");
  });
});

// ─── 3. Pivot anchor snapping ────────────────────────────────────────────────

describe("pivot anchor snapping", () => {
  const transform = makeTransform();
  const bounds = makeBounds();
  const zoom = 1;

  it("returns 9 anchor points (center + 4 corners + 4 edges)", () => {
    const anchors = getPivotAnchorPoints(transform, bounds, zoom);
    expect(anchors).toHaveLength(9);
    const labels = anchors.map((a) => a.label);
    expect(labels).toContain("center");
    expect(labels).toContain("top-left");
    expect(labels).toContain("top-right");
    expect(labels).toContain("bottom-left");
    expect(labels).toContain("bottom-right");
    expect(labels).toContain("top");
    expect(labels).toContain("bottom");
    expect(labels).toContain("left");
    expect(labels).toContain("right");
  });

  it("center anchor is at the layer center", () => {
    const anchors = getPivotAnchorPoints(transform, bounds, zoom);
    const center = anchors.find((a) => a.label === "center")!;
    expect(center.pos.x).toBeCloseTo(50);
    expect(center.pos.y).toBeCloseTo(50);
  });

  it("corner anchors match handle positions", () => {
    const anchors = getPivotAnchorPoints(transform, bounds, zoom);
    const handles = buildHandlePositions(transform, bounds, zoom);
    const topLeftAnchor = anchors.find((a) => a.label === "top-left")!;
    const topLeftHandle = handles.find((h) => h.handle === "top-left")!;
    expect(topLeftAnchor.pos.x).toBeCloseTo(topLeftHandle.pos.x);
    expect(topLeftAnchor.pos.y).toBeCloseTo(topLeftHandle.pos.y);
  });

  it("snaps to the nearest anchor within threshold", () => {
    // Place a point near the center (50, 50), slightly off
    const result = snapPivotToAnchor({ x: 52, y: 48 }, transform, bounds, zoom);
    expect(result.x).toBeCloseTo(50);
    expect(result.y).toBeCloseTo(50);
  });

  it("returns the original point when no anchor is within threshold", () => {
    // Place a point far from any anchor
    const pt: Point = { x: 25, y: 25 }; // midway between center and top-left corner
    const result = snapPivotToAnchor(pt, transform, bounds, zoom);
    // 25,25 is about 35px from center and 35px from top-left — likely outside threshold
    // Snap threshold is 10px at zoom=1
    const dCenter = dist(pt, { x: 50, y: 50 });
    const dTL = dist(pt, { x: 0, y: 0 });
    if (dCenter > 10 && dTL > 10) {
      expect(result.x).toBe(25);
      expect(result.y).toBe(25);
    }
  });

  it("snaps to the closest anchor when multiple are nearby", () => {
    // Place a point near the top-left corner (0, 0)
    const result = snapPivotToAnchor({ x: 2, y: 2 }, transform, bounds, zoom);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
  });

  it("respects zoom in snap threshold", () => {
    // At high zoom, the snap threshold is smaller in doc space
    const highZoom = 4; // threshold = 10/4 = 2.5px in doc space
    const result = snapPivotToAnchor({ x: 53, y: 50 }, transform, bounds, highZoom);
    // 3px away from center at zoom=4, threshold = 2.5px — should NOT snap
    expect(result.x).toBe(53);
    expect(result.y).toBe(50);
  });
});

// ─── 4. Pivot-aware rotation ─────────────────────────────────────────────────

describe("pivot-aware rotation via computeTransformForHandle", () => {
  const bounds = makeBounds();
  const transform = makeTransform();

  it("rotate uses layer center when no pivot is provided", () => {
    const center: Point = { x: 50, y: 50 };
    const dragStart: Point = { x: 100, y: 50 }; // right edge
    const cursor: Point = { x: 50, y: 0 }; // above center → ~90° CCW

    const result = computeTransformForHandle(
      "rotate",
      transform,
      dragStart,
      cursor,
      center,
      bounds,
      false,
      false
    );
    // Should produce a rotation
    expect(result.rotation).toBeDefined();
    expect(result.rotation).not.toBe(0);
  });

  it("rotate uses custom pivot when provided", () => {
    const center: Point = { x: 50, y: 50 };
    const pivot: Point = { x: 0, y: 0 }; // top-left corner as pivot
    const dragStart: Point = { x: 100, y: 50 };
    const cursor: Point = { x: 50, y: 100 };

    const resultWithCenter = computeTransformForHandle(
      "rotate",
      transform,
      dragStart,
      cursor,
      center,
      bounds,
      false,
      false
    );
    const resultWithPivot = computeTransformForHandle(
      "rotate",
      transform,
      dragStart,
      cursor,
      center,
      bounds,
      false,
      false,
      pivot
    );
    // Different pivot should produce different rotation angles
    expect(resultWithCenter.rotation).not.toBeCloseTo(resultWithPivot.rotation!, 2);
  });

  it("rotate-outer dispatches to rotation computation", () => {
    const center: Point = { x: 50, y: 50 };
    const dragStart: Point = { x: 110, y: 50 }; // just outside right edge
    const cursor: Point = { x: 50, y: -10 }; // above center

    const result = computeTransformForHandle(
      "rotate-outer",
      transform,
      dragStart,
      cursor,
      center,
      bounds,
      false,
      false
    );
    expect(result.rotation).toBeDefined();
    expect(result.rotation).not.toBe(0);
  });

  it("pivot handle dispatch returns unchanged transform", () => {
    const center: Point = { x: 50, y: 50 };
    const result = computeTransformForHandle(
      "pivot",
      transform,
      { x: 30, y: 30 },
      { x: 40, y: 40 },
      center,
      bounds,
      false,
      false
    );
    expect(result.x).toBe(transform.x);
    expect(result.y).toBe(transform.y);
    expect(result.scaleX).toBe(transform.scaleX);
    expect(result.scaleY).toBe(transform.scaleY);
    expect(result.rotation).toBe(transform.rotation);
  });

  it("Shift snap works with rotate-outer", () => {
    const center: Point = { x: 50, y: 50 };
    const dragStart: Point = { x: 110, y: 50 };
    // Move to roughly 20° rotation — should snap to 15° with shift
    const angle20 = (20 * Math.PI) / 180;
    const radius = dist(dragStart, center);
    const startAngle = Math.atan2(dragStart.y - center.y, dragStart.x - center.x);
    const targetAngle = startAngle + angle20;
    const cursor: Point = {
      x: center.x + radius * Math.cos(targetAngle),
      y: center.y + radius * Math.sin(targetAngle)
    };

    const result = computeTransformForHandle(
      "rotate-outer",
      transform,
      dragStart,
      cursor,
      center,
      bounds,
      true, // shift = snap
      false
    );
    // Should snap to 15° = PI/12
    const snapStep = Math.PI / 12;
    const snapped = Math.round((result.rotation ?? 0) / snapStep) * snapStep;
    expect(result.rotation).toBeCloseTo(snapped, 5);
  });
});

// ─── 5. Cursor mapping for new handle types ──────────────────────────────────

describe("cursor mapping for new handle types", () => {
  it("returns 'grab' for rotate-outer", () => {
    expect(cursorForHandle("rotate-outer", 0)).toBe("grab");
  });

  it("returns 'crosshair' for pivot", () => {
    expect(cursorForHandle("pivot", 0)).toBe("crosshair");
  });

  it("rotate-outer returns 'grab' regardless of rotation", () => {
    expect(cursorForHandle("rotate-outer", Math.PI / 4)).toBe("grab");
    expect(cursorForHandle("rotate-outer", Math.PI)).toBe("grab");
  });

  it("pivot returns 'crosshair' regardless of rotation", () => {
    expect(cursorForHandle("pivot", Math.PI / 2)).toBe("crosshair");
  });
});

// ─── 6. Hover policy integration ─────────────────────────────────────────────

describe("hover policy with pivot and outer-rotate", () => {
  const transform = makeTransform();
  const bounds = makeBounds();

  it("returns rotate-outer handle and cursor for point just outside box", () => {
    const outerMargin = OUTER_ROTATE_MARGIN;
    const pt: Point = { x: 100 + outerMargin * 0.5, y: 25 }; // avoid edge handles
    const info = getTransformHoverInfo(pt, transform, bounds, 1);
    expect(info.handle).toBe("rotate-outer");
    expect(info.cursor).toBe("grab");
  });

  it("returns pivot handle and cursor when pivot is provided", () => {
    const pivotPoint: Point = { x: 30, y: 30 };
    const info = getTransformHoverInfo({ x: 30, y: 30 }, transform, bounds, 1, pivotPoint);
    expect(info.handle).toBe("pivot");
    expect(info.cursor).toBe("crosshair");
  });

  it("returns null for point beyond outer-rotate zone", () => {
    const info = getTransformHoverInfo({ x: 200, y: 200 }, transform, bounds, 1);
    expect(info.handle).toBeNull();
    expect(info.cursor).toBeNull();
  });
});
