import { describe, expect, it } from "vitest";
import {
  flattenNormalizedPath,
  pointAtPathFraction
} from "../src/pathSampling.js";

const CANVAS = { width: 1000, height: 500 };
const FULL_BOX = { x: 0, y: 0, width: 1, height: 1 };

describe("flattenNormalizedPath", () => {
  it("returns null for unparsable path data", () => {
    expect(flattenNormalizedPath("not a path", FULL_BOX, 1000, 500)).toBeNull();
  });

  it("returns null for empty path data", () => {
    expect(flattenNormalizedPath("", FULL_BOX, 1000, 500)).toBeNull();
  });

  it("places a normalized path inside a sub-box in canvas px", () => {
    // A path spanning its own 0..1 space, placed in the right half of the
    // canvas (x: 0.5..1) — its leftmost point should land at canvas x=500,
    // not x=0.
    const box = { x: 0.5, y: 0, width: 0.5, height: 1 };
    const flat = flattenNormalizedPath("M0,0 L1,0", box, 1000, 500);
    expect(flat).not.toBeNull();
    const first = flat![0]!.points[0]!;
    const last = flat![0]!.points[flat![0]!.points.length - 1]!;
    expect(first.x).toBeCloseTo(500);
    expect(last.x).toBeCloseTo(1000);
  });
});

describe("pointAtPathFraction", () => {
  it("returns null for an empty subpath list", () => {
    expect(pointAtPathFraction([], 0.5)).toBeNull();
  });

  it("walks a straight horizontal line linearly", () => {
    const flat = flattenNormalizedPath("M0,0.5 L1,0.5", FULL_BOX, CANVAS.width, CANVAS.height)!;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const p = pointAtPathFraction(flat, t)!;
      expect(p.x).toBeCloseTo(t * CANVAS.width, 5);
      expect(p.y).toBeCloseTo(0.5 * CANVAS.height, 5);
      // Rightward travel the whole way.
      expect(p.angle).toBeCloseTo(0, 5);
    }
  });

  it("clamps t outside [0, 1]", () => {
    const flat = flattenNormalizedPath("M0,0 L1,0", FULL_BOX, CANVAS.width, CANVAS.height)!;
    expect(pointAtPathFraction(flat, -1)).toEqual(pointAtPathFraction(flat, 0));
    expect(pointAtPathFraction(flat, 2)).toEqual(pointAtPathFraction(flat, 1));
  });

  it("reports the four tangent angles of a closed rectangle", () => {
    // A unit square on a SQUARE canvas, closed, so each edge is exactly a
    // quarter of the perimeter: top (rightward), right (downward), bottom
    // (leftward), left (upward).
    const flat = flattenNormalizedPath("M0,0 L1,0 L1,1 L0,1 Z", FULL_BOX, 1000, 1000)!;
    expect(flat).toBeTruthy();
    // Sample just inside each edge's midpoint to avoid landing exactly on a
    // corner, where the "arriving" tangent belongs to the edge before it.
    const top = pointAtPathFraction(flat, 0.05)!;
    const right = pointAtPathFraction(flat, 0.3)!;
    const bottom = pointAtPathFraction(flat, 0.55)!;
    const left = pointAtPathFraction(flat, 0.8)!;
    expect(top.angle).toBeCloseTo(0, 3); // rightward: +x
    expect(right.angle).toBeCloseTo(Math.PI / 2, 3); // downward: +y
    expect(Math.abs(bottom.angle)).toBeCloseTo(Math.PI, 3); // leftward: -x
    expect(left.angle).toBeCloseTo(-Math.PI / 2, 3); // upward: -y
  });
});
