import { fadeShapeGain } from "@nodetool-ai/timeline";

import { deriveClipFadeMarkers } from "../clipFadeGeometry";

/** The y of the ramp path's `i`th point, in the overlay's unit space. */
function rampPointY(path: string, i: number): number {
  const points = path.replace("M ", "").split(" L ");
  return Number(points[i].split(",")[1]);
}

describe("deriveClipFadeMarkers", () => {
  it("maps fade and transition durations to pixels at the current zoom", () => {
    const markers = deriveClipFadeMarkers(
      {
        fadeInMs: 500,
        fadeOutMs: 300,
        transitionIn: { type: "crossfade", durationMs: 800 }
      },
      10,
      400
    );
    expect(markers.fadeIn?.widthPx).toBe(50);
    expect(markers.fadeOut?.widthPx).toBe(30);
    expect(markers.transitionIn).toEqual({ widthPx: 80, type: "crossfade" });
  });

  it("leaves every marker out when the clip carries none", () => {
    expect(deriveClipFadeMarkers({}, 10, 400)).toEqual({
      fadeIn: undefined,
      fadeOut: undefined,
      transitionIn: undefined
    });
    expect(deriveClipFadeMarkers({ fadeInMs: 0 }, 10, 400).fadeIn).toBeUndefined();
  });

  it("clamps a single fade to the clip width", () => {
    expect(deriveClipFadeMarkers({ fadeInMs: 9000 }, 10, 100).fadeIn?.widthPx).toBe(
      100
    );
    expect(
      deriveClipFadeMarkers(
        { transitionIn: { type: "wipe", durationMs: 9000 } },
        10,
        100
      ).transitionIn
    ).toEqual({ widthPx: 100, type: "wipe" });
  });

  it("clamps overlapping fades to half the clip each", () => {
    const markers = deriveClipFadeMarkers(
      { fadeInMs: 800, fadeOutMs: 800 },
      10,
      100
    );
    expect(markers.fadeIn?.widthPx).toBe(50);
    expect(markers.fadeOut?.widthPx).toBe(50);

    // Only the longer one is clamped when the shorter fits in its half.
    const uneven = deriveClipFadeMarkers(
      { fadeInMs: 200, fadeOutMs: 900 },
      10,
      100
    );
    expect(uneven.fadeIn?.widthPx).toBe(20);
    expect(uneven.fadeOut?.widthPx).toBe(50);
  });

  it("drops sub-pixel ramps", () => {
    expect(deriveClipFadeMarkers({ fadeInMs: 10 }, 10, 400).fadeIn).toBeUndefined();
  });

  it("draws a straight ramp for a linear fade and a curved one otherwise", () => {
    const linear = deriveClipFadeMarkers({ fadeInMs: 500 }, 10, 400).fadeIn;
    expect(linear?.shape).toBe("linear");
    expect(linear?.rampPath).toBe("M 0.0000,1.0000 L 1.0000,0.0000");

    const curved = deriveClipFadeMarkers(
      { fadeInMs: 500, fadeInShape: "plus3dB" },
      10,
      400
    ).fadeIn;
    expect(curved?.shape).toBe("plus3dB");
    // The +3 dB curve is above the straight line: less signal removed at the
    // midpoint, so the ramp sits higher (smaller y).
    expect(rampPointY(curved?.rampPath ?? "", 12)).toBeCloseTo(
      1 - fadeShapeGain("plus3dB", 0.5),
      3
    );
    expect(rampPointY(curved?.rampPath ?? "", 12)).toBeLessThan(0.5);
  });

  it("runs a fade-out's curve backwards, from full volume to silence", () => {
    const out = deriveClipFadeMarkers(
      { fadeOutMs: 500, fadeOutShape: "sCurve" },
      10,
      400
    ).fadeOut;
    expect(rampPointY(out?.rampPath ?? "", 0)).toBe(0);
    expect(rampPointY(out?.rampPath ?? "", 24)).toBe(1);
    expect(out?.fillPath.endsWith("L 1,0 L 0,0 Z")).toBe(true);
  });
});
