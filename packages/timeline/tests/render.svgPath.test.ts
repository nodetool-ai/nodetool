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

import { parseSvgPath, tracePath, type PathSink } from "../src/render/svgPath.js";

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
    ["an arc", "M 0 0 A 1 1 0 0 1 1 1"],
    ["a horizontal shorthand", "M 0 0 H 1"],
    ["a smooth cubic", "M 0 0 S 1 1 1 0"],
    ["data starting with a number", "0 0 L 1 1"],
    ["a drawing command before any move", "L 1 1"],
    ["a half-finished point", "M 0 0 L 1"],
    ["a close with nothing open", "Z"],
    ["nothing at all", "   "]
  ] as const) {
    it(`refuses ${label}`, () => {
      const parsed = parseSvgPath(d);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.error).not.toBe("");
    });
  }
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
