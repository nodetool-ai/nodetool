import {
  affineToMatrix,
  matrixToAffine,
  IDENTITY_MATRIX
} from "../affineMatrix";
import type { AffineTransform } from "../../types";

describe("affineToMatrix", () => {
  it("returns identity matrix for identity transform", () => {
    const t: AffineTransform = {
      kind: "affine",
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
    const m = affineToMatrix(t);
    expect(m[0]).toBeCloseTo(1);
    expect(m[1]).toBeCloseTo(0);
    expect(m[2]).toBeCloseTo(0);
    expect(m[3]).toBeCloseTo(1);
    expect(m[4]).toBeCloseTo(0);
    expect(m[5]).toBeCloseTo(0);
  });

  it("applies translation to e and f components", () => {
    const t: AffineTransform = {
      kind: "affine",
      x: 100,
      y: 200,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
    const m = affineToMatrix(t);
    expect(m[4]).toBe(100);
    expect(m[5]).toBe(200);
  });

  it("applies scale to a and d components", () => {
    const t: AffineTransform = {
      kind: "affine",
      x: 0,
      y: 0,
      scaleX: 2,
      scaleY: 3,
      rotation: 0
    };
    const m = affineToMatrix(t);
    expect(m[0]).toBeCloseTo(2);
    expect(m[3]).toBeCloseTo(3);
    expect(m[1]).toBeCloseTo(0);
    expect(m[2]).toBeCloseTo(0);
  });

  it("applies 90-degree rotation", () => {
    const t: AffineTransform = {
      kind: "affine",
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: Math.PI / 2
    };
    const m = affineToMatrix(t);
    expect(m[0]).toBeCloseTo(0);
    expect(m[1]).toBeCloseTo(1);
    expect(m[2]).toBeCloseTo(-1);
    expect(m[3]).toBeCloseTo(0);
  });

  it("combines translation, rotation, and scale", () => {
    const t: AffineTransform = {
      kind: "affine",
      x: 10,
      y: 20,
      scaleX: 2,
      scaleY: 3,
      rotation: Math.PI / 4
    };
    const m = affineToMatrix(t);
    const cos = Math.cos(Math.PI / 4);
    const sin = Math.sin(Math.PI / 4);
    expect(m[0]).toBeCloseTo(cos * 2);
    expect(m[1]).toBeCloseTo(sin * 2);
    expect(m[2]).toBeCloseTo(-sin * 3);
    expect(m[3]).toBeCloseTo(cos * 3);
    expect(m[4]).toBe(10);
    expect(m[5]).toBe(20);
  });
});

describe("matrixToAffine", () => {
  it("decomposes identity matrix", () => {
    const result = matrixToAffine(IDENTITY_MATRIX);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.scaleX).toBeCloseTo(1);
    expect(result.scaleY).toBeCloseTo(1);
    expect(result.rotation).toBeCloseTo(0);
  });

  it("extracts translation", () => {
    const result = matrixToAffine([1, 0, 0, 1, 50, 75]);
    expect(result.x).toBe(50);
    expect(result.y).toBe(75);
    expect(result.scaleX).toBeCloseTo(1);
    expect(result.scaleY).toBeCloseTo(1);
  });

  it("extracts uniform scale", () => {
    const result = matrixToAffine([3, 0, 0, 3, 0, 0]);
    expect(result.scaleX).toBeCloseTo(3);
    expect(result.scaleY).toBeCloseTo(3);
    expect(result.rotation).toBeCloseTo(0);
  });

  it("extracts non-uniform scale", () => {
    const result = matrixToAffine([2, 0, 0, 5, 0, 0]);
    expect(result.scaleX).toBeCloseTo(2);
    expect(result.scaleY).toBeCloseTo(5);
  });

  it("extracts rotation", () => {
    const angle = Math.PI / 6;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const result = matrixToAffine([cos, sin, -sin, cos, 0, 0]);
    expect(result.rotation).toBeCloseTo(angle);
    expect(result.scaleX).toBeCloseTo(1);
    expect(result.scaleY).toBeCloseTo(1);
  });

  it("round-trips through affineToMatrix", () => {
    const original: AffineTransform = {
      kind: "affine",
      x: 15,
      y: -30,
      scaleX: 2.5,
      scaleY: 1.8,
      rotation: 0.7
    };
    const m = affineToMatrix(original);
    const decomposed = matrixToAffine(m);
    expect(decomposed.x).toBeCloseTo(original.x);
    expect(decomposed.y).toBeCloseTo(original.y);
    expect(decomposed.scaleX).toBeCloseTo(original.scaleX);
    expect(decomposed.scaleY).toBeCloseTo(original.scaleY);
    expect(decomposed.rotation).toBeCloseTo(original.rotation);
  });

  it("handles negative determinant (flipped Y)", () => {
    const result = matrixToAffine([1, 0, 0, -1, 0, 0]);
    expect(result.scaleX).toBeCloseTo(1);
    expect(result.scaleY).toBeCloseTo(-1);
  });
});
