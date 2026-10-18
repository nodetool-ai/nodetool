import { describe, expect, it } from "vitest";
import {
  adjacentKeyframeMs,
  clearKeyframes,
  composeKeyframeValue,
  findKeyframeAnimation,
  isPropertyKeyframed,
  keyframeEasingAt,
  keyframeTimesMs,
  keyframeValueAt,
  keyframeValueForComposed,
  moveKeyframes,
  removeKeyframes,
  setKeyframeEasing,
  setKeyframes
} from "../src/keyframes.js";
import type { TimelineClip } from "../src/types.js";

function clip(extra: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: "c",
    trackId: "v1",
    name: "c",
    startMs: 0,
    durationMs: 2000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    ...extra
  };
}

function keyed(): TimelineClip {
  let c = clip();
  c = {
    ...c,
    animations: setKeyframes(
      c,
      [
        { property: "offsetX", value: 0 },
        { property: "offsetY", value: 0 }
      ],
      0
    )
  };
  c = {
    ...c,
    animations: setKeyframes(
      c,
      [
        { property: "offsetX", value: 100 },
        { property: "offsetY", value: 50 }
      ],
      1000
    )
  };
  return { ...c, animations: setKeyframes(c, [{ property: "opacity", value: 0.5 }], 1500) };
}

describe("stopwatch keyframe helpers", () => {
  it("keys several properties at one instant and filters times by property", () => {
    const c = keyed();
    expect(isPropertyKeyframed(c, "offsetX")).toBe(true);
    expect(isPropertyKeyframed(c, "scale")).toBe(false);
    expect(keyframeTimesMs(c)).toEqual([0, 1000, 1500]);
    expect(keyframeTimesMs(c, ["offsetX", "offsetY"])).toEqual([0, 1000]);
    expect(keyframeTimesMs(c, ["opacity"])).toEqual([1500]);
  });

  it("finds the previous and next keyframe of a property group", () => {
    const c = keyed();
    const position = ["offsetX", "offsetY"] as const;
    expect(adjacentKeyframeMs(c, position, 500, 1)).toBe(1000);
    expect(adjacentKeyframeMs(c, position, 1000, 1)).toBeNull();
    expect(adjacentKeyframeMs(c, position, 1000, -1)).toBe(0);
    expect(adjacentKeyframeMs(c, position, 0, -1)).toBeNull();
  });

  it("removes a group's keyframes at an instant and clears a group", () => {
    let c = keyed();
    c = { ...c, animations: removeKeyframes(c, ["offsetX", "offsetY"], 1000) };
    expect(keyframeTimesMs(c, ["offsetX", "offsetY"])).toEqual([0]);
    c = { ...c, animations: clearKeyframes(c, ["offsetX", "offsetY"]) };
    expect(isPropertyKeyframed(c, "offsetX")).toBe(false);
    expect(keyframeTimesMs(c)).toEqual([1500]);
    c = { ...c, animations: clearKeyframes(c, ["opacity"]) };
    expect(findKeyframeAnimation(c)).toBeUndefined();
  });

  it("moves keyframes in time, replacing one already at the target", () => {
    let c = keyed();
    c = { ...c, animations: moveKeyframes(c, ["offsetX", "offsetY"], 1000, 1500) };
    expect(keyframeTimesMs(c, ["offsetX"])).toEqual([0, 1500]);
    expect(keyframeValueAt(c, "offsetX", 1500)).toBe(100);
    expect(keyframeValueAt(c, "offsetY", 1500)).toBe(50);
    // Opacity was not in the moved group.
    expect(keyframeTimesMs(c, ["opacity"])).toEqual([1500]);

    c = { ...c, animations: moveKeyframes(c, ["offsetX"], 0, 1500) };
    expect(keyframeTimesMs(c, ["offsetX"])).toEqual([1500]);
    expect(keyframeValueAt(c, "offsetX", 1500)).toBe(0);
  });

  it("sets the easing into one keyframe and pushes an override down", () => {
    let c = keyed();
    const animation = findKeyframeAnimation(c)!;
    c = {
      ...c,
      animations: c.animations!.map((a) =>
        a === animation ? { ...a, easing: "easeOut" } : a
      )
    };
    expect(keyframeEasingAt(c, "offsetX", 1000)).toBe("easeOut");

    c = { ...c, animations: setKeyframeEasing(c, ["offsetX", "offsetY"], 1000, "hold") };
    expect(findKeyframeAnimation(c)?.easing).toBeUndefined();
    expect(keyframeEasingAt(c, "offsetX", 1000)).toBe("hold");
    expect(keyframeEasingAt(c, "opacity", 1500)).toBe("easeOut");
    expect(keyframeValueAt(c, "offsetX", 999)).toBe(0);
    expect(keyframeEasingAt(c, "offsetX", 500)).toBeUndefined();
  });

  it("composes and inverts values by how the property folds", () => {
    expect(composeKeyframeValue("offsetX", 40, 10)).toBe(50);
    expect(keyframeValueForComposed("offsetX", 40, 50)).toBe(10);
    expect(composeKeyframeValue("scale", 2, 0.5)).toBe(1);
    expect(keyframeValueForComposed("scale", 2, 1)).toBe(0.5);
    expect(keyframeValueForComposed("opacity", 0, 0.5)).toBeNull();
  });
});
