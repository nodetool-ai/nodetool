import { describe, expect, it } from "vitest";
import { buildSnapPoints } from "../src/snapping/buildSnapPoints.js";

describe("buildSnapPoints", () => {
  it("returns empty array for empty source", () => {
    expect(buildSnapPoints({})).toEqual([]);
  });

  it("includes playheadMs when provided", () => {
    expect(buildSnapPoints({ playheadMs: 5000 })).toEqual([5000]);
  });

  it("generates tick intervals from 0 to maxTimeMs", () => {
    expect(buildSnapPoints({ tickIntervalMs: 1000, maxTimeMs: 3000 })).toEqual([
      0, 1000, 2000, 3000,
    ]);
  });

  it("generates fractional tick intervals as exact multiples (no drift)", () => {
    const points = buildSnapPoints({ tickIntervalMs: 0.5, maxTimeMs: 2 });
    expect(points).toEqual([0, 0.5, 1, 1.5, 2]);
    // Each point is exactly i * interval, so it dedupes against integer sources.
    points.forEach((t, i) => expect(t).toBe(i * 0.5));
  });

  it("ignores tickIntervalMs when it is zero or negative", () => {
    expect(buildSnapPoints({ tickIntervalMs: 0, maxTimeMs: 3000 })).toEqual([]);
    expect(buildSnapPoints({ tickIntervalMs: -100, maxTimeMs: 3000 })).toEqual(
      []
    );
  });

  it("includes marker times", () => {
    expect(
      buildSnapPoints({
        markers: [{ timeMs: 1500 }, { timeMs: 4500 }],
      })
    ).toEqual([1500, 4500]);
  });

  it("includes clip start and end boundaries", () => {
    expect(
      buildSnapPoints({
        clips: [
          { id: "c1", startMs: 1000, durationMs: 2000 },
          { id: "c2", startMs: 5000, durationMs: 1000 },
        ],
      })
    ).toEqual([1000, 3000, 5000, 6000]);
  });

  it("excludes clip boundaries when excludeClipIds is set", () => {
    expect(
      buildSnapPoints({
        clips: [
          { id: "c1", startMs: 1000, durationMs: 2000 },
          { id: "c2", startMs: 5000, durationMs: 1000 },
        ],
        excludeClipIds: new Set(["c1"]),
      })
    ).toEqual([5000, 6000]);
  });

  it("deduplicates identical values from multiple sources", () => {
    expect(
      buildSnapPoints({
        playheadMs: 2000,
        tickIntervalMs: 1000,
        maxTimeMs: 2000,
        clips: [{ id: "c1", startMs: 2000, durationMs: 1000 }],
      })
    ).toEqual([0, 1000, 2000, 3000]);
  });

  it("sorts output ascending", () => {
    expect(
      buildSnapPoints({
        clips: [
          { id: "c1", startMs: 5000, durationMs: 1000 },
          { id: "c2", startMs: 1000, durationMs: 2000 },
        ],
        markers: [{ timeMs: 300 }],
      })
    ).toEqual([300, 1000, 3000, 5000, 6000]);
  });

  it("combines all sources together", () => {
    expect(
      buildSnapPoints({
        playheadMs: 2500,
        tickIntervalMs: 1000,
        maxTimeMs: 4000,
        markers: [{ timeMs: 3500 }],
        clips: [{ id: "c1", startMs: 1500, durationMs: 1000 }],
      })
    ).toEqual([0, 1000, 1500, 2000, 2500, 3000, 3500, 4000]);
  });
});
