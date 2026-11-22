import {
  automationHitRects,
  CLIP_NAME_BAR_BOTTOM_PX,
  CLIP_TOP_PX,
  shownAutomationKey
} from "../automation/automationLayout";

const inside = (rects: { x: number; y: number; width: number; height: number }[], x: number, y: number) =>
  rects.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);

describe("automationHitRects", () => {
  const rects = automationHitRects([{ startMs: 1000, durationMs: 1000 }], 10, 500, 80);

  it("leaves the whole name bar of a clip to the clip, from the clip's top", () => {
    // The clip spans x 100..200 and draws its name at y 6..24.
    for (const y of [CLIP_TOP_PX, 12, CLIP_NAME_BAR_BOTTOM_PX - 1]) {
      expect(inside(rects, 150, y)).toBe(false);
    }
  });

  it("takes the pointer below the name bar and in the padding above the clips", () => {
    expect(inside(rects, 150, CLIP_NAME_BAR_BOTTOM_PX)).toBe(true);
    expect(inside(rects, 150, 2)).toBe(true);
  });

  it("takes the pointer between and beside clips at name bar height", () => {
    expect(inside(rects, 50, 12)).toBe(true);
    expect(inside(rects, 300, 12)).toBe(true);
  });
});

describe("shownAutomationKey", () => {
  const lane = (key: string) => ({
    id: key,
    target: { kind: "device" as const, deviceId: "gone", param: "freq" },
    points: [{ timeMs: 0, value: 1 }]
  });
  const track = { type: "audio" as const, automation: [lane("x")] };

  it("skips a stored or automated key whose control no longer exists", () => {
    const valid = new Set(["mixer:volumeDb", "mixer:pan"]);
    expect(shownAutomationKey(track, "device:gone:freq", valid)).toBe("mixer:volumeDb");
    expect(shownAutomationKey(track, undefined, valid)).toBe("mixer:volumeDb");
    expect(shownAutomationKey(track, "mixer:pan", valid)).toBe("mixer:pan");
  });

  it("keeps the stored key when no key set is given", () => {
    expect(shownAutomationKey(track, "device:gone:freq")).toBe("device:gone:freq");
  });
});
