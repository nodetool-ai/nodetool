import { describe, expect, it } from "vitest";
import {
  findKeyframeAnimation,
  hasKeyframeAt,
  keyframeTimesMs,
  keyframeValueAt,
  removeKeyframe,
  setKeyframe
} from "../src/keyframes.js";
import { compileClipAnimations } from "../src/animation/compile.js";
import type { TimelineClip } from "../src/types.js";

function clip(extra: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: "c",
    trackId: "v1",
    name: "c",
    startMs: 1000,
    durationMs: 2000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    ...extra
  };
}

describe("keyframes", () => {
  it("adds, updates and reads back a keyframe", () => {
    let c = clip();
    c = { ...c, animations: setKeyframe(c, "opacity", 500, 0.2) };
    c = { ...c, animations: setKeyframe(c, "opacity", 1500, 0.8) };
    expect(keyframeTimesMs(c)).toEqual([500, 1500]);
    expect(keyframeValueAt(c, "opacity", 1000)).toBeCloseTo(0.5);
    expect(keyframeValueAt(c, "opacity", 0)).toBe(0.2);
    expect(hasKeyframeAt(c, "opacity", 500)).toBe(true);
    expect(hasKeyframeAt(c, "opacity", 600)).toBe(false);

    c = { ...c, animations: setKeyframe(c, "opacity", 500, 0.4) };
    expect(keyframeTimesMs(c)).toEqual([500, 1500]);
    expect(keyframeValueAt(c, "opacity", 500)).toBe(0.4);
  });

  it("keeps one animation for every property and spans the clip", () => {
    let c = clip();
    c = { ...c, animations: setKeyframe(c, "opacity", 0, 1) };
    c = { ...c, animations: setKeyframe(c, "scale", 2000, 1.5) };
    expect(c.animations).toHaveLength(1);
    const a = findKeyframeAnimation(c)!;
    expect(a.durationMs).toBe(2000);
    expect(a.custom?.curves.map((x) => x.property).sort()).toEqual(["opacity", "scale"]);
  });

  it("reads identity where nothing is keyframed", () => {
    expect(keyframeValueAt(clip(), "opacity", 100)).toBe(1);
    expect(keyframeValueAt(clip(), "offsetX", 100)).toBe(0);
  });

  it("removing the last keyframe drops the animation, other animations survive", () => {
    const other = {
      id: "fade",
      role: "in" as const,
      preset: "fade",
      durationMs: 300,
      enabled: true
    };
    let c = clip({ animations: [other] });
    c = { ...c, animations: setKeyframe(c, "rotation", 1000, 45) };
    expect(c.animations).toHaveLength(2);
    c = { ...c, animations: removeKeyframe(c, "rotation", 1000) };
    expect(c.animations).toEqual([other]);
  });

  it("compiles like any other custom animation", () => {
    let c = clip();
    c = { ...c, animations: setKeyframe(c, "opacity", 0, 0) };
    c = { ...c, animations: setKeyframe(c, "opacity", 2000, 1) };
    const compiled = compileClipAnimations(c.animations, c.durationMs, {
      width: 1920,
      height: 1080
    });
    expect(compiled.length).toBeGreaterThan(0);
  });
});
