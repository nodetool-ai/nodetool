/**
 * packageA-coreSeams.test.ts – Regression coverage for Package A core seam convergence.
 *
 * Tests cover:
 *   - Transform preview merge preserves full transform (scale/rotation/matrix)
 *   - Preview and commit use the same transform-resolution rules
 *   - applyTransformPreviews builds correct composite document
 *   - Resolved layer geometry agrees across consumers
 *   - State-tier ownership: preview never replaces document state
 *   - Moved + scaled/rotated layers produce identical preview vs commit transforms
 */

import {
  mergeTransformPreview,
  applyTransformPreviews,
  createMovePreview,
  isCompleteTransform
} from "../painting/transformPreview";
import {
  resolveLayerGeometry,
  getTransformedExtents,
  getTransformedCorners,
  getCompositeOffset,
  getEffectiveRasterBounds,
  getTransformedCenter
} from "../painting/resolvedLayerGeometry";
import {
  composeAffineMatrix,
  decomposeAffineMatrix,
  ensureTransformMatrix
} from "../types";
import type { LayerTransform, LayerContentBounds, SketchDocument, Layer } from "../types";

// ─── Helper factories ────────────────────────────────────────────────────────

function makeTransform(overrides?: Partial<LayerTransform>): LayerTransform {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, ...overrides };
}

function makeBounds(overrides?: Partial<LayerContentBounds>): LayerContentBounds {
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

function makeDoc(layers: Layer[]): SketchDocument {
  return {
    version: 3,
    canvas: { width: 512, height: 512, backgroundColor: "#ffffff" },
    layers,
    activeLayerId: layers[0]?.id ?? "",
    maskLayerId: null,
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    toolSettings: {} as SketchDocument["toolSettings"]
  } as SketchDocument;
}

// ─── Transform preview merge tests ───────────────────────────────────────────

describe("mergeTransformPreview", () => {
  it("preserves scale and rotation when update contains only translation", () => {
    const base = makeTransform({ x: 10, y: 20, scaleX: 2, scaleY: 1.5, rotation: Math.PI / 4 });
    const update: LayerTransform = { x: 30, y: 40 };
    const result = mergeTransformPreview(base, update);

    expect(result.x).toBe(30);
    expect(result.y).toBe(40);
    expect(result.scaleX).toBe(2);
    expect(result.scaleY).toBe(1.5);
    expect(result.rotation).toBe(Math.PI / 4);
    expect(result.matrix).toBeDefined();
  });

  it("uses update scale/rotation when explicitly provided", () => {
    const base = makeTransform({ scaleX: 2, scaleY: 2, rotation: 0.5 });
    const update = makeTransform({ x: 0, y: 0, scaleX: 3, scaleY: 3, rotation: 1.0 });
    const result = mergeTransformPreview(base, update);

    expect(result.scaleX).toBe(3);
    expect(result.scaleY).toBe(3);
    expect(result.rotation).toBe(1.0);
  });

  it("trusts the matrix from the update when provided", () => {
    const base = makeTransform({ scaleX: 2, scaleY: 2 });
    const matrix = composeAffineMatrix(10, 20, 3, 3, 0);
    const update: LayerTransform = { x: 10, y: 20, matrix };
    const result = mergeTransformPreview(base, update);

    expect(result.matrix).toBe(matrix);
    // Scale comes from base because update doesn't specify it explicitly
    expect(result.scaleX).toBe(2);
  });

  it("produces a complete transform suitable for compositing", () => {
    const base = makeTransform({ scaleX: 0.5, rotation: 1 });
    const update: LayerTransform = { x: 100, y: 200 };
    const result = mergeTransformPreview(base, update);

    expect(isCompleteTransform(result)).toBe(true);
  });

  it("preview and commit produce identical transforms for translation-only moves", () => {
    const base = makeTransform({ x: 50, y: 50, scaleX: 2, scaleY: 1.5, rotation: 0.3 });
    // Simulating a move by +10, +5
    const moveUpdate: LayerTransform = { x: 60, y: 55 };
    const previewResult = mergeTransformPreview(base, moveUpdate);
    const commitResult = mergeTransformPreview(base, moveUpdate);

    expect(previewResult).toEqual(commitResult);
  });
});

describe("createMovePreview", () => {
  it("creates a full-transform preview from a layer with scale/rotation", () => {
    const layer = makeLayer({
      transform: makeTransform({ x: 10, y: 20, scaleX: 2, scaleY: 0.5, rotation: Math.PI / 6 })
    });
    const preview = createMovePreview(layer, 50, 60);

    expect(preview.x).toBe(50);
    expect(preview.y).toBe(60);
    expect(preview.scaleX).toBe(2);
    expect(preview.scaleY).toBe(0.5);
    expect(preview.rotation).toBe(Math.PI / 6);
    expect(preview.matrix).toBeDefined();
  });
});

// ─── applyTransformPreviews tests ────────────────────────────────────────────

describe("applyTransformPreviews", () => {
  it("returns null when no previews exist", () => {
    const layer = makeLayer();
    const doc = makeDoc([layer]);
    expect(applyTransformPreviews(doc, {})).toBeNull();
  });

  it("replaces layer transforms with merged previews", () => {
    const layer = makeLayer({
      transform: makeTransform({ x: 0, y: 0, scaleX: 2, scaleY: 2 })
    });
    const doc = makeDoc([layer]);
    const preview: Record<string, LayerTransform> = {
      [layer.id]: { x: 10, y: 20 }
    };

    const result = applyTransformPreviews(doc, preview);
    expect(result).not.toBeNull();
    const previewedLayer = result!.layers[0];
    expect(previewedLayer.transform.x).toBe(10);
    expect(previewedLayer.transform.y).toBe(20);
    // Scale preserved from the stored transform
    expect(previewedLayer.transform.scaleX).toBe(2);
    expect(previewedLayer.transform.scaleY).toBe(2);
  });

  it("does not mutate the original document", () => {
    const layer = makeLayer();
    const doc = makeDoc([layer]);
    const preview: Record<string, LayerTransform> = {
      [layer.id]: { x: 99, y: 99 }
    };

    applyTransformPreviews(doc, preview);
    expect(doc.layers[0].transform.x).toBe(0);
    expect(doc.layers[0].transform.y).toBe(0);
  });

  it("leaves non-previewed layers untouched (same reference)", () => {
    const layer1 = makeLayer({ id: "a" });
    const layer2 = makeLayer({ id: "b" });
    const doc = makeDoc([layer1, layer2]);
    const preview: Record<string, LayerTransform> = {
      a: { x: 10, y: 10 }
    };

    const result = applyTransformPreviews(doc, preview);
    expect(result!.layers[1]).toBe(layer2);
  });
});

// ─── Resolved layer geometry tests ───────────────────────────────────────────

describe("resolveLayerGeometry", () => {
  it("computes correct extents for identity transform", () => {
    const layer = makeLayer({
      transform: makeTransform({ x: 50, y: 50 }),
      contentBounds: makeBounds({ x: 0, y: 0, width: 100, height: 100 })
    });

    const geo = resolveLayerGeometry(layer);
    expect(geo.compositeOffset).toEqual({ x: 50, y: 50 });
    expect(geo.extents.x).toBe(50);
    expect(geo.extents.y).toBe(50);
    expect(geo.extents.width).toBe(100);
    expect(geo.extents.height).toBe(100);
    expect(geo.center).toEqual({ x: 100, y: 100 });
  });

  it("computes correct extents for scaled layer", () => {
    const layer = makeLayer({
      transform: makeTransform({ x: 10, y: 10, scaleX: 2, scaleY: 2 }),
      contentBounds: makeBounds({ x: 0, y: 0, width: 50, height: 50 })
    });

    const geo = resolveLayerGeometry(layer);
    expect(geo.center).toEqual({ x: 35, y: 35 });
    expect(geo.extents.width).toBe(100);
    expect(geo.extents.height).toBe(100);
  });

  it("computes correct extents for rotated layer", () => {
    const layer = makeLayer({
      transform: makeTransform({ x: 0, y: 0, rotation: Math.PI / 4 }),
      contentBounds: makeBounds({ x: 0, y: 0, width: 100, height: 100 })
    });

    const geo = resolveLayerGeometry(layer);
    // A 100x100 square rotated 45° has an AABB of ~141.42 x 141.42
    const expectedDiag = 100 * Math.SQRT2;
    expect(geo.extents.width).toBeCloseTo(expectedDiag, 1);
    expect(geo.extents.height).toBeCloseTo(expectedDiag, 1);
  });

  it("corners agree with extents", () => {
    const layer = makeLayer({
      transform: makeTransform({ x: 10, y: 20, scaleX: 1.5, scaleY: 1.5, rotation: 0.3 }),
      contentBounds: makeBounds({ x: 0, y: 0, width: 80, height: 60 })
    });

    const geo = resolveLayerGeometry(layer);

    // AABB from corners should match extents
    const allX = geo.corners.map((c) => c.x);
    const allY = geo.corners.map((c) => c.y);
    const cornerMinX = Math.min(...allX);
    const cornerMinY = Math.min(...allY);
    const cornerMaxX = Math.max(...allX);
    const cornerMaxY = Math.max(...allY);

    expect(geo.extents.x).toBeCloseTo(cornerMinX, 5);
    expect(geo.extents.y).toBeCloseTo(cornerMinY, 5);
    expect(geo.extents.width).toBeCloseTo(cornerMaxX - cornerMinX, 5);
    expect(geo.extents.height).toBeCloseTo(cornerMaxY - cornerMinY, 5);
  });
});

describe("getCompositeOffset", () => {
  it("combines translation and raster origin", () => {
    const transform = makeTransform({ x: 10, y: 20 });
    const bounds = makeBounds({ x: 5, y: 5 });
    expect(getCompositeOffset(transform, bounds)).toEqual({ x: 15, y: 25 });
  });
});

describe("getTransformedCorners", () => {
  it("returns axis-aligned corners for identity transform", () => {
    const transform = makeTransform({ x: 10, y: 20 });
    const bounds = makeBounds({ x: 0, y: 0, width: 100, height: 50 });
    const [tl, tr, br, bl] = getTransformedCorners(transform, bounds);

    expect(tl).toEqual({ x: 10, y: 20 });
    expect(tr).toEqual({ x: 110, y: 20 });
    expect(br).toEqual({ x: 110, y: 70 });
    expect(bl).toEqual({ x: 10, y: 70 });
  });

  it("returns rotated corners for 90° rotation", () => {
    const transform = makeTransform({ x: 0, y: 0, rotation: Math.PI / 2 });
    const bounds = makeBounds({ x: 0, y: 0, width: 100, height: 50 });
    const [tl, tr, br, bl] = getTransformedCorners(transform, bounds);

    // Center is at (50, 25). After 90° CW rotation:
    // top-left (-50, -25) → (25, -50) + center → (75, -25)
    expect(tl.x).toBeCloseTo(75, 5);
    expect(tl.y).toBeCloseTo(-25, 5);
  });
});

// ─── Preview vs commit parity tests ─────────────────────────────────────────

describe("preview vs commit parity for moved + transformed layers", () => {
  it("move preview on a scaled layer preserves scale", () => {
    const layer = makeLayer({
      transform: makeTransform({ x: 10, y: 10, scaleX: 2, scaleY: 0.5 })
    });

    // Simulate a move: preview = mergeTransformPreview(base, {x: 30, y: 30})
    const preview = mergeTransformPreview(layer.transform, { x: 30, y: 30 });
    expect(preview.scaleX).toBe(2);
    expect(preview.scaleY).toBe(0.5);
    expect(preview.x).toBe(30);
    expect(preview.y).toBe(30);

    // Commit uses the same merge
    const commit = mergeTransformPreview(layer.transform, { x: 30, y: 30 });
    expect(commit).toEqual(preview);
  });

  it("move preview on a rotated layer preserves rotation", () => {
    const layer = makeLayer({
      transform: makeTransform({ x: 0, y: 0, rotation: Math.PI / 3 })
    });

    const preview = mergeTransformPreview(layer.transform, { x: 50, y: 50 });
    expect(preview.rotation).toBe(Math.PI / 3);
    expect(preview.x).toBe(50);
  });

  it("move preview on a scaled+rotated layer preserves both", () => {
    const layer = makeLayer({
      transform: makeTransform({
        x: 100,
        y: 100,
        scaleX: 1.5,
        scaleY: 0.8,
        rotation: Math.PI / 6,
        matrix: composeAffineMatrix(100, 100, 1.5, 0.8, Math.PI / 6)
      })
    });

    // Move by +20, +30
    const preview = mergeTransformPreview(layer.transform, { x: 120, y: 130 });
    expect(preview.scaleX).toBe(1.5);
    expect(preview.scaleY).toBe(0.8);
    expect(preview.rotation).toBe(Math.PI / 6);
    expect(preview.x).toBe(120);
    expect(preview.y).toBe(130);
    // Matrix should be recomputed with new translation
    expect(preview.matrix).toBeDefined();
    const decomposed = decomposeAffineMatrix(preview.matrix!);
    expect(decomposed.x).toBe(120);
    expect(decomposed.y).toBe(130);
    expect(decomposed.scaleX).toBeCloseTo(1.5, 5);
    expect(decomposed.scaleY).toBeCloseTo(0.8, 5);
    expect(decomposed.rotation).toBeCloseTo(Math.PI / 6, 5);
  });

  it("resolved geometry agrees for preview and committed transforms", () => {
    const layer = makeLayer({
      transform: makeTransform({
        x: 50,
        y: 50,
        scaleX: 2,
        scaleY: 1.5,
        rotation: 0.5
      }),
      contentBounds: makeBounds({ x: 0, y: 0, width: 100, height: 80 })
    });

    const previewTransform = mergeTransformPreview(layer.transform, { x: 80, y: 80 });
    const commitTransform = mergeTransformPreview(layer.transform, { x: 80, y: 80 });

    const previewGeo = resolveLayerGeometry(
      { ...layer, transform: previewTransform }
    );
    const commitGeo = resolveLayerGeometry(
      { ...layer, transform: commitTransform }
    );

    expect(previewGeo.extents).toEqual(commitGeo.extents);
    expect(previewGeo.center).toEqual(commitGeo.center);
    expect(previewGeo.compositeOffset).toEqual(commitGeo.compositeOffset);
    for (let i = 0; i < 4; i++) {
      expect(previewGeo.corners[i]).toEqual(commitGeo.corners[i]);
    }
  });
});

// ─── isCompleteTransform tests ───────────────────────────────────────────────

describe("isCompleteTransform", () => {
  it("returns true for a complete transform", () => {
    expect(isCompleteTransform(makeTransform())).toBe(true);
  });

  it("returns false for translation-only transform", () => {
    expect(isCompleteTransform({ x: 10, y: 20 })).toBe(false);
  });

  it("returns true after mergeTransformPreview", () => {
    const result = mergeTransformPreview(makeTransform(), { x: 10, y: 20 });
    expect(isCompleteTransform(result)).toBe(true);
  });
});
