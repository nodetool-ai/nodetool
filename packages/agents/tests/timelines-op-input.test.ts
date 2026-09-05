/**
 * `resolveTimelineOpInput` canonicalizes the op inputs that ride on the
 * `resource_change` broadcast, so a merging editor can attribute each write to
 * the unit it touched (ADR 0001).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { TimelineDocument } from "@nodetool-ai/models";
import {
  ModelObserver,
  TimelineSequence,
  initTestDb
} from "@nodetool-ai/models";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { ANIMATED_PROPERTIES } from "@nodetool-ai/timeline";
import {
  createTimelineToolBridge,
  type TimelineAnimationBakeRequest,
  type TimelineBridgeFinalState,
  type TimelineBridgeInitialState
} from "../src/evals/surfaces/timeline.js";
import { SHARED_TIMELINE_TOOL_NAMES } from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import {
  resolveTimelineOpInput,
  resultUnitIds
} from "../src/capabilities/timelines.js";

const before = {
  tracks: [{ id: "T1", name: "Video 1" }],
  clips: [{ id: "C1", name: "Opening" }]
} as unknown as TimelineDocument;

const state = {
  tracks: [
    { id: "T1", name: "Video 1" },
    { id: "T2", name: "Music" }
  ],
  clips: [
    { id: "C1", name: "Opening" },
    { id: "C2", name: "Title" }
  ]
} as unknown as TimelineBridgeFinalState;

describe("resultUnitIds", () => {
  it("reads the unit a bridge result names, under each of its keys", () => {
    expect(resultUnitIds({ ok: true, clip: { id: "C2" } })).toEqual(["C2"]);
    expect(resultUnitIds({ ok: true, track: { id: "T2" } })).toEqual(["T2"]);
    expect(resultUnitIds({ ok: true, deleted: { id: "C1" } })).toEqual(["C1"]);
    expect(resultUnitIds({ ok: true, selected: { id: "C1" } })).toEqual(["C1"]);
    expect(
      resultUnitIds({ ok: true, clips: [{ id: "C1" }, { id: "C3" }] })
    ).toEqual(["C1", "C3"]);
    expect(resultUnitIds({ ok: true, selected: null })).toEqual([]);
    expect(resultUnitIds(undefined)).toEqual([]);
  });
});

describe("resolveTimelineOpInput", () => {
  it("resolves a clip name to its id", () => {
    expect(
      resolveTimelineOpInput({ target: "Title" }, before, state, {
        ok: true,
        clip: { id: "C2" }
      })
    ).toEqual({ target: "C2", id: "C2" });
  });

  it("resolves a track name to its id", () => {
    expect(
      resolveTimelineOpInput({ track_id: "Music" }, before, state, {
        ok: true,
        clip: { id: "C2" }
      })
    ).toEqual({ track_id: "T2", id: "C2" });
  });

  it('resolves "selected" to the clip the result names, not a bare id', () => {
    // The bridge answers `{ok, clip}` — a result carrying no `id` of its own,
    // which is exactly the shape every clip op returns.
    expect(
      resolveTimelineOpInput({ target: "selected" }, before, state, {
        ok: true,
        clip: { id: "C1" }
      })
    ).toEqual({ target: "C1", id: "C1" });
  });

  it('leaves "selected" alone when the result names nothing', () => {
    expect(
      resolveTimelineOpInput({ target: "selected" }, before, state, {
        ok: false
      })
    ).toEqual({ target: "selected" });
  });

  it("stamps the created id onto an op that named no unit", () => {
    expect(
      resolveTimelineOpInput(
        { type: "audio", name: "Music" },
        before,
        state,
        { ok: true, track: { id: "T2" } }
      )
    ).toEqual({ type: "audio", name: "Music", id: "T2" });
  });

  it("stamps both halves of a split", () => {
    expect(
      resolveTimelineOpInput({ target: "Opening" }, before, state, {
        ok: true,
        clips: [{ id: "C1" }, { id: "C3" }]
      })
    ).toEqual({ target: "C1", id: ["C1", "C3"] });
  });

  it("leaves an unresolvable name untouched", () => {
    expect(
      resolveTimelineOpInput({ id: "T9" }, before, state, { ok: true })
    ).toEqual({ id: "T9" });
  });

  // The midi ops name their unit `clip` and `track` rather than `target`, so
  // the canonicalizer has to read those keys or the broadcast carries a name.
  it("resolves the `clip` and `track` keys the midi ops use", () => {
    expect(
      resolveTimelineOpInput({ clip: "Title" }, before, state, {
        ok: true,
        clip: { id: "C2" }
      })
    ).toEqual({ clip: "C2", id: "C2" });
    expect(
      resolveTimelineOpInput({ track: "Music" }, before, state, {
        ok: true,
        track: { id: "T2" }
      })
    ).toEqual({ track: "T2", id: "T2" });
  });

  it("resolves `track` against tracks even when a clip shares the name", () => {
    const shadowed = {
      tracks: [{ id: "T2", name: "Music" }],
      clips: [{ id: "C9", name: "Music" }]
    } as unknown as TimelineBridgeFinalState;
    expect(
      resolveTimelineOpInput({ track: "Music" }, before, shadowed, { ok: true })
    ).toEqual({ track: "T2" });
  });
});

/**
 * `animate_clip` with `preset: "custom"` — the op an agent uses to keyframe
 * motion the preset catalog does not cover (D2, F19). The bridge is the one
 * implementation behind both `edit_timeline` and the browser tool (I11), so
 * these drive it directly.
 *
 * Every refusal below ships its own fixture (I12): a call that triggers it.
 */
describe("animate_clip custom curves", () => {
  const fadeCurve = {
    property: "opacity",
    keyframes: [
      { t: 0, value: 0 },
      { t: 1, value: 1 }
    ]
  };

  async function bridgeWithClip(
    over: Partial<TimelineBridgeInitialState> = {}
  ) {
    const bridge = createTimelineToolBridge({
      tracks: [{ type: "video" }],
      clips: [
        {
          name: "shot",
          trackIndex: 0,
          mediaType: "video",
          startMs: 0,
          durationMs: 4000
        }
      ],
      ...over
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    return { bridge, byName };
  }

  const animate = (
    byName: Record<string, { execute: (a: Record<string, unknown>) => unknown }>,
    animation: Record<string, unknown>
  ) =>
    byName["ui_timeline_animate_clip"].execute({
      target: "shot",
      animations: [{ role: "in", preset: "custom", ...animation }]
    });

  it("stores inline curves, normalized and stamped with a bake time", async () => {
    const { bridge, byName } = await bridgeWithClip();
    await animate(byName, {
      durationMs: 1000,
      curves: [
        {
          property: "offsetY",
          keyframes: [
            { t: 0.25, value: 120 },
            { t: 0.75, value: 0 }
          ]
        }
      ]
    });

    const clip = bridge.finalState().documentClips[0];
    const animation = clip.animations?.[0];
    expect(animation?.preset).toBe("custom");
    expect(animation?.durationMs).toBe(1000);
    expect(animation?.custom?.code).toBeUndefined();
    expect(animation?.custom?.bakedAt).toBeTruthy();
    // Ends short of 0..1 are extended by holding, which is what the sampler
    // assumes — the stored curve is what renders.
    expect(animation?.custom?.curves).toEqual([
      {
        property: "offsetY",
        keyframes: [
          { t: 0, value: 120 },
          { t: 0.25, value: 120 },
          { t: 0.75, value: 0 },
          { t: 1, value: 0 }
        ]
      }
    ]);
  });

  it("spans the clip when the animation states no duration of its own", async () => {
    const { bridge, byName } = await bridgeWithClip();
    await animate(byName, { curves: [fadeCurve] });
    expect(bridge.finalState().documentClips[0].animations?.[0].durationMs).toBe(
      4000
    );
  });

  it("bakes `code` through the host's baker and keeps it as provenance", async () => {
    const seen: TimelineAnimationBakeRequest[] = [];
    const { bridge, byName } = await bridgeWithClip({
      bakeAnimation: async (request) => {
        seen.push(request);
        return { ok: true, curves: [fadeCurve] };
      }
    });

    await animate(byName, {
      durationMs: 500,
      code: 'await output("curves", curves);'
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      role: "in",
      durationMs: 500,
      clipDurationMs: 4000,
      canvas: { width: 1920, height: 1080 }
    });

    const animation = bridge.finalState().documentClips[0].animations?.[0];
    expect(animation?.custom?.code).toBe('await output("curves", curves);');
    expect(animation?.custom?.curves?.[0].property).toBe("opacity");
  });

  it("reports a failed bake instead of storing an animation that renders nothing", async () => {
    const { byName } = await bridgeWithClip({
      bakeAnimation: async () => ({ ok: false, error: "ReferenceError: x" })
    });
    await expect(
      animate(byName, { code: "x;" })
    ).rejects.toThrow(/ReferenceError: x/);
  });

  it("refuses `code` on a surface with no baker rather than storing an unbaked body", async () => {
    const { byName } = await bridgeWithClip();
    await expect(animate(byName, { code: "x;" })).rejects.toThrow(
      /cannot run `code`/
    );
  });

  it("refuses both `curves` and `code`", async () => {
    const { byName } = await bridgeWithClip({
      bakeAnimation: async () => ({ ok: true, curves: [fadeCurve] })
    });
    await expect(
      animate(byName, { curves: [fadeCurve], code: "x;" })
    ).rejects.toThrow(/exactly one of `curves` and `code`/);
  });

  it("refuses neither `curves` nor `code`", async () => {
    const { byName } = await bridgeWithClip();
    await expect(animate(byName, {})).rejects.toThrow(
      /needs `curves`.*or `code`/
    );
  });

  it("refuses an unknown property, listing the ones a curve may drive", async () => {
    const { byName } = await bridgeWithClip();
    const call = animate(byName, {
      curves: [
        { property: "wobble", keyframes: [{ t: 0, value: 0 }] }
      ]
    });
    await expect(call).rejects.toThrow(/"wobble"/);
    // The message has to carry the alternatives, or the agent guesses again.
    await expect(call).rejects.toThrow(
      new RegExp(ANIMATED_PROPERTIES.join(", "))
    );
  });

  it("refuses a wipeProgress curve with no mask, and takes one when given", async () => {
    const { byName } = await bridgeWithClip();
    const wipe = {
      property: "wipeProgress",
      keyframes: [
        { t: 0, value: 0 },
        { t: 1, value: 1 }
      ]
    };
    await expect(animate(byName, { curves: [wipe] })).rejects.toThrow(
      /`wipeProgress` curve needs a mask/
    );

    const { bridge, byName: fresh } = await bridgeWithClip();
    await animate(fresh, {
      curves: [wipe],
      mask: { direction: "left", softness: 0.2 }
    });
    expect(
      bridge.finalState().documentClips[0].animations?.[0].custom?.mask
    ).toEqual({ direction: "left", softness: 0.2 });
  });

  it("still refuses a preset that is neither in the catalog nor custom", async () => {
    const { byName } = await bridgeWithClip();
    await expect(
      byName["ui_timeline_animate_clip"].execute({
        target: "shot",
        animations: [{ role: "in", preset: "wobble" }]
      })
    ).rejects.toThrow(/Unknown animation preset "wobble"/);
  });

  it("lists the custom contract and every animatable property", async () => {
    const { byName } = await bridgeWithClip();
    const listed = (await byName["ui_timeline_list_animation_presets"].execute(
      {}
    )) as {
      custom: { id: string; inputs: Record<string, string> };
      properties: { property: string; fold: string; range: string }[];
    };
    expect(listed.custom.id).toBe("custom");
    expect(Object.keys(listed.custom.inputs)).toContain("curves");
    expect(Object.keys(listed.custom.inputs)).toContain("code");
    expect(listed.properties.map((p) => p.property)).toEqual([
      ...ANIMATED_PROPERTIES
    ]);
    expect(
      listed.properties.find((p) => p.property === "opacity")
    ).toMatchObject({ fold: "multiply", range: "0..1" });
  });
});

describe("set_transition", () => {
  async function bridgeWithTwoClips() {
    const bridge = createTimelineToolBridge({
      tracks: [{ type: "video" }],
      clips: [
        {
          name: "shot a",
          trackIndex: 0,
          mediaType: "video",
          startMs: 0,
          durationMs: 2000
        },
        {
          name: "shot b",
          trackIndex: 0,
          mediaType: "video",
          startMs: 1600,
          durationMs: 2000
        }
      ]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    return { bridge, byName };
  }

  const clipNamed = (
    bridge: { finalState: () => TimelineBridgeFinalState },
    name: string
  ) => bridge.finalState().documentClips.find((c) => c.name === name);

  it("writes the cut onto the incoming clip", async () => {
    const { bridge, byName } = await bridgeWithTwoClips();
    await byName["ui_timeline_set_transition"].execute({
      target: "shot b",
      transition: {
        type: "wipe",
        durationMs: 400,
        direction: "up",
        softness: 0.1,
        easing: "easeOut"
      }
    });

    expect(clipNamed(bridge, "shot b")?.transitionIn).toEqual({
      type: "wipe",
      durationMs: 400,
      direction: "up",
      softness: 0.1,
      easing: "easeOut"
    });
    // Authored on the incoming clip only: the outgoing partner is found at
    // render time, not written to (D5).
    expect(clipNamed(bridge, "shot a")?.transitionIn).toBeUndefined();
  });

  it("clears the cut with a null transition", async () => {
    const { bridge, byName } = await bridgeWithTwoClips();
    const set = byName["ui_timeline_set_transition"];
    await set.execute({
      target: "shot b",
      transition: { type: "zoom", durationMs: 300 }
    });
    await set.execute({ target: "shot b", transition: null });
    expect(clipNamed(bridge, "shot b")?.transitionIn).toBeUndefined();
  });

  it("refuses a target no clip matches", async () => {
    const { byName } = await bridgeWithTwoClips();
    await expect(
      byName["ui_timeline_set_transition"].execute({
        target: "shot z",
        transition: { type: "crossfade", durationMs: 300 }
      })
    ).rejects.toThrow(/shot z/);
  });

  it("refuses a type this build cannot draw", async () => {
    const { byName } = await bridgeWithTwoClips();
    // The schema rejects before the impl runs, so this throws rather than
    // rejecting — an agent gets the list of types back in the error.
    expect(() =>
      byName["ui_timeline_set_transition"].execute({
        target: "shot b",
        transition: { type: "flip", durationMs: 300 }
      })
    ).toThrow(/crossfade/);
  });
});

describe("set_mask and set_matte", () => {
  async function bridgeWithTwoClips() {
    const bridge = createTimelineToolBridge({
      tracks: [{ type: "video" }, { type: "video" }],
      clips: [
        {
          name: "shot a",
          trackIndex: 0,
          mediaType: "video",
          startMs: 0,
          durationMs: 2000
        },
        {
          name: "key",
          trackIndex: 1,
          mediaType: "video",
          startMs: 0,
          durationMs: 2000
        }
      ]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    return { bridge, byName };
  }

  const clipNamed = (
    bridge: { finalState: () => TimelineBridgeFinalState },
    name: string
  ) => bridge.finalState().documentClips.find((c) => c.name === name);

  it("writes a shape mask onto the clip", async () => {
    const { bridge, byName } = await bridgeWithTwoClips();
    await byName["ui_timeline_set_mask"].execute({
      target: "shot a",
      mask: { kind: "ellipse", x: 0.2, y: 0.1, width: 0.6, height: 0.8, featherPx: 12 }
    });

    expect(clipNamed(bridge, "shot a")?.mask).toEqual({
      kind: "ellipse",
      x: 0.2,
      y: 0.1,
      width: 0.6,
      height: 0.8,
      featherPx: 12
    });
  });

  it("keeps a rect's bounds off a path mask", async () => {
    // A `d` on a rect — or bounds on a path — would be stored and stripped on
    // the next save, which reads as a `field_stripped` warning about a field
    // that never meant anything.
    const { bridge, byName } = await bridgeWithTwoClips();
    await byName["ui_timeline_set_mask"].execute({
      target: "shot a",
      mask: { kind: "path", d: "M 0 0 L 1 1 Z", x: 0.5, width: 0.2 }
    });
    const mask = clipNamed(bridge, "shot a")?.mask;
    expect(mask?.d).toBe("M 0 0 L 1 1 Z");
    expect(mask?.x).toBeUndefined();
    expect(mask?.width).toBeUndefined();
  });

  it("clears the mask with a null", async () => {
    const { bridge, byName } = await bridgeWithTwoClips();
    const set = byName["ui_timeline_set_mask"];
    await set.execute({ target: "shot a", mask: { kind: "rect" } });
    await set.execute({ target: "shot a", mask: null });
    expect(clipNamed(bridge, "shot a")?.mask).toBeUndefined();
  });

  it("refuses path data the renderer could not draw", async () => {
    const { byName } = await bridgeWithTwoClips();
    await expect(
      byName["ui_timeline_set_mask"].execute({
        target: "shot a",
        mask: { kind: "path", d: "M 0 0 A 1 1 0 0 1 1 1" }
      })
    ).rejects.toThrow(/path data/);
  });

  it("refuses a kind this build cannot rasterize", async () => {
    const { byName } = await bridgeWithTwoClips();
    expect(() =>
      byName["ui_timeline_set_mask"].execute({
        target: "shot a",
        mask: { kind: "star" }
      })
    ).toThrow(/ellipse/);
  });

  it("resolves a matte source by name and stores its id", async () => {
    const { bridge, byName } = await bridgeWithTwoClips();
    await byName["ui_timeline_set_matte"].execute({
      target: "shot a",
      matte: { source: "key", mode: "luma", invert: true }
    });
    const key = clipNamed(bridge, "key");
    expect(clipNamed(bridge, "shot a")?.matte).toEqual({
      sourceClipId: key?.id,
      mode: "luma",
      invert: true
    });
  });

  it("refuses a clip as its own matte source", async () => {
    const { byName } = await bridgeWithTwoClips();
    await expect(
      byName["ui_timeline_set_matte"].execute({
        target: "shot a",
        matte: { source: "shot a", mode: "alpha" }
      })
    ).rejects.toThrow(/own matte source/);
  });

  it("refuses a matte source no clip matches", async () => {
    const { byName } = await bridgeWithTwoClips();
    await expect(
      byName["ui_timeline_set_matte"].execute({
        target: "shot a",
        matte: { source: "nothing", mode: "alpha" }
      })
    ).rejects.toThrow(/nothing/);
  });

  it("clears the matte with a null", async () => {
    const { bridge, byName } = await bridgeWithTwoClips();
    const set = byName["ui_timeline_set_matte"];
    await set.execute({ target: "shot a", matte: { source: "key", mode: "alpha" } });
    await set.execute({ target: "shot a", matte: null });
    expect(clipNamed(bridge, "shot a")?.matte).toBeUndefined();
  });
});

describe("set_effects", () => {
  async function bridgeWithOneClip() {
    const bridge = createTimelineToolBridge({
      tracks: [{ type: "video" }],
      clips: [
        {
          name: "shot a",
          trackIndex: 0,
          mediaType: "video",
          startMs: 0,
          durationMs: 2000
        }
      ]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    return { bridge, byName };
  }

  const effectsOf = (bridge: { finalState: () => TimelineBridgeFinalState }) =>
    bridge.finalState().documentClips.find((c) => c.name === "shot a")?.effects;

  it("writes the chain in the order it was given", async () => {
    const { bridge, byName } = await bridgeWithOneClip();
    await byName["ui_timeline_set_effects"].execute({
      target: "shot a",
      effects: [
        { type: "chromaKey", color: "#00ff00", tolerance: 0.25 },
        { type: "glow", radius: 12, intensity: 0.8 }
      ]
    });

    expect(effectsOf(bridge)).toEqual([
      {
        id: "fx-1",
        type: "chromaKey",
        enabled: true,
        color: "#00ff00",
        tolerance: 0.25,
        softness: 0.05,
        spill: undefined
      },
      {
        id: "fx-2",
        type: "glow",
        enabled: true,
        radius: 12,
        intensity: 0.8,
        color: undefined
      }
    ]);
  });

  it("replaces the chain rather than appending to it", async () => {
    const { bridge, byName } = await bridgeWithOneClip();
    const set = byName["ui_timeline_set_effects"];
    await set.execute({ target: "shot a", effects: [{ type: "blur", radius: 6 }] });
    await set.execute({
      target: "shot a",
      effects: [{ type: "vignette", amount: 0.4, softness: 0.3 }]
    });

    expect(effectsOf(bridge)?.map((e) => e.type)).toEqual(["vignette"]);
  });

  it("clears the chain with an empty list", async () => {
    const { bridge, byName } = await bridgeWithOneClip();
    const set = byName["ui_timeline_set_effects"];
    await set.execute({ target: "shot a", effects: [{ type: "blur", radius: 6 }] });
    await set.execute({ target: "shot a", effects: [] });

    expect(effectsOf(bridge)).toBeUndefined();
  });

  it("keeps a levels' knobs off a glow — the type decides the fields", async () => {
    // A flat input object is all a tool call can express, so an `inBlack` sent
    // with a glow would be stored and stripped on the next save, which reads as
    // a `field_stripped` warning about a field that never meant anything.
    const { bridge, byName } = await bridgeWithOneClip();
    await byName["ui_timeline_set_effects"].execute({
      target: "shot a",
      effects: [{ type: "glow", radius: 9, intensity: 1, inBlack: 0.5 }]
    });

    expect(effectsOf(bridge)?.[0]).not.toHaveProperty("inBlack");
  });

  it("refuses a type this build cannot apply", async () => {
    const { byName } = await bridgeWithOneClip();
    // The schema rejects before the impl runs, so an agent gets the list of
    // types back in the error rather than a clip carrying a dead effect.
    expect(() =>
      byName["ui_timeline_set_effects"].execute({
        target: "shot a",
        effects: [{ type: "halation", radius: 12 }]
      })
    ).toThrow(/liftGammaGain/);
  });
});

/**
 * The three style bags are the document schemas themselves (I1, I11). They had
 * each been written out by hand on three surfaces and each copy fell behind the
 * renderer, so a stroked title or a dashed path was storable in the document
 * and unreachable from a tool call.
 */
describe("style bags reach every field the renderer honours", () => {
  async function bridgeWithClips() {
    const bridge = createTimelineToolBridge({
      tracks: [{ type: "overlay" }],
      clips: [
        {
          name: "title",
          trackIndex: 0,
          mediaType: "text",
          startMs: 0,
          durationMs: 2000
        },
        {
          name: "badge",
          trackIndex: 0,
          mediaType: "shape",
          startMs: 0,
          durationMs: 2000
        }
      ]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    return { bridge, byName };
  }

  const clipNamed = (
    bridge: { finalState: () => TimelineBridgeFinalState },
    name: string
  ) => bridge.finalState().documentClips.find((c) => c.name === name);

  it("stores a text clip's stroke, shadow, background and gradient fill", async () => {
    const { bridge, byName } = await bridgeWithClips();
    await byName["ui_timeline_set_clip_params"].execute({
      target: "title",
      textStyle: {
        text: "SCRAPHEART",
        fontSizePx: 120,
        color: "#ffffff",
        fontStyle: "italic",
        letterSpacingPx: 6,
        lineHeight: 1.1,
        verticalAlign: "top",
        stroke: { color: "#000000", widthPx: 3 },
        shadow: { color: "#000000", blurPx: 12, offsetX: 0, offsetY: 4 },
        background: { color: "#00000099", paddingPx: 24, radiusPx: 8 },
        fill: {
          type: "linear",
          angle: 90,
          stops: [
            { offset: 0, color: "#ff0000" },
            { offset: 1, color: "#0000ff" }
          ]
        }
      }
    });

    expect(clipNamed(bridge, "title")?.textStyle).toMatchObject({
      fontStyle: "italic",
      letterSpacingPx: 6,
      lineHeight: 1.1,
      verticalAlign: "top",
      stroke: { color: "#000000", widthPx: 3 },
      shadow: { color: "#000000", blurPx: 12, offsetX: 0, offsetY: 4 },
      background: { color: "#00000099", paddingPx: 24, radiusPx: 8 },
      fill: { type: "linear", angle: 90 }
    });
  });

  it("stores a path shape's geometry, dash and trim", async () => {
    const { bridge, byName } = await bridgeWithClips();
    await byName["ui_timeline_set_clip_params"].execute({
      target: "badge",
      shapeStyle: {
        kind: "path",
        d: "M 0 0 L 1 1 Z",
        dash: [0.02, 0.01],
        lineCap: "round",
        lineJoin: "bevel",
        trimStart: 0.1,
        trimEnd: 0.8,
        fillStyle: { type: "radial", stops: [{ offset: 0, color: "#fff" }] }
      }
    });

    expect(clipNamed(bridge, "badge")?.shapeStyle).toMatchObject({
      kind: "path",
      d: "M 0 0 L 1 1 Z",
      dash: [0.02, 0.01],
      lineCap: "round",
      lineJoin: "bevel",
      trimStart: 0.1,
      trimEnd: 0.8,
      fillStyle: { type: "radial" }
    });
  });

  it("authors a polygon straight from add_shape_clip", async () => {
    // The kind enum used to stop at rect | ellipse | line, so a star was
    // storable in the document and unreachable from a tool call.
    const { bridge, byName } = await bridgeWithClips();
    await byName["ui_timeline_add_shape_clip"].execute({
      shape: { kind: "star", sides: 5, innerRadius: 0.4, cornerRadius: 0.02 }
    });
    const star = bridge
      .finalState()
      .documentClips.find((c) => c.shapeStyle?.kind === "star");
    expect(star?.shapeStyle).toMatchObject({
      kind: "star",
      sides: 5,
      innerRadius: 0.4,
      cornerRadius: 0.02
    });
  });
});

/**
 * Groups (T11) reached from the bridge, which is what `edit_timeline`'s
 * `add_group` / `set_parent` ops dispatch to and what the browser twin calls
 * through its own handler (I11).
 */
describe("add_group and set_parent", () => {
  async function bridgeWithTwoClips() {
    const bridge = createTimelineToolBridge({
      tracks: [{ type: "video" }],
      clips: [
        {
          name: "shot a",
          trackIndex: 0,
          mediaType: "video",
          startMs: 0,
          durationMs: 2000
        },
        {
          name: "shot b",
          trackIndex: 0,
          mediaType: "video",
          startMs: 2000,
          durationMs: 2000
        }
      ]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    return { bridge, byName };
  }

  const clipNamed = (
    bridge: { finalState: () => TimelineBridgeFinalState },
    name: string
  ) => bridge.finalState().documentClips.find((c) => c.name === name);

  it("creates a group clip and parents the children it was given", async () => {
    const { bridge, byName } = await bridgeWithTwoClips();
    const result = (await byName["ui_timeline_add_group"].execute({
      name: "Title block",
      startMs: 0,
      durationMs: 4000,
      children: ["shot a", "shot b"]
    })) as { clip: { id: string; mediaType: string }; children: string[] };

    expect(result.clip.mediaType).toBe("group");
    expect(result.children).toHaveLength(2);
    expect(clipNamed(bridge, "shot a")?.parentId).toBe(result.clip.id);
    expect(clipNamed(bridge, "shot b")?.parentId).toBe(result.clip.id);
    // A child keeps its own track, so its z-order is unchanged (I9).
    expect(clipNamed(bridge, "shot a")?.trackId).toBe(
      clipNamed(bridge, "shot b")?.trackId
    );
  });

  it("parents nothing when one named child does not exist", async () => {
    // Resolving every child first is what keeps a half-applied group from
    // leaving the caller guessing which of its clips moved.
    const { bridge, byName } = await bridgeWithTwoClips();
    await expect(
      byName["ui_timeline_add_group"].execute({
        name: "Title block",
        startMs: 0,
        durationMs: 4000,
        children: ["shot a", "shot z"]
      })
    ).rejects.toThrow(/shot z/);
    expect(clipNamed(bridge, "shot a")?.parentId).toBeUndefined();
    // And no empty group is left behind for the caller to clean up.
    expect(clipNamed(bridge, "Title block")).toBeUndefined();
  });

  it("parents and unparents a clip after the fact", async () => {
    const { bridge, byName } = await bridgeWithTwoClips();
    const group = (await byName["ui_timeline_add_group"].execute({
      name: "Title block",
      startMs: 0,
      durationMs: 4000
    })) as { clip: { id: string } };

    await byName["ui_timeline_set_parent"].execute({
      target: "shot a",
      parentId: "Title block"
    });
    expect(clipNamed(bridge, "shot a")?.parentId).toBe(group.clip.id);

    await byName["ui_timeline_set_parent"].execute({
      target: "shot a",
      parentId: null
    });
    expect(clipNamed(bridge, "shot a")?.parentId).toBeUndefined();
  });

  it("refuses a parent that is not a group, listing the groups there are", async () => {
    const { byName } = await bridgeWithTwoClips();
    await byName["ui_timeline_add_group"].execute({
      name: "Title block",
      startMs: 0,
      durationMs: 4000
    });
    const call = byName["ui_timeline_set_parent"].execute({
      target: "shot a",
      parentId: "shot b"
    });
    await expect(call).rejects.toThrow(/not a group/);
    await expect(call).rejects.toThrow(/Title block/);
  });

  it("refuses a cycle rather than storing one the renderer drops", async () => {
    const { byName } = await bridgeWithTwoClips();
    const outer = (await byName["ui_timeline_add_group"].execute({
      name: "Outer",
      startMs: 0,
      durationMs: 4000
    })) as { clip: { id: string } };
    await byName["ui_timeline_add_group"].execute({
      name: "Inner",
      startMs: 0,
      durationMs: 4000
    });
    await byName["ui_timeline_set_parent"].execute({
      target: "Inner",
      parentId: outer.clip.id
    });

    await expect(
      byName["ui_timeline_set_parent"].execute({
        target: "Outer",
        parentId: "Inner"
      })
    ).rejects.toThrow(/cycle/);
  });
});

/**
 * A failed op names what the caller could have said instead. Without the ids
 * an agent guesses again, and the guess is another failed op.
 */
describe("target errors list the valid ids", () => {
  async function bridgeWithOneClip() {
    const bridge = createTimelineToolBridge({
      tracks: [{ type: "video", name: "Video 1" }],
      clips: [
        {
          name: "shot a",
          trackIndex: 0,
          mediaType: "video",
          startMs: 0,
          durationMs: 2000
        }
      ]
    });
    return Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
  }

  it("names every clip a structural op could have addressed", async () => {
    const byName = await bridgeWithOneClip();
    for (const op of [
      "ui_timeline_set_transition",
      "ui_timeline_set_mask",
      "ui_timeline_set_matte",
      "ui_timeline_set_effects",
      "ui_timeline_set_parent"
    ]) {
      const input: Record<string, unknown> = { target: "shot z" };
      if (op === "ui_timeline_set_transition") {
        input["transition"] = { type: "crossfade", durationMs: 200 };
      }
      if (op === "ui_timeline_set_mask") input["mask"] = { kind: "rect" };
      if (op === "ui_timeline_set_matte") {
        input["matte"] = { source: "shot a", mode: "alpha" };
      }
      if (op === "ui_timeline_set_effects") input["effects"] = [];
      if (op === "ui_timeline_set_parent") input["parentId"] = null;
      await expect(byName[op].execute(input)).rejects.toThrow(
        /Valid clips: .*\("shot a"\)/
      );
    }
  });

  it("names every track an add_group could have landed on", async () => {
    const byName = await bridgeWithOneClip();
    await expect(
      byName["ui_timeline_add_group"].execute({
        name: "Group",
        startMs: 0,
        durationMs: 1000,
        trackId: "Audio 9"
      })
    ).rejects.toThrow(/Valid tracks: .*\("Video 1"\)/);
  });
});

/**
 * The midi ops, at the seam this file owns: `edit_timeline` dispatches by op
 * name, so a new op is reachable only once the bridge registers it under the
 * `ui_timeline_` prefix, and each one has to name the unit the broadcast
 * attributes the write to.
 */
describe("midi ops", () => {
  async function midiBridge() {
    const bridge = createTimelineToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    await byName["ui_timeline_add_track"].execute({
      type: "midi",
      name: "Lead"
    });
    return { bridge, byName };
  }

  const quarter = (i: number) => ({
    pitch: 60 + i,
    start_tick: i * 960,
    duration_tick: 960
  });

  it("adds a midi track carrying the default synth and a document tempo", async () => {
    const { bridge } = await midiBridge();
    const state = bridge.finalState();
    expect(state.tempo?.bpm).toBe(120);
    expect(state.documentTracks[0].instrument?.type).toBe("subtractive");
  });

  it("places a phrase and names the clip it created", async () => {
    const { bridge, byName } = await midiBridge();
    const result = (await byName["ui_timeline_add_midi_clip"].execute({
      track: "Lead",
      start_ms: 0,
      duration_ms: 2000,
      name: "Walk",
      notes: [0, 1, 2, 3].map(quarter)
    })) as { ok: true; clip: { id: string } };
    expect(resultUnitIds(result)).toEqual([result.clip.id]);
    expect(bridge.finalState().documentClips[0].notes).toHaveLength(4);
  });

  it("refuses a phrase on a track that is not midi", async () => {
    const { byName } = await midiBridge();
    await byName["ui_timeline_add_track"].execute({
      type: "audio",
      name: "Music"
    });
    await expect(
      byName["ui_timeline_add_midi_clip"].execute({
        track: "Music",
        start_ms: 0,
        duration_ms: 1000
      })
    ).rejects.toThrow(/audio track/);
  });

  it("rescales the midi clips on a tempo change and nothing else", async () => {
    const { bridge, byName } = await midiBridge();
    await byName["ui_timeline_add_track"].execute({
      type: "audio",
      name: "Music"
    });
    await byName["ui_timeline_add_midi_clip"].execute({
      track: "Lead",
      start_ms: 1000,
      duration_ms: 2000,
      name: "Walk",
      notes: [quarter(0)]
    });
    await byName["ui_timeline_add_text_clip"].execute({
      text: "Title",
      startMs: 1000,
      durationMs: 2000
    });

    await byName["ui_timeline_set_tempo"].execute({ bpm: 60 });

    const clips = bridge.finalState().documentClips;
    const walk = clips.find((c) => c.name === "Walk");
    expect([walk?.startMs, walk?.durationMs]).toEqual([2000, 4000]);
    const title = clips.find((c) => c.name === "Title");
    expect([title?.startMs, title?.durationMs]).toEqual([1000, 2000]);
    expect(bridge.finalState().tempo?.bpm).toBe(60);
  });

  it("replaces a clip's notes and refuses a list validateNotes rejects", async () => {
    const { bridge, byName } = await midiBridge();
    await byName["ui_timeline_add_midi_clip"].execute({
      track: "Lead",
      start_ms: 0,
      duration_ms: 2000,
      name: "Walk",
      notes: [quarter(0)]
    });

    await byName["ui_timeline_set_notes"].execute({
      clip: "Walk",
      notes: [quarter(0), quarter(1)]
    });
    expect(bridge.finalState().documentClips[0].notes).toHaveLength(2);

    await expect(
      byName["ui_timeline_set_notes"].execute({
        clip: "Walk",
        notes: [
          { id: "same", ...quarter(0) },
          { id: "same", ...quarter(1) }
        ]
      })
    ).rejects.toThrow(/share the id/);
    // The refused list left the stored one alone.
    expect(bridge.finalState().documentClips[0].notes).toHaveLength(2);
  });

  it("sets a midi track's instrument and refuses one elsewhere", async () => {
    const { bridge, byName } = await midiBridge();
    const instrument = {
      type: "subtractive",
      waveform: "square",
      attackMs: 1,
      decayMs: 50,
      sustain: 0.5,
      releaseMs: 80,
      cutoffHz: 2000,
      resonance: 1,
      gainDb: -3
    };
    await byName["ui_timeline_set_track_instrument"].execute({
      track: "Lead",
      instrument
    });
    expect(bridge.finalState().documentTracks[0].instrument).toEqual(instrument);

    await byName["ui_timeline_add_track"].execute({
      type: "audio",
      name: "Music"
    });
    await expect(
      byName["ui_timeline_set_track_instrument"].execute({
        track: "Music",
        instrument
      })
    ).rejects.toThrow(/audio track/);
  });
});

/**
 * I11: the browser registry and this bridge must expose one tool set. A shared
 * field list cannot catch a tool one surface has and the other lacks, so each
 * side asserts the shared name list — this is the headless half, and
 * `web/src/lib/tools/__tests__/timelineTools.test.ts` is the other.
 */
describe("shared tool surface", () => {
  it("exposes every tool the browser twin must also register", () => {
    const bridge = createTimelineToolBridge();
    const names = new Set(bridge.tools.map((t) => t.name));
    expect(SHARED_TIMELINE_TOOL_NAMES.length).toBeGreaterThan(0);
    for (const name of SHARED_TIMELINE_TOOL_NAMES) {
      expect(names.has(name), `bridge is missing ${name}`).toBe(true);
    }
  });
});

/**
 * A script of ops runs to the end. Stopping at the first error hides every
 * problem behind it, and the caller wants the whole picture — so a failing op
 * is recorded and the ones after it still land.
 */
describe("edit_timeline continues past a failing op", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  const seedDocument = () =>
    JSON.stringify({
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
      clips: [
        {
          id: "clip-1",
          trackId: "track-1",
          name: "Shot 1",
          startMs: 0,
          durationMs: 2000,
          mediaType: "video",
          sourceType: "imported",
          status: "generated",
          locked: false,
          versions: []
        }
      ],
      markers: []
    });

  it("records the failures and applies the ops around them", async () => {
    const row = await TimelineSequence.create<TimelineSequence>({
      user_id: "u1",
      project_id: "default",
      name: "Trailer cut",
      fps: 30,
      width: 1920,
      height: 1080,
      duration_ms: 2000,
      document: seedDocument()
    });
    const run = createCapabilityRun({
      context: { userId: "u1" } as unknown as ProcessingContext,
      gate: UNGATED
    });

    const result = (await run.invoke("edit_timeline", {
      timeline_id: row.id,
      ops: [
        // 1 fails: no such clip.
        { op: "set_effects", target: "nothing", effects: [] },
        // 2 succeeds, and must land despite op 1.
        { op: "add_group", name: "Title block", startMs: 0, durationMs: 4000 },
        // 3 fails: a group cannot hold a clip that does not exist.
        { op: "set_parent", target: "nothing", parentId: "Title block" },
        // 4 succeeds, and must land despite op 3.
        { op: "set_parent", target: "Shot 1", parentId: "Title block" }
      ]
    })) as {
      applied: number;
      failed: number;
      ops: { ok: boolean; error?: string }[];
      clips: { name: string; media_type: string }[];
    };

    expect(result).toMatchObject({ applied: 2, failed: 2 });
    expect(result.ops.map((o) => o.ok)).toEqual([false, true, false, true]);
    // The recorded errors name what the caller could have said instead.
    expect(result.ops[0].error).toMatch(/Valid clips: .*\("Shot 1"\)/);
    expect(result.ops[2].error).toMatch(/nothing/);

    const saved = await TimelineSequence.findById(row.id);
    const clips = saved!.toDocument().clips;
    const group = clips.find((c) => c.name === "Title block");
    expect(group?.mediaType).toBe("group");
    expect(clips.find((c) => c.name === "Shot 1")?.parentId).toBe(group?.id);
  });
});

describe("marker ops", () => {
  function bridgeWithNoMarkers() {
    const bridge = createTimelineToolBridge({ tracks: [{ type: "video" }] });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    return { bridge, byName };
  }

  it("adds a marker and reports it in the final state", async () => {
    const { bridge, byName } = bridgeWithNoMarkers();
    const added = await byName["ui_timeline_add_marker"].execute({
      timeMs: 4500,
      label: "Chorus",
      color: "#ff0055"
    });

    expect(added).toEqual({
      ok: true,
      marker: {
        id: "marker_1",
        timeMs: 4500,
        label: "Chorus",
        color: "#ff0055"
      }
    });
    expect(bridge.finalState().markers).toEqual([
      { id: "marker_1", timeMs: 4500, label: "Chorus", color: "#ff0055" }
    ]);
  });

  it("refuses a marker before zero", async () => {
    const { byName } = bridgeWithNoMarkers();
    await expect(
      byName["ui_timeline_add_marker"].execute({ timeMs: -1 })
    ).rejects.toThrow(/before zero/);
  });

  it("deletes a marker by label, case-insensitively", async () => {
    const { bridge, byName } = bridgeWithNoMarkers();
    await byName["ui_timeline_add_marker"].execute({
      timeMs: 1000,
      label: "Cut"
    });
    const deleted = await byName["ui_timeline_delete_marker"].execute({
      target: "cut"
    });

    expect(deleted).toEqual({
      ok: true,
      deleted: { id: "marker_1", timeMs: 1000, label: "Cut" }
    });
    expect(bridge.finalState().markers).toEqual([]);
  });

  it("lists the markers it knows when the target matches none", async () => {
    const { byName } = bridgeWithNoMarkers();
    await byName["ui_timeline_add_marker"].execute({
      timeMs: 1000,
      label: "Cut"
    });
    await expect(
      byName["ui_timeline_delete_marker"].execute({ target: "nope" })
    ).rejects.toThrow(/marker_1 \("Cut"\) at 1000ms/);
  });

  it("reports the markers on get_state, so delete_marker has a target", async () => {
    const { byName } = bridgeWithNoMarkers();
    await byName["ui_timeline_add_marker"].execute({ timeMs: 500, label: "A" });
    const state = (await byName["ui_timeline_get_state"].execute({})) as {
      markers: { id: string; timeMs: number }[];
    };

    expect(state.markers).toEqual([
      { id: "marker_1", timeMs: 500, label: "A" }
    ]);
  });

  it("seeds the markers a document already carries", () => {
    const bridge = createTimelineToolBridge({
      sequence: {
        tracks: [],
        clips: [],
        markers: [{ id: "m_seeded", timeMs: 250, label: "Intro" }]
      }
    });

    expect(bridge.finalState().markers).toEqual([
      { id: "m_seeded", timeMs: 250, label: "Intro" }
    ]);
  });
});

describe("set_markers_from_beats", () => {
  function bareBridge() {
    const bridge = createTimelineToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    return { bridge, byName };
  }

  it("lays one numbered marker per beat of a tempo grid", async () => {
    const { bridge, byName } = bareBridge();
    await byName["ui_timeline_set_markers_from_beats"].execute({
      bpm: 120,
      count: 3
    });

    expect(
      bridge.finalState().markers.map((m) => [m.timeMs, m.label])
    ).toEqual([
      [0, "Beat 1"],
      [500, "Beat 2"],
      [1000, "Beat 3"]
    ]);
  });

  it("takes onset times and a label stem", async () => {
    const { bridge, byName } = bareBridge();
    await byName["ui_timeline_set_markers_from_beats"].execute({
      onsets_ms: [1200, 400],
      label: "Hit"
    });

    expect(
      bridge.finalState().markers.map((m) => [m.timeMs, m.label])
    ).toEqual([
      [400, "Hit 1"],
      [1200, "Hit 2"]
    ]);
  });

  it("keeps existing markers and skips a beat one already sits on", async () => {
    const { bridge, byName } = bareBridge();
    await byName["ui_timeline_add_marker"].execute({
      timeMs: 500,
      label: "Hand-placed"
    });
    const result = (await byName[
      "ui_timeline_set_markers_from_beats"
    ].execute({ bpm: 120, count: 3 })) as { skipped_times_ms: number[] };

    expect(result.skipped_times_ms).toEqual([500]);
    expect(bridge.finalState().markers.map((m) => m.label)).toEqual([
      "Hand-placed",
      "Beat 1",
      "Beat 3"
    ]);
  });

  it("is a no-op on a re-run of the same grid", async () => {
    const { bridge, byName } = bareBridge();
    const set = byName["ui_timeline_set_markers_from_beats"];
    await set.execute({ bpm: 120, count: 4 });
    await set.execute({ bpm: 120, count: 4 });

    expect(bridge.finalState().markers).toHaveLength(4);
  });

  it("refuses a grid with no source, and one with both", async () => {
    const { byName } = bareBridge();
    await expect(
      byName["ui_timeline_set_markers_from_beats"].execute({})
    ).rejects.toThrow(/onsets_ms/);
    await expect(
      byName["ui_timeline_set_markers_from_beats"].execute({
        bpm: 120,
        count: 2,
        onsets_ms: [0]
      })
    ).rejects.toThrow(/exactly one/);
  });
});

describe("snap_to_beats", () => {
  /** Two clips: one 30 ms off a 120 BPM beat, one 90 ms off. */
  function bridgeWithTwoClips() {
    const bridge = createTimelineToolBridge({
      tracks: [{ type: "video" }],
      clips: [
        {
          name: "near",
          trackIndex: 0,
          mediaType: "video",
          startMs: 530,
          durationMs: 1000
        },
        {
          name: "far",
          trackIndex: 0,
          mediaType: "video",
          startMs: 2090,
          durationMs: 1000
        }
      ]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    return { bridge, byName };
  }

  const clipNamed = (
    bridge: { finalState: () => TimelineBridgeFinalState },
    name: string
  ) => bridge.finalState().documentClips.find((c) => c.name === name);

  it("moves the clip inside tolerance and leaves the one outside it", async () => {
    const { bridge, byName } = bridgeWithTwoClips();
    const result = (await byName["ui_timeline_snap_to_beats"].execute({
      bpm: 120
    })) as {
      snapped: number;
      skipped: number;
      clips: { clipId: string; clipName: string | null; snapped: boolean; reason?: string }[];
    };

    expect([result.snapped, result.skipped]).toEqual([1, 1]);
    expect(clipNamed(bridge, "near")?.startMs).toBe(500);
    expect(clipNamed(bridge, "far")?.startMs).toBe(2090);

    const far = result.clips.find((entry) => entry.clipName === "far");
    expect(far?.snapped).toBe(false);
    expect(far?.reason).toContain("90ms from the nearest beat (2000ms)");
  });

  it("reports before, after and delta per clip", async () => {
    const { byName } = bridgeWithTwoClips();
    const result = (await byName["ui_timeline_snap_to_beats"].execute({
      targets: ["near"],
      bpm: 120
    })) as {
      clips: {
        clipId: string;
        before: { startMs: number };
        after: { startMs: number };
        delta: { startMs: number; endMs: number };
      }[];
    };

    expect(result.clips[0].before.startMs).toBe(530);
    expect(result.clips[0].after.startMs).toBe(500);
    expect(result.clips[0].delta).toEqual({ startMs: -30, endMs: -30 });
  });

  it("widens the tolerance on request", async () => {
    const { bridge, byName } = bridgeWithTwoClips();
    await byName["ui_timeline_snap_to_beats"].execute({
      bpm: 120,
      tolerance_ms: 100
    });

    expect(clipNamed(bridge, "far")?.startMs).toBe(2000);
  });

  it("trims the end onto the beat without moving the start", async () => {
    const { bridge, byName } = bridgeWithTwoClips();
    await byName["ui_timeline_snap_to_beats"].execute({
      targets: ["near"],
      onsets_ms: [530, 1500],
      mode: "end",
      action: "trim"
    });

    expect(clipNamed(bridge, "near")).toMatchObject({
      startMs: 530,
      durationMs: 970
    });
  });

  it("resolves targets by name and by id, and reports a name it cannot", async () => {
    const { bridge, byName } = bridgeWithTwoClips();
    const nearId = bridge.finalState().documentClips[0].id;
    const result = (await byName["ui_timeline_snap_to_beats"].execute({
      targets: [nearId, "ghost"],
      bpm: 120
    })) as { clips: { clipId: string; reason?: string }[] };

    expect(result.clips.map((entry) => entry.clipId)).toEqual([
      nearId,
      "ghost"
    ]);
    expect(result.clips[1].reason).toBe('no clip matches "ghost"');
  });

  it('takes "all" as the whole sequence', async () => {
    const { byName } = bridgeWithTwoClips();
    const result = (await byName["ui_timeline_snap_to_beats"].execute({
      targets: "all",
      bpm: 120
    })) as { clips: unknown[] };

    expect(result.clips).toHaveLength(2);
  });

  it("generates a tempo grid long enough to reach the last clip", async () => {
    const { byName } = bridgeWithTwoClips();
    const result = (await byName["ui_timeline_snap_to_beats"].execute({
      bpm: 120
    })) as { grid: { lastMs: number } };

    // The far clip ends at 3090 ms, so the grid has to run past it.
    expect(result.grid.lastMs).toBeGreaterThanOrEqual(3090);
  });

  it("refuses a mode this build does not implement", () => {
    const { byName } = bridgeWithTwoClips();
    expect(() =>
      byName["ui_timeline_snap_to_beats"].execute({ bpm: 120, mode: "middle" })
    ).toThrow(/start/);
  });
});

describe("set_time_remap", () => {
  function bridgeWithOneClip() {
    const bridge = createTimelineToolBridge({
      tracks: [{ type: "video", name: "Video 1" }],
      clips: [
        {
          name: "shot a",
          trackIndex: 0,
          mediaType: "video",
          startMs: 0,
          durationMs: 2000
        }
      ]
    });
    return {
      bridge,
      byName: Object.fromEntries(bridge.tools.map((t) => [t.name, t]))
    };
  }

  const clipNamed = (
    bridge: { finalState: () => TimelineBridgeFinalState },
    name: string
  ) => bridge.finalState().documentClips.find((c) => c.name === name);

  it("stores a curve spanning the clip's window", async () => {
    const { bridge, byName } = bridgeWithOneClip();
    await byName["ui_timeline_set_time_remap"].execute({
      target: "shot a",
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 0.5, sourceMs: 200, easing: "easeInOut" },
          { t: 1, sourceMs: 4000 }
        ]
      }
    });

    expect(clipNamed(bridge, "shot a")?.timeRemap).toEqual({
      keyframes: [
        { t: 0, sourceMs: 0 },
        { t: 0.5, sourceMs: 200, easing: "easeInOut" },
        { t: 1, sourceMs: 4000 }
      ]
    });
  });

  it("clears the remap with a null", async () => {
    const { bridge, byName } = bridgeWithOneClip();
    const set = byName["ui_timeline_set_time_remap"];
    await set.execute({
      target: "shot a",
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 1, sourceMs: 1000 }
        ]
      }
    });
    await set.execute({ target: "shot a", timeRemap: null });
    expect(clipNamed(bridge, "shot a")?.timeRemap).toBeUndefined();
  });

  it("refuses keyframes that do not ascend in t", async () => {
    // The sampler reads the list in array order and never sorts, so a
    // descending pair samples the wrong source instant instead of failing.
    const { byName } = bridgeWithOneClip();
    await expect(
      byName["ui_timeline_set_time_remap"].execute({
        target: "shot a",
        timeRemap: {
          keyframes: [
            { t: 0, sourceMs: 0 },
            { t: 0.8, sourceMs: 500 },
            { t: 0.4, sourceMs: 900 },
            { t: 1, sourceMs: 1200 }
          ]
        }
      })
    ).rejects.toThrow(/ascend/);
  });

  it("refuses a curve that does not span the clip", async () => {
    const { byName } = bridgeWithOneClip();
    await expect(
      byName["ui_timeline_set_time_remap"].execute({
        target: "shot a",
        timeRemap: {
          keyframes: [
            { t: 0.25, sourceMs: 0 },
            { t: 1, sourceMs: 1000 }
          ]
        }
      })
    ).rejects.toThrow(/first keyframe/);
  });

  it("names every clip the target could have been", async () => {
    const { byName } = bridgeWithOneClip();
    await expect(
      byName["ui_timeline_set_time_remap"].execute({
        target: "shot z",
        timeRemap: {
          keyframes: [
            { t: 0, sourceMs: 0 },
            { t: 1, sourceMs: 1000 }
          ]
        }
      })
    ).rejects.toThrow(/Valid clips: .*\("shot a"\)/);
  });
});

/**
 * A group op has to reach what the group holds (D4). The bridge used to patch
 * the target clip alone, so moving a group left its children behind and
 * deleting one left them naming a parent that no longer existed.
 */
describe("group ops reach the clips the group holds", () => {
  async function bridgeWithGroup() {
    const bridge = createTimelineToolBridge({
      tracks: [
        { type: "video", name: "Video 1" },
        { type: "video", name: "Video 2" }
      ],
      clips: [
        {
          name: "shot a",
          trackIndex: 0,
          mediaType: "video",
          startMs: 0,
          durationMs: 2000
        },
        {
          name: "shot b",
          trackIndex: 1,
          mediaType: "video",
          startMs: 2000,
          durationMs: 2000
        }
      ]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    const group = (await byName["ui_timeline_add_group"].execute({
      name: "Block",
      startMs: 0,
      durationMs: 4000,
      children: ["shot a", "shot b"]
    })) as { clip: { id: string } };
    return { bridge, byName, groupId: group.clip.id };
  }

  const clipNamed = (
    bridge: { finalState: () => TimelineBridgeFinalState },
    name: string
  ) => bridge.finalState().documentClips.find((c) => c.name === name);

  it("moves the children by the group's delta and keeps their tracks", async () => {
    const { bridge, byName } = await bridgeWithGroup();
    const trackA = clipNamed(bridge, "shot a")?.trackId;
    const trackB = clipNamed(bridge, "shot b")?.trackId;
    expect(trackA).not.toBe(trackB);

    await byName["ui_timeline_move_clip"].execute({
      target: "Block",
      startMs: 1000
    });

    expect(clipNamed(bridge, "shot a")?.startMs).toBe(1000);
    expect(clipNamed(bridge, "shot b")?.startMs).toBe(3000);
    // Children keep their own track, and with it their z-order (I9).
    expect(clipNamed(bridge, "shot a")?.trackId).toBe(trackA);
    expect(clipNamed(bridge, "shot b")?.trackId).toBe(trackB);
  });

  it("releases the children when the group is deleted", async () => {
    const { bridge, byName, groupId } = await bridgeWithGroup();
    await byName["ui_timeline_delete_clip"].execute({ target: "Block" });

    const names = bridge.finalState().documentClips.map((c) => c.name);
    expect(names).toContain("shot a");
    expect(names).toContain("shot b");
    expect(names).not.toContain("Block");
    for (const clip of bridge.finalState().documentClips) {
      expect(clip.parentId).toBeUndefined();
    }
    expect(groupId).toBeTruthy();
  });

  it("pulls a child inside the window a trim leaves", async () => {
    const { bridge, byName } = await bridgeWithGroup();
    await byName["ui_timeline_trim_clip"].execute({
      target: "Block",
      durationMs: 3000
    });

    expect(clipNamed(bridge, "Block")?.durationMs).toBe(3000);
    // "shot b" ran to 4000, a second past the new end.
    expect(clipNamed(bridge, "shot b")?.startMs).toBe(2000);
    expect(clipNamed(bridge, "shot b")?.durationMs).toBe(1000);
    // "shot a" fits already and is untouched.
    expect(clipNamed(bridge, "shot a")?.durationMs).toBe(2000);
  });
});

describe("ui_timeline_insert_composition", () => {
  const composition = {
    id: "test-lower-third",
    name: "Lower third",
    params: {
      name: { type: "string" as const, default: "Name", path: "/1/textStyle/text" },
      barColor: {
        type: "color" as const,
        default: "#0A84FF",
        path: "/0/shapeStyle/fill"
      }
    },
    group: {
      id: "tpl-group",
      trackId: "Plate",
      name: "Lower third",
      startMs: 0,
      durationMs: 3000,
      mediaType: "group" as const,
      sourceType: "imported" as const,
      status: "generated" as const
    },
    children: [
      {
        id: "tpl-bar",
        trackId: "Plate",
        name: "Bar",
        startMs: 0,
        durationMs: 3000,
        mediaType: "shape" as const,
        sourceType: "generated" as const,
        status: "generated" as const,
        shapeStyle: { kind: "rect", fill: "#0A84FF", x: 0.1, y: 0.7, width: 0.4, height: 0.15 }
      },
      {
        id: "tpl-name",
        trackId: "Text",
        name: "Name",
        startMs: 200,
        durationMs: 2800,
        mediaType: "text" as const,
        sourceType: "generated" as const,
        status: "generated" as const,
        textStyle: { text: "Name", fontSizePx: 60, color: "#FFFFFF" }
      }
    ]
  };

  function bridgeWithLibrary(
    ids: string[] = [composition.id]
  ): ReturnType<typeof createTimelineToolBridge> {
    return createTimelineToolBridge({
      loadComposition: {
        get: async (id) => (id === composition.id ? composition : null),
        listIds: async () => ids
      }
    });
  }

  const toolsOf = (bridge: ReturnType<typeof createTimelineToolBridge>) =>
    Object.fromEntries(bridge.tools.map((tool) => [tool.name, tool]));

  it("drops the group and its children in, on tracks of their own", async () => {
    const bridge = bridgeWithLibrary();
    const result = (await toolsOf(bridge)["ui_timeline_insert_composition"].execute({
      composition_id: "test-lower-third",
      startMs: 4000,
      params: { name: "Ada Lovelace" }
    })) as { compositionId: string; children: { id: string }[] };

    expect(result.compositionId).toBe("test-lower-third");
    const state = bridge.finalState();
    expect(state.documentClips).toHaveLength(3);

    const group = state.documentClips.find((c) => c.mediaType === "group");
    const text = state.documentClips.find((c) => c.mediaType === "text");
    const shape = state.documentClips.find((c) => c.mediaType === "shape");
    expect(group?.startMs).toBe(4000);
    // The child sits 200ms into the group in the template.
    expect(text?.startMs).toBe(4200);
    expect(text?.textStyle?.text).toBe("Ada Lovelace");
    expect(text?.parentId).toBe(group?.id);
    expect(text?.compositionId).toBe("test-lower-third");

    // A plate and the text over it on one track would auto-dissolve, so the
    // two template tracks became two document tracks, text on top.
    expect(text?.trackId).not.toBe(shape?.trackId);
    const index = new Map(state.tracks.map((t) => [t.id, t.index]));
    expect(index.get(text?.trackId ?? "")).toBeLessThan(
      index.get(shape?.trackId ?? "") ?? Infinity
    );
  });

  it("reuses the tracks a second insertion needs", async () => {
    const bridge = bridgeWithLibrary();
    const tools = toolsOf(bridge);
    await tools["ui_timeline_insert_composition"].execute({
      composition_id: "test-lower-third",
      startMs: 0
    });
    const afterFirst = bridge.finalState().tracks.map((t) => t.name);
    // Two template tracks plus one for the group itself, which draws nothing
    // but would otherwise read as overlapping its own child.
    expect(afterFirst).toEqual(["Text", "Plate", "Lower third"]);

    await tools["ui_timeline_insert_composition"].execute({
      composition_id: "test-lower-third",
      startMs: 8000
    });
    expect(bridge.finalState().tracks.map((t) => t.name)).toEqual(afterFirst);
  });

  it("lists the available ids when the id is unknown", async () => {
    const tools = toolsOf(bridgeWithLibrary(["test-lower-third", "title-card"]));
    await expect(
      tools["ui_timeline_insert_composition"].execute({
        composition_id: "nope",
        startMs: 0
      })
    ).rejects.toThrow(/test-lower-third, title-card/);
  });

  it("refuses a parameter the template does not declare", async () => {
    const tools = toolsOf(bridgeWithLibrary());
    await expect(
      tools["ui_timeline_insert_composition"].execute({
        composition_id: "test-lower-third",
        startMs: 0,
        params: { subtitle: "nope" }
      })
    ).rejects.toThrow(/no parameter "subtitle"/);
  });

  it("says so when the surface has no composition library", async () => {
    const tools = toolsOf(createTimelineToolBridge());
    await expect(
      tools["ui_timeline_insert_composition"].execute({
        composition_id: "test-lower-third",
        startMs: 0
      })
    ).rejects.toThrow(/no composition library/);
  });
});
