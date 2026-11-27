/**
 * The free camera through `applyTimelineOp`: a pose with the lens in mm, a
 * camera key at a clip time, and a camera move preset.
 *
 * These are the edits an agent blocks a shot with, so the checks are on the
 * camera the clip renders with afterwards (`model3dKeyframedFreeCameraPose`)
 * and on what a refused call tells the caller to change.
 */

import { describe, expect, it } from "vitest";
import { MODEL3D_CAMERA_MOVE_IDS } from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import { applyTimelineOp } from "../src/ops/apply.js";
import { timelineOpFromToolArgs } from "../src/ops/index.js";
import type { TimelineOpContext, TimelineOpState } from "../src/ops/types.js";
import {
  DEFAULT_MODEL3D_STYLE,
  MODEL3D_CAMERA_MOVES,
  MODEL3D_FREE_CAMERA_PROPERTIES,
  findKeyframeAnimation,
  focalLengthMmToFovDeg,
  keyframeTimesMs,
  makeClip,
  makeTrack,
  model3dKeyframedFreeCameraPose
} from "../src/index.js";
import type { ClipModel3DCamera, TimelineClip } from "../src/types.js";

function context(): TimelineOpContext {
  let n = 0;
  return { newId: (kind) => `${kind}_${++n}` };
}

function seeded(camera: Partial<ClipModel3DCamera> = {}): TimelineOpState {
  return {
    fps: 24,
    width: 1920,
    height: 1080,
    tracks: [makeTrack({ id: "track_v", type: "video", name: "Video 1", index: 0 })],
    clips: [
      makeClip({
        id: "clip_set",
        trackId: "track_v",
        name: "Kitchen set",
        // Not at 0, so a clip-relative time and a timeline time differ.
        startMs: 10_000,
        durationMs: 4000,
        mediaType: "model3d",
        sourceType: "imported",
        status: "generated",
        currentAssetId: "asset_glb",
        model3dStyle: {
          ...DEFAULT_MODEL3D_STYLE,
          camera: { ...DEFAULT_MODEL3D_STYLE.camera, ...camera }
        }
      }),
      makeClip({
        id: "clip_text",
        trackId: "track_v",
        name: "Title",
        startMs: 0,
        durationMs: 2000,
        mediaType: "text",
        sourceType: "imported",
        status: "generated",
        textStyle: { text: "Hi", fontSizePx: 64, color: "#ffffff" }
      })
    ],
    markers: [],
    playheadMs: 0,
    selectedClipIds: []
  };
}

const FREE: Partial<ClipModel3DCamera> = {
  mode: "free",
  position: [0, 1.6, 5],
  target: [0, 1, 0],
  rollDeg: 0,
  fovDeg: 40
};

const setClip = (state: TimelineOpState): TimelineClip =>
  state.clips.find((clip) => clip.id === "clip_set")!;

describe("set_model3d_style with a free camera", () => {
  it("places the camera by position, target, roll and a lens in mm", async () => {
    const out = await applyTimelineOp(
      seeded(),
      {
        op: "set_model3d_style",
        target: "clip_set",
        patch: {
          camera: {
            mode: "free",
            position: [1, 1.6, 4],
            target: [0, 1.2, 0],
            rollDeg: 5,
            focalLengthMm: 35
          }
        }
      },
      context()
    );
    expect(out.error).toBeUndefined();
    const camera = setClip(out.state).model3dStyle!.camera;
    expect(camera).toMatchObject({
      mode: "free",
      position: [1, 1.6, 4],
      target: [0, 1.2, 0],
      rollDeg: 5
    });
    expect(camera.fovDeg).toBeCloseTo(focalLengthMmToFovDeg(35), 10);
    // The lens is stored as a field of view only.
    expect(camera).not.toHaveProperty("focalLengthMm");
    // The orbit terms survive, so switching back restores the old pose.
    expect(camera.azimuthDeg).toBe(DEFAULT_MODEL3D_STYLE.camera.azimuthDeg);
    expect(setClip(out.state).animations ?? []).toEqual([]);
  });

  it("takes the lens in mm when the clip is added", async () => {
    const out = await applyTimelineOp(
      seeded(),
      {
        op: "add_model3d_clip",
        assetId: "asset_glb",
        style: { camera: { mode: "free", focalLengthMm: 50 } }
      },
      context()
    );
    expect(out.error).toBeUndefined();
    const added = out.state.clips.at(-1)!;
    expect(added.model3dStyle!.camera.fovDeg).toBeCloseTo(26.99, 2);
    expect(added.model3dStyle!.camera).not.toHaveProperty("focalLengthMm");
  });

  it("refuses a lens given twice and says which to keep", async () => {
    const out = await applyTimelineOp(
      seeded(FREE),
      {
        op: "set_model3d_style",
        target: "clip_set",
        patch: { camera: { fovDeg: 30, focalLengthMm: 35 } }
      },
      context()
    );
    expect(out.error).toMatch(/both fovDeg \(30\) and focalLengthMm \(35\)/);
    expect(out.error).toMatch(/Send one of them/);
  });

  it("refuses unknown camera fields at the tool boundary", () => {
    expect(() =>
      timelineOpFromToolArgs("set_model3d_style", {
        target: "clip_set",
        patch: { camera: { mode: "free", lens: 35 } }
      })
    ).toThrow(/lens/);
    expect(() =>
      timelineOpFromToolArgs("set_model3d_style", {
        target: "clip_set",
        patch: { camera: { focalLengthMm: 0 } }
      })
    ).toThrow(/focalLengthMm/);
  });
});

describe("set_model3d_style with keyAtMs", () => {
  it("keys the pose at the clip time and leaves the resting pose alone", async () => {
    const first = await applyTimelineOp(
      seeded(FREE),
      { op: "set_model3d_style", target: "clip_set", patch: {}, keyAtMs: 0 },
      context()
    );
    expect(first.error).toBeUndefined();
    const out = await applyTimelineOp(
      first.state,
      {
        op: "set_model3d_style",
        target: "clip_set",
        patch: { camera: { position: [2, 1.6, 3], focalLengthMm: 50 } },
        keyAtMs: 2000
      },
      context()
    );
    expect(out.error).toBeUndefined();
    const clip = setClip(out.state);
    expect(clip.model3dStyle!.camera).toMatchObject(FREE);
    expect(keyframeTimesMs(clip, MODEL3D_FREE_CAMERA_PROPERTIES)).toEqual([
      0, 2000
    ]);
    // Every free channel is keyed, so the pose is pinned at both times.
    const curves = findKeyframeAnimation(clip)!.custom!.curves;
    expect(curves.map((curve) => curve.property).sort()).toEqual(
      [...MODEL3D_FREE_CAMERA_PROPERTIES].sort()
    );
    expect(model3dKeyframedFreeCameraPose(clip, 0)).toMatchObject({
      position: [0, 1.6, 5],
      fovDeg: 40
    });
    const end = model3dKeyframedFreeCameraPose(clip, 2000);
    expect(end.position).toEqual([2, 1.6, 3]);
    expect(end.target).toEqual([0, 1, 0]);
    expect(end.fovDeg).toBeCloseTo(focalLengthMmToFovDeg(50), 10);
    // Halfway, linear: the eye is halfway.
    expect(model3dKeyframedFreeCameraPose(clip, 1000).position).toEqual([
      1, 1.6, 4
    ]);
    // Held after the last key.
    expect(model3dKeyframedFreeCameraPose(clip, 3500).position).toEqual([
      2, 1.6, 3
    ]);
    expect(out.result).toMatchObject({
      keyAtMs: 2000,
      cameraKeyTimesMs: [0, 2000],
      camera: { position: [2, 1.6, 3], focalLengthMm: 50 }
    });
  });

  it("switches to free mode and keys in one call", async () => {
    const out = await applyTimelineOp(
      seeded(),
      {
        op: "set_model3d_style",
        target: "clip_set",
        patch: { camera: { mode: "free", target: [0, 2, 0] }, lighting: "flat" },
        keyAtMs: 1000,
        keyEasing: "easeInOut"
      },
      context()
    );
    expect(out.error).toBeUndefined();
    const clip = setClip(out.state);
    expect(clip.model3dStyle!.camera.mode).toBe("free");
    expect(clip.model3dStyle!.lighting).toBe("flat");
    // The target went into the key, not onto the resting pose.
    expect(clip.model3dStyle!.camera.target).toBeUndefined();
    expect(model3dKeyframedFreeCameraPose(clip, 1000).target).toEqual([0, 2, 0]);
    const curves = findKeyframeAnimation(clip)!.custom!.curves;
    expect(curves.every((curve) => curve.keyframes[0].easing === "easeInOut")).toBe(true);
  });

  it("re-keying the same time replaces the key", async () => {
    let state = seeded(FREE);
    for (const x of [1, 3]) {
      const out = await applyTimelineOp(
        state,
        {
          op: "set_model3d_style",
          target: "clip_set",
          patch: { camera: { position: [x, 1.6, 5] } },
          keyAtMs: 1500
        },
        context()
      );
      expect(out.error).toBeUndefined();
      state = out.state;
    }
    const clip = setClip(state);
    expect(keyframeTimesMs(clip, MODEL3D_FREE_CAMERA_PROPERTIES)).toEqual([1500]);
    expect(model3dKeyframedFreeCameraPose(clip, 1500).position).toEqual([
      3, 1.6, 5
    ]);
  });

  it.each([
    {
      label: "an orbit camera",
      camera: {},
      op: { patch: {}, keyAtMs: 0 },
      error: /keyAtMs keys a free camera.*orbit camera.*patch\.camera\.mode "free"/
    },
    {
      label: "a time past the clip",
      camera: FREE,
      // The clip's timeline start: a caller that sent timeline time.
      op: { patch: {}, keyAtMs: 10_500 },
      error: /keyAtMs 10500 is outside clip "Kitchen set".*0 to 4000 ms.*clip's start/
    },
    {
      label: "an unknown easing",
      camera: FREE,
      op: { patch: {}, keyAtMs: 0, keyEasing: "swoosh" },
      error: /keyEasing "swoosh" is not an easing.*easeInOut/
    },
    {
      label: "an easing with no key",
      camera: FREE,
      op: { patch: {}, keyEasing: "linear" },
      error: /keyEasing.*needs keyAtMs/
    },
    {
      label: "a lens out of range",
      camera: FREE,
      op: { patch: { camera: { fovDeg: 0 } }, keyAtMs: 0 },
      error: /patch\.camera\.fovDeg must be between 1 and 170.*focalLengthMm/
    }
  ])("refuses $label and names the field", async ({ camera, op, error }) => {
    const before = seeded(camera);
    const out = await applyTimelineOp(
      before,
      { op: "set_model3d_style", target: "clip_set", ...op },
      context()
    );
    expect(out.error).toMatch(error);
    expect(setClip(out.state).animations ?? []).toEqual([]);
  });
});

describe("apply_model3d_camera_move", () => {
  it("names the same moves as the protocol contract", () => {
    expect(MODEL3D_CAMERA_MOVES.map((move) => move.id)).toEqual([
      ...MODEL3D_CAMERA_MOVE_IDS
    ]);
  });

  it("keys a push in from the camera at startMs", async () => {
    const out = await applyTimelineOp(
      seeded(FREE),
      {
        op: "apply_model3d_camera_move",
        target: "clip_set",
        move: "pushIn",
        amount: 0.5,
        startMs: 1000,
        durationMs: 2000
      },
      context()
    );
    expect(out.error).toBeUndefined();
    const clip = setClip(out.state);
    expect(model3dKeyframedFreeCameraPose(clip, 0).position).toEqual([0, 1.6, 5]);
    expect(model3dKeyframedFreeCameraPose(clip, 1000).position).toEqual([
      0, 1.6, 5
    ]);
    const end = model3dKeyframedFreeCameraPose(clip, 3000).position;
    expect(end[0]).toBeCloseTo(0, 10);
    expect(end[1]).toBeCloseTo(1.3, 10);
    expect(end[2]).toBeCloseTo(2.5, 10);
    expect(model3dKeyframedFreeCameraPose(clip, 4000).position[2]).toBeCloseTo(2.5, 10);
    expect(out.result).toMatchObject({
      move: { id: "pushIn", unit: "distance", amount: 0.5 },
      startMs: 1000,
      endMs: 3000,
      from: { position: [0, 1.6, 5] },
      to: { position: [0, 1.3, 2.5], target: [0, 1, 0] }
    });
  });

  it("uses the move's default amount and the rest of the clip", async () => {
    const out = await applyTimelineOp(
      seeded(FREE),
      { op: "apply_model3d_camera_move", target: "clip_set", move: "dutch" },
      context()
    );
    expect(out.error).toBeUndefined();
    expect(out.result).toMatchObject({
      move: { id: "dutch", unit: "degrees", amount: 15 },
      startMs: 0,
      endMs: 4000,
      to: { rollDeg: 15 }
    });
  });

  it("chains a second move from where the first one ended", async () => {
    const pushed = await applyTimelineOp(
      seeded(FREE),
      {
        op: "apply_model3d_camera_move",
        target: "clip_set",
        move: "pushIn",
        amount: 0.5,
        durationMs: 2000
      },
      context()
    );
    const out = await applyTimelineOp(
      pushed.state,
      {
        op: "apply_model3d_camera_move",
        target: "clip_set",
        move: "orbit",
        amount: 90,
        startMs: 2000
      },
      context()
    );
    expect(out.error).toBeUndefined();
    const clip = setClip(out.state);
    const atCut = model3dKeyframedFreeCameraPose(clip, 2000).position;
    expect(atCut[2]).toBeCloseTo(2.5, 10);
    const end = model3dKeyframedFreeCameraPose(clip, 4000).position;
    // A quarter turn to the camera's right around a target on the Y axis.
    expect(end[0]).toBeCloseTo(2.5, 6);
    expect(end[2]).toBeCloseTo(0, 6);
    expect(end[1]).toBeCloseTo(1.3, 6);
  });

  it.each([
    {
      label: "an orbit camera",
      camera: {},
      target: "clip_set",
      op: { move: "pan" as const },
      error: /needs a free camera.*orbit camera.*set_model3d_style.*mode: "free"/
    },
    {
      label: "a clip that is not 3D",
      camera: FREE,
      target: "clip_text",
      op: { move: "pan" as const },
      error: /is a text clip, not a 3D clip/
    },
    {
      label: "a start past the clip",
      camera: FREE,
      target: "clip_set",
      op: { move: "pan" as const, startMs: 4000 },
      error: /startMs 4000 is at or past the end.*4000 ms long.*below 4000/
    },
    {
      label: "a duration past the clip",
      camera: FREE,
      target: "clip_set",
      op: { move: "pan" as const, startMs: 3000, durationMs: 2000 },
      error: /durationMs 2000 from startMs 3000 ends at 5000 ms.*at most 1000/
    },
    {
      label: "a zoom factor of zero",
      camera: FREE,
      target: "clip_set",
      op: { move: "zoom" as const, amount: 0 },
      error: /amount for zoom multiplies the focal length.*above 0/
    },
    {
      label: "a push through the target",
      camera: FREE,
      target: "clip_set",
      op: { move: "pushIn" as const, amount: 1.2 },
      error: /amount for pushIn.*at most 0\.95.*1\.2/
    },
    {
      label: "an unknown easing",
      camera: FREE,
      target: "clip_set",
      op: { move: "pan" as const, easing: "bouncy" },
      error: /easing "bouncy" is not an easing/
    }
  ])("refuses $label and names the fix", async ({ camera, target, op, error }) => {
    const out = await applyTimelineOp(
      seeded(camera),
      { op: "apply_model3d_camera_move", target, ...op },
      context()
    );
    expect(out.error).toMatch(error);
    expect(setClip(out.state).animations ?? []).toEqual([]);
  });

  it("refuses an unknown move at the tool boundary, listing the moves", () => {
    expect(() =>
      timelineOpFromToolArgs("apply_model3d_camera_move", {
        target: "clip_set",
        move: "whip"
      })
    ).toThrow(/pushIn/);
  });
});
