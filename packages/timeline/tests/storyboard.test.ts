/**
 * Tests for storyboard → timeline assembly (storyboard.ts).
 */

import { describe, it, expect } from "vitest";
import type { Shot } from "@nodetool-ai/protocol";
import {
  DEFAULT_SHOT_MS,
  buildStoryboardPreviewTimeline,
  buildStoryboardTimeline,
  frameSizeForAspect
} from "../src/storyboard.js";
import type { TimelineClip } from "../src/types.js";

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

/** The picture clips — every shot also contributes its audio twin. */
const pictureClips = (clips: TimelineClip[]) =>
  clips.filter((c) => c.mediaType !== "audio");

// ── buildStoryboardTimeline ───────────────────────────────────────────

describe("frameSizeForAspect", () => {
  it("keeps the short edge at 1080 for landscape, portrait and square", () => {
    expect(frameSizeForAspect("16:9")).toEqual({ width: 1920, height: 1080 });
    expect(frameSizeForAspect("9:16")).toEqual({ width: 1080, height: 1920 });
    expect(frameSizeForAspect("1:1")).toEqual({ width: 1080, height: 1080 });
    expect(frameSizeForAspect("4:5")).toEqual({ width: 1080, height: 1350 });
  });

  it("falls back to 1920x1080 for a ratio it cannot parse", () => {
    expect(frameSizeForAspect("wide")).toEqual({ width: 1920, height: 1080 });
    expect(frameSizeForAspect("0:9")).toEqual({ width: 1920, height: 1080 });
    expect(frameSizeForAspect(null)).toEqual({ width: 1920, height: 1080 });
    expect(frameSizeForAspect(undefined)).toEqual({ width: 1920, height: 1080 });
  });
});

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

    expect(pictureClips(result.clips)).toHaveLength(1);
    expect(pictureClips(result.clips)[0].currentAssetId).toBe("asset-a");
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

    const narration = result.clips.find((c) => c.name === "Narration");
    expect(narration).toBeDefined();
    expect(narration?.prompt).toBe("the light turns");
    expect(narration?.status).toBe("draft");
    expect(narration?.startMs).toBe(0);
    expect(narration?.durationMs).toBe(2500);
    expect(result.tracks.map((t) => t.name)).toEqual([
      "Shots",
      "Shot Audio",
      "Narration"
    ]);
  });

  it("gives every shot clip an audio twin that shares its asset and place", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      shots: [
        makeShot({
          id: "a",
          index: 0,
          slug: "Lighthouse",
          status: "rendered",
          duration_seconds: 2,
          clip: clipRef("asset-a")
        })
      ]
    });

    const video = result.clips.find((c) => c.mediaType === "video");
    const audio = result.clips.find((c) => c.mediaType === "audio");
    expect(audio?.name).toBe("Lighthouse (audio)");
    expect(audio?.currentAssetId).toBe("asset-a");
    expect(audio?.startMs).toBe(video?.startMs);
    expect(audio?.durationMs).toBe(video?.durationMs);
    expect(audio?.status).toBe("generated");
    expect(audio?.sourceType).toBe("imported");
    expect(audio?.storyboardShotId).toBe("a");
    expect(audio?.storyboardBoardId).toBe("board-1");
    const audioTrack = result.tracks.find((t) => t.name === "Shot Audio");
    expect(audio?.trackId).toBe(audioTrack?.id);
    expect(audioTrack?.type).toBe("audio");
    // Linked so a trim or a move on the picture takes the sound with it.
    expect(audio?.linkId).toBeTruthy();
    expect(audio?.linkId).toBe(video?.linkId);
  });

  it("leaves out the shot-audio track when no shot is assemblable", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      narration: "the light turns",
      shots: [makeShot({ id: "a", index: 0, status: "planned" })]
    });

    expect(result.clips).toEqual([]);
    expect(result.tracks.map((t) => t.name)).toEqual(["Shots"]);
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

    expect(pictureClips(result.clips)).toHaveLength(1);
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
    // A still has no rendered clip, so there is no sound to twin.
    expect(result.clips).toHaveLength(1);
    expect(result.tracks.map((t) => t.name)).toEqual(["Shots"]);
  });

  it("twins the audio of every played clip, stills excluded", () => {
    const result = buildStoryboardPreviewTimeline({
      boardId: "board-1",
      shots: [
        makeShot({
          id: "a",
          index: 0,
          duration_seconds: 2,
          clip: clipRef("asset-a")
        }),
        makeShot({ id: "b", index: 1, keyframe: keyframeRef("still-b") })
      ]
    });

    const audio = result.clips.filter((c) => c.mediaType === "audio");
    expect(audio).toHaveLength(1);
    expect(audio[0].currentAssetId).toBe("asset-a");
    expect(audio[0].startMs).toBe(0);
    expect(audio[0].durationMs).toBe(2000);
    expect(result.tracks.map((t) => t.name)).toEqual(["Shots", "Shot Audio"]);
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

    expect(pictureClips(result.clips)).toHaveLength(1);
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

    const picture = pictureClips(result.clips);
    expect(picture.map((c) => c.storyboardShotId)).toEqual(["a", "b", "c"]);
    expect(picture.map((c) => c.startMs)).toEqual([0, 2000, 6000]);
    expect(picture.map((c) => c.durationMs)).toEqual([
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

    expect(pictureClips(result.clips).map((c) => c.durationMs)).toEqual([
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

    expect(result.tracks.map((t) => t.name)).toEqual(["Shots", "Shot Audio"]);
    expect(result.tracks[0].type).toBe("video");
    const picture = pictureClips(result.clips);
    for (const clip of picture) {
      expect(clip.storyboardBoardId).toBe("board-42");
      expect(clip.trackId).toBe(result.tracks[0].id);
      expect(clip.versions).toEqual([]);
    }
    expect(picture.map((c) => c.storyboardShotId)).toEqual(["a", "b"]);
    expect(picture.map((c) => c.name)).toEqual(["Shot 1", "Shot 2"]);
  });
});

// ── rendered length vs directed length ────────────────────────────────
//
// Reproduction of the shipped failure: eight shots directed at 1.0–3.5s all
// came back from the model at 5.184s, and assembly laid down the directed
// length with no in/out point — so every clip played its source's head and
// discarded the rest without saying so.

describe("assembly against the footage that came back", () => {
  const renderedShot = (
    id: string,
    index: number,
    directedSeconds: number,
    sourceSeconds?: number
  ): Shot =>
    makeShot({
      id,
      index,
      status: "rendered",
      duration_seconds: directedSeconds,
      clip:
        sourceSeconds === undefined
          ? { type: "video", asset_id: `asset-${id}` }
          : { type: "video", asset_id: `asset-${id}`, duration: sourceSeconds }
    });

  it("writes an explicit source window and reports the unused footage", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      shots: [renderedShot("a", 0, 1.5, 5.184)]
    });
    const [picture] = pictureClips(result.clips);
    expect(picture.durationMs).toBe(1500);
    expect(picture.inPointMs).toBe(0);
    expect(picture.outPointMs).toBe(1500);
    expect(result.trimmedShots).toEqual([
      { shotId: "a", usedMs: 1500, sourceMs: 5184 }
    ]);
  });

  it("never lays down more timeline than the render holds", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      shots: [renderedShot("a", 0, 8, 5.184)]
    });
    const [picture] = pictureClips(result.clips);
    expect(picture.durationMs).toBe(5184);
    expect(result.durationMs).toBe(5184);
    expect(result.trimmedShots).toEqual([]);
  });

  it("leaves a shot whose source length is unknown exactly as before", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      shots: [renderedShot("a", 0, 1.5)]
    });
    const [picture] = pictureClips(result.clips);
    expect(picture.durationMs).toBe(1500);
    expect(picture.inPointMs).toBeUndefined();
    expect(result.trimmedShots).toEqual([]);
  });

  it("keeps the audio twin on the same window as its picture", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      shots: [renderedShot("a", 0, 1.5, 5.184)]
    });
    const audio = result.clips.filter((c) => c.mediaType === "audio");
    expect(audio).toHaveLength(1);
    expect(audio[0].durationMs).toBe(1500);
  });

  it("lays the whole board end to end without gaps or overlaps", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      shots: [
        renderedShot("a", 0, 1.5, 5.184),
        renderedShot("b", 1, 1.0, 5.184),
        renderedShot("c", 2, 2.0, 5.184)
      ]
    });
    expect(pictureClips(result.clips).map((c) => [c.startMs, c.durationMs])).toEqual(
      [
        [0, 1500],
        [1500, 1000],
        [2500, 2000]
      ]
    );
    expect(result.durationMs).toBe(4500);
    expect(result.trimmedShots).toHaveLength(3);
  });

  it("fits a preview clip to its footage too, and leaves stills alone", () => {
    const result = buildStoryboardPreviewTimeline({
      boardId: "board-1",
      shots: [
        renderedShot("a", 0, 8, 5.184),
        makeShot({
          id: "b",
          index: 1,
          status: "keyframe_ready",
          duration_seconds: 3,
          keyframe: keyframeRef("still-b")
        })
      ]
    });
    const [clip, still] = pictureClips(result.clips);
    expect(clip.durationMs).toBe(5184);
    expect(still.durationMs).toBe(3000);
    expect(still.inPointMs).toBeUndefined();
  });
});

// ── Fused shots (Shot.covered_by) ─────────────────────────────────────
//
// A model that renders a fixed 5.184s window covers several 1.5-2.2s beats in
// one generation. The clip lands on the first shot of the run; the rest name
// it in `covered_by` with the slice they use. Before this they assembled as
// nothing and had to be trimmed onto the track by hand.

describe("covered shots", () => {
  const fused = (): Shot[] => [
    makeShot({
      id: "event",
      index: 0,
      status: "rendered",
      duration_seconds: 2.5,
      clip: { type: "video", asset_id: "fused", duration: 5.184 }
    }),
    makeShot({
      id: "reception",
      index: 1,
      status: "rendered",
      covered_by: { shot_id: "event", start_seconds: 2.5, end_seconds: 5.184 }
    })
  ];

  it("cuts the covered shot out of the covering shot's clip", () => {
    const result = buildStoryboardTimeline({ boardId: "b", shots: fused() });
    const picture = pictureClips(result.clips);

    expect(result.skippedShotIds).toEqual([]);
    expect(picture.map((c) => c.currentAssetId)).toEqual(["fused", "fused"]);
    expect(picture[0]).toMatchObject({
      startMs: 0,
      durationMs: 2500,
      inPointMs: 0,
      outPointMs: 2500
    });
    expect(picture[1]).toMatchObject({
      startMs: 2500,
      durationMs: 2684,
      inPointMs: 2500,
      outPointMs: 5184
    });
    expect(result.durationMs).toBe(5184);
  });

  it("runs to the end of the covering clip when no end is named", () => {
    const shots = fused();
    shots[1].covered_by = { shot_id: "event", start_seconds: 2.5 };
    shots[1].duration_seconds = 10;
    const picture = pictureClips(
      buildStoryboardTimeline({ boardId: "b", shots }).clips
    );

    // 10s was asked for and 2.684s of footage is left: the window caps it.
    expect(picture[1]).toMatchObject({
      durationMs: 2684,
      inPointMs: 2500,
      outPointMs: 5184
    });
  });

  it("skips a shot whose covering shot never rendered", () => {
    const shots = fused();
    delete shots[0].clip;
    shots[0].status = "keyframe_ready";
    const result = buildStoryboardTimeline({ boardId: "b", shots });

    expect(result.skippedShotIds).toEqual(["event", "reception"]);
    expect(pictureClips(result.clips)).toHaveLength(0);
  });

  it("refuses to follow a second hop", () => {
    const shots = fused();
    shots.push(
      makeShot({
        id: "third",
        index: 2,
        status: "rendered",
        covered_by: { shot_id: "reception", start_seconds: 0 }
      })
    );
    const result = buildStoryboardTimeline({ boardId: "b", shots });

    expect(result.skippedShotIds).toEqual(["third"]);
  });

  it("plays the covered shot in the editor preview too", () => {
    const result = buildStoryboardPreviewTimeline({
      boardId: "b",
      shots: fused()
    });
    const picture = pictureClips(result.clips);

    expect(result.skippedShotIds).toEqual([]);
    expect(picture).toHaveLength(2);
    expect(picture[1]).toMatchObject({
      mediaType: "video",
      currentAssetId: "fused",
      inPointMs: 2500
    });
  });
});
