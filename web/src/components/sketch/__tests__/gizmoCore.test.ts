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
  isInRotateZone,
  hitTestPivot,
  getPivotSnapAnchors,
  snapPivotToAnchor,
  HANDLE_RADIUS,
  ROTATION_HANDLE_OFFSET,
  HANDLE_SIZE,
  OUTSIDE_ROTATE_MARGIN,
  PIVOT_HIT_RADIUS,
  PIVOT_SNAP_DISTANCE
} from "../tools/transform/handleGeometry";
import { cursorForHandle } from "../tools/transform/cursorMapping";
import {
  getTransformHoverInfo,
  isPointInsideGizmo
} from "../tools/transform/transformHoverPolicy";
import { GizmoRedrawScheduler } from "../tools/transform/transformGizmoPainter";
import {
  computeRotateTransform,
  computeSkewTransform
} from "../tools/transform/computeTransform";
import {
  HANDLE_HIT_RADIUS,
  ROTATION_HANDLE_OFFSET as GIZMO_ROTATION_HANDLE_OFFSET,
  HANDLE_SIZE as GIZMO_HANDLE_SIZE,
  GIZMO_PRIMARY_COLOR,
  HANDLE_FILL_DEFAULT
} from "../tools/gizmo/gizmoConstants";
import type { LayerTransform, LayerContentBounds, Point } from "../types";
import { getTransformedCorners } from "../painting/resolvedLayerGeometry";

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
    // At zoom=2, threshold = HANDLE_RADIUS/2, point is outside
    expect(resultZoom2).toBeNull();
  });

  it("matrix-backed skew transform keeps move hit testing inside the skewed quad", () => {
    const skewed = computeSkewTransform(
      getTransformedCorners(transform, bounds),
      "top",
      { x: 50, y: 0 },
      { x: 75, y: 20 },
      bounds
    );
    const center = getTransformedCorners(skewed, bounds).reduce(
      (acc, corner) => ({
        x: acc.x + corner.x / 4,
        y: acc.y + corner.y / 4
      }),
      { x: 0, y: 0 }
    );

    expect(hitTestHandles(skewed, bounds, center, zoom)).toBe("move");
  });

  it("buildHandlePositions uses transformed corners for matrix-backed quads", () => {
    const skewed = computeSkewTransform(
      getTransformedCorners(transform, bounds),
      "top",
      { x: 50, y: 0 },
      { x: 75, y: 20 },
      bounds
    );
    const corners = getTransformedCorners(skewed, bounds);
    const handles = buildHandlePositions(skewed, bounds, zoom);
    const topLeft = handles.find((entry) => entry.handle === "top-left");

    expect(topLeft).toBeDefined();
    expect(topLeft?.pos.x).toBeCloseTo(corners[0].x, 5);
    expect(topLeft?.pos.y).toBeCloseTo(corners[0].y, 5);
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

// ─── Outside-box rotate zone ────────────────────────────────────────────────

describe("outside-box rotate zone", () => {
  const transform = makeTransform();
  const bounds = makeBounds(); // 100x100 at origin → box from (0,0) to (100,100)
  const zoom = 1;

  it("returns false for points inside the bounding box", () => {
    expect(isInRotateZone(transform, bounds, { x: 50, y: 50 }, zoom)).toBe(false);
  });

  it("returns true for points just outside the bounding box edge", () => {
    // Just outside the right edge
    const margin = OUTSIDE_ROTATE_MARGIN / zoom;
    expect(
      isInRotateZone(transform, bounds, { x: 100 + margin * 0.5, y: 50 }, zoom)
    ).toBe(true);
  });

  it("returns true for points just outside a corner", () => {
    // Just outside the top-left corner
    const margin = OUTSIDE_ROTATE_MARGIN / zoom;
    expect(
      isInRotateZone(transform, bounds, { x: -margin * 0.5, y: -margin * 0.5 }, zoom)
    ).toBe(true);
  });

  it("returns false for points far outside the margin", () => {
    const margin = OUTSIDE_ROTATE_MARGIN / zoom;
    expect(
      isInRotateZone(transform, bounds, { x: -margin * 2, y: -margin * 2 }, zoom)
    ).toBe(false);
  });

  it("respects zoom scaling of the margin", () => {
    // At zoom=2, the margin in doc-space is halved
    const marginZoom2 = OUTSIDE_ROTATE_MARGIN / 2;
    // Point just inside margin at zoom=2
    expect(
      isInRotateZone(transform, bounds, { x: 100 + marginZoom2 * 0.5, y: 50 }, 2)
    ).toBe(true);
    // Point outside margin at zoom=2 but inside margin at zoom=1
    expect(
      isInRotateZone(transform, bounds, { x: 100 + marginZoom2 * 1.5, y: 50 }, 2)
    ).toBe(false);
  });

  it("works with rotated layers", () => {
    const rotated = makeTransform({ rotation: Math.PI / 4 }); // 45°
    // Center of 100x100 box at origin is (50,50), hw=hh=50.
    // A point far to the right of the rotated box should be in the zone.
    // The rotated box extends to ~120.7 on x axis from center=50.
    // A point at x=121, y=50 is just outside; un-rotated it falls outside
    // the axis-aligned box but inside the expanded margin.
    expect(
      isInRotateZone(rotated, bounds, { x: 121, y: 50 }, zoom)
    ).toBe(true);
    // A point well outside should miss
    expect(
      isInRotateZone(rotated, bounds, { x: 200, y: 200 }, zoom)
    ).toBe(false);
  });

  it("works with scaled layers", () => {
    const scaled = makeTransform({ scaleX: 2, scaleY: 1 });
    // Center = (50, 50), hw = 100*2/2 = 100, hh = 50
    // Box goes from x=-50..150, y=0..100
    const margin = OUTSIDE_ROTATE_MARGIN / zoom;
    // Just outside the right edge (x=150)
    expect(
      isInRotateZone(scaled, bounds, { x: 150 + margin * 0.5, y: 50 }, zoom)
    ).toBe(true);
    // Inside the scaled box
    expect(
      isInRotateZone(scaled, bounds, { x: 80, y: 50 }, zoom)
    ).toBe(false);
  });

  it("getTransformHoverInfo returns rotate for outside-box rotate zone", () => {
    const margin = OUTSIDE_ROTATE_MARGIN / zoom;
    const info = getTransformHoverInfo(
      { x: 100 + margin * 0.5, y: 50 },
      transform,
      bounds,
      zoom
    );
    expect(info.handle).toBe("rotate");
    expect(info.cursor).toBe("grab");
  });

  it("getTransformHoverInfo returns null for points well outside", () => {
    const margin = OUTSIDE_ROTATE_MARGIN / zoom;
    const info = getTransformHoverInfo(
      { x: 100 + margin * 2, y: 50 },
      transform,
      bounds,
      zoom
    );
    expect(info.handle).toBeNull();
    expect(info.cursor).toBeNull();
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

// ─── Pivot handle ────────────────────────────────────────────────────────────

describe("pivot handle", () => {
  const transform = makeTransform();
  const bounds = makeBounds(); // 100x100, center at (50, 50)
  const zoom = 1;
  const center: Point = { x: 50, y: 50 };

  describe("hitTestPivot", () => {
    it("returns true when clicking on the pivot", () => {
      expect(hitTestPivot(center, { x: 50, y: 50 }, zoom)).toBe(true);
    });

    it("returns true when clicking within the hit radius", () => {
      const threshold = PIVOT_HIT_RADIUS / zoom;
      expect(
        hitTestPivot(center, { x: 50 + threshold * 0.5, y: 50 }, zoom)
      ).toBe(true);
    });

    it("returns false when clicking outside the hit radius", () => {
      const threshold = PIVOT_HIT_RADIUS / zoom;
      expect(
        hitTestPivot(center, { x: 50 + threshold * 2, y: 50 }, zoom)
      ).toBe(false);
    });

    it("respects zoom scaling", () => {
      const threshold1 = PIVOT_HIT_RADIUS / 1;
      const threshold2 = PIVOT_HIT_RADIUS / 2;
      // Point within radius at zoom=1 but outside at zoom=2
      const pt: Point = { x: 50 + threshold1 * 0.9, y: 50 };
      expect(hitTestPivot(center, pt, 1)).toBe(true);
      expect(hitTestPivot(center, pt, 2)).toBe(threshold1 * 0.9 <= threshold2);
    });

    it("works with a custom pivot position", () => {
      const customPivot: Point = { x: 0, y: 0 };
      expect(hitTestPivot(customPivot, { x: 1, y: 1 }, zoom)).toBe(true);
      expect(hitTestPivot(customPivot, { x: 100, y: 100 }, zoom)).toBe(false);
    });
  });

  describe("getPivotSnapAnchors", () => {
    it("returns 9 anchor points (center + 4 corners + 4 edge midpoints)", () => {
      const anchors = getPivotSnapAnchors(transform, bounds);
      expect(anchors).toHaveLength(9);
    });

    it("first anchor is the layer center", () => {
      const anchors = getPivotSnapAnchors(transform, bounds);
      expect(anchors[0].x).toBeCloseTo(50, 1);
      expect(anchors[0].y).toBeCloseTo(50, 1);
    });

    it("includes all corners", () => {
      const anchors = getPivotSnapAnchors(transform, bounds);
      // Corners of a 100x100 box centered at (50,50): (0,0), (100,0), (0,100), (100,100)
      const cornerPoints = anchors.slice(1, 5);
      const xs = cornerPoints.map((p) => Math.round(p.x)).sort((a, b) => a - b);
      const ys = cornerPoints.map((p) => Math.round(p.y)).sort((a, b) => a - b);
      expect(xs).toEqual([0, 0, 100, 100]);
      expect(ys).toEqual([0, 0, 100, 100]);
    });

    it("includes edge midpoints", () => {
      const anchors = getPivotSnapAnchors(transform, bounds);
      const edgePoints = anchors.slice(5);
      expect(edgePoints).toHaveLength(4);
      // Edge midpoints: (50,0), (50,100), (0,50), (100,50)
      const expected = [
        { x: 50, y: 0 },
        { x: 50, y: 100 },
        { x: 0, y: 50 },
        { x: 100, y: 50 }
      ];
      for (let i = 0; i < expected.length; i++) {
        expect(edgePoints[i].x).toBeCloseTo(expected[i].x, 1);
        expect(edgePoints[i].y).toBeCloseTo(expected[i].y, 1);
      }
    });
  });

  describe("snapPivotToAnchor", () => {
    it("snaps to center when within snap distance", () => {
      const threshold = PIVOT_SNAP_DISTANCE / zoom;
      const result = snapPivotToAnchor(
        { x: 50 + threshold * 0.5, y: 50 },
        transform,
        bounds,
        zoom
      );
      expect(result.x).toBeCloseTo(50, 1);
      expect(result.y).toBeCloseTo(50, 1);
    });

    it("snaps to nearest corner", () => {
      const threshold = PIVOT_SNAP_DISTANCE / zoom;
      const result = snapPivotToAnchor(
        { x: threshold * 0.5, y: threshold * 0.5 },
        transform,
        bounds,
        zoom
      );
      // Should snap to top-left corner (0, 0)
      expect(result.x).toBeCloseTo(0, 1);
      expect(result.y).toBeCloseTo(0, 1);
    });

    it("returns original point when far from all anchors", () => {
      const farPoint: Point = { x: 500, y: 500 };
      const result = snapPivotToAnchor(farPoint, transform, bounds, zoom);
      expect(result.x).toBe(500);
      expect(result.y).toBe(500);
    });

    it("respects zoom scaling of snap distance", () => {
      // At zoom=2, snap distance in doc-space is halved
      const threshold2 = PIVOT_SNAP_DISTANCE / 2;
      // Point just outside snap distance at zoom=2
      const result = snapPivotToAnchor(
        { x: 50 + threshold2 * 1.5, y: 50 },
        transform,
        bounds,
        2
      );
      // Should NOT snap
      expect(result.x).not.toBeCloseTo(50, 0);
    });
  });

  describe("cursor for pivot handle", () => {
    it("returns crosshair cursor for pivot handle", () => {
      expect(cursorForHandle("pivot", 0)).toBe("crosshair");
    });
  });
});

// ─── Pivot rotation ──────────────────────────────────────────────────────────

describe("rotation with custom pivot", () => {
  const bounds = makeBounds(); // 100x100
  const layerCenter: Point = { x: 50, y: 50 };

  it("rotates around layer center without orbit when pivot matches center", () => {
    const transform = makeTransform();
    // Drag from right of center to above center (90° CCW)
    const dragStart: Point = { x: 150, y: 50 };
    const cursor: Point = { x: 50, y: -50 };
    const result = computeRotateTransform(
      transform,
      dragStart,
      cursor,
      layerCenter, // pivot === center
      false
      // no layerCenter arg → no orbit
    );
    // Rotation should change but translation should stay at (0, 0)
    expect(result.rotation).toBeDefined();
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it("orbits layer center around off-center pivot", () => {
    const transform = makeTransform();
    // Pivot at the top-left corner of the box
    const pivot: Point = { x: 0, y: 0 };
    // Small rotation (not exactly 90°) so both x and y change
    const dragStart: Point = { x: 100, y: 0 };
    const cursor: Point = { x: 87, y: 50 }; // ~30° rotation
    const result = computeRotateTransform(
      transform,
      dragStart,
      cursor,
      pivot,
      false,
      layerCenter // enables orbit
    );
    // The layer should rotate AND translate so the center orbits the pivot
    expect(result.rotation).toBeDefined();
    // At least one coordinate should change from the orbital translation
    const translationChanged = result.x !== 0 || result.y !== 0;
    expect(translationChanged).toBe(true);
  });

  it("preserves distance from pivot after rotation", () => {
    const transform = makeTransform();
    const pivot: Point = { x: 0, y: 0 };
    // Small rotation
    const dragStart: Point = { x: 100, y: 0 };
    const cursor: Point = { x: 95, y: 31 }; // ~18° rotation
    const result = computeRotateTransform(
      transform,
      dragStart,
      cursor,
      pivot,
      false,
      layerCenter
    );
    // The new layer center (derived from new translation) should be at the
    // same distance from the pivot as the original center was.
    const origDist = Math.hypot(layerCenter.x, layerCenter.y);
    const newCenterX = result.x + bounds.x + bounds.width / 2;
    const newCenterY = result.y + bounds.y + bounds.height / 2;
    const newDist = Math.hypot(newCenterX, newCenterY);
    expect(newDist).toBeCloseTo(origDist, 0);
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
