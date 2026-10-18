import { describe, expect, it } from "vitest";
import {
  RATE_STRETCH_MAX_SPEED,
  RATE_STRETCH_MIN_SPEED,
  rateStretchClips
} from "../src/clipSpeed.js";
import type { TimelineClip } from "../src/types.js";

function clip(
  id: string,
  startMs: number,
  durationMs: number,
  extra: Partial<TimelineClip> = {}
): TimelineClip {
  return {
    id,
    trackId: "v1",
    name: id,
    startMs,
    durationMs,
    mediaType: "video",
    sourceType: "imported",
    status: "draft",
    locked: false,
    versions: [],
    ...extra
  };
}

const byId = (clips: TimelineClip[], id: string): TimelineClip => {
  const found = clips.find((c) => c.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

describe("rateStretchClips", () => {
  it("slows a clip down to fill a longer end edge", () => {
    const out = rateStretchClips([clip("a", 0, 1000)], new Set(["a"]), "a", "end", 2000);
    expect(byId(out, "a")).toMatchObject({ startMs: 0, durationMs: 2000, speedMultiplier: 0.5 });
  });

  it("keeps the end in place for a start-edge stretch", () => {
    const out = rateStretchClips(
      [clip("a", 1000, 1000)],
      new Set(["a"]),
      "a",
      "start",
      500
    );
    expect(byId(out, "a")).toMatchObject({ startMs: 1500, durationMs: 500, speedMultiplier: 2 });
  });

  it("stops at the neighbour on the track", () => {
    const out = rateStretchClips(
      [clip("a", 0, 1000), clip("b", 1500, 1000)],
      new Set(["a"]),
      "a",
      "end",
      4000
    );
    expect(byId(out, "a").durationMs).toBe(1500);
  });

  it("stretches linked partners by the same factor", () => {
    const out = rateStretchClips(
      [
        clip("v", 0, 1000, { linkId: "L" }),
        clip("s", 0, 1000, { linkId: "L", trackId: "a1", mediaType: "audio" }),
        clip("x", 1200, 500, { trackId: "a1", mediaType: "audio" })
      ],
      new Set(["v", "s"]),
      "v",
      "end",
      3000
    );
    // The audio track's neighbour at 1200 holds both members to 1200.
    expect(byId(out, "v").durationMs).toBe(1200);
    expect(byId(out, "s").durationMs).toBe(1200);
    expect(byId(out, "s").speedMultiplier).toBeCloseTo(1000 / 1200);
  });

  it("clamps the speed to the stretch limits", () => {
    const slow = rateStretchClips([clip("a", 0, 100)], new Set(["a"]), "a", "end", 1e6);
    expect(byId(slow, "a").speedMultiplier).toBeCloseTo(RATE_STRETCH_MIN_SPEED);
    const fast = rateStretchClips([clip("a", 0, 1000)], new Set(["a"]), "a", "end", 1);
    expect(byId(fast, "a").speedMultiplier).toBeCloseTo(RATE_STRETCH_MAX_SPEED);
  });

  it("leaves a time-remapped clip alone", () => {
    const remapped = clip("a", 0, 1000, {
      timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }] }
    });
    const out = rateStretchClips([remapped], new Set(["a"]), "a", "end", 2000);
    expect(byId(out, "a")).toBe(remapped);
  });
});
