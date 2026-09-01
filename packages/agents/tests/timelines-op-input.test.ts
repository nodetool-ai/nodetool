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
