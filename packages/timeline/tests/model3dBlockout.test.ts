/**
 * The blockout of a shot: which clip it is, which clips can become one, and
 * what a take generated from it sends to the video model.
 */

import { describe, expect, it } from "vitest";

import {
  BLOCKOUT_PROMPT_ONLY_NOTE,
  BLOCKOUT_REFERENCE_INSTRUCTION,
  blockoutCandidatesForClip,
  blockoutClipForShot,
  blockoutLinkPatches,
  shotClipCandidatesForBlockout,
  clipsFollowingShot,
  makeClip,
  modelTakesReferenceVideo,
  planBlockoutGeneration,
  type TimelineClip
} from "../src/index.js";

const BOARD = "0123456789abcdef0123456789abcdef";
const SHOT = "fedcba9876543210fedcba9876543210";
/** A generated asset id, full length, as a reference render is stored under. */
const REFERENCE_ASSET = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

const clip = (overrides: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    id: "clip",
    trackId: "track_v",
    name: "Clip",
    startMs: 0,
    durationMs: 4000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    ...overrides
  });

const shotVideo = clip({
  id: "video",
  storyboardBoardId: BOARD,
  storyboardShotId: SHOT
});
const shotAudio = clip({
  id: "audio",
  mediaType: "audio",
  storyboardBoardId: BOARD,
  storyboardShotId: SHOT
});
const blockout = clip({
  id: "blockout",
  mediaType: "model3d",
  trackId: "track_b",
  storyboardBoardId: BOARD,
  storyboardShotId: SHOT
});

describe("blockoutClipForShot", () => {
  it("finds the model3d clip stamped with the shot", () => {
    const clips = [shotVideo, shotAudio, blockout];
    expect(blockoutClipForShot(clips, BOARD, SHOT)?.id).toBe("blockout");
  });

  it("returns nothing for another shot, another board, or no blockout", () => {
    expect(blockoutClipForShot([shotVideo, blockout], BOARD, "other")).toBeUndefined();
    expect(blockoutClipForShot([shotVideo, blockout], "other", SHOT)).toBeUndefined();
    expect(blockoutClipForShot([shotVideo, shotAudio], BOARD, SHOT)).toBeUndefined();
  });

  it("takes the earliest when two clips carry the shot", () => {
    const later = { ...blockout, id: "later", startMs: 5000 };
    expect(blockoutClipForShot([later, blockout], BOARD, SHOT)?.id).toBe("blockout");
  });
});

describe("clipsFollowingShot", () => {
  it("keeps ignoring the blockout clip, so a new take never replaces the set", () => {
    const following = clipsFollowingShot([shotVideo, shotAudio, blockout], BOARD, SHOT);
    expect(following.map((c) => c.id)).toEqual(["video", "audio"]);
  });
});

describe("blockoutCandidatesForClip", () => {
  const free = (id: string, startMs: number, durationMs = 2000): TimelineClip =>
    clip({ id, mediaType: "model3d", trackId: "track_b", startMs, durationMs });

  it("offers model3d clips that overlap the shot's clip, earliest first", () => {
    const under = free("under", 0, 4000);
    const tail = free("tail", 3000);
    const after = free("after", 4000);
    const before = clip({
      id: "before",
      mediaType: "model3d",
      startMs: 0,
      durationMs: 1000
    });
    const shot = { ...shotVideo, startMs: 1000, durationMs: 3000 };
    const found = blockoutCandidatesForClip(
      [tail, after, under, before, shotVideo, shotAudio],
      shot
    );
    expect(found.map((c) => c.id)).toEqual(["under", "tail"]);
  });

  it("keeps this shot's own blockout and leaves out another shot's", () => {
    const other = {
      ...free("other", 0),
      storyboardBoardId: BOARD,
      storyboardShotId: "another-shot"
    };
    const found = blockoutCandidatesForClip([blockout, other], shotVideo);
    expect(found.map((c) => c.id)).toEqual(["blockout"]);
  });
});

describe("shotClipCandidatesForBlockout", () => {
  it("offers each overlapping shot once, by its video clip", () => {
    const set = clip({ id: "set", mediaType: "model3d", startMs: 1000, durationMs: 4000 });
    const other = clip({
      id: "video2",
      startMs: 4000,
      storyboardBoardId: BOARD,
      storyboardShotId: "shot-2"
    });
    const far = clip({
      id: "video3",
      startMs: 9000,
      storyboardBoardId: BOARD,
      storyboardShotId: "shot-3"
    });
    const voiceover = clip({
      id: "vo",
      storyboardBoardId: BOARD,
      storyboardShotId: SHOT,
      scriptLineId: "line-1"
    });
    const found = shotClipCandidatesForBlockout(
      [other, far, voiceover, shotAudio, shotVideo, { ...shotVideo, id: "dup" }],
      set
    );
    expect(found.map((c) => c.id)).toEqual(["video", "video2"]);
  });
});

describe("blockoutLinkPatches", () => {
  const set = clip({ id: "set", mediaType: "model3d" });

  it("stamps the clip with the shot's full board and shot ids", () => {
    expect(
      blockoutLinkPatches([shotVideo, set], "set", { boardId: BOARD, shotId: SHOT })
    ).toEqual([
      { clipId: "set", patch: { storyboardBoardId: BOARD, storyboardShotId: SHOT } }
    ]);
  });

  it("unlinks the shot's previous blockout in the same edit", () => {
    const patches = blockoutLinkPatches([shotVideo, blockout, set], "set", {
      boardId: BOARD,
      shotId: SHOT
    });
    expect(patches).toEqual([
      {
        clipId: "blockout",
        patch: { storyboardBoardId: undefined, storyboardShotId: undefined }
      },
      { clipId: "set", patch: { storyboardBoardId: BOARD, storyboardShotId: SHOT } }
    ]);
  });

  it("unlinks with a null shot, and changes nothing when already unlinked", () => {
    expect(blockoutLinkPatches([blockout], "blockout", null)).toEqual([
      {
        clipId: "blockout",
        patch: { storyboardBoardId: undefined, storyboardShotId: undefined }
      }
    ]);
    expect(blockoutLinkPatches([set], "set", null)).toEqual([]);
  });

  it("never touches the shot's video or audio clip", () => {
    expect(
      blockoutLinkPatches([shotVideo], "video", { boardId: BOARD, shotId: SHOT })
    ).toEqual([]);
    const relink = blockoutLinkPatches([shotVideo, shotAudio, blockout], "blockout", {
      boardId: BOARD,
      shotId: SHOT
    });
    expect(relink).toEqual([]);
  });
});

describe("modelTakesReferenceVideo", () => {
  it("is decided by the reference_to_video task alone", () => {
    expect(modelTakesReferenceVideo(["text_to_video", "reference_to_video"])).toBe(true);
    expect(modelTakesReferenceVideo(["reference_to_video"])).toBe(true);
    expect(modelTakesReferenceVideo(["text_to_video", "image_to_video"])).toBe(false);
    expect(modelTakesReferenceVideo(["video_to_video"])).toBe(false);
    expect(modelTakesReferenceVideo(["motion_control"])).toBe(false);
  });

  it("is false for a model that declares no tasks", () => {
    expect(modelTakesReferenceVideo([])).toBe(false);
    expect(modelTakesReferenceVideo(undefined)).toBe(false);
    expect(modelTakesReferenceVideo(null)).toBe(false);
  });
});

describe("planBlockoutGeneration", () => {
  const input = {
    prompt: "A woman crosses a rainy street at night.",
    referenceAssetId: REFERENCE_ASSET,
    cameraMove: "The camera pushes in slowly and pans right."
  };

  it("attaches the reference video for a model that takes one", () => {
    const plan = planBlockoutGeneration({
      ...input,
      supportedTasks: ["text_to_video", "reference_to_video"]
    });
    expect(plan.route).toBe("reference_video");
    if (plan.route !== "reference_video") return;
    expect(plan.capability).toBe("reference_to_video");
    expect(plan.referenceVideos).toEqual([
      { type: "video", asset_id: REFERENCE_ASSET }
    ]);
    expect(plan.prompt.startsWith(input.prompt)).toBe(true);
    expect(plan.prompt).toContain(BLOCKOUT_REFERENCE_INSTRUCTION);
    expect(plan.prompt).toContain(input.cameraMove);
  });

  it("carries the reference asset id through whole, never shortened", () => {
    const plan = planBlockoutGeneration({
      ...input,
      supportedTasks: ["reference_to_video"]
    });
    if (plan.route !== "reference_video") throw new Error("expected a reference");
    expect(plan.referenceVideos[0].asset_id).toBe(REFERENCE_ASSET);
    expect(plan.referenceVideos[0].asset_id).toHaveLength(32);
  });

  it("falls back to the camera sentence for a model that takes none", () => {
    const plan = planBlockoutGeneration({
      ...input,
      supportedTasks: ["text_to_video", "image_to_video"]
    });
    expect(plan).toEqual({
      route: "prompt_only",
      prompt: `${input.prompt}\n\n${input.cameraMove}`,
      note: BLOCKOUT_PROMPT_ONLY_NOTE
    });
    expect(plan.prompt).not.toContain(BLOCKOUT_REFERENCE_INSTRUCTION);
    expect(plan.prompt).not.toContain(REFERENCE_ASSET);
  });

  it("falls back when there is no reference asset to send", () => {
    const plan = planBlockoutGeneration({
      ...input,
      referenceAssetId: "",
      supportedTasks: ["reference_to_video"]
    });
    expect(plan.route).toBe("prompt_only");
  });
});
