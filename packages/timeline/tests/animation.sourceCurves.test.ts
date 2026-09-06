/**
 * Source-anchored custom curves: the gate, the sampler, and what a trim or a
 * split does to them.
 *
 * The round-trip tests all ask one question — is the motion at a given TIMELINE
 * instant the same before and after the edit — because that is the whole point
 * of anchoring a curve to the media: an edit that changes which stretch of the
 * media a clip shows must not move the motion inside the stretch it kept.
 */
import { describe, expect, it } from "vitest";

import { compileClipAnimations } from "../src/animation/compile.js";
import { normalizeCustomCurves } from "../src/animation/custom.js";
import { sampleAnimations } from "../src/animation/sample.js";
import { splitClip } from "../src/splitClip.js";
import { clipSourceMsAt } from "../src/timeRemap.js";
import { trimClip } from "../src/trimClip.js";
import type { ClipAnimation } from "../src/animation/types.js";
import type { TimelineClip } from "../src/types.js";

const CANVAS = { width: 1920, height: 1080 };

/** Keyframes in source ms, linear: the shape a bake writes. */
const SOURCE_KEYFRAMES = [
  { sourceMs: 2000, value: 0 },
  { sourceMs: 3000, value: 100 },
  { sourceMs: 5000, value: -50 },
  { sourceMs: 6000, value: 0 }
];

function sourceAnimation(
  keyframes: ReadonlyArray<{ sourceMs: number; value: number; easing?: string }>
): ClipAnimation {
  return {
    id: "anim-source",
    role: "emphasis",
    preset: "custom",
    durationMs: 4000,
    delayMs: 0,
    custom: {
      timeBase: "source",
      bakedFrom: { kind: "audio", assetId: "asset-1", settings: { gain: 2 } },
      curves: [
        {
          property: "offsetY",
          keyframes: keyframes.map((kf) => ({ t: 0, ...kf }))
        }
      ]
    }
  };
}

function makeClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: "clip-1",
    trackId: "track-1",
    name: "shot",
    startMs: 1000,
    durationMs: 4000,
    inPointMs: 2000,
    outPointMs: 6000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    animations: [sourceAnimation(SOURCE_KEYFRAMES)],
    ...overrides
  };
}

/** The clip's animated `offsetY` at a timeline instant, the way a host reads it. */
function motionAt(clip: TimelineClip, timelineMs: number): number {
  const compiled = compileClipAnimations(
    clip.animations,
    clip.durationMs,
    CANVAS
  );
  const sample = sampleAnimations(
    compiled,
    timelineMs - clip.startMs,
    undefined,
    clipSourceMsAt(clip, timelineMs)
  );
  return sample.offsetY;
}

/** Every 10ms of a timeline span, so a re-slice cannot hide between samples. */
function expectSameMotion(
  before: TimelineClip,
  after: TimelineClip,
  fromMs: number,
  toMs: number
): void {
  for (let timelineMs = fromMs; timelineMs <= toMs; timelineMs += 10) {
    expect(motionAt(after, timelineMs)).toBeCloseTo(
      motionAt(before, timelineMs),
      6
    );
  }
}

const curveOf = (clip: TimelineClip): ReadonlyArray<{ sourceMs?: number; value: number }> =>
  clip.animations?.[0].custom?.curves[0].keyframes ?? [];

describe("normalizeCustomCurves — source time base", () => {
  it("accepts a source curve and derives `t` from `sourceMs`", () => {
    const result = normalizeCustomCurves(
      [{ property: "offsetY", keyframes: SOURCE_KEYFRAMES }],
      "source"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timeBase).toBe("source");
    expect(result.curves[0].keyframes.map((kf) => kf.sourceMs)).toEqual([
      2000, 3000, 5000, 6000
    ]);
    // t is the keyframe's normalized position over the curve's own span.
    expect(result.curves[0].keyframes.map((kf) => kf.t)).toEqual([
      0, 0.25, 0.75, 1
    ]);
  });

  it("rejects a keyframe with no `sourceMs`", () => {
    const result = normalizeCustomCurves(
      [{ property: "offsetY", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }],
      "source"
    );
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/sourceMs/);
  });

  it("rejects a negative `sourceMs`", () => {
    const result = normalizeCustomCurves(
      [
        {
          property: "offsetY",
          keyframes: [
            { sourceMs: -1, value: 0 },
            { sourceMs: 10, value: 1 }
          ]
        }
      ],
      "source"
    );
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/non-negative/);
  });

  it("rejects keyframes that go back in the source instead of sorting them", () => {
    const result = normalizeCustomCurves(
      [
        {
          property: "offsetY",
          keyframes: [
            { sourceMs: 900, value: 0 },
            { sourceMs: 100, value: 1 }
          ]
        }
      ],
      "source"
    );
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/ascend/);
  });

  it("rejects a time base this build does not sample", () => {
    const result = normalizeCustomCurves(
      [{ property: "offsetY", keyframes: SOURCE_KEYFRAMES }],
      "beat"
    );
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/timeBase/);
  });

  it("still accepts a clip-based curve with no `sourceMs`", () => {
    const result = normalizeCustomCurves([
      { property: "offsetY", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.timeBase).toBe("clip");
  });
});

describe("sampleAnimations — source time base", () => {
  it("evaluates the curve at the clip's source time", () => {
    const clip = makeClip();
    expect(motionAt(clip, 1000)).toBeCloseTo(0, 6); // source 2000
    expect(motionAt(clip, 2000)).toBeCloseTo(100, 6); // source 3000
    expect(motionAt(clip, 2500)).toBeCloseTo(62.5, 6); // source 3500
  });

  it("moves with the footage when the clip is sped up", () => {
    const clip = makeClip({ speedMultiplier: 2 });
    // 500ms of timeline consumes 1000ms of source, so source 3000.
    expect(motionAt(clip, 1500)).toBeCloseTo(100, 6);
  });

  it("follows a time remap rather than the rate", () => {
    const clip = makeClip({
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 6000 },
          { t: 1, sourceMs: 2000 }
        ]
      }
    });
    // The remap runs the source backwards: mid-clip is source 4000.
    expect(motionAt(clip, 3000)).toBeCloseTo(25, 6);
  });

  it("holds the end values outside the curve's source range", () => {
    const clip = makeClip({ inPointMs: 0, outPointMs: 4000, durationMs: 4000 });
    expect(motionAt(clip, 1000)).toBeCloseTo(0, 6); // source 0, before the curve
    expect(motionAt(clip, 1500)).toBeCloseTo(0, 6); // source 500, still before
  });

  it("contributes identity when the caller resolves no source time", () => {
    const clip = makeClip();
    const compiled = compileClipAnimations(
      clip.animations,
      clip.durationMs,
      CANVAS
    );
    expect(compiled[0].timeBase).toBe("source");
    expect(sampleAnimations(compiled, 1000).offsetY).toBe(0);
  });
});

describe("trimClip — source curves", () => {
  it("re-slices on a head trim and keeps the retained motion", () => {
    const clip = makeClip();
    const trimmed = trimClip(clip, "start", -1000);
    expect(trimmed.inPointMs).toBe(3000);
    // The 2000ms keyframe is outside the retained window; the boundary at
    // 3000ms was already a keyframe, so nothing is invented.
    expect(curveOf(trimmed).map((kf) => kf.sourceMs)).toEqual([3000, 5000, 6000]);
    expectSameMotion(clip, trimmed, 2000, 5000);
  });

  it("re-slices on a tail trim and keeps the retained motion", () => {
    const clip = makeClip();
    const trimmed = trimClip(clip, "end", -1500);
    expect(trimmed.outPointMs).toBe(4500);
    // 4500 falls inside the 3000→5000 segment: the boundary keyframe carries
    // the value the curve had there.
    expect(curveOf(trimmed).map((kf) => kf.sourceMs)).toEqual([2000, 3000, 4500]);
    expect(curveOf(trimmed)[2].value).toBeCloseTo(-12.5, 6);
    expectSameMotion(clip, trimmed, 1000, 3500);
  });

  it("leaves a clip-based curve to stretch with the clip", () => {
    const animation = sourceAnimation(SOURCE_KEYFRAMES);
    const clipBased: ClipAnimation = {
      ...animation,
      custom: {
        curves: [
          { property: "offsetY", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 100 }] }
        ]
      }
    };
    const clip = makeClip({ animations: [clipBased] });
    const trimmed = trimClip(clip, "end", -1000);
    expect(trimmed.animations?.[0]).toEqual(clipBased);
  });
});

describe("splitClip — source curves", () => {
  it("gives each half the part of the curve it shows", () => {
    const clip = makeClip();
    const [left, right] = splitClip(clip, 3000);

    expect(left.inPointMs).toBe(2000);
    expect(left.outPointMs).toBe(4000);
    expect(right.inPointMs).toBe(4000);
    expect(right.outPointMs).toBe(6000);

    expect(curveOf(left).map((kf) => kf.sourceMs)).toEqual([2000, 3000, 4000]);
    expect(curveOf(right).map((kf) => kf.sourceMs)).toEqual([4000, 5000, 6000]);
    // The cut lands inside the 3000→5000 segment, so both halves carry the
    // same interpolated value at it.
    expect(curveOf(left)[2].value).toBeCloseTo(25, 6);
    expect(curveOf(right)[0].value).toBeCloseTo(25, 6);

    expect(right.animations?.[0].id).not.toBe(left.animations?.[0].id);
    expectSameMotion(clip, left, 1000, 3000);
    expectSameMotion(clip, right, 3000, 5000);
  });

  it("round-trips through a merge of the two halves", () => {
    const clip = makeClip();
    const [left, right] = splitClip(clip, 2400);
    const merged = mergeHalves(left, right);

    expect(merged.durationMs).toBe(clip.durationMs);
    expect(merged.outPointMs).toBe(clip.outPointMs);
    expectSameMotion(clip, merged, 1000, 5000);
  });
});

/**
 * The inverse of the split, the way `mergeClipsAtTime` (web
 * `TimelineStore.ts`) rebuilds a clip from two halves — plus the curve join
 * a source-anchored animation needs: the halves' keyframes back to back, with
 * the duplicated keyframe at the cut dropped.
 */
function mergeHalves(left: TimelineClip, right: TimelineClip): TimelineClip {
  const leftKeyframes = left.animations?.[0].custom?.curves[0].keyframes ?? [];
  const rightKeyframes = right.animations?.[0].custom?.curves[0].keyframes ?? [];
  const joined = [
    ...leftKeyframes,
    ...rightKeyframes.filter(
      (kf) => kf.sourceMs !== leftKeyframes[leftKeyframes.length - 1]?.sourceMs
    )
  ];
  const animation = left.animations?.[0] as ClipAnimation;
  return {
    ...left,
    durationMs: left.durationMs + right.durationMs,
    outPointMs: right.outPointMs,
    animations: [
      {
        ...animation,
        durationMs: left.durationMs + right.durationMs,
        custom: {
          ...animation.custom,
          curves: [{ property: "offsetY", keyframes: joined }]
        }
      }
    ]
  };
}
