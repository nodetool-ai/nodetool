import { describe, expect, it } from "vitest";
import { timelineClip } from "../src/api-schemas/timeline.js";

describe("timeline Smart Reframe schema", () => {
  it("round-trips automatic samples and manual source-time keyframes", () => {
    const reframe = {
      mode: "track" as const,
      trackId: "subject",
      safeMargin: 0.1,
      smoothing: 0.25,
      sourceAssetId: "asset-1",
      sourceWidth: 1920,
      sourceHeight: 1080,
      samples: [{ sourceMs: 0, x: 0.4, y: 0.5, confidence: 0.9 }],
      keyframes: [{ sourceMs: 500, x: 0.6, y: 0.5, zoom: 1.2 }]
    };
    const parsed = timelineClip.parse({
      id: "clip-1",
      trackId: "track-1",
      name: "Shot",
      startMs: 0,
      durationMs: 1000,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      locked: false,
      versions: [],
      reframe
    });
    expect(parsed.reframe).toEqual(reframe);
  });

  it("rejects invalid captured source dimensions", () => {
    const parsed = timelineClip.safeParse({
      id: "clip-1",
      trackId: "track-1",
      name: "Shot",
      startMs: 0,
      durationMs: 1000,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      locked: false,
      versions: [],
      reframe: { mode: "center", sourceWidth: 0, sourceHeight: 1080 }
    });
    expect(parsed.success).toBe(false);
  });
});
