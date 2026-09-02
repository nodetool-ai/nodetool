/**
 * A shape clip's outline and the arc-length walk that trims it (F8, T16).
 *
 * Everything a shape can draw resolves to one segment list, so the claims worth
 * pinning are the ones that would otherwise only show up as a wrong picture:
 * the vertex count of a star, the length of a curve the flattener measured, and
 * where a trim range lands when the figure is made of several subpaths.
 *
 * `packages/agents/tests/timeline-shape-frames.test.ts` reads the pixels the
 * same styles produce on a real canvas; what a pure function decides is here.
 */
import { describe, expect, it } from "vitest";

import type { ClipShapeStyle } from "../src/index.js";
import {
  buildShapeSegments,
  flatPathLength,
  flattenSegments,
  trimFlatPath
} from "../src/render/shapeGeometry.js";

const W = 400;
const H = 400;

/** A shape filling the whole surface, so its box is the surface. */
function shape(over: Partial<ClipShapeStyle> & Pick<ClipShapeStyle, "kind">) {
  return { x: 0, y: 0, width: 1, height: 1, ...over } as ClipShapeStyle;
}

function segments(style: ClipShapeStyle) {
  const built = buildShapeSegments(style, W, H);
  expect(built).not.toBeNull();
  return built!;
}

function lengthOf(style: ClipShapeStyle): number {
  return flatPathLength(flattenSegments(segments(style)));
}

describe("buildShapeSegments", () => {
  it("draws a rect as four straight sides", () => {
    const built = segments(shape({ kind: "rect" }));
    expect(built.map((s) => s.kind)).toEqual([
      "move",
      "line",
      "line",
      "line",
      "close"
    ]);
    expect(lengthOf(shape({ kind: "rect" }))).toBeCloseTo(4 * W, 6);
  });

  it("rounds a rect's corners to a circular arc of the authored radius", () => {
    // Perimeter of a rounded rect: the straight runs plus one whole circle.
    const radius = 0.1 * W;
    const expected = 4 * (W - 2 * radius) + 2 * Math.PI * radius;
    expect(lengthOf(shape({ kind: "rect", cornerRadius: 0.1 }))).toBeCloseTo(
      expected,
      0
    );
  });

  it("draws an ellipse whose flattened length is its circumference", () => {
    // A circle of radius W/2, so the exact answer is known.
    expect(lengthOf(shape({ kind: "ellipse" }))).toBeCloseTo(Math.PI * W, 0);
  });

  it("gives a star two vertices per point, alternating radius", () => {
    const built = segments(shape({ kind: "star", sides: 6 }));
    // move + 11 lines + close: twelve vertices for a six-pointed star.
    expect(built.filter((s) => s.kind === "line")).toHaveLength(11);
    expect(built.map((s) => s.kind).filter((k) => k === "move")).toHaveLength(1);

    const outer = built.filter(
      (s): s is { kind: "move" | "line"; x: number; y: number } =>
        s.kind === "move" || s.kind === "line"
    );
    const radii = outer.map((p) => Math.hypot(p.x - W / 2, p.y - H / 2));
    // Alternating: every even vertex is on the outer circle, every odd one on
    // the inner one at the default half radius.
    radii.forEach((r, i) => expect(r).toBeCloseTo((i % 2 === 0 ? 1 : 0.5) * (W / 2), 4));
  });

  it("gives a polygon one vertex per side, all on the circumscribed circle", () => {
    const built = segments(shape({ kind: "polygon", sides: 7 }));
    expect(built.filter((s) => s.kind === "line")).toHaveLength(6);
    for (const segment of built) {
      if (segment.kind !== "move" && segment.kind !== "line") continue;
      expect(
        Math.hypot(segment.x - W / 2, segment.y - H / 2)
      ).toBeCloseTo(W / 2, 4);
    }
  });

  it("scales authored path data out of its normalized space", () => {
    const built = segments(shape({ kind: "path", d: "M 0 0 L 1 0.5" }));
    expect(built[1]).toEqual({ kind: "line", x: W, y: H / 2 });
  });

  it("refuses path data that does not parse, and a kind it cannot draw", () => {
    expect(buildShapeSegments(shape({ kind: "path", d: "A 1 1" }), W, H)).toBeNull();
    expect(buildShapeSegments(shape({ kind: "path" }), W, H)).toBeNull();
    expect(
      buildShapeSegments(
        { kind: "hexahedron" } as unknown as ClipShapeStyle,
        W,
        H
      )
    ).toBeNull();
  });
});

describe("trimFlatPath", () => {
  /** A single straight run of known length, so a fraction reads exactly. */
  const line = () =>
    flattenSegments(
      segments(shape({ kind: "line", x: 0, y: 0, x2: 1, y2: 0 }))
    );

  it("keeps the first half of the outline at trimEnd 0.5", () => {
    const runs = trimFlatPath(line(), 0, 0.5);
    expect(runs).toHaveLength(1);
    expect(runLength(runs[0]!)).toBeCloseTo(W / 2, 6);
    expect(runs[0]![0]).toEqual({ x: 0, y: 0 });
  });

  it("keeps the middle of the outline when both ends move in", () => {
    const runs = trimFlatPath(line(), 0.25, 0.75);
    expect(runLength(runs[0]!)).toBeCloseTo(W / 2, 6);
    expect(runs[0]![0]!.x).toBeCloseTo(W * 0.25, 6);
  });

  it("keeps half of a curve's arc length, not half its bounding box", () => {
    // A quarter circle of radius W: the arc is π·W/2 long while its box is W
    // square, so a length-based trim and a box-based one differ by 57%.
    const flat = flattenSegments(
      segments(shape({ kind: "path", d: "M 0 1 C 0 0.4477 0.4477 0 1 0" }))
    );
    const whole = flatPathLength(flat);
    expect(whole).toBeCloseTo((Math.PI * W) / 2, 0);
    const runs = trimFlatPath(flat, 0, 0.5);
    expect(runLength(runs[0]!)).toBeCloseTo(whole / 2, 1);
  });

  it("walks several subpaths in order, so a range can straddle two", () => {
    // Two separate unit-width strokes: the second half of the first and the
    // first half of the second come back as two runs, not one.
    const flat = flattenSegments(
      segments(shape({ kind: "path", d: "M 0 0 L 1 0 M 0 1 L 1 1" }))
    );
    const runs = trimFlatPath(flat, 0.25, 0.75);
    expect(runs).toHaveLength(2);
    expect(runs[0]![0]!.y).toBe(0);
    expect(runs[1]![0]!.y).toBe(H);
    // Half of both strokes together: the range is measured over their total.
    expect(runLength(runs[0]!) + runLength(runs[1]!)).toBeCloseTo(W, 6);
  });

  it("draws nothing when the range is empty or inverted", () => {
    expect(trimFlatPath(line(), 0.5, 0.5)).toEqual([]);
    expect(trimFlatPath(line(), 0.8, 0.2)).toEqual([]);
  });
});

function runLength(run: readonly { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 1; i < run.length; i++) {
    total += Math.hypot(run[i]!.x - run[i - 1]!.x, run[i]!.y - run[i - 1]!.y);
  }
  return total;
}
