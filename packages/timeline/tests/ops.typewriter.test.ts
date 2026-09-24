import { describe, expect, it } from "vitest";
import { applyTimelineOp } from "../src/ops/apply.js";
import { countTypewriterUnits } from "../src/animation/typewriter.js";
import { compileClipAnimations } from "../src/animation/compile.js";
import { createAnimationSample, sampleStaggeredAnimations } from "../src/animation/sample.js";
import type { TimelineOpContext, TimelineOpState } from "../src/ops/types.js";

describe("typewriter timeline op", () => {
  it("reveals the full text inside the requested duration", async () => {
    let nextId = 0;
    const context: TimelineOpContext = {
      newId: (kind) => `${kind}_${++nextId}`
    };
    const state: TimelineOpState = {
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [],
      clips: [],
      markers: [],
      playheadMs: 0,
      selectedClipIds: []
    };
    const added = await applyTimelineOp(
      state,
      { op: "add_text_clip", text: "BUILD", durationMs: 2000 },
      context
    );
    expect(added.error).toBeUndefined();
    const clipId = added.state.clips[0]!.id;
    const animated = await applyTimelineOp(
      added.state,
      {
        op: "animate_clip",
        target: clipId,
        animations: [{ role: "in", preset: "typewriter", durationMs: 1000 }]
      },
      context
    );
    expect(animated.error).toBeUndefined();
    expect(animated.state.clips[0]?.animations).toMatchObject([
      {
        preset: "typewriter",
        durationMs: 1,
        stagger: { unit: "character", offsetMs: 999 / 4 }
      }
    ]);
  });

  it("finishes the default reveal inside a short clip", async () => {
    let nextId = 0;
    const context: TimelineOpContext = {
      newId: (kind) => `${kind}_${++nextId}`
    };
    const state: TimelineOpState = {
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [],
      clips: [],
      markers: [],
      playheadMs: 0,
      selectedClipIds: []
    };
    const text = "Describe it once.";
    const added = await applyTimelineOp(
      state,
      { op: "add_text_clip", text, durationMs: 500 },
      context
    );
    const animated = await applyTimelineOp(
      added.state,
      {
        op: "animate_clip",
        target: added.state.clips[0]!.id,
        animations: [{ role: "in", preset: "typewriter" }]
      },
      context
    );
    expect(animated.error).toBeUndefined();
    const animation = animated.state.clips[0]!.animations![0]!;
    expect(
      animation.durationMs +
        (countTypewriterUnits(text) - 1) * animation.stagger!.offsetMs
    ).toBeLessThanOrEqual(500);
  });

  it("reveals about half a long brief midway and all of it at 1300ms", async () => {
    let nextId = 0;
    const context: TimelineOpContext = { newId: (kind) => `${kind}_${++nextId}` };
    const state: TimelineOpState = {
      fps: 30, width: 1920, height: 1080, tracks: [], clips: [],
      markers: [], playheadMs: 0, selectedClipIds: []
    };
    const brief = "Make me a 12-second teaser for SCRAPHEART — a desert chase across the flats.";
    const added = await applyTimelineOp(state, { op: "add_text_clip", text: brief, durationMs: 2000 }, context);
    const animated = await applyTimelineOp(added.state, {
      op: "animate_clip", target: added.state.clips[0]!.id,
      animations: [{ role: "in", preset: "typewriter", durationMs: 1300,
        caret: { color: "#e879f9", widthPx: 4, blinkPeriodMs: 533 } }]
    }, context);
    const animation = animated.state.clips[0]!.animations![0]!;
    expect(animation.caret).toEqual({ color: "#e879f9", widthPx: 4, blinkPeriodMs: 533 });
    const count = countTypewriterUnits(brief);
    const compiled = compileClipAnimations([animation], 2000, { width: 1920, height: 1080 },
      { staggerUnit: "character", staggerCount: count });
    const visible = (ms: number): number => Array.from({ length: count }, (_, index) =>
      sampleStaggeredAnimations(compiled, ms, index, createAnimationSample()).opacity > 0.5 ? 1 : 0
    ).reduce((sum, unit) => sum + unit, 0);
    expect(visible(650)).toBeGreaterThan(count * 0.45);
    expect(visible(650)).toBeLessThan(count * 0.55);
    expect(visible(1300)).toBe(count);
  });
});
