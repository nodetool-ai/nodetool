import {
  DEFAULT_MODEL3D_STYLE,
  focalLengthMmToFovDeg,
  fovDegToFocalLengthMm,
  model3dStyleWithPatch,
  isPropertyKeyframed,
  keyframeTimesMs,
  keyframeValueAt,
  makeClip,
  setKeyframes,
  type TimelineClip
} from "@nodetool-ai/timeline";

import {
  CAMERA_LENS_ROW,
  CAMERA_POSITION_ROW,
  CAMERA_ROLL_ROW,
  cameraRowsFor,
  keyframeRowFor,
  OPACITY_ROW,
  POSITION_ROW,
  SCALE_ROW,
  commitInputValue,
  gizmoTransformPatch,
  inputValueAt,
  rowKeyframeTimesMs,
  toggleRowKeyframeAt,
  toggleRowStopwatch
} from "../keyframeRows";

const TRANSFORM = {
  position: { x: 100, y: 50 },
  scale: { x: 2, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 }
};

function clip(extra: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    name: "c",
    sourceType: "imported",
    mediaType: "video",
    startMs: 0,
    durationMs: 2000,
    transform: TRANSFORM,
    ...extra
  });
}

const apply = (c: TimelineClip, patch: Partial<TimelineClip> | null): TimelineClip => ({
  ...c,
  ...patch
});

describe("keyframeRows", () => {
  it("shows the authored value folded with the keyframe at the playhead", () => {
    let c = apply(clip(), toggleRowStopwatch(clip(), POSITION_ROW, 0));
    c = apply(c, commitInputValue(c, POSITION_ROW, POSITION_ROW.inputs[0], 300, 1000));
    expect(inputValueAt(c, POSITION_ROW.inputs[0], 0)).toBe(100);
    expect(inputValueAt(c, POSITION_ROW.inputs[0], 1000)).toBe(300);
    expect(inputValueAt(c, POSITION_ROW.inputs[0], 500)).toBe(200);
    // Y was keyed at the same instant with the value it showed.
    expect(keyframeTimesMs(c, ["offsetY"])).toEqual([0, 1000]);
    expect(inputValueAt(c, POSITION_ROW.inputs[1], 1000)).toBe(50);
    expect(c.transform).toEqual(TRANSFORM);
  });

  it("keeps an animated scale's X:Y ratio", () => {
    let c = apply(clip(), toggleRowStopwatch(clip(), SCALE_ROW, 0));
    c = apply(c, commitInputValue(c, SCALE_ROW, SCALE_ROW.inputs[0], 4, 1000));
    expect(inputValueAt(c, SCALE_ROW.inputs[0], 1000)).toBe(4);
    expect(inputValueAt(c, SCALE_ROW.inputs[1], 1000)).toBe(2);
  });

  it("re-bases a multiplied curve whose authored value is zero", () => {
    let c = apply(clip({ opacity: 0 }), toggleRowStopwatch(clip({ opacity: 0 }), OPACITY_ROW, 0));
    c = apply(c, commitInputValue(c, OPACITY_ROW, OPACITY_ROW.inputs[0], 0.8, 1000));
    expect(c.opacity).toBe(1);
    expect(inputValueAt(c, OPACITY_ROW.inputs[0], 0)).toBe(0);
    expect(inputValueAt(c, OPACITY_ROW.inputs[0], 1000)).toBeCloseTo(0.8);
  });

  it("writes nothing to a keyed row while the playhead is off the clip", () => {
    const c = apply(clip(), toggleRowStopwatch(clip(), OPACITY_ROW, 0));
    expect(commitInputValue(c, OPACITY_ROW, OPACITY_ROW.inputs[0], 0.5, null)).toBeNull();
    expect(toggleRowStopwatch(c, OPACITY_ROW, null)).toBeNull();
  });

  it("keeps the value showing when the last keyframe is deleted", () => {
    let c = apply(clip(), toggleRowStopwatch(clip(), POSITION_ROW, 1000));
    c = apply(c, commitInputValue(c, POSITION_ROW, POSITION_ROW.inputs[0], 250, 1000));
    c = apply(c, toggleRowKeyframeAt(c, POSITION_ROW, 1000));
    expect(isPropertyKeyframed(c, "offsetX")).toBe(false);
    expect(c.transform?.position).toEqual({ x: 250, y: 50 });
  });

  it.each([30, 24])("edits fractional row times at %s fps without deleting a nearby key", (fps) => {
    let c = clip({ durationMs: 1000 });
    const first = 1000 / fps;
    c = { ...c, animations: setKeyframes(c, [{ property: "opacity", value: 0.5 }], first) };
    c = { ...c, animations: setKeyframes(c, [{ property: "opacity", value: 0.8 }], first + 0.3) };
    const [at, nearby] = rowKeyframeTimesMs(c, OPACITY_ROW);
    c = apply(c, toggleRowKeyframeAt(c, OPACITY_ROW, at));
    expect(rowKeyframeTimesMs(c, OPACITY_ROW)).toEqual([nearby]);
  });

  it("turns a gizmo drag on a keyed position into a keyframe at the playhead", () => {
    const start: TimelineClip = {
      ...clip(),
      animations: setKeyframes(
        clip(),
        [
          { property: "offsetX", value: 0 },
          { property: "offsetY", value: 0 }
        ],
        0
      )
    };
    const next = { ...TRANSFORM, position: { x: 130, y: 70 }, rotation: 0.5 };
    const patch = gizmoTransformPatch(start, next, 1000);
    const c = apply(start, patch);
    expect(c.transform?.position).toEqual(TRANSFORM.position);
    // Rotation was not keyed, so it lands on the authored transform.
    expect(c.transform?.rotation).toBe(0.5);
    expect(keyframeValueAt(c, "offsetX", 1000)).toBe(30);
    expect(keyframeValueAt(c, "offsetY", 1000)).toBe(20);
    expect(keyframeTimesMs(c, ["offsetX"])).toEqual([0, 1000]);
  });

  it("patches the transform as before when nothing is keyed", () => {
    const next = { ...TRANSFORM, position: { x: 1, y: 2 } };
    expect(gizmoTransformPatch(clip(), next, 1000)).toEqual({ transform: next });
  });
});

describe("free camera rows", () => {
  const freeClip = (): TimelineClip =>
    clip({
      mediaType: "model3d",
      model3dStyle: model3dStyleWithPatch(DEFAULT_MODEL3D_STYLE, {
        camera: { mode: "free", position: [0, 1, 5], target: [0, 1, 0], fovDeg: 40 }
      })
    });

  it("offers each camera mode the rows whose curves it reads", () => {
    expect(cameraRowsFor("orbit").map((row) => row.id)).toEqual([
      "cameraOrbit",
      "cameraFov",
      "cameraZoom"
    ]);
    expect(cameraRowsFor("free").map((row) => row.id)).toEqual([
      "cameraPosition",
      "cameraTarget",
      "cameraLens",
      "cameraRoll"
    ]);
    expect(cameraRowsFor("scene")).toEqual([]);
  });

  it("edits one axis of the authored position and keeps the other two", () => {
    const c = freeClip();
    const next = apply(
      c,
      commitInputValue(c, CAMERA_POSITION_ROW, CAMERA_POSITION_ROW.inputs[2], 3, 0)
    );
    expect(next.model3dStyle?.camera.position).toEqual([0, 1, 3]);
  });

  it("keys all three axes together and stores offsets from the authored point", () => {
    let c = freeClip();
    c = apply(c, toggleRowStopwatch(c, CAMERA_POSITION_ROW, 0));
    c = apply(
      c,
      commitInputValue(c, CAMERA_POSITION_ROW, CAMERA_POSITION_ROW.inputs[2], 3, 1000)
    );
    expect(c.model3dStyle?.camera.position).toEqual([0, 1, 5]);
    expect(keyframeValueAt(c, "cameraPosZ", 1000)).toBe(-2);
    expect(keyframeTimesMs(c, ["cameraPosX"])).toEqual([0, 1000]);
    expect(inputValueAt(c, CAMERA_POSITION_ROW.inputs[2], 500)).toBe(4);
  });

  it("stores the lens as a field of view and shows it in millimetres", () => {
    const input = CAMERA_LENS_ROW.inputs[0];
    const c = freeClip();
    expect(input.display?.toDisplay(inputValueAt(c, input, 0))).toBeCloseTo(
      fovDegToFocalLengthMm(40),
      6
    );
    const next = apply(
      c,
      commitInputValue(c, CAMERA_LENS_ROW, input, input.display!.fromDisplay(50), 0)
    );
    expect(next.model3dStyle?.camera.fovDeg).toBeCloseTo(focalLengthMmToFovDeg(50), 6);
  });

  it("arms the position row for the keyframe shortcut", () => {
    expect(keyframeRowFor("cameraPosY")).toBe(CAMERA_POSITION_ROW);
    expect(keyframeRowFor("cameraRoll")).toBe(CAMERA_ROLL_ROW);
    // The orbit row keeps `cameraFov`, which both lens rows write.
    expect(keyframeRowFor("cameraFov")?.id).toBe("cameraFov");
  });
});
