/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import {
  affineMultiply,
  affineInvert,
  fitAffineRectangleCorners,
  unionOfDocumentExtents,
  layerTransformFromDocAffine
} from "../multiLayerTransformMath";
import type { AffineMatrix } from "../../../types";
import type { DocumentExtents } from "../../../painting/resolvedLayerGeometry";

describe("affineMultiply", () => {
  it("returns identity when multiplying two identities", () => {
    const identity: AffineMatrix = [1, 0, 0, 1, 0, 0];
    const result = affineMultiply(identity, identity);
    expect(result).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("applies translation correctly", () => {
    const identity: AffineMatrix = [1, 0, 0, 1, 0, 0];
    const translate: AffineMatrix = [1, 0, 0, 1, 10, 20];
    const result = affineMultiply(identity, translate);
    expect(result).toEqual([1, 0, 0, 1, 10, 20]);
  });

  it("composes two translations", () => {
    const t1: AffineMatrix = [1, 0, 0, 1, 5, 3];
    const t2: AffineMatrix = [1, 0, 0, 1, 10, 20];
    const result = affineMultiply(t1, t2);
    expect(result[4]).toBeCloseTo(15);
    expect(result[5]).toBeCloseTo(23);
  });

  it("composes scale and translation", () => {
    const scale2x: AffineMatrix = [2, 0, 0, 2, 0, 0];
    const translate: AffineMatrix = [1, 0, 0, 1, 5, 10];
    const result = affineMultiply(scale2x, translate);
    expect(result[4]).toBeCloseTo(10);
    expect(result[5]).toBeCloseTo(20);
  });

  it("composes 90-degree rotation with translation", () => {
    const cos = Math.cos(Math.PI / 2);
    const sin = Math.sin(Math.PI / 2);
    const rotate: AffineMatrix = [cos, sin, -sin, cos, 0, 0];
    const translate: AffineMatrix = [1, 0, 0, 1, 10, 0];
    const result = affineMultiply(rotate, translate);
    expect(result[4]).toBeCloseTo(0, 10);
    expect(result[5]).toBeCloseTo(10, 10);
  });
});

describe("affineInvert", () => {
  it("inverts the identity matrix", () => {
    const identity: AffineMatrix = [1, 0, 0, 1, 0, 0];
    const inv = affineInvert(identity);
    expect(inv).not.toBeNull();
    for (let i = 0; i < 6; i++) {
      expect(inv![i]).toBeCloseTo(identity[i]);
    }
  });

  it("inverts a pure translation", () => {
    const t: AffineMatrix = [1, 0, 0, 1, 10, 20];
    const inv = affineInvert(t);
    expect(inv).not.toBeNull();
    expect(inv![4]).toBeCloseTo(-10);
    expect(inv![5]).toBeCloseTo(-20);
  });

  it("inverts a scale matrix", () => {
    const s: AffineMatrix = [2, 0, 0, 3, 0, 0];
    const inv = affineInvert(s);
    expect(inv).not.toBeNull();
    expect(inv![0]).toBeCloseTo(0.5);
    expect(inv![3]).toBeCloseTo(1 / 3);
  });

  it("returns null for a singular matrix", () => {
    const singular: AffineMatrix = [0, 0, 0, 0, 10, 20];
    expect(affineInvert(singular)).toBeNull();
  });

  it("M * M^-1 = identity", () => {
    const m: AffineMatrix = [2, 1, -1, 3, 5, 7];
    const inv = affineInvert(m);
    expect(inv).not.toBeNull();
    const product = affineMultiply(m, inv!);
    expect(product[0]).toBeCloseTo(1);
    expect(product[1]).toBeCloseTo(0);
    expect(product[2]).toBeCloseTo(0);
    expect(product[3]).toBeCloseTo(1);
    expect(product[4]).toBeCloseTo(0);
    expect(product[5]).toBeCloseTo(0);
  });
});

describe("fitAffineRectangleCorners", () => {
  it("returns identity-like matrix for axis-aligned rectangle at origin", () => {
    const corners: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];
    const m = fitAffineRectangleCorners(0, 0, 100, 100, corners);
    expect(m).not.toBeNull();
    expect(m![0]).toBeCloseTo(1);
    expect(m![1]).toBeCloseTo(0);
    expect(m![2]).toBeCloseTo(0);
    expect(m![3]).toBeCloseTo(1);
    expect(m![4]).toBeCloseTo(0);
    expect(m![5]).toBeCloseTo(0);
  });

  it("maps a translated rectangle", () => {
    const corners: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] = [
      { x: 50, y: 30 },
      { x: 150, y: 30 },
      { x: 150, y: 130 },
      { x: 50, y: 130 }
    ];
    const m = fitAffineRectangleCorners(0, 0, 100, 100, corners);
    expect(m).not.toBeNull();
    expect(m![4]).toBeCloseTo(50);
    expect(m![5]).toBeCloseTo(30);
  });

  it("maps a scaled rectangle", () => {
    const corners: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 }
    ];
    const m = fitAffineRectangleCorners(0, 0, 100, 100, corners);
    expect(m).not.toBeNull();
    expect(m![0]).toBeCloseTo(2);
    expect(m![3]).toBeCloseTo(2);
  });
});

describe("unionOfDocumentExtents", () => {
  it("returns null for empty array", () => {
    expect(unionOfDocumentExtents([])).toBeNull();
  });

  it("returns the single rect when given one", () => {
    const rect: DocumentExtents = { x: 10, y: 20, width: 100, height: 50 };
    expect(unionOfDocumentExtents([rect])).toEqual(rect);
  });

  it("computes the union of two non-overlapping rects", () => {
    const a: DocumentExtents = { x: 0, y: 0, width: 10, height: 10 };
    const b: DocumentExtents = { x: 20, y: 20, width: 10, height: 10 };
    const union = unionOfDocumentExtents([a, b]);
    expect(union).not.toBeNull();
    expect(union!.x).toBe(0);
    expect(union!.y).toBe(0);
    expect(union!.width).toBe(30);
    expect(union!.height).toBe(30);
  });

  it("computes the union of overlapping rects", () => {
    const a: DocumentExtents = { x: 0, y: 0, width: 20, height: 20 };
    const b: DocumentExtents = { x: 10, y: 10, width: 20, height: 20 };
    const union = unionOfDocumentExtents([a, b]);
    expect(union).not.toBeNull();
    expect(union!.x).toBe(0);
    expect(union!.y).toBe(0);
    expect(union!.width).toBe(30);
    expect(union!.height).toBe(30);
  });

  it("handles negative coordinates", () => {
    const a: DocumentExtents = { x: -10, y: -5, width: 10, height: 10 };
    const b: DocumentExtents = { x: 5, y: 0, width: 15, height: 20 };
    const union = unionOfDocumentExtents([a, b]);
    expect(union).not.toBeNull();
    expect(union!.x).toBe(-10);
    expect(union!.y).toBe(-5);
    expect(union!.width).toBe(30);
    expect(union!.height).toBe(25);
  });
});

describe("layerTransformFromDocAffine", () => {
  it("decomposes an identity matrix", () => {
    const identity: AffineMatrix = [1, 0, 0, 1, 0, 0];
    const t = layerTransformFromDocAffine(identity);
    expect(t.x).toBeCloseTo(0);
    expect(t.y).toBeCloseTo(0);
    expect(t.scaleX).toBeCloseTo(1);
    expect(t.scaleY).toBeCloseTo(1);
    expect(t.rotation).toBeCloseTo(0);
  });

  it("decomposes a translation matrix", () => {
    const translate: AffineMatrix = [1, 0, 0, 1, 42, 99];
    const t = layerTransformFromDocAffine(translate);
    expect(t.x).toBeCloseTo(42);
    expect(t.y).toBeCloseTo(99);
    expect(t.scaleX).toBeCloseTo(1);
    expect(t.scaleY).toBeCloseTo(1);
  });

  it("decomposes a uniform scale matrix", () => {
    const scale: AffineMatrix = [3, 0, 0, 3, 0, 0];
    const t = layerTransformFromDocAffine(scale);
    expect(t.scaleX).toBeCloseTo(3);
    expect(t.scaleY).toBeCloseTo(3);
  });

  it("preserves the raw matrix", () => {
    const m: AffineMatrix = [2, 0.5, -0.5, 2, 10, 20];
    const t = layerTransformFromDocAffine(m);
    expect(t.matrix).toEqual([...m]);
  });
});
