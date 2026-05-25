/**
 * Phase 1.4 – Harden coordinate mapping.
 *
 * Regression tests for CoordinateMapper that complement the existing
 * affineMatrix.test.ts suite. Each section maps to a specific scenario
 * listed in SKETCH_FEATURES.md Phase 1.4.
 */

import { CoordinateMapper } from "../painting/CoordinateMapper";
import { makeAffineTransform } from "../types";
import { getLayerGeometry } from "../transform/geometry/layerGeometry";

// ─── 1. Round-trip identity: translation-only ───────────────────────────────

describe("round-trip identity – translation only", () => {
  it("docToLayer → layerToDoc returns the original point", () => {
    const mapper = new CoordinateMapper({
      layerTransform: makeAffineTransform({ x: 42, y: -17 })
    });

    const original = { x: 100, y: 200 };
    const roundTrip = mapper.layerToDoc(mapper.docToLayer(original));

    expect(roundTrip.x).toBeCloseTo(original.x, 10);
    expect(roundTrip.y).toBeCloseTo(original.y, 10);
  });

  it("layerToDoc → docToLayer returns the original point", () => {
    const mapper = new CoordinateMapper({
      layerTransform: makeAffineTransform({ x: -10, y: 55 })
    });

    const original = { x: 7, y: -3 };
    const roundTrip = mapper.docToLayer(mapper.layerToDoc(original));

    expect(roundTrip.x).toBeCloseTo(original.x, 10);
    expect(roundTrip.y).toBeCloseTo(original.y, 10);
  });
});

// ─── 2. Round-trip identity: scale + rotation ───────────────────────────────

describe("round-trip identity – scale + rotation", () => {
  const cases = [
    { label: "2× scale + 45° rotation", sx: 2, sy: 2, rot: Math.PI / 4 },
    { label: "non-uniform scale + 30°", sx: 0.5, sy: 3, rot: Math.PI / 6 },
    { label: "negative scale + 120°", sx: -1, sy: 2, rot: (2 * Math.PI) / 3 }
  ];

  it.each(cases)("$label", ({ sx, sy, rot }) => {
    const mapper = new CoordinateMapper({
      layerTransform: makeAffineTransform({
        scaleX: sx,
        scaleY: sy,
        rotation: rot
      })
    });

    const original = { x: 37, y: -19 };
    const roundTrip = mapper.layerToDoc(mapper.docToLayer(original));

    expect(roundTrip.x).toBeCloseTo(original.x, 5);
    expect(roundTrip.y).toBeCloseTo(original.y, 5);
  });
});

// ─── 3. Round-trip identity: full affine (translate + scale + rotation) ─────

describe("round-trip identity – full affine", () => {
  const cases = [
    { x: 10, y: 20, sx: 2, sy: 1.5, rot: 0.7 },
    { x: -50, y: 100, sx: 0.3, sy: 4, rot: -1.1 },
    { x: 0.5, y: -0.5, sx: 1, sy: 1, rot: Math.PI }
  ];

  it.each(cases)(
    "translate($x,$y) scale($sx,$sy) rotate($rot)",
    ({ x, y, sx, sy, rot }) => {
      const mapper = new CoordinateMapper({
        layerTransform: makeAffineTransform({
          x,
          y,
          scaleX: sx,
          scaleY: sy,
          rotation: rot
        })
      });

      const original = { x: 55, y: -42 };
      const roundTrip = mapper.layerToDoc(mapper.docToLayer(original));

      expect(roundTrip.x).toBeCloseTo(original.x, 5);
      expect(roundTrip.y).toBeCloseTo(original.y, 5);
    }
  );

  it("round-trips with rasterBounds", () => {
    const mapper = new CoordinateMapper({
      layerTransform: makeAffineTransform({
        x: 10,
        y: 20,
        scaleX: 2,
        scaleY: 1.5,
        rotation: 0.5
      }),
      rasterBounds: { x: -5, y: -8 }
    });

    const original = { x: 77, y: 33 };
    const roundTrip = mapper.layerToDoc(mapper.docToLayer(original));

    expect(roundTrip.x).toBeCloseTo(original.x, 5);
    expect(roundTrip.y).toBeCloseTo(original.y, 5);
  });
});

// ─── 4. offset getter matches docToLayer({0,0}) negation ────────────────────

describe("offset getter matches -docToLayer(origin)", () => {
  it("translation-only mapper", () => {
    const mapper = new CoordinateMapper({
      layerTransform: makeAffineTransform({ x: 15, y: -30 })
    });

    const origin = mapper.docToLayer({ x: 0, y: 0 });
    const offset = mapper.offset;

    expect(offset.x).toBeCloseTo(-origin.x, 10);
    expect(offset.y).toBeCloseTo(-origin.y, 10);
  });

  it("translation-only with rasterBounds", () => {
    const mapper = new CoordinateMapper({
      layerTransform: makeAffineTransform({ x: 10, y: 20 }),
      rasterBounds: { x: -3, y: -7 }
    });

    const origin = mapper.docToLayer({ x: 0, y: 0 });
    const offset = mapper.offset;

    expect(offset.x).toBeCloseTo(-origin.x, 10);
    expect(offset.y).toBeCloseTo(-origin.y, 10);
  });
});

// ─── 5. Singular matrix fallback returns identity ───────────────────────────

describe("singular matrix fallback", () => {
  it("zero-determinant matrix does not produce NaN or Infinity", () => {
    // scaleX=0, scaleY=0 → determinant = 0 (CoordinateMapper derives matrix
    // from the affine fields and falls back to identity-inverse on singular).
    const mapper = new CoordinateMapper({
      layerTransform: makeAffineTransform({
        x: 10,
        y: 20,
        scaleX: 0,
        scaleY: 0
      })
    });

    const result = mapper.docToLayer({ x: 50, y: 60 });

    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });

  it("near-zero determinant also triggers fallback", () => {
    const eps = 1e-14;
    const mapper = new CoordinateMapper({
      layerTransform: makeAffineTransform({
        scaleX: eps,
        scaleY: eps
      })
    });

    const result = mapper.docToLayer({ x: 100, y: 200 });

    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});

// ─── 6. dirtyToDoc consistency with getLayerCompositeOffset ─────────────────

describe("dirtyToDoc consistency with layer composite offset", () => {
  it("offset used in dirtyToDoc matches layer composite offset", () => {
    const tx = 15;
    const ty = -25;
    const cbx = -5;
    const cby = -8;

    const layer = {
      transform: makeAffineTransform({ x: tx, y: ty }),
      contentBounds: { x: cbx, y: cby, width: 100, height: 100 }
    };

    const compositeOffset = getLayerGeometry(layer).compositeOffset;

    const mapper = new CoordinateMapper({
      layerTransform: makeAffineTransform({ x: tx, y: ty }),
      rasterBounds: { x: cbx, y: cby }
    });

    const dirtyRect = { minX: 0, minY: 0, maxX: 50, maxY: 50 };
    const docRect = mapper.dirtyToDoc(dirtyRect);

    // dirtyToDoc adds (tx + rx, ty + ry) which must equal compositeOffset
    expect(docRect.x).toBeCloseTo(compositeOffset.x + dirtyRect.minX, 10);
    expect(docRect.y).toBeCloseTo(compositeOffset.y + dirtyRect.minY, 10);
  });

  it("dirty region covers the correct document area", () => {
    const tx = 10;
    const ty = 20;
    const rx = -3;
    const ry = -7;

    const mapper = new CoordinateMapper({
      layerTransform: makeAffineTransform({ x: tx, y: ty }),
      rasterBounds: { x: rx, y: ry }
    });

    const dirty = { minX: 5, minY: 10, maxX: 25, maxY: 30 };
    const doc = mapper.dirtyToDoc(dirty);

    expect(doc.x).toBe(dirty.minX + tx + rx);
    expect(doc.y).toBe(dirty.minY + ty + ry);
    expect(doc.w).toBe(dirty.maxX - dirty.minX);
    expect(doc.h).toBe(dirty.maxY - dirty.minY);
  });
});

// ─── 7. Cross-tool consistency ──────────────────────────────────────────────

describe("cross-tool consistency", () => {
  it("translation-only and equivalent matrix produce same docToLayer result", () => {
    const translationOnly = new CoordinateMapper({
      layerTransform: makeAffineTransform({ x: 10, y: 20 })
    });

    const withMatrix = new CoordinateMapper({
      layerTransform: makeAffineTransform({
        x: 10,
        y: 20,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      })
    });

    const testPoints = [
      { x: 0, y: 0 },
      { x: 50, y: 60 },
      { x: -10, y: -20 },
      { x: 100, y: 200 }
    ];

    for (const pt of testPoints) {
      const a = translationOnly.docToLayer(pt);
      const b = withMatrix.docToLayer(pt);
      expect(a.x).toBeCloseTo(b.x, 5);
      expect(a.y).toBeCloseTo(b.y, 5);
    }
  });

  it("translation-only and equivalent matrix produce same layerToDoc result", () => {
    const translationOnly = new CoordinateMapper({
      layerTransform: makeAffineTransform({ x: 10, y: 20 })
    });

    const withMatrix = new CoordinateMapper({
      layerTransform: makeAffineTransform({
        x: 10,
        y: 20,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      })
    });

    const testPoints = [
      { x: 0, y: 0 },
      { x: 5, y: 8 },
      { x: -15, y: -30 }
    ];

    for (const pt of testPoints) {
      const a = translationOnly.layerToDoc(pt);
      const b = withMatrix.layerToDoc(pt);
      expect(a.x).toBeCloseTo(b.x, 5);
      expect(a.y).toBeCloseTo(b.y, 5);
    }
  });
});
