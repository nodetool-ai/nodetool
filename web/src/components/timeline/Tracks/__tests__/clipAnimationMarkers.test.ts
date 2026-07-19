import type { ClipAnimation } from "@nodetool-ai/timeline";

import { deriveClipAnimationMarkers } from "../clipAnimationMarkers";

const animation = (
  overrides: Partial<ClipAnimation>
): ClipAnimation => ({
  id: "animation",
  role: "in",
  preset: "fade",
  durationMs: 500,
  ...overrides
});

describe("deriveClipAnimationMarkers", () => {
  it("maps in and out windows to zoomed clip zones", () => {
    expect(
      deriveClipAnimationMarkers(
        [
          animation({ role: "in", durationMs: 500, delayMs: 100 }),
          animation({ role: "out", durationMs: 300, delayMs: 200 })
        ],
        10,
        400
      )
    ).toEqual({
      inZone: { offsetPx: 10, widthPx: 50 },
      outZone: { offsetPx: 20, widthPx: 30 },
      hasLoopOrEmphasis: false
    });
  });

  it("hides sub-pixel clutter and ignores disabled animations", () => {
    expect(
      deriveClipAnimationMarkers(
        [
          animation({ durationMs: 50 }),
          animation({ role: "loop", enabled: false })
        ],
        10,
        100
      )
    ).toEqual({
      inZone: undefined,
      outZone: undefined,
      hasLoopOrEmphasis: false
    });
  });

  it("shows the loop glyph for loop and emphasis motion", () => {
    expect(
      deriveClipAnimationMarkers(
        [animation({ role: "emphasis", preset: "pulse" })],
        10,
        100
      ).hasLoopOrEmphasis
    ).toBe(true);
  });
});
