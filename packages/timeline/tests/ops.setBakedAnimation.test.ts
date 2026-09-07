/**
 * `set_baked_animation` through `applyTimelineOp`.
 *
 * The op exists because a bake is re-run. What is pinned here is the identity
 * that decides what a re-run overwrites — `custom.bakedFrom.kind` plus the
 * driven property — and the two things it must never overwrite: a curve on a
 * different property, and an animation a person keyframed (no `bakedFrom`).
 * Inverting the match (dropping the property from the comparison, say) turns
 * the "leaves a different property alone" case red.
 */

import { describe, expect, it } from "vitest";
import { applyTimelineOp } from "../src/ops/apply.js";
import type { TimelineOpContext, TimelineOpState } from "../src/ops/types.js";
import type { SetBakedAnimationOp } from "../src/ops/op.js";
import { makeClip, makeTrack } from "../src/index.js";
import type { ClipAnimation } from "../src/animation/types.js";

function context(): TimelineOpContext {
  let n = 0;
  return { newId: (kind) => `${kind}_${++n}` };
}

function state(animations?: ClipAnimation[]): TimelineOpState {
  const clip = makeClip({
    id: "clip_a",
    trackId: "track_v",
    name: "Shot A",
    startMs: 1000,
    durationMs: 4000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated"
  });
  if (animations) clip.animations = animations;
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [makeTrack({ id: "track_v", type: "video", name: "V1", index: 0 })],
    clips: [clip],
    markers: [],
    playheadMs: 0,
    selectedClipIds: []
  };
}

/** A pulse on `scale`, produced by `kind`. */
function bake(
  property = "scale",
  kind = "audio",
  overrides: Partial<SetBakedAnimationOp["animation"]> = {}
): SetBakedAnimationOp {
  return {
    op: "set_baked_animation",
    target: "clip_a",
    animation: {
      property,
      keyframes: [
        { sourceMs: 0, value: 1 },
        { sourceMs: 500, value: 1.4 },
        { sourceMs: 1200, value: 1 }
      ],
      timeBase: "source",
      bakedFrom: { kind, assetId: "asset_music", settings: { mode: "envelope" } },
      ...overrides
    }
  };
}

const animationsOf = (out: { state: TimelineOpState }): ClipAnimation[] =>
  out.state.clips[0]!.animations ?? [];

describe("set_baked_animation", () => {
  it("writes one source-anchored custom animation over the whole clip", async () => {
    const out = await applyTimelineOp(state(), bake(), context());
    expect(out.error).toBeUndefined();

    const animations = animationsOf(out);
    expect(animations).toHaveLength(1);
    const animation = animations[0]!;
    expect(animation.preset).toBe("custom");
    expect(animation.role).toBe("emphasis");
    expect(animation.delayMs).toBe(0);
    // The window is the clip's, so the curve needs no arithmetic to line up.
    expect(animation.durationMs).toBe(4000);
    expect(animation.custom?.timeBase).toBe("source");
    expect(animation.custom?.bakedFrom).toEqual({
      kind: "audio",
      assetId: "asset_music",
      settings: { mode: "envelope" }
    });

    const curve = animation.custom!.curves[0]!;
    expect(curve.property).toBe("scale");
    expect(curve.keyframes.map((kf) => kf.sourceMs)).toEqual([0, 500, 1200]);
    // `t` is the gate's, recomputed from `sourceMs` over the curve's own span.
    expect(curve.keyframes.map((kf) => kf.t)).toEqual([0, 500 / 1200, 1]);

    expect(out.result).toMatchObject({
      animationId: animation.id,
      keyframeCount: 3,
      replaced: false
    });
    expect(out.changedClipIds).toEqual(["clip_a"]);
  });

  it("replaces an earlier bake of the same kind and property, keeping its id", async () => {
    const first = await applyTimelineOp(state(), bake(), context());
    const firstId = animationsOf(first)[0]!.id;

    const again = await applyTimelineOp(
      first.state,
      bake("scale", "audio", {
        keyframes: [
          { sourceMs: 0, value: 1 },
          { sourceMs: 900, value: 2 }
        ]
      }),
      context()
    );
    expect(again.error).toBeUndefined();

    const animations = animationsOf(again);
    expect(animations).toHaveLength(1);
    expect(animations[0]!.id).toBe(firstId);
    expect(animations[0]!.custom!.curves[0]!.keyframes).toHaveLength(2);
    expect(again.result).toMatchObject({ replaced: true, keyframeCount: 2 });
  });

  it("leaves a bake on a different property alone", async () => {
    const first = await applyTimelineOp(state(), bake("scale"), context());
    const second = await applyTimelineOp(
      first.state,
      bake("opacity"),
      context()
    );
    expect(second.error).toBeUndefined();

    const animations = animationsOf(second);
    expect(animations).toHaveLength(2);
    expect(
      animations.map((a) => a.custom!.curves[0]!.property).sort()
    ).toEqual(["opacity", "scale"]);
    expect(second.result).toMatchObject({ replaced: false });
  });

  it("leaves a hand-edited animation alone and appends beside it", async () => {
    const handEdited: ClipAnimation = {
      id: "anim_hand",
      role: "emphasis",
      preset: "custom",
      durationMs: 4000,
      // No `bakedFrom`: a person keyframed this, so no bake owns it.
      custom: {
        timeBase: "source",
        curves: [
          {
            property: "scale",
            keyframes: [
              { t: 0, value: 1, sourceMs: 0 },
              { t: 1, value: 3, sourceMs: 4000 }
            ]
          }
        ]
      }
    };
    const out = await applyTimelineOp(
      state([handEdited]),
      bake("scale"),
      context()
    );
    expect(out.error).toBeUndefined();

    const animations = animationsOf(out);
    expect(animations).toHaveLength(2);
    expect(animations[0]).toEqual(handEdited);
    expect(animations[1]!.custom?.bakedFrom?.kind).toBe("audio");
    expect(out.result).toMatchObject({ replaced: false });
  });

  it("appends rather than replacing when `replace` is false", async () => {
    const first = await applyTimelineOp(state(), bake(), context());
    const again = await applyTimelineOp(
      first.state,
      bake("scale", "audio", { replace: false }),
      context()
    );
    expect(again.error).toBeUndefined();
    expect(animationsOf(again)).toHaveLength(2);
    expect(again.result).toMatchObject({ replaced: false });
  });

  it("refuses a curve whose keyframes go back in the source", async () => {
    const out = await applyTimelineOp(
      state(),
      bake("scale", "audio", {
        keyframes: [
          { sourceMs: 500, value: 1 },
          { sourceMs: 100, value: 2 }
        ]
      }),
      context()
    );
    expect(out.error).toContain("goes back in the source");
    expect(out.state.clips[0]!.animations).toBeUndefined();
  });

  it("refuses a property no curve can drive", async () => {
    const out = await applyTimelineOp(state(), bake("loudness"), context());
    expect(out.error).toContain("expected one of");
    expect(out.state.clips[0]!.animations).toBeUndefined();
  });

  it("refuses a wipeProgress curve with no mask", async () => {
    const out = await applyTimelineOp(
      state(),
      bake("wipeProgress"),
      context()
    );
    expect(out.error).toContain("needs a mask");
  });

  it("refuses a clip-normalized time base and names the op that takes one", async () => {
    const out = await applyTimelineOp(
      state(),
      // A caller reaching for the other clock; the op writes source curves only.
      bake("scale", "audio", {
        timeBase: "clip" as unknown as "source"
      }),
      context()
    );
    expect(out.error).toContain("animate_clip");
  });

  it("refuses provenance with no kind", async () => {
    const out = await applyTimelineOp(
      state(),
      bake("scale", "", {}),
      context()
    );
    expect(out.error).toContain("bakedFrom.kind");
  });
});
