import { describe, expect, it } from "vitest";
import { applyTimelineOp } from "../src/ops/apply.js";
import type { TimelineOpContext, TimelineOpState } from "../src/ops/types.js";
import { makeClip, makeTrack } from "../src/defaults.js";
import {
  effectCurveName,
  joinParamCurves,
  paramCurvesForEffects,
  parseEffectCurveName
} from "../src/paramCurves.js";
import { curveValueAtT } from "../src/keyframes.js";
import { retargetSequence } from "../src/retarget.js";
import { splitClip } from "../src/splitClip.js";
import { trimClip } from "../src/trimClip.js";
import type { ClipParamCurve, TimelineClip, TimelineSequence } from "../src/types.js";

const curve = (
  property: string,
  ...keys: [number, number, string?][]
): ClipParamCurve => ({
  property,
  keyframes: keys.map(([t, value, easing]) =>
    easing ? { t, value, easing } : { t, value }
  )
});

const clip = (overrides: Partial<TimelineClip> = {}): TimelineClip =>
  makeClip({
    id: "c",
    trackId: "v",
    mediaType: "video",
    startMs: 0,
    durationMs: 2000,
    inPointMs: 0,
    outPointMs: 2000,
    ...overrides
  });

const valueAt = (owner: TimelineClip, property: string, t: number) => {
  const found = owner.paramCurves?.find((c) => c.property === property);
  if (!found) throw new Error(`no curve ${property}`);
  return curveValueAtT(found.keyframes, t);
};

describe("paramCurves through a split", () => {
  it("cuts each curve at its value, so each half keeps only its part", () => {
    const [left, right] = splitClip(
      clip({ paramCurves: [curve("volumeDb", [0, 0], [1, -20])] }),
      500
    );
    expect(valueAt(left, "volumeDb", 0)).toBe(0);
    expect(valueAt(left, "volumeDb", 1)).toBe(-5);
    expect(valueAt(right, "volumeDb", 0)).toBe(-5);
    expect(valueAt(right, "volumeDb", 1)).toBe(-20);
    expect(left.paramCurves?.[0].keyframes).toHaveLength(2);
    expect(right.paramCurves?.[0].keyframes).toHaveLength(2);
  });

  it("keeps a key near the cut on a long clip", () => {
    const [, right] = splitClip(
      clip({
        durationMs: 600000,
        outPointMs: 600000,
        paramCurves: [curve("volumeDb", [0, 0], [0.5, -40, "hold"], [1, -40])]
      }),
      299966.67
    );
    expect(right.paramCurves?.[0].keyframes).toHaveLength(3);
    expect(right.paramCurves?.[0].keyframes[1].easing).toBe("hold");
  });

  it("carries a name no reader knows", () => {
    const [left, right] = splitClip(
      clip({ paramCurves: [curve("future:thing", [0, 1], [1, 3])] }),
      1000
    );
    expect(valueAt(left, "future:thing", 1)).toBe(2);
    expect(valueAt(right, "future:thing", 0)).toBe(2);
  });

  it("leaves a clip with no curves without the field", () => {
    const [left, right] = splitClip(clip(), 500);
    expect("paramCurves" in left).toBe(false);
    expect("paramCurves" in right).toBe(false);
  });

  it("joins the halves back to the same values", () => {
    const whole = clip({ paramCurves: [curve("volumeDb", [0, 0], [1, -20])] });
    const [left, right] = splitClip(whole, 500);
    const joined = joinParamCurves(left.paramCurves, right.paramCurves, 500, 1500);
    expect(joined).toHaveLength(1);
    const keys = joined![0].keyframes;
    expect(curveValueAtT(keys, 0.25)).toBeCloseTo(-5);
    expect(curveValueAtT(keys, 0.5)).toBeCloseTo(-10);
    expect(curveValueAtT(keys, 1)).toBeCloseTo(-20);
    expect(keys).toHaveLength(3);
  });
});

describe("paramCurves through other clip edits", () => {
  it("stretch with the clip on a trim, as a hand-set keyframe does", () => {
    const paramCurves = [curve("volumeDb", [0, 0], [1, -20])];
    const trimmed = trimClip(clip({ paramCurves }), "end", -1000);
    expect(trimmed.durationMs).toBe(1000);
    expect(trimmed.paramCurves).toEqual(paramCurves);
  });

  it("stay as they are through a canvas retarget, as the static values do", () => {
    const paramCurves = [curve("effect:e:radius", [0, 4], [1, 12])];
    const seq = {
      id: "s",
      projectId: "p",
      name: "s",
      fps: 30,
      width: 1920,
      height: 1080,
      durationMs: 2000,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tracks: [],
      clips: [clip({ paramCurves })],
      markers: []
    } as unknown as TimelineSequence;
    expect(retargetSequence(seq, "9:16", "cover").sequence.clips[0].paramCurves).toEqual(paramCurves);
  });
});

describe("an effect's curves", () => {
  it("name the effect, with a colon allowed in its id", () => {
    expect(effectCurveName("e1", "radius")).toBe("effect:e1:radius");
    expect(parseEffectCurveName("effect:e1:radius")).toEqual({ effectId: "e1", param: "radius" });
    expect(parseEffectCurveName("effect:inspector:color:hue")).toEqual({
      effectId: "inspector:color",
      param: "hue"
    });
    expect(parseEffectCurveName("effect:e1")).toBeNull();
    expect(parseEffectCurveName("effect:e1:")).toBeNull();
    expect(parseEffectCurveName("volumeDb")).toBeNull();
  });

  it("go with the effect, and no other curve does", () => {
    const paramCurves = [
      curve("effect:a:radius", [0, 1]),
      curve("effect:b:radius", [0, 2]),
      curve("volumeDb", [0, -3]),
      curve("future:thing", [0, 4])
    ];
    const kept = paramCurvesForEffects(paramCurves, [
      { id: "b", type: "blur", enabled: true }
    ] as TimelineClip["effects"]);
    expect(kept?.map((c) => c.property)).toEqual(["effect:b:radius", "volumeDb", "future:thing"]);
    expect(paramCurvesForEffects([curve("effect:a:radius", [0, 1])], [])).toBeUndefined();
    expect(paramCurvesForEffects(undefined, [])).toBeUndefined();
  });
});

describe("the set_effects op", () => {
  it("drops the curves of an effect it removes", async () => {
    const state: TimelineOpState = {
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [makeTrack({ id: "v", type: "video", name: "Video", index: 0 })],
      clips: [
        clip({
          name: "Shot",
          effects: [{ id: "a", type: "blur", enabled: true, radius: 4 }] as TimelineClip["effects"],
          paramCurves: [curve("effect:a:radius", [0, 1], [1, 9]), curve("volumeDb", [0, -3])]
        })
      ],
      markers: [],
      playheadMs: 0,
      selectedClipIds: []
    };
    const context: TimelineOpContext = { newId: (kind) => `${kind}_1` };
    const outcome = await applyTimelineOp(state, { op: "set_effects", target: "Shot", effects: [] }, context);
    expect(outcome.state.clips[0].effects).toBeUndefined();
    expect(outcome.state.clips[0].paramCurves?.map((c) => c.property)).toEqual(["volumeDb"]);
  });
});
