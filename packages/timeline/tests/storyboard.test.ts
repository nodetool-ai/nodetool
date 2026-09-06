/**
 * Tests for storyboard → timeline assembly (storyboard.ts).
 */

import { describe, it, expect } from "vitest";
import type { Scene, Screenplay, Shot } from "@nodetool-ai/protocol";
import {
  DEFAULT_SHOT_MS,
  buildStoryboardPreviewTimeline,
  buildStoryboardTimeline,
  frameSizeForAspect
} from "../src/storyboard.js";
import type { AssembledTimeline } from "../src/storyboard.js";
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
// came back from the model at 5.184s, and assembly cut every clip down to the
// directed length — so the cut played each render's head and discarded the
// rest. The footage that came back is the picture, so it is the clip.

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

  it("plays the whole render of a shot that came back long", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      shots: [renderedShot("a", 0, 1.5, 5.184)]
    });
    const [picture] = pictureClips(result.clips);
    expect(picture.durationMs).toBe(5184);
    expect(picture.inPointMs).toBe(0);
    expect(picture.outPointMs).toBe(5184);
    expect(result.durationMs).toBe(5184);
    expect(result.trimmedShots).toEqual([]);
    expect(result.retimedShots).toEqual([
      { shotId: "a", usedMs: 5184, directedMs: 1500 }
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
    expect(result.retimedShots).toEqual([
      { shotId: "a", usedMs: 5184, directedMs: 8000 }
    ]);
  });

  it("says nothing about a render that matches its direction", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      shots: [renderedShot("a", 0, 5.184, 5.184)]
    });
    expect(pictureClips(result.clips)[0].durationMs).toBe(5184);
    expect(result.retimedShots).toEqual([]);
  });

  it("falls back to the directed length when the source length is unknown", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      shots: [renderedShot("a", 0, 1.5)]
    });
    const [picture] = pictureClips(result.clips);
    expect(picture.durationMs).toBe(1500);
    expect(picture.inPointMs).toBeUndefined();
    expect(result.retimedShots).toEqual([]);
  });

  it("keeps the audio twin on the same window as its picture", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      shots: [renderedShot("a", 0, 1.5, 5.184)]
    });
    const audio = result.clips.filter((c) => c.mediaType === "audio");
    expect(audio).toHaveLength(1);
    expect(audio[0].durationMs).toBe(5184);
  });

  it("lays the whole board end to end without gaps or overlaps", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      shots: [
        renderedShot("a", 0, 1.5, 5.184),
        renderedShot("b", 1, 1.0, 2.0),
        renderedShot("c", 2, 2.0, 3.5)
      ]
    });
    expect(pictureClips(result.clips).map((c) => [c.startMs, c.durationMs])).toEqual(
      [
        [0, 5184],
        [5184, 2000],
        [7184, 3500]
      ]
    );
    expect(result.durationMs).toBe(10684);
    expect(result.retimedShots).toHaveLength(3);
  });

  it("plays a preview clip at its footage length, and leaves stills alone", () => {
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

  it("ends the covering shot where the covered one takes over", () => {
    // The claim decides, not the direction: the owner holds the whole fused
    // asset, so laying it down at its rendered length would play the run
    // once and then play the covered slices again after it.
    const shots = fused();
    shots[0].duration_seconds = 1;
    const result = buildStoryboardTimeline({ boardId: "b", shots });
    const picture = pictureClips(result.clips);

    expect(picture[0]).toMatchObject({
      startMs: 0,
      durationMs: 2500,
      inPointMs: 0,
      outPointMs: 2500
    });
    expect(picture[1]).toMatchObject({ startMs: 2500, durationMs: 2684 });
    expect(result.durationMs).toBe(5184);
    // Neither shot's length came from `duration_seconds`, so neither is a
    // shot that came back off the length it was directed at.
    expect(result.retimedShots).toEqual([]);
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

// ── Scenes are grouping, not order (PRD D5, § 7.7.3) ──────────────────
//
// `Scene`, `Screenplay.scenes` and `Shot.scene_id` group shots for the
// screenplay surface. `shot.index` stays the one global order that assembly
// reads, so putting a board's shots into scenes must not move a frame.

describe("scenes do not change the cut", () => {
  /**
   * Eight shots in one global order, carrying no scene.
   *
   * Deliberately mixed so a regression has somewhere to show: a render that
   * came back longer than it was directed at (s0), a clip whose source length
   * is unknown (s1), a shot with no clip at all (s2), a fused generation and
   * the shot covered out of it (s3/s4), a slugged shot (s5), a shot with no
   * media (s6), and a render shorter than the direction (s7).
   */
  const unscenedShots = (): Shot[] => [
    makeShot({
      id: "s0",
      index: 0,
      status: "rendered",
      duration_seconds: 1.5,
      clip: { type: "video", asset_id: "asset-0", duration: 5.184 }
    }),
    makeShot({
      id: "s1",
      index: 1,
      status: "rendered",
      duration_seconds: 2,
      clip: clipRef("asset-1")
    }),
    makeShot({
      id: "s2",
      index: 2,
      status: "keyframe_ready",
      duration_seconds: 3,
      keyframe: keyframeRef("still-2")
    }),
    makeShot({
      id: "s3",
      index: 3,
      status: "rendered",
      duration_seconds: 1.25,
      clip: { type: "video", asset_id: "fused", duration: 4 }
    }),
    makeShot({
      id: "s4",
      index: 4,
      status: "rendered",
      covered_by: { shot_id: "s3", start_seconds: 1.25, end_seconds: 4 }
    }),
    makeShot({
      id: "s5",
      index: 5,
      slug: "Harbour wide",
      status: "rendered",
      duration_seconds: 3,
      clip: { type: "video", asset_id: "asset-5", duration: 3 }
    }),
    makeShot({ id: "s6", index: 6, status: "planned" }),
    makeShot({
      id: "s7",
      index: 7,
      status: "rendered",
      duration_seconds: 0.75,
      clip: { type: "video", asset_id: "asset-7", duration: 2.2 }
    })
  ];

  /**
   * Three contiguous scenes whose boundaries cut across everything else the
   * builder could group by: the fused run s3/s4 is split between scene B and
   * scene C, and the skipped shots s2 and s6 land in different scenes.
   */
  const SCENE_OF: Record<string, string> = {
    s0: "sc-a",
    s1: "sc-a",
    s2: "sc-b",
    s3: "sc-b",
    s4: "sc-c",
    s5: "sc-c",
    s6: "sc-c",
    s7: "sc-c"
  };

  const scenes: Scene[] = [
    { type: "scene", id: "sc-a", slugline: "EXT. HARBOUR — DAWN" },
    {
      type: "scene",
      id: "sc-b",
      slugline: "INT. WHEELHOUSE — DAWN",
      lighting: "sodium wash through glass"
    },
    { type: "scene", id: "sc-c", slugline: "EXT. BREAKWATER — DUSK" }
  ];

  const scenedShots = (sceneOf: Record<string, string> = SCENE_OF): Shot[] =>
    unscenedShots().map((shot) => ({ ...shot, scene_id: sceneOf[shot.id] }));

  const screenplay = (shots: Shot[], boardScenes?: Scene[]): Screenplay => ({
    type: "screenplay",
    id: "screenplay-1",
    title: "Harbour",
    aspect_ratio: "16:9",
    narration: "the light turns",
    music_prompt: "low strings, no percussion",
    shots,
    ...(boardScenes ? { scenes: boardScenes } : {})
  });

  const assemble = (board: Screenplay): AssembledTimeline =>
    buildStoryboardTimeline({
      boardId: "board-1",
      shots: board.shots,
      narration: board.narration,
      musicPrompt: board.music_prompt
    });

  /**
   * The three generated id fields, relabelled by first appearance.
   *
   * `makeTrack`, `makeClip` and the audio twin's `linkId` each call
   * `createTimeOrderedUuid`, so `track.id`, `clip.id`, `clip.trackId` and
   * `clip.linkId` are fresh every run and no two builds could ever be deeply
   * equal on them. Relabelling preserves which clip points at which track and
   * which pair is linked, so the identity relations are still compared. Every
   * other field is a function of the input and is compared as it comes back.
   */
  const normalize = (result: AssembledTimeline) => {
    const tokens = new Map<string, string>();
    const token = (prefix: string, id: string): string => {
      const seen = tokens.get(id);
      if (seen !== undefined) return seen;
      const next = `${prefix}:${tokens.size}`;
      tokens.set(id, next);
      return next;
    };
    return {
      ...result,
      tracks: result.tracks.map((track) => ({
        ...track,
        id: token("track", track.id)
      })),
      clips: result.clips.map((clip) => ({
        ...clip,
        id: token("clip", clip.id),
        trackId: token("track", clip.trackId),
        linkId: clip.linkId === undefined ? undefined : token("link", clip.linkId)
      }))
    };
  };

  it("assembles a board that has scenes exactly as it did without them", () => {
    const unscened = assemble(screenplay(unscenedShots()));
    const scened = assemble(screenplay(scenedShots(), scenes));

    expect(normalize(scened)).toEqual(normalize(unscened));

    // The cut both sides produced, so the equality above is not two empties.
    expect(pictureClips(unscened.clips).map((c) => c.storyboardShotId)).toEqual([
      "s0",
      "s1",
      "s3",
      "s4",
      "s5",
      "s7"
    ]);
    expect(
      pictureClips(unscened.clips).map((c) => [c.startMs, c.durationMs])
    ).toEqual([
      [0, 5184],
      [5184, 2000],
      [7184, 1250],
      [8434, 2750],
      [11184, 3000],
      [14184, 2200]
    ]);
    expect(unscened.durationMs).toBe(16384);
    expect(unscened.skippedShotIds).toEqual(["s2", "s6"]);
    expect(unscened.tracks.map((t) => t.name)).toEqual([
      "Shots",
      "Shot Audio",
      "Narration",
      "Music"
    ]);
  });

  it("assembles the same cut however the shots are grouped", () => {
    // One scene per shot: a different grouping of the same order, so nothing
    // about the cut may follow from how many scenes there are.
    const perShot = Object.fromEntries(
      unscenedShots().map((shot) => [shot.id, `sc-${shot.id}`])
    );
    const oneSceneEach = assemble(
      screenplay(
        scenedShots(perShot),
        unscenedShots().map((shot) => ({
          type: "scene" as const,
          id: `sc-${shot.id}`,
          slugline: `EXT. ${shot.id.toUpperCase()} — DAY`
        }))
      )
    );

    expect(normalize(oneSceneEach)).toEqual(
      normalize(assemble(screenplay(unscenedShots())))
    );
  });

  it("moves the cut when shot.index moves, scenes untouched", () => {
    // The guard on the two equalities above: they would also hold against a
    // builder that ignored its input, so reversing the order has to change
    // the output while every scene stays where it was.
    const shots = scenedShots();
    const reversed = shots.map((shot, i) => ({
      ...shot,
      index: shots.length - 1 - i
    }));
    const result = assemble(screenplay(reversed, scenes));

    expect(pictureClips(result.clips).map((c) => c.storyboardShotId)).toEqual([
      "s7",
      "s5",
      "s4",
      "s3",
      "s1",
      "s0"
    ]);
    expect(normalize(result)).not.toEqual(
      normalize(assemble(screenplay(scenedShots(), scenes)))
    );
  });
});
