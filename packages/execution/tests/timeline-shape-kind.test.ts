/**
 * `unknown_shape_kind`: a shape geometry this build cannot draw (I2), with the
 * fixture that triggers it and a control the check must stay quiet on.
 *
 * A warning rather than an error. `ClipShapeStyle.kind` is a plain string on
 * the wire, so a shape a newer build authored parses and reaches the renderer,
 * which builds no outline for it — the clip draws nothing, and the rest of the
 * document still plays.
 */
import { describe, expect, it } from "vitest";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

type Json = Record<string, unknown>;

const clip = (over: Json): Json => ({
  trackId: "track-1",
  name: "Clip",
  startMs: 0,
  durationMs: 1000,
  mediaType: "shape",
  sourceType: "generated",
  status: "generated",
  locked: false,
  versions: [],
  ...over
});

const doc = (clips: Json[]): Json => ({
  tracks: [
    {
      id: "track-1",
      name: "Video 1",
      type: "video",
      index: 0,
      visible: true,
      locked: false
    }
  ],
  clips,
  markers: []
});

const shapeWarnings = (
  result: ReturnType<typeof validateTimelineSequence>
): ReadonlyArray<{ message: string; path?: string }> =>
  result.warnings.filter((w) => w.code === "unknown_shape_kind");

describe("validateTimelineSequence — shape kinds", () => {
  it("stays quiet on every kind this build draws", () => {
    const result = validateTimelineSequence(
      doc([
        clip({ id: "a", shapeStyle: { kind: "rect" } }),
        clip({ id: "b", startMs: 1000, shapeStyle: { kind: "ellipse" } }),
        clip({ id: "c", startMs: 2000, shapeStyle: { kind: "line" } }),
        clip({
          id: "d",
          startMs: 3000,
          shapeStyle: { kind: "path", d: "M0 0 L1 1 Z" }
        }),
        clip({
          id: "e",
          startMs: 4000,
          shapeStyle: { kind: "polygon", sides: 6 }
        }),
        clip({ id: "f", startMs: 5000, shapeStyle: { kind: "star", sides: 5 } }),
        clip({ id: "g", startMs: 6000, mediaType: "video" })
      ])
    );
    expect(shapeWarnings(result)).toEqual([]);
  });

  it("warns on a kind from a newer build, without failing the document", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          id: "a",
          name: "Pointer",
          shapeStyle: { kind: "arrow", x: 0.1, y: 0.1, width: 0.5 }
        })
      ])
    );
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    const warnings = shapeWarnings(result);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('"arrow"');
    expect(warnings[0]!.message).toContain("rect, ellipse, line");
    expect(warnings[0]!.path).toBe("shapeStyle.kind");
  });
});
