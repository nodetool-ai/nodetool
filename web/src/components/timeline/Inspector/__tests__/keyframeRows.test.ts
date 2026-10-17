import {
  isPropertyKeyframed,
  keyframeTimesMs,
  keyframeValueAt,
  makeClip,
  setKeyframes,
  type TimelineClip
} from "@nodetool-ai/timeline";

import {
  OPACITY_ROW,
  POSITION_ROW,
  SCALE_ROW,
  commitInputValue,
  gizmoTransformPatch,
  inputValueAt,
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
