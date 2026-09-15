import { describe, expect, it } from "vitest";
import { createTimelineToolBridge } from "../src/evals/surfaces/timeline.js";

const baseVersion = {
  id: "take-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  jobId: "job-1",
  assetId: "asset-1",
  workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
  dependencyHash: "",
  paramOverridesSnapshot: {},
  status: "success" as const,
  source: "imported" as const
};

function bridge() {
  return createTimelineToolBridge({
    sequence: {
      tracks: [{ id: "track-1", name: "Video", type: "video", index: 0, visible: true, locked: false }],
      clips: [{
        id: "clip-1",
        trackId: "track-1",
        name: "hero",
        startMs: 0,
        durationMs: 4000,
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        locked: false,
        versions: [baseVersion],
        currentAssetId: "asset-1",
        activeTakeId: "take-1"
      }],
      mediaTracks: [{
        id: "track-object-1",
        clipId: "clip-1",
        sourceAssetId: "asset-1",
        name: "phone",
        kind: "box",
        sourceStartMs: 0,
        sourceEndMs: 4000,
        samples: [],
        status: "ready"
      }]
    }
  });
}

describe("ui_timeline_generatively_edit_clip", () => {
  it("adds an extend take without replacing the active take", async () => {
    const bridgeInstance = bridge();
    const tool = bridgeInstance.tools.find(
      (candidate) => candidate.name === "ui_timeline_generatively_edit_clip"
    );
    expect(tool).toBeDefined();
    const result = (await tool!.execute({
      target: "hero",
      operation: "extend",
      direction: "end",
      durationMs: 2000,
      prompt: "keep the logo visible"
    })) as {
      activeTakeId: string;
      take: { source: string; durationMs: number };
      clip: { currentAssetId: string; takeCount: number };
    };
    expect(result.activeTakeId).toBe("take-1");
    expect(result.take).toMatchObject({ source: "extended", durationMs: 6000 });
    expect(result.clip.currentAssetId).toBe("asset-1");
    expect(result.clip.takeCount).toBe(2);
  });

  it("routes object replacement through the existing MediaTrack", async () => {
    const tool = bridge().tools.find(
      (candidate) => candidate.name === "ui_timeline_generatively_edit_clip"
    )!;
    const result = (await tool.execute({
      target: "hero",
      operation: "replace_object",
      prompt: "replace the phone with a black bottle",
      referenceAssetIds: ["asset-bottle"]
    })) as { routing: { requiredCapabilities: string[] }; take: { source: string } };
    expect(result.take.source).toBe("object_replace");
    expect(result.routing.requiredCapabilities).toEqual([
      "video.object_replace",
      "video.mask_input"
    ]);
  });

  it("rejects an internal range outside the clip and missing tracking", async () => {
    const tool = bridge().tools.find(
      (candidate) => candidate.name === "ui_timeline_generatively_edit_clip"
    )!;
    await expect(tool.execute({
      target: "hero",
      operation: "replace_range",
      range: { startMs: 1000, endMs: 5000 }
    })).rejects.toThrow("range must be inside the clip");

    const noTracking = createTimelineToolBridge({
      tracks: [{ type: "video" }],
      clips: [{ name: "hero", trackIndex: 0, startMs: 0, durationMs: 1000 }]
    }).tools.find((candidate) => candidate.name === "ui_timeline_generatively_edit_clip")!;
    await expect(noTracking.execute({
      target: "hero",
      operation: "remove_object",
      prompt: "remove the phone"
    })).rejects.toThrow("Run track_object first");
  });
});
