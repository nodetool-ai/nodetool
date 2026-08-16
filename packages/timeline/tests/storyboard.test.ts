/**
 * Tests for storyboard → timeline assembly (storyboard.ts).
 */

import { describe, it, expect } from "vitest";
import type { Shot } from "@nodetool-ai/protocol";
import {
  DEFAULT_SHOT_MS,
  buildStoryboardPreviewTimeline,
  buildStoryboardTimeline
} from "../src/storyboard.js";

function makeShot(overrides: Partial<Shot> & Pick<Shot, "id" | "index">): Shot {
  return {
    type: "shot",
    action: "a lighthouse at dusk",
    status: "planned",
    ...overrides
  };
}

const clipRef = (assetId: string) =>
  ({ type: "video", asset_id: assetId }) as const;
const keyframeRef = (assetId: string) =>
  ({ type: "image", asset_id: assetId }) as const;

// ── buildStoryboardTimeline ───────────────────────────────────────────

describe("buildStoryboardTimeline", () => {
  it("keeps only rendered shots with a clip asset", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      shots: [
        makeShot({
          id: "a",
          index: 0,
          status: "rendered",
          clip: clipRef("asset-a")
        }),
        makeShot({
          id: "b",
          index: 1,
          status: "keyframe_ready",
          keyframe: keyframeRef("still-b")
        }),
        makeShot({ id: "c", index: 2, status: "rendered" })
      ]
    });

    expect(result.clips).toHaveLength(1);
    expect(result.clips[0].currentAssetId).toBe("asset-a");
    expect(result.skippedShotIds).toEqual(["b", "c"]);
    expect(result.durationMs).toBe(DEFAULT_SHOT_MS);
  });

  it("lays narration across the full cut as a draft audio clip", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      narration: "  the light turns  ",
      shots: [
        makeShot({
          id: "a",
          index: 0,
          status: "rendered",
          duration_seconds: 2.5,
          clip: clipRef("asset-a")
        })
      ]
    });

    const narration = result.clips.find((c) => c.mediaType === "audio");
    expect(narration).toBeDefined();
    expect(narration?.prompt).toBe("the light turns");
    expect(narration?.status).toBe("draft");
    expect(narration?.startMs).toBe(0);
    expect(narration?.durationMs).toBe(2500);
    expect(result.tracks.map((t) => t.name)).toEqual(["Shots", "Narration"]);
  });
});

// ── buildStoryboardPreviewTimeline ────────────────────────────────────

describe("buildStoryboardPreviewTimeline", () => {
  it("turns a clip-backed shot into a video clip", () => {
    const result = buildStoryboardPreviewTimeline({
      boardId: "board-1",
      shots: [
        makeShot({
          id: "a",
          index: 0,
          slug: "Lighthouse",
          status: "rendered",
          duration_seconds: 3,
          clip: clipRef("asset-a")
        })
      ]
    });

    expect(result.clips).toHaveLength(1);
    const clip = result.clips[0];
    expect(clip.mediaType).toBe("video");
    expect(clip.sourceType).toBe("imported");
    expect(clip.status).toBe("generated");
    expect(clip.currentAssetId).toBe("asset-a");
    expect(clip.name).toBe("Lighthouse");
    expect(clip.startMs).toBe(0);
    expect(clip.durationMs).toBe(3000);
    expect(result.stillShotIds).toEqual([]);
    expect(result.skippedShotIds).toEqual([]);
  });

  it("holds a keyframe still when the shot has no clip asset", () => {
    const result = buildStoryboardPreviewTimeline({
      boardId: "board-1",
      shots: [
        makeShot({
          id: "a",
          index: 0,
          status: "keyframe_ready",
          keyframe: keyframeRef("still-a")
        })
      ]
    });

    expect(result.clips[0].mediaType).toBe("image");
    expect(result.clips[0].sourceType).toBe("imported");
    expect(result.clips[0].status).toBe("generated");
    expect(result.clips[0].currentAssetId).toBe("still-a");
    expect(result.stillShotIds).toEqual(["a"]);
  });

  it("plays a selected take whose shot is not yet marked rendered", () => {
    const result = buildStoryboardPreviewTimeline({
      boardId: "board-1",
      shots: [
        makeShot({
          id: "a",
          index: 0,
          status: "clip_generating",
          clip: clipRef("asset-a"),
          keyframe: keyframeRef("still-a")
        })
      ]
    });

    expect(result.clips).toHaveLength(1);
    expect(result.clips[0].mediaType).toBe("video");
    expect(result.clips[0].currentAssetId).toBe("asset-a");
    expect(result.stillShotIds).toEqual([]);
  });

  it("skips a shot with neither clip nor keyframe asset", () => {
    const result = buildStoryboardPreviewTimeline({
      boardId: "board-1",
      shots: [
        makeShot({ id: "a", index: 0 }),
        makeShot({
          id: "b",
          index: 1,
          clip: { type: "video", asset_id: null },
          keyframe: { type: "image", asset_id: "" }
        })
      ]
    });

    expect(result.clips).toEqual([]);
    expect(result.skippedShotIds).toEqual(["a", "b"]);
    expect(result.durationMs).toBe(0);
  });

  it("orders clips by shot index and lays them end to end", () => {
    const result = buildStoryboardPreviewTimeline({
      boardId: "board-1",
      shots: [
        makeShot({
          id: "c",
          index: 2,
          duration_seconds: 1,
          clip: clipRef("asset-c")
        }),
        makeShot({
          id: "a",
          index: 0,
          duration_seconds: 2,
          clip: clipRef("asset-a")
        }),
        makeShot({
          id: "b",
          index: 1,
          keyframe: keyframeRef("still-b")
        })
      ]
    });

    expect(result.clips.map((c) => c.storyboardShotId)).toEqual([
      "a",
      "b",
      "c"
    ]);
    expect(result.clips.map((c) => c.startMs)).toEqual([0, 2000, 6000]);
    expect(result.clips.map((c) => c.durationMs)).toEqual([
      2000,
      DEFAULT_SHOT_MS,
      1000
    ]);
    expect(result.durationMs).toBe(7000);
    expect(result.stillShotIds).toEqual(["b"]);
  });

  it("falls back to the default length when duration_seconds is missing", () => {
    const result = buildStoryboardPreviewTimeline({
      boardId: "board-1",
      shots: [
        makeShot({ id: "a", index: 0, clip: clipRef("asset-a") }),
        makeShot({
          id: "b",
          index: 1,
          duration_seconds: 0,
          clip: clipRef("asset-b")
        })
      ]
    });

    expect(result.clips.map((c) => c.durationMs)).toEqual([
      DEFAULT_SHOT_MS,
      DEFAULT_SHOT_MS
    ]);
    expect(result.durationMs).toBe(DEFAULT_SHOT_MS * 2);
  });

  it("stamps board and shot provenance onto a single Shots track", () => {
    const result = buildStoryboardPreviewTimeline({
      boardId: "board-42",
      shots: [
        makeShot({ id: "a", index: 0, clip: clipRef("asset-a") }),
        makeShot({ id: "b", index: 1, keyframe: keyframeRef("still-b") })
      ]
    });

    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].type).toBe("video");
    expect(result.tracks[0].name).toBe("Shots");
    for (const clip of result.clips) {
      expect(clip.storyboardBoardId).toBe("board-42");
      expect(clip.trackId).toBe(result.tracks[0].id);
      expect(clip.versions).toEqual([]);
    }
    expect(result.clips.map((c) => c.storyboardShotId)).toEqual(["a", "b"]);
    expect(result.clips.map((c) => c.name)).toEqual(["Shot 1", "Shot 2"]);
  });
});
