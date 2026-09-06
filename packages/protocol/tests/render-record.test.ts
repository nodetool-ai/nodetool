import { describe, expect, it } from "vitest";

import type { Scene, Shot } from "../src/creative.js";
import {
  currentRenderInputs,
  isVersionStale,
  shotStaleness,
  stampRenderInputs,
  staleClipShots,
  staleKeyframeShots,
  versionId,
  type BoardRenderContext
} from "../src/render-record.js";

const SCENE: Scene = {
  type: "scene",
  id: "sc-1",
  slugline: "EXT. HARBOUR — DUSK",
  lighting: "last light, sodium spill from the road"
};

const BOARD: BoardRenderContext = {
  aspect_ratio: "16:9",
  image_model: "fal-ai/flux/dev",
  video_model: "fal-ai/kling-video/v1.6",
  style_entity_id: "ent-style-noir",
  style: "grainy 16mm, muted palette",
  scenes: [SCENE]
};

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    type: "shot",
    id: "s1",
    index: 0,
    scene_id: SCENE.id,
    action: "a lighthouse against the swell",
    camera: { framing: "wide", angle: "low angle", lens: "85mm" },
    motion: "slow push in",
    status: "keyframe_ready",
    ...overrides
  };
}

/** A shot carrying a still and a clip, each stamped with today's inputs. */
function makeRenderedShot(board: BoardRenderContext = BOARD): Shot {
  const base = makeShot();
  const keyframe = {
    type: "image" as const,
    asset_id: "asset-still-1",
    render_inputs: stampRenderInputs(
      currentRenderInputs(base, board, "keyframe"),
      "2026-01-01T00:00:00.000Z"
    )
  };
  const withStill: Shot = { ...base, keyframe, keyframe_versions: [keyframe] };
  const clip = {
    type: "video" as const,
    asset_id: "asset-clip-1",
    render_inputs: stampRenderInputs(
      currentRenderInputs(withStill, board, "clip"),
      "2026-01-01T00:00:00.000Z"
    )
  };
  return { ...withStill, clip, clip_versions: [clip] };
}

describe("versionId", () => {
  it("prefers the stored asset id, falls back to the uri", () => {
    expect(versionId({ type: "image", asset_id: "a1", uri: "u1" })).toBe("a1");
    expect(versionId({ type: "image", uri: "u1" })).toBe("u1");
    expect(versionId(null)).toBe("");
  });
});

describe("currentRenderInputs", () => {
  it("names the still a keyframe-mode clip would animate", () => {
    const shot = makeRenderedShot();
    expect(currentRenderInputs(shot, BOARD, "clip").source_version_id).toBe(
      "asset-still-1"
    );
  });

  it("leaves a direct-mode clip without a source", () => {
    const shot = { ...makeRenderedShot(), render_mode: "direct" as const };
    expect(
      currentRenderInputs(shot, BOARD, "clip").source_version_id
    ).toBeUndefined();
  });

  it("hashes the composed prompt, so a rewritten action changes the record", () => {
    const shot = makeShot();
    const rewritten = makeShot({ action: "a lighthouse at first light" });
    expect(currentRenderInputs(shot, BOARD, "keyframe").prompt_hash).not.toBe(
      currentRenderInputs(rewritten, BOARD, "keyframe").prompt_hash
    );
  });

  it("takes the image model for a still and the video model for a clip", () => {
    const shot = makeShot();
    expect(currentRenderInputs(shot, BOARD, "keyframe").model).toBe(
      BOARD.image_model
    );
    expect(currentRenderInputs(shot, BOARD, "clip").model).toBe(
      BOARD.video_model
    );
  });
});

describe("isVersionStale", () => {
  it("reads a version rendered from today's inputs as current", () => {
    const shot = makeRenderedShot();
    expect(shotStaleness(shot, BOARD)).toEqual({
      keyframe: false,
      clip: false
    });
  });

  it("never reads a version without a record as stale", () => {
    const shot = makeShot({
      // An upload, a flip and an image-editor edit all land like this.
      keyframe: { type: "image", asset_id: "uploaded" }
    });
    expect(isVersionStale(shot.keyframe, shot, BOARD)).toBe(false);
  });

  // One case per input the record carries (PRD § 7.7.4).
  const changes: Array<{
    name: string;
    board?: Partial<BoardRenderContext>;
    shot?: Partial<Shot>;
    kind: "keyframe" | "clip";
  }> = [
    { name: "the prompt", shot: { action: "a different lighthouse" }, kind: "keyframe" },
    { name: "the image model", board: { image_model: "other/model" }, kind: "keyframe" },
    { name: "the video model", board: { video_model: "other/model" }, kind: "clip" },
    { name: "the aspect ratio", board: { aspect_ratio: "9:16" }, kind: "keyframe" },
    { name: "the style entity", board: { style_entity_id: "ent-style-warm" }, kind: "keyframe" },
    { name: "the style descriptor", board: { style: "clean digital, high key" }, kind: "keyframe" },
    { name: "the scene's lighting", board: { scenes: [{ ...SCENE, lighting: "hard noon sun" }] }, kind: "keyframe" }
  ];

  for (const change of changes) {
    it(`reads a version stale after ${change.name} changes`, () => {
      const rendered = makeRenderedShot();
      const shot = { ...rendered, ...change.shot };
      const board = { ...BOARD, ...change.board };
      const version = change.kind === "keyframe" ? shot.keyframe : shot.clip;
      expect(isVersionStale(version, shot, board)).toBe(true);
    });
  }

  it("reads a keyframe-mode clip stale when another take is selected", () => {
    const rendered = makeRenderedShot();
    const other = { type: "image" as const, asset_id: "asset-still-2" };
    const shot: Shot = {
      ...rendered,
      keyframe: other,
      keyframe_versions: [...(rendered.keyframe_versions ?? []), other]
    };
    expect(isVersionStale(shot.clip, shot, BOARD)).toBe(true);
    // The still itself did not change — only which one the clip should animate.
    expect(isVersionStale(rendered.keyframe, shot, BOARD)).toBe(false);
  });

  it("keeps a landing render stale when the style moved while it was in flight", () => {
    // The job was enqueued against the old style and stamped then; the asset
    // lands after `setStylePreset` ran (criterion 8).
    const enqueued = makeRenderedShot();
    const afterStyleChange: BoardRenderContext = {
      ...BOARD,
      style_entity_id: "ent-style-warm",
      style: "warm tungsten, soft halation"
    };
    expect(isVersionStale(enqueued.keyframe, enqueued, afterStyleChange)).toBe(
      true
    );
  });

  it("ignores recorded_at, which is a fact about the job and not an input", () => {
    const shot = makeRenderedShot();
    const later = {
      ...shot.keyframe!,
      render_inputs: {
        ...shot.keyframe!.render_inputs!,
        recorded_at: "2027-06-06T12:00:00.000Z"
      }
    };
    expect(isVersionStale(later, shot, BOARD)).toBe(false);
  });
});

describe("stale selections across a board", () => {
  it("returns only the shots whose selection is out of date", () => {
    const current = makeRenderedShot();
    const outdated: Shot = {
      ...makeRenderedShot(),
      id: "s2",
      index: 1,
      action: "the keeper climbs the stair"
    };
    const untouched = makeShot({ id: "s3", index: 2, keyframe: null, clip: null });
    const shots = [current, outdated, untouched];

    expect(staleKeyframeShots(shots, BOARD).map((s) => s.id)).toEqual(["s2"]);
    expect(staleClipShots(shots, BOARD).map((s) => s.id)).toEqual(["s2"]);
  });
});
