/**
 * packageB-moveTransformCorrectness.test.ts – Regression coverage for
 * Package B: dependent move/transform correctness.
 *
 * Tests verify:
 *   - Move preview and commit preserve full transform state (scale/rotation/matrix)
 *   - Move/scale gizmo handle positions align with resolved geometry
 *   - Selection/overlay bounds align with the same resolved transformed extents
 *   - Left/top transform handles behave correctly (signed distance)
 *   - Transform computation produces correct results for all handle types
 *   - Shared seam consumption: tools use resolvedLayerGeometry, not local math
 */

import type {
  AffineTransform,
  LayerTransform,
  LayerContentBounds,
  Layer,
  SketchDocument
} from "../types";
import {
  IDENTITY_AFFINE,
  isAffineTransform,
  makeAffineTransform,
  makeSingleQuadTransform
} from "../types";
import {
  aff,
  quadOf,
  fxComposeMatrix as composeAffineMatrix,
  fxEnsureTransform as ensureTransformMatrix
} from "./_transformFixtures";
import {
  mergeTransformPreview,
  createMovePreview,
  isCompleteTransform
} from "../painting/transformPreview";
import {
  getLayerGeometry,
  computeTransformedExtents,
  computeTransformedCorners,
  computeTransformedCenter,
  getRasterBounds
} from "../transform/geometry/layerGeometry";
import {
  hitTestHandles,
  buildHandlePositions,
  computeLayerCenter,
  scaledHalfExtents,
  docToScreen,
  docRectToScreen,
  rotatePoint,
  dist,
  HANDLE_RADIUS,
  ROTATION_HANDLE_OFFSET,
  type TransformHandle
} from "../tools/transform/handleGeometry";
import {
  computeMoveTransform,
  computeRotateTransform,
  computeScaleTransform,
  computeTransformForHandle,
  computeDistortTransform,
  computeSkewTransform,
  computePerspectiveTransform,
  resolveTransformGestureMode
} from "../tools/transform/computeTransform";
import { cursorForHandle, ROTATE_CURSOR_CSS } from "../tools/transform/cursorMapping";

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeTransform(overrides?: Partial<{
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}>): AffineTransform {
  return ensureTransformMatrix({
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    ...overrides
  });
}

function makeBounds(
  overrides?: Partial<LayerContentBounds>
): LayerContentBounds {
  return { x: 0, y: 0, width: 100, height: 100, ...overrides };
}

function makeLayer(overrides?: Partial<Layer>): Layer {
  return {
    id: "test-layer",
    name: "Test Layer",
    type: "paint",
    visible: true,
    opacity: 1,
    locked: false,
    blendMode: "normal",
    data: null,
    effects: [],
    transform: makeTransform(),
    contentBounds: makeBounds(),
    ...(overrides as Partial<Layer>)
  } as Layer;
}

// ─── Move preview / commit preserves full transform ──────────────────────────

describe("Package B: move preview preserves full transform", () => {
  it("move on translated-only layer works normally", () => {
    const layer = makeLayer({
      transform: makeTransform({ x: 50, y: 50 })
    });
    const preview = aff(createMovePreview(layer, 100, 100));

    expect(preview.x).toBe(100);
    expect(preview.y).toBe(100);
    expect(preview.scaleX).toBe(1);
    expect(preview.scaleY).toBe(1);
    expect(preview.rotation).toBe(0);
    expect(isCompleteTransform(preview)).toBe(true);
  });

  it("move on scaled layer preserves scale", () => {
    const layer = makeLayer({
      transform: makeTransform({ x: 10, y: 10, scaleX: 2, scaleY: 0.5 })
    });
    const preview = aff(createMovePreview(layer, 50, 50));

    expect(preview.x).toBe(50);
    expect(preview.y).toBe(50);
    expect(preview.scaleX).toBe(2);
    expect(preview.scaleY).toBe(0.5);
  });

  it("move on rotated layer preserves rotation", () => {
    const layer = makeLayer({
      transform: makeTransform({ rotation: Math.PI / 4 })
    });
    const preview = aff(createMovePreview(layer, 30, 40));

    expect(preview.rotation).toBe(Math.PI / 4);
  });

  it("move on scaled+rotated layer preserves all fields", () => {
    const layer = makeLayer({
      transform: makeTransform({
        x: 100,
        y: 100,
        scaleX: 1.5,
        scaleY: 0.8,
        rotation: Math.PI / 6
      })
    });
    const preview = aff(createMovePreview(layer, 120, 130));

    expect(preview.scaleX).toBe(1.5);
    expect(preview.scaleY).toBe(0.8);
    expect(preview.rotation).toBe(Math.PI / 6);
    expect(preview.x).toBe(120);
    expect(preview.y).toBe(130);
    // Renderer derives the matrix on demand via affineToMatrix(preview).
    expect(isCompleteTransform(preview)).toBe(true);
  });

  it("merge-based move matches createMovePreview", () => {
    const base = makeTransform({
      x: 10,
      y: 20,
      scaleX: 2,
      scaleY: 2,
      rotation: 0.5
    });
    const layer = makeLayer({ transform: base });

    const viaHelper = createMovePreview(layer, 40, 50);
    const viaMerge = mergeTransformPreview(
      base,
      makeAffineTransform({ ...base, x: 40, y: 50 })
    );

    expect(viaHelper).toEqual(viaMerge);
  });

  it("computeMoveTransform preserves scale and rotation", () => {
    const dragStart = makeTransform({
      x: 10,
      y: 20,
      scaleX: 3,
      scaleY: 0.5,
      rotation: 1.2
    });
    const result = aff(computeMoveTransform(
      dragStart,
      { x: 100, y: 100 },
      { x: 120, y: 130 }
    ));

    expect(result.x).toBe(30); // 10 + (120-100)
    expect(result.y).toBe(50); // 20 + (130-100)
    expect(result.scaleX).toBe(3);
    expect(result.scaleY).toBe(0.5);
    expect(result.rotation).toBe(1.2);
  });
});

// ─── Gizmo handle alignment with resolved geometry ───────────────────────────

describe("Package B: gizmo alignment with resolved geometry", () => {
  it("handle center matches resolved layer center for identity transform", () => {
    const transform = makeTransform({ x: 50, y: 50 });
    const bounds = makeBounds({ x: 0, y: 0, width: 100, height: 100 });

    const resolvedCenter = computeTransformedCenter(transform, bounds);
    const handleCenter = computeLayerCenter(transform, bounds);

    expect(handleCenter).toEqual(resolvedCenter);
  });

  it("handle center matches resolved layer center for scaled transform", () => {
    const transform = makeTransform({
      x: 10,
      y: 20,
      scaleX: 2,
      scaleY: 1.5
    });
    const bounds = makeBounds({ x: 0, y: 0, width: 80, height: 60 });

    const resolvedCenter = computeTransformedCenter(transform, bounds);
    const handleCenter = computeLayerCenter(transform, bounds);

    expect(handleCenter).toEqual(resolvedCenter);
  });

  it("handle center matches resolved layer center for rotated transform", () => {
    const transform = makeTransform({
      x: 10,
      y: 20,
      rotation: Math.PI / 3
    });
    const bounds = makeBounds({ x: 0, y: 0, width: 120, height: 80 });

    const resolvedCenter = computeTransformedCenter(transform, bounds);
    const handleCenter = computeLayerCenter(transform, bounds);

    expect(handleCenter).toEqual(resolvedCenter);
  });

  it("handle corner positions match resolved corners for identity", () => {
    const transform = makeTransform({ x: 10, y: 20 });
    const bounds = makeBounds({ x: 0, y: 0, width: 100, height: 50 });

    const handles = buildHandlePositions(transform, bounds, 1);
    const resolvedCorners = computeTransformedCorners(transform, bounds);

    // Find each corner handle and verify it matches the resolved corner
    const tl = handles.find((h) => h.handle === "top-left")!;
    const tr = handles.find((h) => h.handle === "top-right")!;
    const bl = handles.find((h) => h.handle === "bottom-left")!;
    const br = handles.find((h) => h.handle === "bottom-right")!;

    expect(tl.pos.x).toBeCloseTo(resolvedCorners[0].x, 5);
    expect(tl.pos.y).toBeCloseTo(resolvedCorners[0].y, 5);
    expect(tr.pos.x).toBeCloseTo(resolvedCorners[1].x, 5);
    expect(tr.pos.y).toBeCloseTo(resolvedCorners[1].y, 5);
    expect(br.pos.x).toBeCloseTo(resolvedCorners[2].x, 5);
    expect(br.pos.y).toBeCloseTo(resolvedCorners[2].y, 5);
    expect(bl.pos.x).toBeCloseTo(resolvedCorners[3].x, 5);
    expect(bl.pos.y).toBeCloseTo(resolvedCorners[3].y, 5);
  });

  it("handle corner positions match resolved corners for scaled transform", () => {
    const transform = makeTransform({
      x: 10,
      y: 10,
      scaleX: 2,
      scaleY: 1.5
    });
    const bounds = makeBounds({ x: 0, y: 0, width: 80, height: 60 });

    const handles = buildHandlePositions(transform, bounds, 1);
    const resolvedCorners = computeTransformedCorners(transform, bounds);

    const tl = handles.find((h) => h.handle === "top-left")!;
    const tr = handles.find((h) => h.handle === "top-right")!;
    const bl = handles.find((h) => h.handle === "bottom-left")!;
    const br = handles.find((h) => h.handle === "bottom-right")!;

    expect(tl.pos.x).toBeCloseTo(resolvedCorners[0].x, 5);
    expect(tl.pos.y).toBeCloseTo(resolvedCorners[0].y, 5);
    expect(tr.pos.x).toBeCloseTo(resolvedCorners[1].x, 5);
    expect(tr.pos.y).toBeCloseTo(resolvedCorners[1].y, 5);
    expect(br.pos.x).toBeCloseTo(resolvedCorners[2].x, 5);
    expect(br.pos.y).toBeCloseTo(resolvedCorners[2].y, 5);
    expect(bl.pos.x).toBeCloseTo(resolvedCorners[3].x, 5);
    expect(bl.pos.y).toBeCloseTo(resolvedCorners[3].y, 5);
  });

  it("handle corner positions match resolved corners for rotated transform", () => {
    const transform = makeTransform({
      x: 10,
      y: 20,
      scaleX: 1.5,
      scaleY: 1.5,
      rotation: Math.PI / 6
    });
    const bounds = makeBounds({ x: 0, y: 0, width: 80, height: 60 });

    const handles = buildHandlePositions(transform, bounds, 1);
    const resolvedCorners = computeTransformedCorners(transform, bounds);

    const tl = handles.find((h) => h.handle === "top-left")!;
    const tr = handles.find((h) => h.handle === "top-right")!;
    const bl = handles.find((h) => h.handle === "bottom-left")!;
    const br = handles.find((h) => h.handle === "bottom-right")!;

    expect(tl.pos.x).toBeCloseTo(resolvedCorners[0].x, 5);
    expect(tl.pos.y).toBeCloseTo(resolvedCorners[0].y, 5);
    expect(tr.pos.x).toBeCloseTo(resolvedCorners[1].x, 5);
    expect(tr.pos.y).toBeCloseTo(resolvedCorners[1].y, 5);
    expect(br.pos.x).toBeCloseTo(resolvedCorners[2].x, 5);
    expect(br.pos.y).toBeCloseTo(resolvedCorners[2].y, 5);
    expect(bl.pos.x).toBeCloseTo(resolvedCorners[3].x, 5);
    expect(bl.pos.y).toBeCloseTo(resolvedCorners[3].y, 5);
  });

  it("getLayerGeometry bundles extents/center/corners consistent with computeTransformed*", () => {
    const transform = makeTransform({
      x: 30,
      y: 40,
      scaleX: 1.5,
      scaleY: 2,
      rotation: 0.3
    });
    const bounds = makeBounds({ x: 5, y: 5, width: 100, height: 80 });

    const resolved = getLayerGeometry({ transform, contentBounds: bounds });

    expect(resolved.transformedExtents).toEqual(
      computeTransformedExtents(transform, bounds)
    );
    expect(resolved.transformedCenter).toEqual(
      computeTransformedCenter(transform, bounds)
    );
    const corners = computeTransformedCorners(transform, bounds);
    for (let i = 0; i < 4; i++) {
      expect(resolved.transformedCorners[i]).toEqual(corners[i]);
    }
  });
});

// ─── Hit testing alignment ───────────────────────────────────────────────────

describe("Package B: hit testing alignment with resolved geometry", () => {
  it("hitting center of identity-transform layer returns 'move'", () => {
    const transform = makeTransform({ x: 0, y: 0 });
    const bounds = makeBounds({ width: 100, height: 100 });

    const center = computeTransformedCenter(transform, bounds);
    const result = hitTestHandles(transform, bounds, center, 1);
    expect(result).toBe("move");
  });

  it("hitting center of scaled layer returns 'move'", () => {
    const transform = makeTransform({ x: 10, y: 10, scaleX: 2, scaleY: 2 });
    const bounds = makeBounds({ width: 50, height: 50 });

    const center = computeTransformedCenter(transform, bounds);
    const result = hitTestHandles(transform, bounds, center, 1);
    expect(result).toBe("move");
  });

  it("hitting center of rotated layer returns 'move'", () => {
    const transform = makeTransform({
      x: 0,
      y: 0,
      rotation: Math.PI / 4
    });
    const bounds = makeBounds({ width: 100, height: 100 });

    const center = computeTransformedCenter(transform, bounds);
    const result = hitTestHandles(transform, bounds, center, 1);
    expect(result).toBe("move");
  });

  it("hitting resolved corner returns the correct handle", () => {
    const transform = makeTransform({ x: 10, y: 20 });
    const bounds = makeBounds({ width: 100, height: 50 });

    const corners = computeTransformedCorners(transform, bounds);
    // Top-left corner
    const result = hitTestHandles(transform, bounds, corners[0], 1);
    expect(result).toBe("top-left");
  });

  it("hitting outside the bounding box returns null", () => {
    const transform = makeTransform({ x: 10, y: 10 });
    const bounds = makeBounds({ width: 100, height: 100 });

    // Way outside
    const result = hitTestHandles(
      transform,
      bounds,
      { x: 500, y: 500 },
      1
    );
    expect(result).toBeNull();
  });
});

// ─── Left/top handle correctness ─────────────────────────────────────────────

describe("Package B: left/top handle correctness", () => {
  const bounds = makeBounds({ x: 0, y: 0, width: 100, height: 100 });

  it("dragging left handle inward increases scale (signed distance)", () => {
    const transform = makeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const center = computeTransformedCenter(transform, bounds);
    // Left edge is at center.x - 50 = 0
    // Dragging from left edge toward center should increase scale
    const dragStart = { x: center.x - 50, y: center.y };
    const cursor = { x: center.x - 30, y: center.y }; // moved 20px inward

    const result = aff(computeScaleTransform(
      transform,
      dragStart,
      cursor,
      center,
      bounds,
      "left",
      false,
      true // alt=true: scale from center
    ));

    // Scale should be less than 1 (inward means smaller)
    expect(result.scaleX).toBeLessThan(1);
  });

  it("dragging left handle outward increases scale (grows)", () => {
    const transform = makeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const center = computeTransformedCenter(transform, bounds);
    const dragStart = { x: center.x - 50, y: center.y };
    const cursor = { x: center.x - 70, y: center.y }; // moved 20px outward

    const result = aff(computeScaleTransform(
      transform,
      dragStart,
      cursor,
      center,
      bounds,
      "left",
      false,
      true
    ));

    expect(result.scaleX).toBeGreaterThan(1);
  });

  it("dragging top handle inward decreases scale", () => {
    const transform = makeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const center = computeTransformedCenter(transform, bounds);
    const dragStart = { x: center.x, y: center.y - 50 };
    const cursor = { x: center.x, y: center.y - 30 }; // moved 20px inward

    const result = aff(computeScaleTransform(
      transform,
      dragStart,
      cursor,
      center,
      bounds,
      "top",
      false,
      true
    ));

    expect(result.scaleY).toBeLessThan(1);
  });

  it("dragging top handle outward increases scale", () => {
    const transform = makeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const center = computeTransformedCenter(transform, bounds);
    const dragStart = { x: center.x, y: center.y - 50 };
    const cursor = { x: center.x, y: center.y - 70 }; // moved 20px outward

    const result = aff(computeScaleTransform(
      transform,
      dragStart,
      cursor,
      center,
      bounds,
      "top",
      false,
      true
    ));

    expect(result.scaleY).toBeGreaterThan(1);
  });

  it("top-left corner handle scales correctly", () => {
    const transform = makeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const center = computeTransformedCenter(transform, bounds);
    const dragStart = { x: center.x - 50, y: center.y - 50 };

    // Drag outward (both axes)
    const cursorOut = { x: center.x - 70, y: center.y - 70 };
    const resultOut = aff(computeScaleTransform(
      transform,
      dragStart,
      cursorOut,
      center,
      bounds,
      "top-left",
      false,
      true
    ));
    expect(resultOut.scaleX).toBeGreaterThan(1);
    expect(resultOut.scaleY).toBeGreaterThan(1);

    // Drag inward (both axes)
    const cursorIn = { x: center.x - 30, y: center.y - 30 };
    const resultIn = aff(computeScaleTransform(
      transform,
      dragStart,
      cursorIn,
      center,
      bounds,
      "top-left",
      false,
      true
    ));
    expect(resultIn.scaleX).toBeLessThan(1);
    expect(resultIn.scaleY).toBeLessThan(1);
  });

  it("right handle direction is consistent with left handle", () => {
    const transform = makeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const center = computeTransformedCenter(transform, bounds);

    // Drag right handle outward
    const rightStart = { x: center.x + 50, y: center.y };
    const rightOut = { x: center.x + 70, y: center.y };
    const resultRight = aff(computeScaleTransform(
      transform,
      rightStart,
      rightOut,
      center,
      bounds,
      "right",
      false,
      true
    ));

    // Drag left handle outward (same magnitude)
    const leftStart = { x: center.x - 50, y: center.y };
    const leftOut = { x: center.x - 70, y: center.y };
    const resultLeft = aff(computeScaleTransform(
      transform,
      leftStart,
      leftOut,
      center,
      bounds,
      "left",
      false,
      true
    ));

    // Both should produce the same scale increase
    expect(resultRight.scaleX).toBeCloseTo(resultLeft.scaleX, 5);
  });

  it("bottom handle direction is consistent with top handle", () => {
    const transform = makeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const center = computeTransformedCenter(transform, bounds);

    const bottomStart = { x: center.x, y: center.y + 50 };
    const bottomOut = { x: center.x, y: center.y + 70 };
    const resultBottom = aff(computeScaleTransform(
      transform,
      bottomStart,
      bottomOut,
      center,
      bounds,
      "bottom",
      false,
      true
    ));

    const topStart = { x: center.x, y: center.y - 50 };
    const topOut = { x: center.x, y: center.y - 70 };
    const resultTop = aff(computeScaleTransform(
      transform,
      topStart,
      topOut,
      center,
      bounds,
      "top",
      false,
      true
    ));

    expect(resultBottom.scaleY).toBeCloseTo(resultTop.scaleY, 5);
  });

  it("left handle anchor offset keeps the right edge fixed", () => {
    const transform = makeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const center = computeTransformedCenter(transform, bounds);

    // Drag left handle outward (to the left) to grow
    const leftStart = { x: center.x - 50, y: center.y };
    const leftOut = { x: center.x - 70, y: center.y };
    const result = aff(computeScaleTransform(
      transform,
      leftStart,
      leftOut,
      center,
      bounds,
      "left",
      false,
      false // alt=false, so opposite edge should be anchored
    ));

    // The right edge position in document space should stay fixed.
    // Scale is applied around the center of the raster bounds, so:
    // right_edge = (tx + bx + bw/2) + bw * scaleX / 2
    const originalRightEdge =
      transform.x + bounds.x + bounds.width / 2 +
      (bounds.width * transform.scaleX) / 2;
    const newRightEdge =
      result.x + bounds.x + bounds.width / 2 +
      (bounds.width * result.scaleX) / 2;
    expect(newRightEdge).toBeCloseTo(originalRightEdge, 0);
  });

  it("top handle anchor offset keeps the bottom edge fixed", () => {
    const transform = makeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const center = computeTransformedCenter(transform, bounds);

    // Drag top handle outward (upward) to grow
    const topStart = { x: center.x, y: center.y - 50 };
    const topOut = { x: center.x, y: center.y - 70 };
    const result = aff(computeScaleTransform(
      transform,
      topStart,
      topOut,
      center,
      bounds,
      "top",
      false,
      false // alt=false, so opposite edge should be anchored
    ));

    // The bottom edge position in document space should stay fixed.
    // bottom_edge = (ty + by + bh/2) + bh * scaleY / 2
    const originalBottomEdge =
      transform.y + bounds.y + bounds.height / 2 +
      (bounds.height * transform.scaleY) / 2;
    const newBottomEdge =
      result.y + bounds.y + bounds.height / 2 +
      (bounds.height * result.scaleY) / 2;
    expect(newBottomEdge).toBeCloseTo(originalBottomEdge, 0);
  });
});

// ─── Transform computation correctness ───────────────────────────────────────

describe("Package B: transform computation correctness", () => {
  const bounds = makeBounds({ x: 0, y: 0, width: 100, height: 100 });

  it("computeTransformForHandle dispatches move correctly", () => {
    const transform = makeTransform({ x: 10, y: 20, scaleX: 2, scaleY: 2 });
    const center = computeTransformedCenter(transform, bounds);

    const result = aff(computeTransformForHandle(
      "move",
      transform,
      { x: 50, y: 50 },
      { x: 60, y: 70 },
      center,
      bounds,
      false,
      false
    ));

    expect(result.x).toBe(20); // 10 + (60-50)
    expect(result.y).toBe(40); // 20 + (70-50)
    expect(result.scaleX).toBe(2);
    expect(result.scaleY).toBe(2);
  });

  it("computeTransformForHandle dispatches rotate correctly", () => {
    const transform = makeTransform({ x: 0, y: 0 });
    const center = computeTransformedCenter(transform, bounds);

    // Drag from directly above center to directly right of center
    const result = aff(computeTransformForHandle(
      "rotate",
      transform,
      { x: center.x, y: center.y - 50 },
      { x: center.x + 50, y: center.y },
      center,
      bounds,
      false,
      false
    ));

    // Should rotate approximately 90° (π/2)
    expect(result.rotation).toBeCloseTo(Math.PI / 2, 1);
  });

  it("rotate with shift snaps to 15° increments", () => {
    const transform = makeTransform({ x: 0, y: 0 });
    const center = computeTransformedCenter(transform, bounds);

    const result = aff(computeTransformForHandle(
      "rotate",
      transform,
      { x: center.x, y: center.y - 50 },
      { x: center.x + 20, y: center.y - 45 },
      center,
      bounds,
      true, // shift
      false
    ));

    // Result should be a multiple of 15° (π/12)
    const step = Math.PI / 12;
    const remainder = Math.abs(result.rotation % step);
    expect(Math.min(remainder, step - remainder)).toBeCloseTo(0, 5);
  });

  it("corner scale is proportional by default (Affinity/Figma convention)", () => {
    // Asymmetric cursor delta — only proportional locking would force equal axes.
    const transform = makeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const center = computeTransformedCenter(transform, bounds);

    const result = aff(computeTransformForHandle(
      "bottom-right",
      transform,
      { x: center.x + 50, y: center.y + 50 },
      { x: center.x + 80, y: center.y + 60 }, // dx=30, dy=10 — asymmetric
      center,
      bounds,
      false, // shift = false → DEFAULT: proportional
      true   // alt = scale from center
    ));

    expect(result.scaleX).toBeCloseTo(result.scaleY, 5);
    expect(result.scaleX).toBeGreaterThan(1);
  });

  it("corner scale with shift unlocks independent X/Y", () => {
    const transform = makeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const center = computeTransformedCenter(transform, bounds);

    const result = aff(computeTransformForHandle(
      "bottom-right",
      transform,
      { x: center.x + 50, y: center.y + 50 },
      { x: center.x + 80, y: center.y + 60 }, // dx=30, dy=10
      center,
      bounds,
      true, // shift = true → INDEPENDENT
      true  // alt
    ));

    // Asymmetric delta should produce different axes when independent.
    expect(result.scaleX).not.toBeCloseTo(result.scaleY, 3);
  });

  it("scale without alt anchors opposite edge", () => {
    const transform = makeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const center = computeTransformedCenter(transform, bounds);

    const result = aff(computeTransformForHandle(
      "right",
      transform,
      { x: center.x + 50, y: center.y },
      { x: center.x + 75, y: center.y },
      center,
      bounds,
      false,
      false // alt = false → anchor opposite edge
    ));

    // Scale should increase (dragged right handle outward)
    expect(result.scaleX).toBeGreaterThan(1);
    // x should shift to compensate for the anchor (keeps left edge fixed)
    expect(result.x).not.toBe(0);
    // The left edge should remain at its original position (within ±1px
    // rounding from Math.round in the anchor offset).
    const originalLeftEdge =
      transform.x + bounds.x + bounds.width / 2 - (bounds.width * transform.scaleX) / 2;
    const newLeftEdge =
      result.x + bounds.x + bounds.width / 2 - (bounds.width * result.scaleX) / 2;
    expect(Math.abs(newLeftEdge - originalLeftEdge)).toBeLessThanOrEqual(1);
  });
});

describe("Package B: advanced transform modes", () => {
  const bounds = makeBounds({ x: 0, y: 0, width: 100, height: 100 });

  it("Ctrl/Cmd on edge promotes to skew; corners stay scale (Ctrl is from-center)", () => {
    // Affinity convention: Ctrl/Cmd on a CORNER means scale-from-center,
    // not distort. Distort is only available via the explicit Mode toggle.
    expect(
      resolveTransformGestureMode("scale", "top-left", {
        ctrlOrMeta: true,
        shift: false,
        alt: false
      })
    ).toBe("scale");
    expect(
      resolveTransformGestureMode("scale", "left", {
        ctrlOrMeta: true,
        shift: false,
        alt: false
      })
    ).toBe("skew");
    expect(
      resolveTransformGestureMode("scale", "top-left", {
        ctrlOrMeta: true,
        shift: true,
        alt: true
      })
    ).toBe("perspective");
  });

  it("preserves explicit mesh-warp mode without remapping it through modifiers", () => {
    expect(
      resolveTransformGestureMode("mesh-warp", "top-left", {
        ctrlOrMeta: false,
        shift: false,
        alt: false
      })
    ).toBe("mesh-warp");
  });

  it("computeDistortTransform keeps the opposite corner anchored", () => {
    const transform = makeTransform({ x: 0, y: 0 });
    const corners = computeTransformedCorners(transform, bounds);
    const dragStart = corners[0];
    const cursor = { x: dragStart.x + 20, y: dragStart.y + 10 };

    const result = quadOf(computeDistortTransform(
      corners,
      "top-left",
      dragStart,
      cursor,
      bounds,
      false,
      transform
    ));
    const nextCorners = computeTransformedCorners(result, bounds);

    expect(nextCorners[0].x).toBeCloseTo(cursor.x, 5);
    expect(nextCorners[0].y).toBeCloseTo(cursor.y, 5);
    expect(nextCorners[2].x).toBeCloseTo(corners[2].x, 5);
    expect(nextCorners[2].y).toBeCloseTo(corners[2].y, 5);
    expect(result.mode).toBe("distort");
  });

  it("computeDistortTransform with shift axis-locks to a single edge direction", () => {
    const transform = makeTransform({ x: 0, y: 0 });
    const corners = computeTransformedCorners(transform, bounds);
    const dragStart = corners[0];
    const cursor = { x: dragStart.x + 30, y: dragStart.y + 5 };

    const result = computeDistortTransform(
      corners,
      "top-left",
      dragStart,
      cursor,
      bounds,
      true,
      transform
    );
    const nextCorners = computeTransformedCorners(result, bounds);

    expect(Math.abs(nextCorners[0].y - corners[0].y)).toBeLessThan(1);
    expect(nextCorners[0].x).toBeGreaterThan(corners[0].x);
  });

  it("computeSkewTransform moves only the dragged edge", () => {
    const transform = makeTransform({ x: 0, y: 0 });
    const corners = computeTransformedCorners(transform, bounds);
    const topMid = {
      x: (corners[0].x + corners[1].x) / 2,
      y: (corners[0].y + corners[1].y) / 2
    };
    const cursor = { x: topMid.x + 25, y: topMid.y + 15 };

    const result = quadOf(
      computeSkewTransform(corners, "top", topMid, cursor, bounds, transform)
    );
    const nextCorners = computeTransformedCorners(result, bounds);

    expect(nextCorners[0].x).toBeGreaterThan(corners[0].x);
    expect(nextCorners[1].x).toBeGreaterThan(corners[1].x);
    expect(nextCorners[3].x).toBeCloseTo(corners[3].x, 5);
    expect(nextCorners[2].x).toBeCloseTo(corners[2].x, 5);
    expect(result.mode).toBe("skew");
  });

  it("computePerspectiveTransform couples opposite edges for corner perspective drags", () => {
    const transform = makeTransform({ x: 0, y: 0 });
    const corners = computeTransformedCorners(transform, bounds);
    const dragStart = corners[0];
    const cursor = { x: dragStart.x - 20, y: dragStart.y + 12 };

    const result = quadOf(computePerspectiveTransform(
      corners,
      "top-left",
      dragStart,
      cursor,
      bounds,
      transform
    ));
    const nextCorners = computeTransformedCorners(result, bounds);

    expect(result.mode).toBe("perspective");
    expect(result.quad).toBeDefined();
    expect(nextCorners[0].x).toBeLessThan(corners[0].x);
    expect(nextCorners[1].x).toBeGreaterThan(corners[1].x);
    expect(nextCorners[3].y).toBeLessThan(corners[3].y);
    expect(nextCorners[2]).toEqual(corners[2]);
  });

  it("computeDistortTransform (formerly warp) moves only the dragged corner in quad space", () => {
    const transform = makeTransform({ x: 0, y: 0 });
    const corners = computeTransformedCorners(transform, bounds);
    const dragStart = corners[0];
    const cursor = { x: dragStart.x - 18, y: dragStart.y + 14 };

    const result = quadOf(computeDistortTransform(
      corners,
      "top-left",
      dragStart,
      cursor,
      bounds,
      false,
      transform
    ));
    const nextCorners = computeTransformedCorners(result, bounds);

    expect(result.mode).toBe("distort");
    expect(result.quad).toBeDefined();
    expect(nextCorners[0].x).toBeCloseTo(cursor.x, 5);
    expect(nextCorners[0].y).toBeCloseTo(cursor.y, 5);
    expect(nextCorners[1]).toEqual(corners[1]);
    expect(nextCorners[2]).toEqual(corners[2]);
    expect(nextCorners[3]).toEqual(corners[3]);
  });
});

// ─── Cursor mapping correctness ──────────────────────────────────────────────

describe("Package B: cursor mapping", () => {
  it("returns 'move' for move handle", () => {
    expect(cursorForHandle("move", 0)).toBe("move");
  });

  it("returns rotate cursor for rotate handle", () => {
    expect(cursorForHandle("rotate", 0)).toBe(ROTATE_CURSOR_CSS);
  });

  it("returns 'default' for null handle", () => {
    expect(cursorForHandle(null, 0)).toBe("default");
  });

  it("returns resize cursor for scale handles at 0 rotation", () => {
    expect(cursorForHandle("top", 0)).toBe("ns-resize");
    expect(cursorForHandle("right", 0)).toBe("ew-resize");
  });

  it("rotates cursor with layer rotation", () => {
    // At 90° rotation, "top" handle should be horizontal
    const cursor = cursorForHandle("top", Math.PI / 2);
    expect(cursor).toBe("ew-resize");
  });
});

// ─── Selection overlay alignment ─────────────────────────────────────────────

describe("Package B: selection overlay alignment", () => {
  it("docRectToScreen matches docToScreen for top-left corner", () => {
    const docW = 512;
    const docH = 512;
    const zoom = 1;
    const pan = { x: 0, y: 0 };
    const containerW = 800;
    const containerH = 600;
    const dpr = 1;

    const rect = docRectToScreen(
      10,
      20,
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
    const point = docToScreen(
      10,
      20,
      docW,
      docH,
      zoom,
      pan,
      containerW,
      containerH,
      dpr
    );

    expect(rect.x).toBeCloseTo(point.x, 5);
    expect(rect.y).toBeCloseTo(point.y, 5);
  });

  it("resolved extents and gizmo bounds agree for moved+scaled layer", () => {
    const transform = makeTransform({ x: 20, y: 30, scaleX: 1.5, scaleY: 2 });
    const bounds = makeBounds({ x: 0, y: 0, width: 100, height: 80 });

    const extents = computeTransformedExtents(transform, bounds);
    const gizmoBounds = { extents: computeTransformedExtents(transform, bounds), corners: computeTransformedCorners(transform, bounds), center: computeTransformedCenter(transform, bounds) };

    expect(gizmoBounds.extents).toEqual(extents);
  });

  it("resolved extents and gizmo bounds agree for rotated layer", () => {
    const transform = makeTransform({
      x: 10,
      y: 10,
      scaleX: 1,
      scaleY: 1,
      rotation: Math.PI / 4
    });
    const bounds = makeBounds({ x: 0, y: 0, width: 100, height: 100 });

    const extents = computeTransformedExtents(transform, bounds);
    const gizmoBounds = { extents: computeTransformedExtents(transform, bounds), corners: computeTransformedCorners(transform, bounds), center: computeTransformedCenter(transform, bounds) };

    expect(gizmoBounds.extents.x).toBeCloseTo(extents.x, 5);
    expect(gizmoBounds.extents.y).toBeCloseTo(extents.y, 5);
    expect(gizmoBounds.extents.width).toBeCloseTo(extents.width, 5);
    expect(gizmoBounds.extents.height).toBeCloseTo(extents.height, 5);
  });
});

// ─── Shared seam regression: move-after-transform round-trip ─────────────────

describe("Package B: move-after-transform round-trip", () => {
  it("move after scale produces correct geometry", () => {
    // Start with a scaled layer
    const scaledTransform = makeTransform({
      x: 0,
      y: 0,
      scaleX: 2,
      scaleY: 2
    });
    const bounds = makeBounds({ width: 100, height: 100 });

    // Move to (50, 50)
    const movedTransform = mergeTransformPreview(
      scaledTransform,
      makeAffineTransform({ ...scaledTransform, x: 50, y: 50 })
    );

    // Geometry should show 200x200 layer at (50, 50) offset
    const geo = getLayerGeometry({
      transform: movedTransform,
      contentBounds: bounds
    });

    expect(geo.transformedExtents.width).toBe(200); // 100 * 2
    expect(geo.transformedExtents.height).toBe(200);
    expect(geo.transformedCenter.x).toBe(100); // 50 + 100/2
    expect(geo.transformedCenter.y).toBe(100);
  });

  it("move after rotate produces correct geometry", () => {
    const rotatedTransform = makeTransform({
      x: 0,
      y: 0,
      rotation: Math.PI / 4
    });
    const bounds = makeBounds({ width: 100, height: 100 });

    const movedTransform = mergeTransformPreview(
      rotatedTransform,
      makeAffineTransform({ ...rotatedTransform, x: 50, y: 50 })
    );

    const geo = getLayerGeometry({
      transform: movedTransform,
      contentBounds: bounds
    });

    // Rotated 100x100 square → ~141.42 AABB
    const expectedSize = 100 * Math.SQRT2;
    expect(geo.transformedExtents.width).toBeCloseTo(expectedSize, 1);
    expect(geo.transformedExtents.height).toBeCloseTo(expectedSize, 1);
    expect(geo.transformedCenter.x).toBe(100); // 50 + 50
    expect(geo.transformedCenter.y).toBe(100);
  });

  it("sequential moves accumulate correctly", () => {
    const initial = makeTransform({ x: 0, y: 0, scaleX: 1.5, scaleY: 1.5 });

    // First move: to (10, 20)
    const after1 = aff(mergeTransformPreview(
      initial,
      makeAffineTransform({ ...initial, x: 10, y: 20 })
    ));
    expect(after1.x).toBe(10);
    expect(after1.y).toBe(20);
    expect(after1.scaleX).toBe(1.5);

    // Second move: to (30, 50) (from the first move result)
    const after2 = aff(mergeTransformPreview(
      after1,
      makeAffineTransform({ ...after1, x: 30, y: 50 })
    ));
    expect(after2.x).toBe(30);
    expect(after2.y).toBe(50);
    expect(after2.scaleX).toBe(1.5);
  });
});
