import { describe, expect, it } from "vitest";
import { splitClip } from "../src/splitClip.js";
import { compileClipAnimations } from "../src/animation/compile.js";
import { sampleAnimations } from "../src/animation/sample.js";
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
  it("keeps 'in' left, 'out' right, emphasis on one half, loop on both", () => {
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
    expect(rightRoles).toEqual(["loop", "out"]);
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

  const CANVAS = { width: 1920, height: 1080 };

  it("puts an emphasis on the half that holds its delay, rebased", () => {
    const clip = makeClipWithAnimations([
      { id: "early", role: "emphasis", preset: "pulse", durationMs: 100, delayMs: 50 },
      { id: "late", role: "emphasis", preset: "pulse", durationMs: 100, delayMs: 260 }
    ]);
    // clip-local split point is 300 - 100 = 200ms
    const [left, right] = splitClip(clip, 300);

    expect((left.animations ?? []).map((a) => a.id)).toEqual(["early"]);
    expect(left.animations?.[0].delayMs).toBe(50);

    const rightEmphasis = (right.animations ?? []).filter((a) => a.role === "emphasis");
    expect(rightEmphasis).toHaveLength(1);
    expect(rightEmphasis[0].id).not.toBe("late");
    expect(rightEmphasis[0].delayMs).toBe(60);
  });

  it("keeps a loop's phase across the cut, with no pause to the next cycle", () => {
    // period 300ms, loop starts at clip-local 20ms; the cut at clip-local
    // 200ms lands 180ms into the first cycle. The right half must resume
    // mid-cycle at once: every instant after the cut samples the same value
    // the unsplit clip would have.
    const clip = makeClipWithAnimations([
      { id: "loop-1", role: "loop", preset: "float", durationMs: 300, delayMs: 20 }
    ]);
    const [left, right] = splitClip(clip, 300);

    const rightLoop = (right.animations ?? []).find((a) => a.role === "loop");
    expect(rightLoop?.delayMs).toBe(-180);

    const wholeCompiled = compileClipAnimations(clip.animations, clip.durationMs, CANVAS);
    const leftCompiled = compileClipAnimations(left.animations, left.durationMs, CANVAS);
    const rightCompiled = compileClipAnimations(right.animations, right.durationMs, CANVAS);
    // Left half: unchanged up to the cut.
    for (const localMs of [20, 100, 199]) {
      const whole = sampleAnimations(wholeCompiled, localMs);
      const half = sampleAnimations(leftCompiled, localMs);
      expect(half.offsetY).toBeCloseTo(whole.offsetY, 6);
    }
    // Right half: local 20 and 60 are unsplit-local 220 and 260, inside the
    // cycle the cut interrupted. A delay to the next boundary would return 0
    // here and only resume at unsplit-local 320.
    let moved = false;
    for (const localMs of [0, 20, 60, 120, 200]) {
      const whole = sampleAnimations(wholeCompiled, 200 + localMs);
      const half = sampleAnimations(rightCompiled, localMs);
      expect(half.offsetY).toBeCloseTo(whole.offsetY, 6);
      expect(half.offsetX).toBeCloseTo(whole.offsetX, 6);
      if (Math.abs(whole.offsetY) > 1e-6) moved = true;
    }
    expect(moved).toBe(true);
  });

  it("does not delay a loop that has not started at the cut", () => {
    const clip = makeClipWithAnimations([
      { id: "loop-1", role: "loop", preset: "float", durationMs: 300, delayMs: 260 }
    ]);
    const [, right] = splitClip(clip, 300);
    expect(right.animations?.[0].delayMs).toBe(60);
  });

  it("replays a fullClip loop on both halves", () => {
    // kenBurns ignores delay and runs once over the whole clip, and its curves
    // are in canvas pixels, which splitClip has no access to — so neither half
    // can carry a partial move. Both replay the whole one-shot.
    const clip = makeClipWithAnimations([
      { id: "kb", role: "loop", preset: "kenBurns", durationMs: 3000, delayMs: 40, params: { zoom: 0.4 } }
    ]);
    const [left, right] = splitClip(clip, 300);
    expect(left.animations?.[0].delayMs).toBe(40);
    expect(right.animations?.[0].delayMs).toBe(40);

    const rightCompiled = compileClipAnimations(right.animations, right.durationMs, CANVAS);
    expect(sampleAnimations(rightCompiled, 0).scale).toBeCloseTo(1, 3);
    expect(sampleAnimations(rightCompiled, right.durationMs).scale).toBeCloseTo(1.4, 3);
  });
});
