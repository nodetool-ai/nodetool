/**
 * `resolveTimelineOpInput` canonicalizes the op inputs that ride on the
 * `resource_change` broadcast, so a merging editor can attribute each write to
 * the unit it touched (ADR 0001).
 */
import { describe, expect, it } from "vitest";
import type { TimelineDocument } from "@nodetool-ai/models";
import { ANIMATED_PROPERTIES } from "@nodetool-ai/timeline";
import {
  createTimelineToolBridge,
  type TimelineAnimationBakeRequest,
  type TimelineBridgeFinalState,
  type TimelineBridgeInitialState
} from "../src/evals/surfaces/timeline.js";
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
