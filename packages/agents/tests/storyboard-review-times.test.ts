import { describe, expect, it } from "vitest";
import { makeClip } from "@nodetool-ai/timeline";
import { storyboardReviewTimes } from "../src/capabilities/storyboard-review-times.js";

describe("finished-cut evidence schedule", () => {
  it("refuses excessive evidence instead of silently omitting events", () => {
    const clips = Array.from({ length: 50 }, (_, index) => makeClip({ mediaType: "image", startMs: index * 3000, durationMs: 3000 }));
    expect(() => storyboardReviewTimes(clips, 1080, 1920, 30)).toThrow("128-frame limit");
  });
  it("includes exit fade and cross-shot transition boundaries and midpoints", () => {
    const clips = [
      makeClip({ id: "first", mediaType: "image", startMs: 0, durationMs: 3000, animations: [{ id: "exit", preset: "fade", role: "out", durationMs: 300 }] }),
      makeClip({ id: "second", mediaType: "image", startMs: 3000, durationMs: 3000, transitionIn: { type: "crossfade", durationMs: 400 } })
    ];
    const times = storyboardReviewTimes(clips, 1080, 1920, 30);
    expect(times).toEqual(expect.arrayContaining([0, 1500, 2700, 2850, 2967, 3000, 3200, 3400, 4500, 5967]));
    expect(times).toEqual([...new Set(times)].sort((a, b) => a - b));
  });
});
