/**
 * Tests for Phase 4A: Affine Matrix helpers and CoordinateMapper matrix support.
 */

import {
  composeAffineMatrix,
  decomposeAffineMatrix,
  ensureTransformMatrix,
  isIdentityTransform,
  IDENTITY_MATRIX,
  type AffineMatrix,
  type LayerTransform
} from "../types";
import { CoordinateMapper } from "../painting/CoordinateMapper";

// ─── composeAffineMatrix ────────────────────────────────────────────────────

describe("composeAffineMatrix", () => {
  it("returns identity for zero translate, unit scale, no rotation", () => {
    const m = composeAffineMatrix(0, 0, 1, 1, 0);
    expect(m[0]).toBeCloseTo(1);
    expect(m[1]).toBeCloseTo(0);
    expect(m[2]).toBeCloseTo(0);
    expect(m[3]).toBeCloseTo(1);
    expect(m[4]).toBe(0);
    expect(m[5]).toBe(0);
  });

  it("encodes translation in e and f", () => {
    const m = composeAffineMatrix(10, -5, 1, 1, 0);
    expect(m[4]).toBe(10);
    expect(m[5]).toBe(-5);
  });

  it("encodes scale in a and d for zero rotation", () => {
    const m = composeAffineMatrix(0, 0, 2, 3, 0);
    expect(m[0]).toBeCloseTo(2);
    expect(m[3]).toBeCloseTo(3);
  });

  it("encodes 90° rotation correctly", () => {
    const m = composeAffineMatrix(0, 0, 1, 1, Math.PI / 2);
    // cos(90°)≈0, sin(90°)≈1
    expect(m[0]).toBeCloseTo(0);   // a = cos*sx
    expect(m[1]).toBeCloseTo(1);   // b = sin*sx
    expect(m[2]).toBeCloseTo(-1);  // c = -sin*sy
    expect(m[3]).toBeCloseTo(0);   // d = cos*sy
  });

  it("combines translate, scale, and rotation", () => {
    const m = composeAffineMatrix(5, 10, 2, 1.5, 0.5);
    const cos = Math.cos(0.5);
    const sin = Math.sin(0.5);
    expect(m[0]).toBeCloseTo(cos * 2);
    expect(m[1]).toBeCloseTo(sin * 2);
    expect(m[2]).toBeCloseTo(-sin * 1.5);
    expect(m[3]).toBeCloseTo(cos * 1.5);
    expect(m[4]).toBe(5);
    expect(m[5]).toBe(10);
  });
});

// ─── decomposeAffineMatrix ──────────────────────────────────────────────────

describe("decomposeAffineMatrix", () => {
  it("decomposes identity matrix", () => {
    const result = decomposeAffineMatrix([...IDENTITY_MATRIX] as AffineMatrix);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.scaleX).toBeCloseTo(1);
    expect(result.scaleY).toBeCloseTo(1);
    expect(result.rotation).toBeCloseTo(0);
  });

  it("decomposes pure translation", () => {
    const result = decomposeAffineMatrix([1, 0, 0, 1, 42, -17]);
    expect(result.x).toBe(42);
    expect(result.y).toBe(-17);
    expect(result.scaleX).toBeCloseTo(1);
    expect(result.scaleY).toBeCloseTo(1);
    expect(result.rotation).toBeCloseTo(0);
  });

  it("round-trips compose → decompose", () => {
    const cases = [
      { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      { x: 10, y: -5, scaleX: 2, scaleY: 3, rotation: 0 },
      { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: Math.PI / 4 },
      { x: 5, y: 10, scaleX: 2, scaleY: 1.5, rotation: 0.5 },
      { x: -3, y: 7, scaleX: 0.5, scaleY: 2, rotation: -1.2 }
    ];

    for (const c of cases) {
      const m = composeAffineMatrix(c.x, c.y, c.scaleX, c.scaleY, c.rotation);
      const d = decomposeAffineMatrix(m);
      expect(d.x).toBeCloseTo(c.x, 5);
      expect(d.y).toBeCloseTo(c.y, 5);
      expect(d.scaleX).toBeCloseTo(c.scaleX, 5);
      expect(d.scaleY).toBeCloseTo(c.scaleY, 5);
      expect(d.rotation).toBeCloseTo(c.rotation, 5);
    }
  });
});

// ─── isIdentityTransform ────────────────────────────────────────────────────

describe("isIdentityTransform", () => {
  it("returns true for { x: 0, y: 0 }", () => {
    expect(isIdentityTransform({ x: 0, y: 0 })).toBe(true);
  });

  it("returns true when optional fields are default", () => {
    expect(
      isIdentityTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })
    ).toBe(true);
  });

  it("returns false for non-zero translate", () => {
    expect(isIdentityTransform({ x: 5, y: 0 })).toBe(false);
  });

  it("returns false for non-unit scale", () => {
    expect(isIdentityTransform({ x: 0, y: 0, scaleX: 2 })).toBe(false);
  });

  it("returns false for non-zero rotation", () => {
    expect(isIdentityTransform({ x: 0, y: 0, rotation: 0.1 })).toBe(false);
  });
});

// ─── ensureTransformMatrix ──────────────────────────────────────────────────

describe("ensureTransformMatrix", () => {
  it("adds matrix to transform without one", () => {
    const t: LayerTransform = { x: 5, y: 10 };
    const result = ensureTransformMatrix(t);
    expect(result.matrix).toBeDefined();
    expect(result.matrix![4]).toBe(5);
    expect(result.matrix![5]).toBe(10);
  });

  it("preserves existing matrix", () => {
    const m: AffineMatrix = [2, 0, 0, 3, 5, 10];
    const t: LayerTransform = { x: 5, y: 10, matrix: m };
    const result = ensureTransformMatrix(t);
    expect(result.matrix).toBe(m); // same reference
  });

  it("generates correct matrix for translate + scale + rotation", () => {
    const t: LayerTransform = { x: 5, y: 10, scaleX: 2, scaleY: 1.5, rotation: 0.5 };
    const result = ensureTransformMatrix(t);
    const expected = composeAffineMatrix(5, 10, 2, 1.5, 0.5);
    expect(result.matrix).toEqual(expected);
  });
});

// ─── CoordinateMapper with matrix ───────────────────────────────────────────

describe("CoordinateMapper with matrix", () => {
  it("docToLayer with translation-only matrix matches translation-only fallback", () => {
    const transform: LayerTransform = {
      x: 10,
      y: 20,
      matrix: composeAffineMatrix(10, 20, 1, 1, 0)
    };

    const withMatrix = new CoordinateMapper({
      layerTransform: transform
    });
    const withoutMatrix = new CoordinateMapper({
      layerTransform: { x: 10, y: 20 }
    });

    const doc = { x: 50, y: 60 };
    const a = withMatrix.docToLayer(doc);
    const b = withoutMatrix.docToLayer(doc);
    expect(a.x).toBeCloseTo(b.x);
    expect(a.y).toBeCloseTo(b.y);
  });

  it("layerToDoc with translation-only matrix matches translation-only fallback", () => {
    const transform: LayerTransform = {
      x: 10,
      y: 20,
      matrix: composeAffineMatrix(10, 20, 1, 1, 0)
    };

    const mapper = new CoordinateMapper({ layerTransform: transform });
    const result = mapper.layerToDoc({ x: 5, y: 8 });
    expect(result.x).toBeCloseTo(15);
    expect(result.y).toBeCloseTo(28);
  });

  it("docToLayer → layerToDoc round-trips with scaled matrix", () => {
    const transform: LayerTransform = {
      x: 5,
      y: 10,
      scaleX: 2,
      scaleY: 3,
      matrix: composeAffineMatrix(5, 10, 2, 3, 0)
    };

    const mapper = new CoordinateMapper({ layerTransform: transform });
    const original = { x: 30, y: 40 };
    const layerPt = mapper.docToLayer(original);
    const roundTrip = mapper.layerToDoc(layerPt);
    expect(roundTrip.x).toBeCloseTo(original.x);
    expect(roundTrip.y).toBeCloseTo(original.y);
  });

  it("docToLayer → layerToDoc round-trips with rotated matrix", () => {
    const transform: LayerTransform = {
      x: 0,
      y: 0,
      rotation: Math.PI / 4,
      matrix: composeAffineMatrix(0, 0, 1, 1, Math.PI / 4)
    };

    const mapper = new CoordinateMapper({ layerTransform: transform });
    const original = { x: 10, y: 0 };
    const layerPt = mapper.docToLayer(original);
    const roundTrip = mapper.layerToDoc(layerPt);
    expect(roundTrip.x).toBeCloseTo(original.x);
    expect(roundTrip.y).toBeCloseTo(original.y);
  });

  it("docToLayer → layerToDoc round-trips with full TRS matrix", () => {
    const transform: LayerTransform = {
      x: 5,
      y: 10,
      scaleX: 2,
      scaleY: 1.5,
      rotation: 0.5,
      matrix: composeAffineMatrix(5, 10, 2, 1.5, 0.5)
    };

    const mapper = new CoordinateMapper({ layerTransform: transform });
    const original = { x: 30, y: 40 };
    const layerPt = mapper.docToLayer(original);
    const roundTrip = mapper.layerToDoc(layerPt);
    expect(roundTrip.x).toBeCloseTo(original.x, 5);
    expect(roundTrip.y).toBeCloseTo(original.y, 5);
  });

  it("handles rasterBounds with matrix", () => {
    const transform: LayerTransform = {
      x: 10,
      y: 20,
      matrix: composeAffineMatrix(10, 20, 1, 1, 0)
    };

    const mapper = new CoordinateMapper({
      layerTransform: transform,
      rasterBounds: { x: -5, y: -8 }
    });

    // docToLayer should apply inverse matrix then subtract rasterBounds
    const result = mapper.docToLayer({ x: 10, y: 20 });
    // Inverse of translate(10,20) applied to (10,20) = (0,0), minus rasterBounds(-5,-8) = (5, 8)
    expect(result.x).toBeCloseTo(5);
    expect(result.y).toBeCloseTo(8);
  });
});
