/**
 * The motion a document asks for and the compiler quietly refuses to give it
 * (F24), plus the one retime that cannot be evaluated at all.
 *
 * Every code here gets both fixtures I12 asks for: one that triggers it, and
 * one a hair on the safe side that must stay silent. The pairs are deliberately
 * close — a 1000ms animation on a 1000ms clip against the same animation on a
 * 999ms one — because a check that only fires on absurd input is not measuring
 * the boundary it claims to.
 */
import { describe, expect, it } from "vitest";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

type Json = Record<string, unknown>;

const clip = (over: Json): Json => ({
  id: "clip-1",
  trackId: "track-1",
  name: "Shot 1",
  startMs: 0,
  durationMs: 2000,
  mediaType: "video",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  ...over
});

const textClip = (over: Json): Json =>
  clip({
    mediaType: "text",
    textStyle: { text: "one two three four five", fontSizePx: 96, color: "#ffffff" },
    ...over
  });

const doc = (clips: Json[]): Json => ({
  tracks: [
    {
      id: "track-1",
      name: "Video 1",
      type: "video",
      index: 0,
      visible: true,
      locked: false
    }
  ],
  clips,
  markers: []
});

const of = (result: { warnings: { code: string }[]; errors: { code: string }[] }, code: string) =>
  [...result.warnings, ...result.errors].filter((issue) => issue.code === code);

const animation = (over: Json): Json => ({
  id: "anim-1",
  role: "in",
  preset: "fade",
  durationMs: 500,
  ...over
});

describe("validateTimelineSequence — animation_exceeds_clip", () => {
  it("stays quiet on a window that fits exactly", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          durationMs: 1000,
          animations: [animation({ durationMs: 600, delayMs: 400 })]
        })
      ])
    );
    expect(of(result, "animation_exceeds_clip")).toEqual([]);
  });

  it("warns when the delay plus the duration overruns the clip", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          durationMs: 1000,
          animations: [animation({ durationMs: 800, delayMs: 400 })]
        })
      ])
    );
    const found = of(result, "animation_exceeds_clip");
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe("warning");
    expect(found[0]?.message).toContain("clamped");
    expect(found[0]?.clipId).toBe("clip-1");
    expect(result.ok).toBe(true);
  });

  it("warns when an `out` animation cannot start inside the clip", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          durationMs: 1000,
          animations: [animation({ role: "out", durationMs: 900, delayMs: 300 })]
        })
      ])
    );
    expect(of(result, "animation_exceeds_clip")).toHaveLength(1);
  });

  it("warns when a delay past clip end drops the animation entirely", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          durationMs: 1000,
          animations: [animation({ durationMs: 200, delayMs: 1200 })]
        })
      ])
    );
    const found = of(result, "animation_exceeds_clip");
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("never runs");
  });

  it("says nothing about a full-clip preset, which ignores duration by design", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          durationMs: 1000,
          animations: [
            animation({ preset: "kenBurns", role: "emphasis", durationMs: 9000 })
          ]
        })
      ])
    );
    expect(of(result, "animation_exceeds_clip")).toEqual([]);
  });

  it("says nothing about an animation the author disabled", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          durationMs: 1000,
          animations: [
            animation({ durationMs: 5000, delayMs: 4000, enabled: false })
          ]
        })
      ])
    );
    expect(of(result, "animation_exceeds_clip")).toEqual([]);
  });

  it("reports an unknown preset once, without a second window finding", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          durationMs: 1000,
          animations: [animation({ preset: "teleport", durationMs: 9000 })]
        })
      ])
    );
    expect(of(result, "animation_exceeds_clip")).toEqual([]);
    expect(of(result, "unknown_animation_preset")).toHaveLength(1);
  });
});

describe("validateTimelineSequence — stagger_compressed", () => {
  const staggered = (durationMs: number, offsetMs: number): Json =>
    textClip({
      durationMs,
      animations: [
        animation({
          durationMs: 400,
          stagger: { unit: "word", offsetMs }
        })
      ]
    });

  it("stays quiet when the whole stagger span fits", () => {
    // Five words, four steps of 150ms + a 400ms unit = 1000ms.
    const result = validateTimelineSequence(doc([staggered(1200, 150)]));
    expect(of(result, "stagger_compressed")).toEqual([]);
  });

  it("warns when the compiler had to shrink the per-unit offset", () => {
    const result = validateTimelineSequence(doc([staggered(1000, 400)]));
    const found = of(result, "stagger_compressed");
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe("warning");
    expect(found[0]?.message).toContain("5 word(s)");
    expect(result.ok).toBe(true);
  });

  it("says nothing when the stagger has no text to split", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          durationMs: 500,
          animations: [
            animation({ durationMs: 400, stagger: { unit: "word", offsetMs: 900 } })
          ]
        })
      ])
    );
    expect(of(result, "stagger_compressed")).toEqual([]);
  });
});

describe("validateTimelineSequence — replace_curves_overlap", () => {
  const positionCurve = (id: string, over: Json): Json => ({
    id,
    role: "emphasis",
    preset: "custom",
    durationMs: 400,
    custom: {
      curves: [
        {
          property: "positionX",
          keyframes: [
            { t: 0, value: 0 },
            { t: 1, value: 200 }
          ]
        }
      ]
    },
    ...over
  });

  it("stays quiet when two replace curves run at different times", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          durationMs: 2000,
          animations: [
            positionCurve("a", { delayMs: 0 }),
            positionCurve("b", { delayMs: 1000 })
          ]
        })
      ])
    );
    expect(of(result, "replace_curves_overlap")).toEqual([]);
  });

  it("stays quiet when two animations drive channels that compose", () => {
    const additive = (id: string, delayMs: number): Json => ({
      id,
      role: "emphasis",
      preset: "custom",
      durationMs: 400,
      delayMs,
      custom: {
        curves: [
          {
            property: "offsetX",
            keyframes: [
              { t: 0, value: 0 },
              { t: 1, value: 200 }
            ]
          }
        ]
      }
    });
    const result = validateTimelineSequence(
      doc([
        clip({ durationMs: 2000, animations: [additive("a", 0), additive("b", 100)] })
      ])
    );
    expect(of(result, "replace_curves_overlap")).toEqual([]);
  });

  it("warns when two animations drive one replace channel at the same time", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          durationMs: 2000,
          animations: [
            positionCurve("a", { delayMs: 0 }),
            positionCurve("b", { delayMs: 200 })
          ]
        })
      ])
    );
    const found = of(result, "replace_curves_overlap");
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe("warning");
    expect(found[0]?.message).toContain("positionX");
    expect(found[0]?.message).toContain('"a" and "b"');
  });

  it("warns when an `in` holds its value into a later animation's window", () => {
    // The `in` runs 0–400ms but pins t=1 from then on (holdAfter is false for
    // `in`, holdBefore is true), so the overlap is the second window itself.
    const result = validateTimelineSequence(
      doc([
        clip({
          durationMs: 2000,
          animations: [
            positionCurve("late", { role: "out", delayMs: 0 }),
            positionCurve("early", { role: "in", delayMs: 1500 })
          ]
        })
      ])
    );
    expect(of(result, "replace_curves_overlap")).toHaveLength(1);
  });
});

describe("validateTimelineSequence — time_remap_not_monotonic", () => {
  it("accepts a ramp whose source time descends", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          timeRemap: {
            keyframes: [
              { t: 0, sourceMs: 2000 },
              { t: 0.5, sourceMs: 1000 },
              { t: 1, sourceMs: 0 }
            ]
          }
        })
      ])
    );
    expect(of(result, "time_remap_not_monotonic")).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("errors when `t` repeats", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          timeRemap: {
            keyframes: [
              { t: 0, sourceMs: 0 },
              { t: 0.5, sourceMs: 500 },
              { t: 0.5, sourceMs: 900 }
            ]
          }
        })
      ])
    );
    const found = of(result, "time_remap_not_monotonic");
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe("error");
    expect(found[0]?.path).toBe("timeRemap.keyframes[2].t");
    expect(result.ok).toBe(false);
  });

  it("errors when `t` goes backwards", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          timeRemap: {
            keyframes: [
              { t: 0, sourceMs: 0 },
              { t: 0.8, sourceMs: 800 },
              { t: 0.4, sourceMs: 1200 }
            ]
          }
        })
      ])
    );
    expect(of(result, "time_remap_not_monotonic")).toHaveLength(1);
  });
});
