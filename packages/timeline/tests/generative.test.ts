import { describe, expect, it } from "vitest";
import {
  composeGenerativeTakePatch,
  planGenerativeOperation,
  takeSourceForOperation
} from "../src/generative.js";
import type { MediaTrack, TimelineClip } from "../src/types.js";

const clip = (overrides: Partial<TimelineClip> = {}): TimelineClip => ({
  id: "clip-1",
  trackId: "track-1",
  name: "Hero",
  startMs: 1000,
  durationMs: 5000,
  inPointMs: 200,
  outPointMs: 5200,
  mediaType: "video",
  sourceType: "generated",
  currentAssetId: "asset-1",
  status: "generated",
  locked: false,
  versions: [],
  opacity: 0.7,
  ...overrides
});

const track: MediaTrack = {
  id: "track-object",
  clipId: "clip-1",
  sourceAssetId: "asset-1",
  name: "Phone",
  kind: "box",
  sourceStartMs: 0,
  sourceEndMs: 5000,
  samples: [{ sourceMs: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 }],
  status: "ready"
};

describe("generative timeline operations", () => {
  it("builds capability-routed extend requests", () => {
    const result = planGenerativeOperation({
      clip: clip(),
      operation: "extend",
      direction: "end",
      durationMs: 1500,
      prompt: "keep the logo visible"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.requiredCapabilities).toEqual(["video.extend"]);
      expect(result.request.optionalCapabilities).toContain("video.first_last_frame");
      expect(result.request.sourceAssetId).toBe("asset-1");
    }
  });

  it("rejects invalid ranges and extension arguments", () => {
    expect(planGenerativeOperation({ clip: clip(), operation: "extend", direction: "end" }).ok).toBe(false);
    expect(planGenerativeOperation({ clip: clip(), operation: "extend", direction: "end", durationMs: 10, range: { startMs: 1, endMs: 2 } }).ok).toBe(false);
    expect(planGenerativeOperation({ clip: clip(), operation: "regenerate", range: { startMs: 0, endMs: 5001 } }).ok).toBe(false);
    expect(planGenerativeOperation({ clip: clip(), operation: "replace_range", range: { startMs: 4, endMs: 4 } }).ok).toBe(false);
  });

  it("requires a ready, current-asset track for object operations", () => {
    const base = { clip: clip(), operation: "remove_object" as const, range: { startMs: 100, endMs: 900 }, trackId: "track-object", mediaTracks: [track] };
    expect(planGenerativeOperation(base).ok).toBe(true);
    expect(planGenerativeOperation({ ...base, trackId: "missing" }).ok).toBe(false);
    expect(planGenerativeOperation({ ...base, mediaTracks: [{ ...track, sourceAssetId: "old" }] }).ok).toBe(false);
    expect(planGenerativeOperation({ ...base, mediaTracks: [{ ...track, status: "stale" }] }).ok).toBe(false);
  });

  it("routes object replacement with mask and optional references", () => {
    const result = planGenerativeOperation({
      clip: clip(),
      operation: "replace_object",
      range: { startMs: 100, endMs: 900 },
      trackId: track.id,
      mediaTracks: [track],
      referenceAssetIds: ["bottle.png"]
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.requiredCapabilities).toEqual(["video.object_replace", "video.mask_input"]);
      expect(result.request.referenceAssetIds).toEqual(["bottle.png"]);
    }
  });

  it("adds a completed take without changing editorial fields", () => {
    const original = clip({ versions: [{
      id: "take-1", createdAt: "2025-01-01", jobId: "job-1", assetId: "asset-1",
      workflowUpdatedAt: "2025-01-01", dependencyHash: "hash-1", paramOverridesSnapshot: {}, status: "success"
    }] });
    const patched = composeGenerativeTakePatch(original, "replace_object", {
      assetId: "asset-2", jobId: "job-2", createdAt: "2025-01-02", dependencyHash: "hash-2",
      provider: "provider", model: "model", prompt: "a bottle"
    });
    expect(patched.startMs).toBe(original.startMs);
    expect(patched.durationMs).toBe(original.durationMs);
    expect(patched.inPointMs).toBe(original.inPointMs);
    expect(patched.opacity).toBe(original.opacity);
    expect(patched.currentAssetId).toBe("asset-1");
    expect(patched.activeTakeId).toBeUndefined();
    expect(patched.versions).toHaveLength(2);
    expect(patched.versions[1]).toMatchObject({ source: "object_replace", parentTakeId: "take-1", provider: "provider" });
    expect(composeGenerativeTakePatch(original, "regenerate", { assetId: "asset-failed", createdAt: "2025-01-03", status: "failed" })).toBe(original);
  });

  it("makes a new take active only after an explicit selection", () => {
    const original = clip();
    const patched = composeGenerativeTakePatch(original, "extend", {
      assetId: "asset-2",
      createdAt: "2025-01-02",
      activate: true
    });
    expect(patched.currentAssetId).toBe("asset-2");
    expect(patched.activeTakeId).toBe("clip-1:2025-01-02");
  });

  it("keeps stale and locked clips unchanged while appending a candidate", () => {
    for (const original of [
      clip({ status: "stale" }),
      clip({ locked: true, status: "generated" })
    ]) {
      const patched = composeGenerativeTakePatch(original, "restyle", {
        assetId: "asset-2",
        createdAt: "2025-01-02"
      });
      expect(patched.status).toBe(original.status);
      expect(patched.locked).toBe(original.locked);
      expect(patched.currentAssetId).toBe(original.currentAssetId);
    }
  });

  it("maps every operation to existing take provenance", () => {
    expect(takeSourceForOperation("extend")).toBe("extended");
    expect(takeSourceForOperation("remove_object")).toBe("inpainted");
    expect(takeSourceForOperation("replace_object")).toBe("object_replace");
    expect(takeSourceForOperation("restyle")).toBe("video_to_video");
    expect(takeSourceForOperation("regenerate")).toBe("generated");
  });
});
