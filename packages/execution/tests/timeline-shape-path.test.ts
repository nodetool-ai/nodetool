/**
 * `shape_path_invalid`: a `path`-kind shape whose own `d` this build cannot
 * parse (I2). An error, not a warning — unlike a mask, which leaves the layer
 * drawing unmasked, a shape with unparseable path data draws nothing at all.
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

const shapePathErrors = (
  result: ReturnType<typeof validateTimelineSequence>
): ReadonlyArray<{ message: string; path?: string }> =>
  result.errors.filter((e) => e.code === "shape_path_invalid");

describe("validateTimelineSequence — shape path data", () => {
  it("reports a path shape this build cannot parse, naming the command", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          id: "a",
          shapeStyle: { kind: "path", d: "M 0 0 B 1 1" }
        })
      ])
    );
    const errors = shapePathErrors(result);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("shapeStyle.d");
    expect(result.ok).toBe(false);
  });

  it("stays quiet on a path shape drawn with the full grammar, arcs included", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          id: "a",
          shapeStyle: { kind: "path", d: "M 0.1 0.5 A 0.4 0.4 0 0 1 0.9 0.5 Z" }
        })
      ])
    );
    expect(shapePathErrors(result)).toEqual([]);
  });

  it("stays quiet on shapes that are not a path kind at all", () => {
    const result = validateTimelineSequence(
      doc([
        clip({ id: "a", shapeStyle: { kind: "rect" } }),
        clip({ id: "b", startMs: 1000, mediaType: "video" })
      ])
    );
    expect(shapePathErrors(result)).toEqual([]);
  });

  it("reports a path shape with no d at all — it draws nothing too", () => {
    const result = validateTimelineSequence(
      doc([clip({ id: "a", shapeStyle: { kind: "path" } })])
    );
    const errors = shapePathErrors(result);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("shapeStyle.d");
  });
});
