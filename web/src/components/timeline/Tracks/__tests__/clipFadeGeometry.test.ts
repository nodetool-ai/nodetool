import { deriveClipFadeMarkers } from "../clipFadeGeometry";

describe("deriveClipFadeMarkers", () => {
  it("maps fade and transition durations to pixels at the current zoom", () => {
    expect(
      deriveClipFadeMarkers(
        {
          fadeInMs: 500,
          fadeOutMs: 300,
          transitionIn: { type: "crossfade", durationMs: 800 }
        },
        10,
        400
      )
    ).toEqual({
      fadeIn: { widthPx: 50 },
      fadeOut: { widthPx: 30 },
      transitionIn: { widthPx: 80, type: "crossfade" }
    });
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
    expect(deriveClipFadeMarkers({ fadeInMs: 9000 }, 10, 100).fadeIn).toEqual({
      widthPx: 100
    });
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
    expect(markers.fadeIn).toEqual({ widthPx: 50 });
    expect(markers.fadeOut).toEqual({ widthPx: 50 });

    // Only the longer one is clamped when the shorter fits in its half.
    const uneven = deriveClipFadeMarkers(
      { fadeInMs: 200, fadeOutMs: 900 },
      10,
      100
    );
    expect(uneven.fadeIn).toEqual({ widthPx: 20 });
    expect(uneven.fadeOut).toEqual({ widthPx: 50 });
  });

  it("drops sub-pixel ramps", () => {
    expect(deriveClipFadeMarkers({ fadeInMs: 10 }, 10, 400).fadeIn).toBeUndefined();
  });
});
