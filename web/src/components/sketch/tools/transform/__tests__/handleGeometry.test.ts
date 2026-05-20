/**
 * @jest-environment node
 */
import {
  isCornerHandle,
  isEdgeHandle,
  rotatePoint,
  snapAngle,
  dist,
  type TransformHandle,
} from "../handleGeometry";

describe("isCornerHandle", () => {
  it("returns true for corner handles", () => {
    const corners: TransformHandle[] = [
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ];
    for (const h of corners) {
      expect(isCornerHandle(h)).toBe(true);
    }
  });

  it("returns false for edge, rotate, move, and pivot handles", () => {
    const nonCorners: TransformHandle[] = [
      "top",
      "bottom",
      "left",
      "right",
      "rotate",
      "move",
      "pivot",
    ];
    for (const h of nonCorners) {
      expect(isCornerHandle(h)).toBe(false);
    }
  });
});

describe("isEdgeHandle", () => {
  it("returns true for edge handles", () => {
    const edges: TransformHandle[] = ["top", "bottom", "left", "right"];
    for (const h of edges) {
      expect(isEdgeHandle(h)).toBe(true);
    }
  });

  it("returns false for corner, rotate, move, and pivot handles", () => {
    const nonEdges: TransformHandle[] = [
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "rotate",
      "move",
      "pivot",
    ];
    for (const h of nonEdges) {
      expect(isEdgeHandle(h)).toBe(false);
    }
  });
});

describe("rotatePoint", () => {
  it("returns the same point for 0 rotation", () => {
    const p = rotatePoint(10, 20, 0, 0, 0);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(20);
  });

  it("rotates 90 degrees counter-clockwise", () => {
    const p = rotatePoint(1, 0, 0, 0, Math.PI / 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });

  it("rotates 180 degrees", () => {
    const p = rotatePoint(1, 0, 0, 0, Math.PI);
    expect(p.x).toBeCloseTo(-1);
    expect(p.y).toBeCloseTo(0);
  });

  it("rotates around a non-origin center", () => {
    const p = rotatePoint(5, 5, 5, 0, Math.PI / 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });

  it("full 360-degree rotation returns to original", () => {
    const p = rotatePoint(3, 7, 1, 2, 2 * Math.PI);
    expect(p.x).toBeCloseTo(3);
    expect(p.y).toBeCloseTo(7);
  });
});

describe("snapAngle", () => {
  it("snaps 0 to 0", () => {
    expect(snapAngle(0)).toBeCloseTo(0);
  });

  it("snaps exact 15-degree increments to themselves", () => {
    const step = Math.PI / 12;
    expect(snapAngle(step)).toBeCloseTo(step);
    expect(snapAngle(2 * step)).toBeCloseTo(2 * step);
    expect(snapAngle(12 * step)).toBeCloseTo(Math.PI);
  });

  it("rounds to the nearest 15-degree increment", () => {
    const step = Math.PI / 12;
    expect(snapAngle(step * 0.3)).toBeCloseTo(0);
    expect(snapAngle(step * 0.6)).toBeCloseTo(step);
    expect(snapAngle(step * 1.4)).toBeCloseTo(step);
    expect(snapAngle(step * 1.6)).toBeCloseTo(2 * step);
  });

  it("handles negative angles", () => {
    const step = Math.PI / 12;
    expect(snapAngle(-step * 0.3)).toBeCloseTo(0);
    expect(snapAngle(-step)).toBeCloseTo(-step);
  });
});

describe("dist", () => {
  it("returns 0 for identical points", () => {
    expect(dist({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it("computes horizontal distance", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3);
  });

  it("computes vertical distance", () => {
    expect(dist({ x: 0, y: 0 }, { x: 0, y: 4 })).toBe(4);
  });

  it("computes diagonal distance (3-4-5 triangle)", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("is symmetric", () => {
    const a = { x: 1, y: 2 };
    const b = { x: 4, y: 6 };
    expect(dist(a, b)).toBe(dist(b, a));
  });
});
