import { describe, expect, it } from "vitest";
import {
  currentRenderInputs,
  stampRenderInputs,
  staleClipShots,
  staleKeyframeShots
} from "@nodetool-ai/protocol";
import type { Entity, RenderInputs, Shot } from "@nodetool-ai/protocol";
import type { StoryboardDocument } from "../src/document.js";
import { boardRenderContext, planShotRenders } from "../src/render-plan.js";

const shot = (over: Partial<Shot> & { id: string; index: number }): Shot => ({
  type: "shot",
  status: "planned",
  action: `action ${over.index}`,
  ...over
});

const board = (shots: Shot[]): StoryboardDocument => ({
  screenplay: null,
  shots,
  brief: "",
  style: "moody neon",
  entityIds: ["style-1"],
  aspectRatio: "16:9",
  setupStage: "done",
  genre: "",
  directorModel: null,
  imageModel: { type: "image_model", id: "flux", provider: "fal_ai" },
  videoModel: { type: "video_model", id: "vid-1", provider: "fal_ai" }
});

const style: Entity = {
  type: "entity",
  id: "style-1",
  kind: "style",
  name: "House look",
  descriptor: "cold blue key, deep shadow",
  reference_images: [{ type: "image", asset_id: "ref-1", uri: "asset://ref-1" }]
};

/** A still recorded with `overrides` applied to today's inputs. */
const recordedStill = (
  target: Shot,
  doc: StoryboardDocument,
  assetId: string,
  overrides: Partial<RenderInputs> = {}
) => ({
  type: "image" as const,
  asset_id: assetId,
  uri: `asset://${assetId}`,
  render_inputs: {
    ...stampRenderInputs(
      currentRenderInputs(target, boardRenderContext(doc, [style]), "keyframe")
    ),
    ...overrides
  }
});

const recordedClip = (
  target: Shot,
  doc: StoryboardDocument,
  overrides: Partial<RenderInputs> = {}
) => ({
  type: "video" as const,
  asset_id: `clip-${target.id}`,
  uri: `asset://clip-${target.id}`,
  render_inputs: {
    ...stampRenderInputs(
      currentRenderInputs(target, boardRenderContext(doc, [style]), "clip")
    ),
    ...overrides
  }
});

describe("planShotRenders freshness", () => {
  /**
   * The capability's own `stale_only` fixture: one still recorded as the board
   * stands, one recorded against a style entity the board no longer carries,
   * one shot with no still at all — nothing to be out of date with.
   */
  const stillsFixture = () => {
    const base = board([
      shot({ id: "s1", index: 0 }),
      shot({ id: "s2", index: 1 }),
      shot({ id: "s3", index: 2 })
    ]);
    const shots = [
      { ...base.shots[0], keyframe: recordedStill(base.shots[0], base, "a1") },
      {
        ...base.shots[1],
        keyframe: recordedStill(base.shots[1], base, "a2", {
          style_entity_id: "style-gone"
        })
      },
      base.shots[2]
    ];
    return { ...base, shots };
  };

  it("marks fresh exactly the shots the stale selection leaves out", () => {
    const doc = stillsFixture();
    const plans = planShotRenders(doc, [style], "keyframe");
    const stale = new Set(
      staleKeyframeShots(doc.shots, boardRenderContext(doc, [style])).map(
        (s) => s.id
      )
    );
    expect(plans.map((p) => p.fresh)).toEqual([true, false, true]);
    expect(plans.filter((p) => !p.fresh).map((p) => p.shotId)).toEqual([
      ...stale
    ]);
  });

  it("agrees with the stale clip selection too", () => {
    const base = board([
      shot({ id: "s1", index: 0, render_mode: "direct" }),
      shot({ id: "s2", index: 1, render_mode: "direct" })
    ]);
    const doc = {
      ...base,
      shots: [
        { ...base.shots[0], clip: recordedClip(base.shots[0], base) },
        {
          ...base.shots[1],
          clip: recordedClip(base.shots[1], base, { model: "vid-old" })
        }
      ]
    };
    const plans = planShotRenders(doc, [style], "clip");
    const stale = new Set(
      staleClipShots(doc.shots, boardRenderContext(doc, [style])).map(
        (s) => s.id
      )
    );
    expect(plans.filter((p) => !p.fresh).map((p) => p.shotId)).toEqual([
      ...stale
    ]);
    expect(stale.size).toBe(1);
  });

  it("measures freshness against the board, not against the call's override", () => {
    const doc = stillsFixture();
    const plans = planShotRenders(doc, [style], "keyframe", ["s1"], {
      model: "sd-3",
      style: "warm tungsten"
    });
    expect(plans[0].fresh).toBe(true);
    // What the call renders with is what the record says, so the still it
    // produces reads stale against the board afterwards.
    expect(plans[0].renderInputs.model).toBe("sd-3");
    expect(plans[0].model).toEqual({ provider: "fal_ai", model: "sd-3" });
    expect(plans[0].prompt).toContain("warm tungsten");
  });
});

describe("planShotRenders composition", () => {
  const doc = () =>
    board([
      shot({ id: "s1", index: 0, slug: "opening", action: "A lit doorway" }),
      shot({
        id: "s2",
        index: 1,
        action: "The hall",
        motion: "slow push in",
        duration_seconds: 4
      })
    ]);

  it("composes the still prompt with the board style and the applied entities", () => {
    const [first] = planShotRenders(doc(), [style], "keyframe", ["s1"]);
    expect(first).toMatchObject({
      shotId: "s1",
      index: 0,
      slug: "opening",
      kind: "keyframe",
      prompt: "A lit doorway, moody neon",
      aspectRatio: "16:9",
      mode: "keyframe",
      model: { provider: "fal_ai", model: "flux" }
    });
    expect(first.entities).toEqual([
      {
        name: "House look",
        descriptor: "cold blue key, deep shadow",
        reference_images: [
          { type: "image", asset_id: "ref-1", uri: "asset://ref-1" }
        ]
      }
    ]);
    expect(first.referenceAssetIds).toEqual(["ref-1"]);
  });

  it("composes a keyframe-mode clip from motion and action, and carries the length", () => {
    const plans = planShotRenders(doc(), [style], "clip", ["s2"]);
    expect(plans[0].prompt).toBe("slow push in, The hall");
    expect(plans[0].durationSeconds).toBe(4);
    expect(plans[0].mode).toBe("keyframe");
    expect(plans[0].model).toEqual({ provider: "fal_ai", model: "vid-1" });
  });

  it("carries the whole shot into a direct clip prompt when the call forces it", () => {
    const plans = planShotRenders(doc(), [style], "clip", ["s2"], {
      mode: "direct"
    });
    expect(plans[0].mode).toBe("direct");
    expect(plans[0].prompt).toBe("The hall, slow push in, moody neon");
  });

  it("resolves targets by id, index or slug and keeps the order asked for", () => {
    const plans = planShotRenders(doc(), [style], "keyframe", ["1", "opening"]);
    expect(plans.map((p) => p.shotId)).toEqual(["s2", "s1"]);
  });

  it("plans every shot in index order when no target is named", () => {
    const plans = planShotRenders(doc(), [style], "keyframe");
    expect(plans.map((p) => p.shotId)).toEqual(["s1", "s2"]);
  });
});
