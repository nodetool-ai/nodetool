/**
 * Clip → price mapping, and what a sequence adds up to. Priced against the
 * shipped catalogs rather than a mock.
 */

import { makeClip } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { clipGenerationSpec } from "../useClipCostEstimate";
import { summarizeClipCosts } from "../useTimelineCostEstimate";

/** A fal video endpoint whose published grid sells 720p and 1080p apart. */
const VIDEO = { provider: "fal_ai", model: "wan/v2.6/image-to-video" };

function videoClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    ...makeClip({ trackId: "t1", startMs: 0, durationMs: 5000 }),
    name: "Shot 1",
    mediaType: "video",
    sourceType: "generated",
    bindingKind: "text-to-video",
    resolution: "720p",
    ...VIDEO,
    ...overrides
  };
}

describe("clipGenerationSpec", () => {
  it("declines a workflow-bound clip — its cost is its graph's", () => {
    expect(
      clipGenerationSpec({ bindingKind: "workflow", model: "whatever" })
    ).toBeNull();
  });

  it("declines a clip with no model picked", () => {
    expect(clipGenerationSpec({ bindingKind: "text-to-video" })).toBeNull();
  });

  it("bills a video clip for the length it occupies on the timeline", () => {
    expect(
      clipGenerationSpec({ ...VIDEO, bindingKind: "text-to-video", durationMs: 8000 })
    ).toMatchObject({ kind: "video", seconds: 8 });
  });

  it("leaves an image clip's duration out of the price", () => {
    expect(
      clipGenerationSpec({ ...VIDEO, bindingKind: "text-to-image", durationMs: 8000 })
    ).toMatchObject({ kind: "image", seconds: null });
  });

  it("maps a text-to-audio clip to the audio kind", () => {
    expect(
      clipGenerationSpec({ ...VIDEO, bindingKind: "text-to-audio" })
    ).toMatchObject({ kind: "audio" });
  });
});

describe("summarizeClipCosts", () => {
  it("returns nothing for a sequence of imported clips", () => {
    expect(
      summarizeClipCosts([videoClip({ sourceType: "imported" })])
    ).toBeNull();
  });

  it("sums every priced clip", () => {
    const one = summarizeClipCosts([videoClip()]);
    const two = summarizeClipCosts([videoClip(), videoClip({ id: "c2" })]);
    expect(one?.total).toBeGreaterThan(0);
    expect(two?.total).toBeCloseTo((one?.total ?? 0) * 2, 10);
    expect(two?.pricedCount).toBe(2);
    expect(two?.isLowerBound).toBe(false);
  });

  it("counts a clip it cannot price and says the total is a floor", () => {
    const summary = summarizeClipCosts([
      videoClip(),
      videoClip({ id: "c2", bindingKind: "workflow", workflowId: "w1" })
    ]);
    expect(summary?.pricedCount).toBe(1);
    expect(summary?.unpricedCount).toBe(1);
    expect(summary?.isLowerBound).toBe(true);
    expect(summary?.lines.at(-1)).toContain("1 clip without a known price");
  });

  it("summarizes past six clips instead of listing them all", () => {
    const clips = Array.from({ length: 9 }, (_, i) =>
      videoClip({ id: `c${i}` })
    );
    const summary = summarizeClipCosts(clips);
    expect(summary?.pricedCount).toBe(9);
    expect(summary?.lines).toHaveLength(7);
    expect(summary?.lines.at(-1)).toBe("+3 more clips");
  });
});
