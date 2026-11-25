/**
 * Regression tests for Task A24t — TypeScript parity with native set_clip_params
 * fixes C1-C18 and N1-N2.
 */

import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/defaults.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import { normalizePattern } from "../src/midi/stepPattern.js";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOp,
  type TimelineOpContext,
  type TimelineOpState
} from "../src/ops/index.js";
import type { TimelineClip, TimelineTrack } from "../src/types.js";

function context(
  assetDurations: Record<string, number> = {},
  overrides: Partial<TimelineOpContext> = {}
): TimelineOpContext {
  let n = 0;
  return {
    newId: (kind) => `${kind}_${++n}`,
    resolveAsset:
      Object.keys(assetDurations).length > 0
        ? async (id) => {
            const durationMs = assetDurations[id];
            if (durationMs === undefined) return undefined;
            return {
              id,
              name: id,
              contentType: "video/mp4",
              durationMs
            };
          }
        : undefined,
    ...overrides
  };
}

function makeState(
  clips: TimelineClip[],
  tracks: TimelineTrack[] = [
    makeTrack({ id: "track_v", type: "video", name: "Video", index: 0 }),
    makeTrack({ id: "track_a", type: "audio", name: "Audio", index: 1 }),
    makeTrack({ id: "track_m", type: "midi", name: "MIDI", index: 2 }),
    makeTrack({ id: "track_o", type: "overlay", name: "Overlay", index: 3 })
  ]
): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks,
    clips,
    markers: [],
    tempo: { ...DEFAULT_TEMPO },
    playheadMs: 0,
    selectedClipIds: []
  };
}

function video(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    id: "clip_v",
    trackId: "track_v",
    name: "Shot",
    startMs: 0,
    durationMs: 1000,
    inPointMs: 0,
    outPointMs: 1000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset_v",
    ...overrides
  });
}

function audio(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    id: "clip_a",
    trackId: "track_a",
    name: "Sound",
    startMs: 0,
    durationMs: 1000,
    inPointMs: 0,
    outPointMs: 1000,
    mediaType: "audio",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset_a",
    ...overrides
  });
}

function patternClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    id: "clip_p",
    trackId: "track_m",
    name: "Drums",
    startMs: 0,
    durationMs: 2000,
    inPointMs: 0,
    outPointMs: 2000,
    mediaType: "midi",
    sourceType: "imported",
    status: "generated",
    pattern: normalizePattern({
      lengthSteps: 4,
      stepRate: "1/4",
      rows: [
        {
          id: "r1",
          name: "Kick",
          assignment: { type: "note", pitch: 36 },
          lengthSteps: 4,
          loopEnd: 4,
          stepRate: "1/4",
          steps: [{ on: true }, {}, {}, {}]
        }
      ]
    }),
    ...overrides
  });
}

function textClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    id: "clip_t",
    trackId: "track_o",
    name: "Title",
    startMs: 0,
    durationMs: 2000,
    mediaType: "text",
    sourceType: "imported",
    status: "generated",
    textStyle: {
      text: "Hello",
      fontSizePx: 64,
      color: "#FFFFFF",
      fontFamily: "Inter",
      stroke: { color: "#000000", widthPx: 2 },
      shadow: { color: "#000000", blurPx: 4, offsetX: 1, offsetY: 2 },
      background: { color: "#111111", paddingPx: 8, radiusPx: 4 }
    },
    ...overrides
  });
}

function shapeClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    id: "clip_s",
    trackId: "track_o",
    name: "Box",
    startMs: 0,
    durationMs: 2000,
    mediaType: "shape",
    sourceType: "imported",
    status: "generated",
    shapeStyle: { kind: "rect", fill: "#FFFFFF" },
    ...overrides
  });
}

function clipOf(s: TimelineOpState, id: string): TimelineClip {
  const c = s.clips.find((entry) => entry.id === id);
  if (!c) throw new Error(`missing clip ${id}`);
  return c;
}

async function runTool(
  s: TimelineOpState,
  args: Record<string, unknown>,
  assetDurations: Record<string, number> = {},
  ctxOverrides: Partial<TimelineOpContext> = {}
) {
  let op: TimelineOp;
  try {
    op = timelineOpFromToolArgs("set_clip_params", args);
  } catch (error) {
    return {
      state: s,
      result: { ok: false },
      changed: [] as string[],
      error: error instanceof Error ? error.message : String(error)
    };
  }
  return applyTimelineOp(s, op, context(assetDurations, ctxOverrides));
}

describe("A24t: C1-C9, N1-N2 source-window, slip, group trim, and animation/remap parity", () => {
  it("C1: slips past the clip's previous outPointMs", async () => {
    const first = await runTool(
      makeState([video({ inPointMs: 0, outPointMs: 1000, durationMs: 1000 })]),
      { target: "clip_v", inPointMs: 5000 },
      { asset_v: 60000 }
    );
    expect(first.error).toBeUndefined();
    expect(clipOf(first.state, "clip_v")).toMatchObject({
      inPointMs: 5000,
      outPointMs: 6000,
      durationMs: 1000
    });

    const second = await runTool(
      first.state,
      { target: "clip_v", inPointMs: 7000 },
      { asset_v: 60000 }
    );
    expect(second.error).toBeUndefined();
    expect(clipOf(second.state, "clip_v")).toMatchObject({
      inPointMs: 7000,
      outPointMs: 8000,
      durationMs: 1000
    });
  });

  it("C2: validates combined durationMs + inPointMs/outPointMs against the new window, not the old one", async () => {
    const out = await runTool(
      makeState([video({ inPointMs: 1500, outPointMs: 2000, durationMs: 500 })]),
      { target: "clip_v", durationMs: 1500, inPointMs: 0, outPointMs: 1500 },
      { asset_v: 2000 }
    );
    expect(out.error).toBeUndefined();
    expect(clipOf(out.state, "clip_v")).toMatchObject({
      durationMs: 1500,
      inPointMs: 0,
      outPointMs: 1500
    });
  });

  it("C3: derives outPointMs from new inPointMs and durationMs on shrink and grow", async () => {
    const shrink = await runTool(
      makeState([video({ durationMs: 1000, inPointMs: 0, outPointMs: 1000 })]),
      { target: "clip_v", durationMs: 500, inPointMs: 500 },
      { asset_v: 5000 }
    );
    expect(shrink.error).toBeUndefined();
    expect(clipOf(shrink.state, "clip_v")).toMatchObject({
      durationMs: 500,
      inPointMs: 500,
      outPointMs: 1000
    });

    const grow = await runTool(
      makeState([video({ durationMs: 1000, inPointMs: 0, outPointMs: 1000 })]),
      { target: "clip_v", durationMs: 2000, inPointMs: 500 },
      { asset_v: 5000 }
    );
    expect(grow.error).toBeUndefined();
    expect(clipOf(grow.state, "clip_v")).toMatchObject({
      durationMs: 2000,
      inPointMs: 500,
      outPointMs: 2500
    });
  });

  it("C4: rejects an inPointMs-only slip whose computed outPointMs exceeds sourceLimitMs", async () => {
    const out = await runTool(
      makeState([
        video({ durationMs: 2000, inPointMs: 0, outPointMs: undefined })
      ]),
      { target: "clip_v", inPointMs: 2500 },
      { asset_v: 3000 }
    );
    expect(out.error).toMatch(/source/i);
  });

  it("C5: tolerates IEEE-754 roundoff near zero when slipping linked non-power-of-two speed clips", async () => {
    const out = await runTool(
      makeState([
        video({
          inPointMs: 116,
          outPointMs: 1866,
          durationMs: 1000,
          speedMultiplier: 1.75,
          linkId: "pair"
        }),
        audio({
          inPointMs: 116,
          outPointMs: 1866,
          durationMs: 1000,
          speedMultiplier: 1.75,
          linkId: "pair"
        })
      ]),
      { target: "clip_v", inPointMs: 0 },
      { asset_v: 5000, asset_a: 5000 }
    );
    expect(out.error).toBeUndefined();
    expect(clipOf(out.state, "clip_v").inPointMs).toBe(0);
    expect(clipOf(out.state, "clip_a").inPointMs).toBe(0);

    // Genuinely negative linked slip is still rejected
    const tooFar = await runTool(
      makeState([
        video({ inPointMs: 200, outPointMs: 1200, durationMs: 1000, linkId: "pair" }),
        audio({ inPointMs: 50, outPointMs: 1050, durationMs: 1000, linkId: "pair" })
      ]),
      { target: "clip_v", inPointMs: 0 },
      { asset_v: 5000, asset_a: 5000 }
    );
    expect(tooFar.error).toMatch(/before its in-point/i);
  });

  it("C6: uses accumulated pattern phase for linked and direct backward slips, rounds once, and applies sourceRate to pattern outPointMs", async () => {
    const s = makeState([
      audio({ inPointMs: 0, outPointMs: 2000, durationMs: 2000, linkId: "sync" }),
      patternClip({ inPointMs: 0, outPointMs: 2000, durationMs: 2000, linkId: "sync" })
    ]);
    const forward = await runTool(
      s,
      { target: "clip_a", inPointMs: 500 },
      { asset_a: 10000 }
    );
    expect(forward.error).toBeUndefined();
    expect(clipOf(forward.state, "clip_p")).toMatchObject({
      inPointMs: 0,
      patternPhaseTicks: 960
    });

    // Linked backward slip
    const back = await runTool(
      forward.state,
      { target: "clip_a", inPointMs: 250 },
      { asset_a: 10000 }
    );
    expect(back.error).toBeUndefined();
    expect(clipOf(back.state, "clip_p")).toMatchObject({
      inPointMs: 0,
      patternPhaseTicks: 480
    });

    // Direct backward slip on pattern clip, then back to 0 removes patternPhaseTicks
    const directBack = await runTool(forward.state, {
      target: "clip_p",
      inPointMs: 250
    });
    expect(directBack.error).toBeUndefined();
    expect(clipOf(directBack.state, "clip_p")).toMatchObject({
      inPointMs: 0,
      patternPhaseTicks: 480
    });
    const backToZero = await runTool(directBack.state, {
      target: "clip_p",
      inPointMs: 0
    });
    expect(backToZero.error).toBeUndefined();
    expect(clipOf(backToZero.state, "clip_p").patternPhaseTicks).toBeUndefined();

    // Rate included in pattern outPointMs and single rounding
    const rated = await runTool(
      makeState([
        patternClip({
          inPointMs: 0.25,
          durationMs: 2000,
          speedMultiplier: 2
        })
      ]),
      { target: "clip_p", inPointMs: 0.5 }
    );
    expect(rated.error).toBeUndefined();
    expect(clipOf(rated.state, "clip_p")).toMatchObject({
      inPointMs: 0,
      outPointMs: 4000,
      patternPhaseTicks: 1
    });
  });

  it("C7: group durationMs trim propagates child trims to external linked media and enforces source limits", async () => {
    const group = makeClip({
      id: "grp",
      trackId: "track_v",
      name: "Group",
      startMs: 0,
      durationMs: 2000,
      mediaType: "group",
      sourceType: "imported",
      status: "generated"
    });
    const childV = video({
      id: "child_v",
      parentId: "grp",
      durationMs: 2000,
      outPointMs: 2000,
      linkId: "av"
    });
    const extA = audio({
      id: "ext_a",
      durationMs: 2000,
      outPointMs: 2000,
      linkId: "av"
    });

    const shrunk = await runTool(
      makeState([group, childV, extA]),
      { target: "grp", durationMs: 1000 },
      { asset_v: 5000, asset_a: 5000 }
    );
    expect(shrunk.error).toBeUndefined();
    expect(clipOf(shrunk.state, "grp").durationMs).toBe(1000);
    expect(clipOf(shrunk.state, "child_v").durationMs).toBe(1000);
    expect(clipOf(shrunk.state, "ext_a").durationMs).toBe(1000);

    // Source limit check on group linked media when growing
    const linkedGroup = makeClip({
      id: "grp2",
      trackId: "track_v",
      name: "Group2",
      startMs: 0,
      durationMs: 1000,
      mediaType: "group",
      sourceType: "imported",
      status: "generated",
      linkId: "gl"
    });
    const linkedA = audio({
      id: "linked_a",
      durationMs: 1000,
      inPointMs: 0,
      outPointMs: 1000,
      linkId: "gl"
    });
    const over = await runTool(
      makeState([linkedGroup, linkedA]),
      { target: "grp2", durationMs: 2000 },
      { asset_a: 1500 }
    );
    expect(over.error).toMatch(/source/i);
  });

  it("C8: combined durationMs + inPointMs/outPointMs shifts linked partners' source windows at each member's rate", async () => {
    const out = await runTool(
      makeState([
        video({
          id: "clip_v",
          durationMs: 1000,
          inPointMs: 0,
          outPointMs: 1000,
          linkId: "pair"
        }),
        audio({
          id: "clip_a",
          durationMs: 1000,
          inPointMs: 0,
          outPointMs: 2000,
          speedMultiplier: 2,
          linkId: "pair"
        })
      ]),
      { target: "clip_v", durationMs: 750, inPointMs: 250, outPointMs: 1000 },
      { asset_v: 5000, asset_a: 5000 }
    );
    expect(out.error).toBeUndefined();
    expect(clipOf(out.state, "clip_v")).toMatchObject({
      durationMs: 750,
      inPointMs: 250,
      outPointMs: 1000
    });
    expect(clipOf(out.state, "clip_a")).toMatchObject({
      durationMs: 750,
      inPointMs: 500,
      outPointMs: 2000
    });
  });

  it("C9: retimes caption words whenever inPointMs changes outside slip-only edits", async () => {
    const captioned = video({
      durationMs: 2000,
      inPointMs: 0,
      outPointMs: 2000,
      caption: {
        words: [
          { word: "hello", startMs: 500, endMs: 900 },
          { word: "world", startMs: 1000, endMs: 1400 }
        ]
      }
    });
    const out = await runTool(
      makeState([captioned]),
      { target: "clip_v", inPointMs: 500, outPointMs: 1500, durationMs: 1000 },
      { asset_v: 5000 }
    );
    expect(out.error).toBeUndefined();
    expect(clipOf(out.state, "clip_v").caption?.words).toEqual([
      { word: "hello", startMs: 0, endMs: 400 },
      { word: "world", startMs: 500, endMs: 900 }
    ]);
  });

  it("N1: reslices source-anchored animations on source-window edits", async () => {
    const animated = video({
      durationMs: 1000,
      inPointMs: 0,
      outPointMs: 1000,
      animations: [
        {
          id: "anim_1",
          role: "emphasis",
          preset: "custom",
          durationMs: 1000,
          delayMs: 0,
          custom: {
            timeBase: "source",
            curves: [
              {
                property: "opacity",
                keyframes: [
                  { t: 0, value: 0, sourceMs: 0 },
                  { t: 0.5, value: 0.5, sourceMs: 1000 },
                  { t: 1, value: 1, sourceMs: 2000 }
                ]
              }
            ]
          }
        }
      ]
    });
    const slipped = await runTool(
      makeState([animated]),
      { target: "clip_v", inPointMs: 1000 },
      { asset_v: 5000 }
    );
    expect(slipped.error).toBeUndefined();
    const kfs =
      clipOf(slipped.state, "clip_v").animations?.[0]?.custom?.curves[0]
        ?.keyframes;
    expect(kfs).toEqual([
      { t: 0, value: 0.5, sourceMs: 1000 },
      { t: 1, value: 1, sourceMs: 2000 }
    ]);

    // Combined durationMs + explicit outPointMs reslices from original source curve
    const combined = await runTool(
      makeState([animated]),
      { target: "clip_v", durationMs: 500, outPointMs: 2000 },
      { asset_v: 5000 }
    );
    expect(combined.error).toBeUndefined();
    expect(
      clipOf(combined.state, "clip_v").animations?.[0]?.custom?.curves[0]
        ?.keyframes
    ).toEqual([
      { t: 0, value: 0, sourceMs: 0 },
      { t: 0.5, value: 0.5, sourceMs: 1000 },
      { t: 1, value: 1, sourceMs: 2000 }
    ]);
  });

  it("N2: rejects source-only edits on clips with a nonconstant timeRemap", async () => {
    const remapped = video({
      durationMs: 1000,
      inPointMs: 0,
      outPointMs: 1000,
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 1, sourceMs: 2000 }
        ]
      }
    });
    const slipRes = await runTool(
      makeState([remapped]),
      { target: "clip_v", inPointMs: 500 },
      { asset_v: 5000 }
    );
    expect(slipRes.error).toMatch(/time remap/i);

    const outRes = await runTool(
      makeState([remapped]),
      { target: "clip_v", outPointMs: 1500 },
      { asset_v: 5000 }
    );
    expect(outRes.error).toMatch(/time remap/i);

    // Constant hold remap remains editable
    const hold = video({
      durationMs: 1000,
      inPointMs: 0,
      outPointMs: 1000,
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 500 },
          { t: 1, sourceMs: 500 }
        ]
      }
    });
    const holdRes = await runTool(
      makeState([hold]),
      { target: "clip_v", inPointMs: 200 },
      { asset_v: 5000 }
    );
    expect(holdRes.error).toBeUndefined();
  });
});

describe("A24t: C10-C18 caption, text, visual, and shape validation parity", () => {
  it("C10: merges captionStyle fields instead of replacing caption.style wholesale", async () => {
    const captioned = video({
      caption: {
        words: [{ word: "hi", startMs: 0, endMs: 500 }],
        style: {
          fontFamily: "Inter",
          fontSizeFrac: 0.05,
          color: "yellow"
        }
      }
    });
    const out = await runTool(makeState([captioned]), {
      target: "clip_v",
      captionStyle: { color: "white" }
    });
    expect(out.error).toBeUndefined();
    expect(clipOf(out.state, "clip_v").caption?.style).toEqual({
      fontFamily: "Inter",
      fontSizeFrac: 0.05,
      color: "white"
    });
  });

  it("C11: rejects generic CSS font families in captionStyle.fontFamily", async () => {
    const captioned = video({
      caption: { words: [{ word: "hi", startMs: 0, endMs: 500 }] }
    });
    const out = await runTool(makeState([captioned]), {
      target: "clip_v",
      captionStyle: { fontFamily: "sans-serif" }
    });
    expect(out.error).toMatch(/sans-serif|typeface|font/i);
  });

  it("C12: removes optional textStyle fields and decorations on null while rejecting null required fields", async () => {
    const cleared = await runTool(makeState([textClip()]), {
      target: "clip_t",
      textStyle: {
        stroke: null,
        shadow: null,
        background: null,
        fontFamily: null
      }
    });
    expect(cleared.error).toBeUndefined();
    const style = clipOf(cleared.state, "clip_t").textStyle!;
    expect(style.stroke).toBeUndefined();
    expect(style.shadow).toBeUndefined();
    expect(style.background).toBeUndefined();
    expect(style.fontFamily).toBeUndefined();
    expect(style.text).toBe("Hello");
    expect(style.fontSizePx).toBe(64);
    expect(style.color).toBe("#FFFFFF");

    const badRequired = await runTool(makeState([textClip()]), {
      target: "clip_t",
      textStyle: { text: null }
    });
    expect(badRequired.error).toBeDefined();
  });

  it("C13: validates blendMode against supported modes and resets on null", async () => {
    const bad = await runTool(makeState([video()]), {
      target: "clip_v",
      blendMode: "invalid-mode"
    });
    expect(bad.error).toBeDefined();

    const cleared = await runTool(
      makeState([video({ blendMode: "multiply" })]),
      { target: "clip_v", blendMode: null }
    );
    expect(cleared.error).toBeUndefined();
    expect(clipOf(cleared.state, "clip_v").blendMode).toBeUndefined();
  });

  it("C14: rejects negative borderRadius", async () => {
    const bad = await runTool(makeState([video()]), {
      target: "clip_v",
      borderRadius: -25
    });
    expect(bad.error).toBeDefined();
  });

  it("C15: requires at least 2 gradient stops and offsets in [0, 1]", async () => {
    const emptyStops = await runTool(makeState([shapeClip()]), {
      target: "clip_s",
      shapeStyle: {
        kind: "rect",
        fillStyle: { type: "linear", angle: 45, stops: [] }
      }
    });
    expect(emptyStops.error).toBeDefined();

    const oneStop = await runTool(makeState([shapeClip()]), {
      target: "clip_s",
      shapeStyle: {
        kind: "rect",
        fillStyle: {
          type: "radial",
          stops: [{ offset: 0.5, color: "#fff" }]
        }
      }
    });
    expect(oneStop.error).toBeDefined();

    const outOfRange = await runTool(makeState([textClip()]), {
      target: "clip_t",
      textStyle: {
        fill: {
          type: "linear",
          angle: 0,
          stops: [
            { offset: -0.5, color: "#fff" },
            { offset: 1.5, color: "#000" }
          ]
        }
      }
    });
    expect(outOfRange.error).toBeDefined();
  });

  it("C16: rejects negative decoration dimensions while allowing signed shadow offsets", async () => {
    const negStroke = await runTool(makeState([textClip()]), {
      target: "clip_t",
      textStyle: { stroke: { color: "#000", widthPx: -2 } }
    });
    expect(negStroke.error).toBeDefined();

    const negBlur = await runTool(makeState([textClip()]), {
      target: "clip_t",
      textStyle: {
        shadow: { color: "#000", blurPx: -5, offsetX: 0, offsetY: 0 }
      }
    });
    expect(negBlur.error).toBeDefined();

    const negBg = await runTool(
      makeState([
        video({ caption: { words: [{ word: "hi", startMs: 0, endMs: 500 }] } })
      ]),
      {
        target: "clip_v",
        captionStyle: {
          background: { color: "#000", paddingPx: -8, radiusPx: -4 }
        }
      }
    );
    expect(negBg.error).toBeDefined();

    const signedOffset = await runTool(makeState([textClip()]), {
      target: "clip_t",
      textStyle: {
        shadow: { color: "#000", blurPx: 4, offsetX: -3, offsetY: -6 }
      }
    });
    expect(signedOffset.error).toBeUndefined();
  });

  it("C17: validates typography ranges and enums in fontSizePx, textStyle, and captionStyle", async () => {
    const negSize = await runTool(makeState([textClip()]), {
      target: "clip_t",
      fontSizePx: -12
    });
    expect(negSize.error).toBeDefined();

    const zeroLineHeight = await runTool(makeState([textClip()]), {
      target: "clip_t",
      textStyle: { lineHeight: 0 }
    });
    expect(zeroLineHeight.error).toBeDefined();

    const badFontStyle = await runTool(makeState([textClip()]), {
      target: "clip_t",
      textStyle: { fontStyle: "bogus" }
    });
    expect(badFontStyle.error).toBeDefined();

    const badMaxWidth = await runTool(makeState([textClip()]), {
      target: "clip_t",
      textStyle: { maxWidthFrac: 1.5 }
    });
    expect(badMaxWidth.error).toBeDefined();

    const badWeight = await runTool(makeState([textClip()]), {
      target: "clip_t",
      textStyle: { fontWeight: 0 }
    });
    expect(badWeight.error).toBeDefined();

    const badQuotedWeight = await runTool(makeState([textClip()]), {
      target: "clip_t",
      textStyle: { fontWeight: "-100" }
    });
    expect(badQuotedWeight.error).toBeDefined();

    const captioned = video({
      caption: { words: [{ word: "hi", startMs: 0, endMs: 500 }] }
    });
    const badCaptionFrac = await runTool(makeState([captioned]), {
      target: "clip_v",
      captionStyle: { fontSizeFrac: 0 }
    });
    expect(badCaptionFrac.error).toBeDefined();

    const badCaptionMargin = await runTool(makeState([captioned]), {
      target: "clip_v",
      captionStyle: { bottomMarginFrac: -0.1 }
    });
    expect(badCaptionMargin.error).toBeDefined();
  });

  it("C18: validates shapeStyle kind/lineCap/lineJoin allowlists, geometry ranges, and dash entries", async () => {
    const badKind = await runTool(makeState([shapeClip()]), {
      target: "clip_s",
      shapeStyle: { kind: "invalid" }
    });
    expect(badKind.error).toBeDefined();

    const badCap = await runTool(makeState([shapeClip()]), {
      target: "clip_s",
      shapeStyle: { kind: "line", lineCap: "pointy" }
    });
    expect(badCap.error).toBeDefined();

    const badJoin = await runTool(makeState([shapeClip()]), {
      target: "clip_s",
      shapeStyle: { kind: "rect", lineJoin: "sharp" }
    });
    expect(badJoin.error).toBeDefined();

    const badStroke = await runTool(makeState([shapeClip()]), {
      target: "clip_s",
      shapeStyle: { kind: "rect", strokeWidthPx: -4 }
    });
    expect(badStroke.error).toBeDefined();

    const badSides = await runTool(makeState([shapeClip()]), {
      target: "clip_s",
      shapeStyle: { kind: "polygon", sides: 2 }
    });
    expect(badSides.error).toBeDefined();

    const nonIntSides = await runTool(makeState([shapeClip()]), {
      target: "clip_s",
      shapeStyle: { kind: "polygon", sides: 3.5 }
    });
    expect(nonIntSides.error).toBeDefined();

    const badWidth = await runTool(makeState([shapeClip()]), {
      target: "clip_s",
      shapeStyle: { kind: "rect", width: -0.5 }
    });
    expect(badWidth.error).toBeDefined();

    const badTrim = await runTool(makeState([shapeClip()]), {
      target: "clip_s",
      shapeStyle: { kind: "path", trimStart: 2 }
    });
    expect(badTrim.error).toBeDefined();

    const badDash = await runTool(makeState([shapeClip()]), {
      target: "clip_s",
      shapeStyle: { kind: "rect", dash: [-5, 0] }
    });
    expect(badDash.error).toBeDefined();
  });
});

describe("A24t fix round 1: C7, C19, C20, N1-N3", () => {
  it("C7: rejects group durationMs trim when a member retains a source overrun", async () => {
    const group = makeClip({
      id: "grp",
      trackId: "track_v",
      name: "Group",
      startMs: 0,
      durationMs: 2000,
      mediaType: "group",
      sourceType: "imported",
      status: "generated"
    });
    const childV = video({
      id: "child_v",
      parentId: "grp",
      inPointMs: 3000,
      outPointMs: 5000,
      durationMs: 2000
    });
    const out = await runTool(
      makeState([group, childV]),
      { target: "grp", durationMs: 1000 },
      { asset_v: 2000 }
    );
    expect(out.error).toMatch(/source/i);
  });

  it("N3: rejects duration-only trim that retains an existing source overrun", async () => {
    const out = await runTool(
      makeState([
        video({ inPointMs: 3000, outPointMs: 5000, durationMs: 2000 })
      ]),
      { target: "clip_v", durationMs: 1000 },
      { asset_v: 2000 }
    );
    expect(out.error).toMatch(/source/i);
  });

  it("C19: rejects non-finite or invalid transform values on direct applyTimelineOp", async () => {
    const infPos = await applyTimelineOp(
      makeState([video()]),
      {
        op: "set_clip_params",
        target: "clip_v",
        patch: { transform: { position: { x: Infinity } } }
      },
      context()
    );
    expect(infPos.error).toBeDefined();

    const nanRot = await applyTimelineOp(
      makeState([video()]),
      {
        op: "set_clip_params",
        target: "clip_v",
        patch: { transform: { rotation: Number.NaN } }
      },
      context()
    );
    expect(nanRot.error).toBeDefined();

    const zeroPersp = await applyTimelineOp(
      makeState([video()]),
      {
        op: "set_clip_params",
        target: "clip_v",
        patch: { transform: { perspective: 0 } }
      },
      context()
    );
    expect(zeroPersp.error).toBeDefined();
  });

  it("C20: accepts and validates maxSourceDurationMs on set_clip_params", async () => {
    const ok = await runTool(
      makeState([
        video({ inPointMs: 0, outPointMs: 1000, durationMs: 1000 })
      ]),
      { target: "clip_v", durationMs: 1500, maxSourceDurationMs: 2000 }
    );
    expect(ok.error).toBeUndefined();
    expect(clipOf(ok.state, "clip_v")).toMatchObject({
      durationMs: 1500,
      outPointMs: 1500
    });

    const over = await runTool(
      makeState([
        video({ inPointMs: 0, outPointMs: 1000, durationMs: 1000 })
      ]),
      { target: "clip_v", durationMs: 2500, maxSourceDurationMs: 2000 }
    );
    expect(over.error).toMatch(/source/i);

    const invalidDirect = await applyTimelineOp(
      makeState([video()]),
      {
        op: "set_clip_params",
        target: "clip_v",
        patch: { opacity: 0.5, maxSourceDurationMs: -100 }
      },
      context()
    );
    expect(invalidDirect.error).toMatch(/maxSourceDurationMs/i);
  });

  it("N1: allows oversized saved shape dimensions (>1) when resending full shapeStyle", async () => {
    const oversized = shapeClip({
      id: "S1_s6",
      shapeStyle: {
        kind: "rect",
        x: 0.4986111111111111,
        y: -0.15,
        width: 0.002777777777777778,
        height: 1.3,
        cornerRadius: 0,
        fill: "rgba(21,23,28,0.12)"
      }
    });
    const out = await runTool(makeState([oversized]), {
      target: "S1_s6",
      shapeStyle: {
        ...oversized.shapeStyle!,
        fill: "#ff0000"
      }
    });
    expect(out.error).toBeUndefined();
    expect(clipOf(out.state, "S1_s6").shapeStyle).toMatchObject({
      height: 1.3,
      fill: "#ff0000"
    });
  });

  it("N2: validates only changed fields on captionStyle and textStyle so saved values stay editable", async () => {
    const captioned = video({
      caption: {
        words: [{ word: "hi", startMs: 0, endMs: 500 }],
        style: { bottomMarginFrac: 1.5, color: "#000000" }
      }
    });
    const captionEdit = await runTool(makeState([captioned]), {
      target: "clip_v",
      captionStyle: { color: "#fff" }
    });
    expect(captionEdit.error).toBeUndefined();
    expect(clipOf(captionEdit.state, "clip_v").caption?.style).toEqual({
      bottomMarginFrac: 1.5,
      color: "#fff"
    });

    const legacyText = textClip({
      textStyle: {
        text: "Legacy",
        fontSizePx: 64,
        color: "#FFFFFF",
        verticalAlign: "center" as unknown as "middle",
        maxWidthFrac: 1.5
      }
    });
    const textEdit = await runTool(makeState([legacyText]), {
      target: "clip_t",
      textStyle: { color: "#00FF00" }
    });
    expect(textEdit.error).toBeUndefined();
    expect(clipOf(textEdit.state, "clip_t").textStyle).toMatchObject({
      color: "#00FF00",
      verticalAlign: "center",
      maxWidthFrac: 1.5
    });

    const fontSizeEdit = await runTool(makeState([legacyText]), {
      target: "clip_t",
      fontSizePx: 72
    });
    expect(fontSizeEdit.error).toBeUndefined();
    expect(clipOf(fontSizeEdit.state, "clip_t").textStyle).toMatchObject({
      fontSizePx: 72,
      verticalAlign: "center",
      maxWidthFrac: 1.5
    });
  });
});
