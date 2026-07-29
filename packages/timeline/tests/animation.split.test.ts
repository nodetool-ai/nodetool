import { describe, expect, it } from "vitest";
import { splitClip } from "../src/splitClip.js";
import type { TimelineClip } from "../src/types.js";
import type { ClipAnimation } from "../src/animation/types.js";

function makeClipWithAnimations(animations: ClipAnimation[]): TimelineClip {
  return {
    id: "clip-1",
    trackId: "track-1",
    name: "clip",
    startMs: 100,
    durationMs: 400,
    mediaType: "video",
    sourceType: "generated",
    status: "generated",
    locked: false,
    versions: [],
    animations
  };
}

describe("splitClip with animations", () => {
  it("keeps 'in' left, 'out' right, copies emphasis/loop to both", () => {
    const clip = makeClipWithAnimations([
      { id: "in-1", role: "in", preset: "fade", durationMs: 300 },
      { id: "out-1", role: "out", preset: "fade", durationMs: 300 },
      { id: "emph-1", role: "emphasis", preset: "pulse", durationMs: 400 },
      { id: "loop-1", role: "loop", preset: "float", durationMs: 1000 }
    ]);
    const [left, right] = splitClip(clip, 300);

    const leftRoles = (left.animations ?? []).map((a) => a.role).sort();
    const rightRoles = (right.animations ?? []).map((a) => a.role).sort();
    expect(leftRoles).toEqual(["emphasis", "in", "loop"]);
    expect(rightRoles).toEqual(["emphasis", "loop", "out"]);
  });

  it("regenerates ids on the right half", () => {
    const clip = makeClipWithAnimations([
      { id: "loop-1", role: "loop", preset: "float", durationMs: 1000 }
    ]);
    const [left, right] = splitClip(clip, 300);
    expect(left.animations?.[0].id).toBe("loop-1");
    expect(right.animations?.[0].id).not.toBe("loop-1");
    expect(right.animations?.[0].preset).toBe("float");
  });

  it("leaves clips without animations untouched", () => {
    const clip = makeClipWithAnimations([]);
    delete clip.animations;
    const [left, right] = splitClip(clip, 300);
    expect(left.animations).toBeUndefined();
    expect(right.animations).toBeUndefined();
  });
});
