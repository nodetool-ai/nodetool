import { describe, it, expect } from "@jest/globals";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

import { gapStartsMs, slowShuttleRate, stepSelectionIds } from "../editPoints";

describe("slowShuttleRate", () => {
  it("starts at 10% and each press in the same direction adds 10%, up to normal speed", () => {
    expect(slowShuttleRate(false, 1, 1)).toBe(0.1);
    expect(slowShuttleRate(true, 0.1, 1)).toBe(0.2);
    expect(slowShuttleRate(true, 0.9, 1)).toBe(1);
    expect(slowShuttleRate(true, 0.3, -1)).toBe(-0.1);
    expect(slowShuttleRate(true, -0.3, -1)).toBe(-0.4);
    // Already at full speed: start slow again.
    expect(slowShuttleRate(true, 2, 1)).toBe(0.1);
  });
});

describe("gapStartsMs", () => {
  it("lists where each stretch no track covers starts", () => {
    const clips = [
      makeClip({ id: "a", trackId: "v", startMs: 500, durationMs: 1000 }),
      makeClip({ id: "b", trackId: "a", startMs: 1200, durationMs: 1000 }),
      makeClip({ id: "c", trackId: "v", startMs: 4000, durationMs: 1000 })
    ];
    expect(gapStartsMs(clips)).toEqual([0, 2200]);
  });
});

describe("stepSelectionIds", () => {
  it("steps each track of the selection and stays put at the end", () => {
    const tracks = [makeTrack({ id: "v" }), makeTrack({ id: "w" })];
    const clips = [
      makeClip({ id: "a", trackId: "v", startMs: 0, durationMs: 1000 }),
      makeClip({ id: "b", trackId: "v", startMs: 1000, durationMs: 1000 }),
      makeClip({ id: "x", trackId: "w", startMs: 0, durationMs: 1000 })
    ];
    expect(stepSelectionIds(clips, tracks, new Set(["a", "x"]), true)).toEqual(["b"]);
    expect(stepSelectionIds(clips, tracks, new Set(["b"]), true)).toBeNull();
    expect(stepSelectionIds(clips, tracks, new Set(["a", "b"]), false)).toBeNull();
  });
});
