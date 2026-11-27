/**
 * `describeModel3DCameraMove`: the words a keyed camera reads as. Each move is
 * written with `applyModel3DCameraMove`, the preset the editor and the agent
 * use, so the description is checked against the moves people make.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL3D_STYLE,
  MODEL3D_STATIC_CAMERA_DESCRIPTION,
  applyModel3DCameraMove,
  describeModel3DCameraMove,
  makeClip,
  setKeyframe,
  type ClipModel3DCamera,
  type Model3DCameraMoveId,
  type AnimatedProperty,
  type TimelineClip
} from "../src/index.js";

/** Key a channel from identity at the clip's start to `value` at its end. */
const ramp = (
  clip: TimelineClip,
  property: AnimatedProperty,
  from: number,
  to: number
): TimelineClip => {
  const first = { ...clip, animations: setKeyframe(clip, property, 0, from) };
  return {
    ...first,
    animations: setKeyframe(first, property, clip.durationMs, to)
  };
};

const freeClip = (
  camera: Partial<ClipModel3DCamera> = {},
  overrides: Partial<TimelineClip> = {}
): TimelineClip =>
  makeClip({
    id: "clip_1",
    trackId: "track_1",
    name: "Set",
    startMs: 0,
    durationMs: 4000,
    mediaType: "model3d",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset_glb",
    model3dStyle: {
      ...DEFAULT_MODEL3D_STYLE,
      camera: {
        ...DEFAULT_MODEL3D_STYLE.camera,
        mode: "free",
        position: [0, 1.6, 5],
        target: [0, 1.6, 0],
        rollDeg: 0,
        ...camera
      }
    },
    ...overrides
  });

const moved = (
  move: Model3DCameraMoveId,
  amount?: number,
  clip: TimelineClip = freeClip()
): TimelineClip => ({
  ...clip,
  animations: applyModel3DCameraMove(clip, move, { amount })
});

describe("describeModel3DCameraMove", () => {
  it("reads an unkeyed camera as static", () => {
    expect(describeModel3DCameraMove(freeClip())).toBe(
      MODEL3D_STATIC_CAMERA_DESCRIPTION
    );
  });

  it("reads a clip with no style and a scene camera as static", () => {
    const bare = makeClip({
      id: "c",
      trackId: "t",
      name: "Bare",
      startMs: 0,
      durationMs: 1000,
      mediaType: "model3d",
      sourceType: "imported",
      status: "generated"
    });
    expect(describeModel3DCameraMove({ ...bare, model3dStyle: undefined })).toBe(
      MODEL3D_STATIC_CAMERA_DESCRIPTION
    );
    expect(describeModel3DCameraMove(freeClip({ mode: "scene" }))).toBe(
      MODEL3D_STATIC_CAMERA_DESCRIPTION
    );
  });

  it.each<[Model3DCameraMoveId, number, string]>([
    ["pushIn", 0.5, "The camera pushes in."],
    ["pushIn", -0.5, "The camera pulls out."],
    ["pan", 30, "The camera pans right."],
    ["pan", -30, "The camera pans left."],
    ["tilt", 20, "The camera tilts up slowly."],
    ["tilt", -20, "The camera tilts down slowly."],
    ["truck", 0.5, "The camera trucks right."],
    ["truck", -0.5, "The camera trucks left."],
    ["pedestal", 0.4, "The camera pedestals up."],
    ["pedestal", -0.4, "The camera pedestals down."],
    ["crane", 0.4, "The camera cranes up."],
    ["orbit", 90, "The camera orbits right around the subject."],
    ["orbit", -90, "The camera orbits left around the subject."],
    ["zoom", 2, "The camera zooms in."],
    ["zoom", 0.5, "The camera zooms out."],
    ["dutch", 15, "The camera rolls so the horizon turns clockwise."]
  ])("describes the %s preset at %d", (move, amount, expected) => {
    expect(describeModel3DCameraMove(moved(move, amount))).toBe(expected);
  });

  it("joins several moves in one sentence", () => {
    const pushed = moved("pushIn", 0.1);
    const both = {
      ...pushed,
      animations: applyModel3DCameraMove(pushed, "pan", { amount: 40 })
    };
    expect(describeModel3DCameraMove(both)).toBe(
      "The camera pushes in slowly and pans right."
    );
  });

  it("reads the pace from the clip length", () => {
    const short = freeClip({}, { durationMs: 500 });
    expect(describeModel3DCameraMove(moved("pushIn", 0.5, short))).toBe(
      "The camera pushes in quickly."
    );
    const long = freeClip({}, { durationMs: 20_000 });
    expect(describeModel3DCameraMove(moved("pushIn", 0.5, long))).toBe(
      "The camera pushes in slowly."
    );
  });

  it("leaves out a change under the thresholds", () => {
    const clip = freeClip();
    const nudged = ramp(clip, "cameraPosZ", 0, -0.05);
    expect(describeModel3DCameraMove(nudged)).toBe(
      MODEL3D_STATIC_CAMERA_DESCRIPTION
    );
    expect(describeModel3DCameraMove(moved("pan", 1))).toBe(
      MODEL3D_STATIC_CAMERA_DESCRIPTION
    );
    expect(describeModel3DCameraMove(moved("dutch", 1))).toBe(
      MODEL3D_STATIC_CAMERA_DESCRIPTION
    );
  });

  it("reads an orbit camera from its own channels", () => {
    const orbit = makeClip({
      id: "o",
      trackId: "t",
      name: "Turntable",
      startMs: 0,
      durationMs: 4000,
      mediaType: "model3d",
      sourceType: "imported",
      status: "generated",
      currentAssetId: "asset_glb",
      model3dStyle: DEFAULT_MODEL3D_STYLE
    });
    expect(describeModel3DCameraMove(orbit)).toBe(MODEL3D_STATIC_CAMERA_DESCRIPTION);
    const turned = ramp(orbit, "cameraAzimuth", 0, 90);
    expect(describeModel3DCameraMove(turned)).toBe(
      "The camera orbits right around the subject."
    );
    const closer = ramp(orbit, "cameraZoom", 1, 2);
    expect(describeModel3DCameraMove(closer)).toBe("The camera pushes in.");
  });
});
