/**
 * The SVG path subset a mask (T12) and, later, a shape (T16) are drawn from.
 *
 * Two things are pinned here. Relative commands and `Z` have to resolve to the
 * same absolute segments an editor would export — a path parsed with the
 * current point off by one subpath is a mask in the wrong place, and nothing
 * downstream can tell. And a command this build does not read has to be
 * refused by name rather than skipped, because that refusal is what the
 * validator reports as `mask_path_invalid`.
 */
import { describe, expect, it } from "vitest";

import { createCanvas } from "@napi-rs/canvas";

import { drawShape } from "../src/render/draw.js";
import {
  parseSvgPath,
  tracePath,
  type PathSegment,
  type PathSink
} from "../src/render/svgPath.js";

/** Records the calls `tracePath` issues, rounded so a scale reads exactly. */
class RecordingSink implements PathSink {
  readonly calls: string[] = [];
  private push(name: string, ...args: number[]): void {
    this.calls.push(`${name}(${args.map((n) => n.toFixed(2)).join(",")})`);
  }
  moveTo(x: number, y: number): void {
    this.push("moveTo", x, y);
  }
  lineTo(x: number, y: number): void {
    this.push("lineTo", x, y);
  }
  bezierCurveTo(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): void {
    this.push("bezierCurveTo", a, b, c, d, e, f);
  }
  quadraticCurveTo(a: number, b: number, c: number, d: number): void {
    this.push("quadraticCurveTo", a, b, c, d);
  }
  closePath(): void {
    this.calls.push("closePath()");
  }
}

const segmentsOf = (d: string) => {
  const parsed = parseSvgPath(d);
  if (!parsed.ok) throw new Error(`expected ${d} to parse: ${parsed.error}`);
  return parsed.segments;
};

/** Segments with coordinates rounded, so accumulated relative moves compare. */
const roundedSegmentsOf = (d: string): unknown[] =>
  segmentsOf(d).map((segment) =>
    Object.fromEntries(
      Object.entries(segment).map(([key, value]) => [
        key,
        typeof value === "number" ? Number(value.toFixed(4)) : value
      ])
    )
  );

describe("parseSvgPath", () => {
  it("reads absolute commands as written", () => {
    expect(segmentsOf("M 0 0 L 1 0 L 1 1 Z")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "line", x: 1, y: 0 },
      { kind: "line", x: 1, y: 1 },
      { kind: "close" }
    ]);
  });

  it("resolves relative commands against the current point", () => {
    expect(roundedSegmentsOf("m 0.1 0.1 l 0.2 0 l 0 0.2")).toEqual([
      { kind: "move", x: 0.1, y: 0.1 },
      { kind: "line", x: 0.3, y: 0.1 },
      { kind: "line", x: 0.3, y: 0.3 }
    ]);
  });

  it("returns the current point to the subpath start after Z", () => {
    // The `l 0 0.5` after the close runs from (0.2, 0.2) — the point `M`
    // opened the subpath at — not from (0.8, 0.8) where the line ended.
    expect(roundedSegmentsOf("M 0.2 0.2 L 0.8 0.8 Z l 0 0.5")).toEqual([
      { kind: "move", x: 0.2, y: 0.2 },
      { kind: "line", x: 0.8, y: 0.8 },
      { kind: "close" },
      { kind: "line", x: 0.2, y: 0.7 }
    ]);
  });

  it("treats a repeated pair after M as an implicit line", () => {
    expect(segmentsOf("M 0 0 0.5 0 0.5 0.5")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "line", x: 0.5, y: 0 },
      { kind: "line", x: 0.5, y: 0.5 }
    ]);
  });

  it("repeats a relative move's implicit lines relatively", () => {
    expect(roundedSegmentsOf("m 0.1 0.1 0.1 0 0.1 0")).toEqual([
      { kind: "move", x: 0.1, y: 0.1 },
      { kind: "line", x: 0.2, y: 0.1 },
      { kind: "line", x: 0.3, y: 0.1 }
    ]);
  });

  it("reads cubic and quadratic curves, absolute and relative", () => {
    expect(segmentsOf("M 0 0 C 0 1 1 1 1 0 q -0.5 -1 -1 0")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "cubic", x1: 0, y1: 1, x2: 1, y2: 1, x: 1, y: 0 },
      { kind: "quad", x1: 0.5, y1: -1, x: 0, y: 0 }
    ]);
  });

  it("reads numbers with no separator between them", () => {
    expect(segmentsOf("M0 0L.5.5")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "line", x: 0.5, y: 0.5 }
    ]);
  });

  // The number pattern was rewritten so its two branches split on the first
  // character (a digit or a dot) rather than sharing it, which is what CodeQL
  // reads as polynomial backtracking. Both forms accept the same language, so
  // only these cases catch a rewrite that quietly narrowed it.
  it("reads every number form SVG allows", () => {
    expect(segmentsOf("M0 0L10. .5 5.25 -3 1e2 -1.5E-2")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "line", x: 10, y: 0.5 },
      { kind: "line", x: 5.25, y: -3 },
      { kind: "line", x: 100, y: -0.015 }
    ]);
  });

  it("reads a negative sign as the separator it is", () => {
    expect(segmentsOf("M0 0L10-5")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "line", x: 10, y: -5 }
    ]);
  });

  it("repeats a command for every extra group of numbers", () => {
    expect(segmentsOf("M 0 0 L 1 0 1 1 0 1")).toHaveLength(4);
  });

  for (const [label, d] of [
    ["data starting with a number", "0 0 L 1 1"],
    ["a drawing command before any move", "L 1 1"],
    ["a half-finished point", "M 0 0 L 1"],
    ["a close with nothing open", "Z"],
    ["nothing at all", "   "],
    ["an arc with a large-arc-flag that is not 0 or 1", "M 0 0 A 1 1 0 2 1 1 1"],
    ["an arc with a sweep-flag that is not 0 or 1", "M 0 0 A 1 1 0 0 5 1 1"]
  ] as const) {
    it(`refuses ${label}`, () => {
      const parsed = parseSvgPath(d);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.error).not.toBe("");
    });
  }

  it("reads H and V as single-coordinate lines, absolute and relative", () => {
    expect(segmentsOf("M 0 0 H 1 V 1 h -0.5 v -0.5")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "line", x: 1, y: 0 },
      { kind: "line", x: 1, y: 1 },
      { kind: "line", x: 0.5, y: 1 },
      { kind: "line", x: 0.5, y: 0.5 }
    ]);
  });

  it("reflects S's control point off the previous C, not off the current point", () => {
    // C's own second control point is (1,1); S's implied first control point
    // is that reflected through the current point (1,0): (2*1-1, 2*0-1) = (1,-1).
    expect(segmentsOf("M 0 0 C 0 1 1 1 1 0 S 3 -1 2 0")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "cubic", x1: 0, y1: 1, x2: 1, y2: 1, x: 1, y: 0 },
      { kind: "cubic", x1: 1, y1: -1, x2: 3, y2: -1, x: 2, y: 0 }
    ]);
  });

  it("uses the current point as S's control when the previous command was not C or S", () => {
    expect(segmentsOf("M 0 0 L 1 0 S 2 1 3 0")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "line", x: 1, y: 0 },
      { kind: "cubic", x1: 1, y1: 0, x2: 2, y2: 1, x: 3, y: 0 }
    ]);
  });

  it("reflects T's control point off the previous Q, not off the current point", () => {
    // Q's control point is (1,1); T's implied control is that reflected
    // through the current point (2,0): (2*2-1, 2*0-1) = (3,-1).
    expect(segmentsOf("M 0 0 Q 1 1 2 0 T 4 0")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "quad", x1: 1, y1: 1, x: 2, y: 0 },
      { kind: "quad", x1: 3, y1: -1, x: 4, y: 0 }
    ]);
  });

  it("uses the current point as T's control when the previous command was not Q or T", () => {
    expect(segmentsOf("M 0 0 L 2 0 T 4 0")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "line", x: 2, y: 0 },
      { kind: "quad", x1: 2, y1: 0, x: 4, y: 0 }
    ]);
  });

  it("treats a zero-radius arc as a straight line", () => {
    expect(segmentsOf("M 0 0 A 0 1 0 0 1 1 1")).toEqual([
      { kind: "move", x: 0, y: 0 },
      { kind: "line", x: 1, y: 1 }
    ]);
  });

  it("omits an arc whose endpoints are identical", () => {
    expect(segmentsOf("M 0.5 0.5 A 1 1 0 0 1 0.5 0.5")).toEqual([
      { kind: "move", x: 0.5, y: 0.5 }
    ]);
  });

  describe("arc geometry", () => {
    /** Every cubic and quad control-free sample point an arc's segments pass
     * through, at several `t` along each cubic (De Casteljau, cheap enough
     * inline for a test). */
    const sampleArcPoints = (segments: readonly PathSegment[]): { x: number; y: number }[] => {
      const points: { x: number; y: number }[] = [];
      let cx = 0;
      let cy = 0;
      for (const segment of segments) {
        if (segment.kind === "move") {
          cx = segment.x;
          cy = segment.y;
          points.push({ x: cx, y: cy });
        } else if (segment.kind === "cubic") {
          for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            const mt = 1 - t;
            const x =
              mt * mt * mt * cx +
              3 * mt * mt * t * segment.x1 +
              3 * mt * t * t * segment.x2 +
              t * t * t * segment.x;
            const y =
              mt * mt * mt * cy +
              3 * mt * mt * t * segment.y1 +
              3 * mt * t * t * segment.y2 +
              t * t * t * segment.y;
            points.push({ x, y });
          }
          cx = segment.x;
          cy = segment.y;
        }
      }
      return points;
    };

    it("samples every point of a circular arc onto the circle", () => {
      // A quarter turn of a unit circle centered at the origin, from (1,0) to (0,1).
      const segments = segmentsOf("M 1 0 A 1 1 0 0 1 0 1");
      for (const { x, y } of sampleArcPoints(segments)) {
        // A 90° cubic approximation of a unit circle is accurate to a few
        // parts in ten-thousand, not floating-point exact.
        expect(x * x + y * y).toBeCloseTo(1, 2);
      }
    });

    it("samples a rotated, non-circular ellipse onto the ellipse", () => {
      // rx=2, ry=1, rotated 30°. The endpoints are diametrically opposite
      // along the ellipse's own (rotated) major axis, so the center is the
      // origin — same shape as the semicircle case in `arcToCubics` (`co`
      // works out to 0), just rotated.
      const rot = (30 * Math.PI) / 180;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const rx = 2;
      const p1 = { x: rx * cos, y: rx * sin };
      const p2 = { x: -rx * cos, y: -rx * sin };
      const segments = segmentsOf(
        `M ${p1.x} ${p1.y} A ${rx} 1 30 0 1 ${p2.x} ${p2.y}`
      );
      for (const { x, y } of sampleArcPoints(segments)) {
        // Un-rotate into the ellipse's own frame before checking the equation.
        const ux = cos * x + sin * y;
        const uy = -sin * x + cos * y;
        expect((ux * ux) / 4 + uy * uy).toBeCloseTo(1, 2);
      }
    });

    it("draws a full circle from two semicircle arcs", () => {
      const segments = segmentsOf("M 1 0 A 1 1 0 0 1 -1 0 A 1 1 0 0 1 1 0");
      const points = sampleArcPoints(segments);
      for (const { x, y } of points) {
        expect(x * x + y * y).toBeCloseTo(1, 2);
      }
      // The path returns to its start.
      const last = points[points.length - 1]!;
      expect(last.x).toBeCloseTo(1, 6);
      expect(last.y).toBeCloseTo(0, 6);
    });

    it("scales an undersized radius up until it just reaches both endpoints (F.6.6.2)", () => {
      // rx=ry=0.1 cannot span a chord of length 10; the spec scales both up
      // until they can, which here (a diameter-length chord) makes the
      // scaled circle's center the chord's midpoint.
      const segments = segmentsOf("M 0 0 A 0.1 0.1 0 0 1 10 0");
      for (const { x, y } of sampleArcPoints(segments)) {
        const dx = x - 5;
        expect(dx * dx + y * y).toBeCloseTo(25, 1);
      }
    });
  });
});

describe("tracePath", () => {
  it("scales the path into the surface it draws on", () => {
    const sink = new RecordingSink();
    tracePath(sink, segmentsOf("M 0 0 L 1 0.5 Q 1 1 0 1 Z"), {
      scaleX: 200,
      scaleY: 100
    });
    expect(sink.calls).toEqual([
      "moveTo(0.00,0.00)",
      "lineTo(200.00,50.00)",
      "quadraticCurveTo(200.00,100.00,0.00,100.00)",
      "closePath()"
    ]);
  });

  it("offsets on top of the scale", () => {
    const sink = new RecordingSink();
    tracePath(sink, segmentsOf("M 0.5 0.5"), {
      scaleX: 10,
      scaleY: 10,
      offsetX: 3,
      offsetY: -3
    });
    expect(sink.calls).toEqual(["moveTo(8.00,2.00)"]);
  });

  it("passes a cubic through with every control point placed", () => {
    const sink = new RecordingSink();
    tracePath(sink, segmentsOf("M 0 0 C 0 1 1 1 1 0"), {
      scaleX: 100,
      scaleY: 100
    });
    expect(sink.calls[1]).toBe(
      "bezierCurveTo(0.00,100.00,100.00,100.00,100.00,0.00)"
    );
  });
});

describe("an arc-drawn shape on a real 2D surface", () => {
  it("fills a half-disc where the arc bulges, and nowhere past its flat chord", () => {
    const canvas = createCanvas(100, 100);
    // A chord from (0.1, 0.5) to (0.9, 0.5), closed by a straight edge (`Z`)
    // back to the start — a half-disc whose curved side is the arc and whose
    // flat side is the chord. `sweep-flag 1` bulges it toward smaller y.
    drawShape(
      canvas.getContext("2d"),
      { kind: "path", d: "M 0.1 0.5 A 0.4 0.4 0 0 1 0.9 0.5 Z", fill: "#000000" },
      100,
      100
    );
    const ctx = canvas.getContext("2d");
    const insideTheBulge = ctx.getImageData(50, 30, 1, 1).data[3]!;
    const pastTheFlatChord = ctx.getImageData(50, 70, 1, 1).data[3]!;
    expect(insideTheBulge).toBeGreaterThan(200);
    expect(pastTheFlatChord).toBe(0);
  });
});
