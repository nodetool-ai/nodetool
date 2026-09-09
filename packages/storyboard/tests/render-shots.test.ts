import { describe, expect, it, vi } from "vitest";
import type { Entity, Shot } from "@nodetool-ai/protocol";
import type { StoryboardDocument } from "../src/document.js";
import { planShotRenders } from "../src/render-plan.js";
import { renderShots } from "../src/io/render-shots.js";
import type {
  RenderGenerationRequest,
  StoryboardRenderHost
} from "../src/io/render-shots.js";

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
  style: "",
  entityIds: [],
  aspectRatio: "16:9",
  setupStage: "done",
  genre: "",
  directorModel: null,
  imageModel: { type: "image_model", id: "flux", provider: "fal_ai" },
  videoModel: { type: "video_model", id: "vid-1", provider: "fal_ai" }
});

const NO_ENTITIES: Entity[] = [];
const BYTES = new Uint8Array([1, 2, 3, 4]);

/** A board in memory, with the update token the CAS reads. */
function fakeHost(
  document: StoryboardDocument,
  over: Partial<StoryboardRenderHost> = {}
) {
  const state = { document, updatedAt: "t0", writes: 0 };
  const requests: RenderGenerationRequest[] = [];
  const host: StoryboardRenderHost = {
    runGeneration: async (request) => {
      requests.push(request);
      return {
        output: BYTES,
        assets: [{ asset_id: `asset-${requests.length}`, uri: `asset://asset-${requests.length}` }]
      };
    },
    getStoryboard: async () => ({
      document: state.document,
      updatedAt: state.updatedAt
    }),
    updateStoryboard: async ({ document: next }) => {
      state.writes++;
      state.document = next;
      state.updatedAt = `t${state.writes}`;
      return { document: next, updatedAt: state.updatedAt };
    },
    ...over
  };
  return { host, state, requests };
}

const ids = () => {
  let n = 0;
  return () => `gen-${++n}`;
};

describe("renderShots", () => {
  it("renders a still, appends the version with its record, and writes the shot", async () => {
    const doc = board([shot({ id: "s1", index: 0 })]);
    const { host, state, requests } = fakeHost(doc);
    const plans = planShotRenders(doc, NO_ENTITIES, "keyframe");

    const outcomes = await renderShots(host, { id: "b1" }, plans, {
      newId: ids()
    });

    expect(requests[0]).toMatchObject({
      id: "gen-1",
      provider: "fal_ai",
      capability: "text_to_image",
      model: "flux",
      persist: { name: "shot-1-still" }
    });
    expect(requests[0].params).toEqual({
      prompt: "action 0",
      entities: [],
      aspect_ratio: "16:9"
    });
    expect(outcomes[0]).toMatchObject({
      shotId: "s1",
      ok: true,
      assetId: "asset-1",
      generationId: "gen-1",
      status: "keyframe_ready"
    });
    const saved = state.document.shots[0];
    expect(saved.keyframe?.asset_id).toBe("asset-1");
    expect(saved.keyframe_versions).toHaveLength(1);
    expect(saved.keyframe?.render_inputs).toMatchObject({
      kind: "keyframe",
      model: "flux",
      aspect_ratio: "16:9"
    });
    expect(saved.keyframe?.render_inputs?.recorded_at).toBeTypeOf("string");
  });

  it("animates the selected still and records the clip's real length", async () => {
    const still = { type: "image" as const, asset_id: "k1", uri: "asset://k1" };
    const doc = board([
      { ...shot({ id: "s1", index: 0 }), keyframe: still, status: "keyframe_ready" }
    ]);
    const loadMedia = vi.fn(async () => BYTES);
    const { host, state, requests } = fakeHost(doc, {
      loadMedia,
      videoDurationSeconds: () => 5.184
    });
    const plans = planShotRenders(doc, NO_ENTITIES, "clip");

    const outcomes = await renderShots(host, { id: "b1" }, plans, {
      newId: ids(),
      resolution: "1080p"
    });

    expect(loadMedia).toHaveBeenCalledWith(still);
    expect(requests[0]).toMatchObject({
      capability: "image_to_video",
      model: "vid-1",
      persist: { name: "shot-1-clip", mime: "video/mp4" }
    });
    expect(requests[0].params["images"]).toEqual([BYTES]);
    expect(requests[0].params["resolution"]).toBe("1080p");
    expect(outcomes[0].ok).toBe(true);
    expect(state.document.shots[0].clip).toMatchObject({
      asset_id: "asset-1",
      duration: 5.184
    });
    expect(state.document.shots[0].status).toBe("rendered");
  });

  it("resolves ordered reference images and dispatches reference_to_video", async () => {
    const entity: Entity = {
      type: "entity",
      id: "e1",
      kind: "character",
      name: "Mara",
      descriptor: "runner",
      reference_images: [
        { type: "image", asset_id: "r1", uri: "asset://r1" },
        { type: "image", asset_id: "r2", uri: "asset://r2" }
      ]
    };
    const doc = board([{ ...shot({ id: "s1", index: 0, entity_ids: ["e1"] }), render_mode: "reference" }]);
    const { host, requests } = fakeHost(doc, {
      loadMedia: vi.fn(async (ref) => (ref.asset_id === "r1" ? new Uint8Array([1]) : new Uint8Array([2])))
    });
    const plans = planShotRenders(doc, [entity], "clip");
    await renderShots(host, { id: "b1" }, plans, { newId: ids() });
    expect(requests[0].capability).toBe("reference_to_video");
    expect(requests[0].params["reference_images"]).toEqual([new Uint8Array([1]), new Uint8Array([2])]);
    expect(requests[0].params["image"]).toBeUndefined();
  });

  it("rejects an unreadable reference before spending", async () => {
    const entity: Entity = {
      type: "entity", id: "e1", kind: "character", name: "Mara", descriptor: "runner",
      reference_images: [{ type: "image", asset_id: "r1", uri: "asset://r1" }]
    };
    const doc = board([{ ...shot({ id: "s1", index: 0, entity_ids: ["e1"] }), render_mode: "reference" }]);
    const { host, requests } = fakeHost(doc, { loadMedia: vi.fn(async () => null) });
    const outcomes = await renderShots(host, { id: "b1" }, planShotRenders(doc, [entity], "clip"));
    expect(outcomes[0].ok).toBe(false);
    expect(requests).toHaveLength(0);
  });

  it("refuses a keyframe-mode clip with no still, and spends nothing", async () => {
    const doc = board([shot({ id: "s1", index: 0 })]);
    const { host, requests } = fakeHost(doc);
    const plans = planShotRenders(doc, NO_ENTITIES, "clip");

    const outcomes = await renderShots(host, { id: "b1" }, plans);

    expect(requests).toHaveLength(0);
    expect(outcomes[0].ok).toBe(false);
    expect(outcomes[0].error).toContain("no still to animate");
  });

  it("re-reads and re-applies when the board moved under the write", async () => {
    const doc = board([shot({ id: "s1", index: 0 }), shot({ id: "s2", index: 1 })]);
    const inner = fakeHost(doc);
    let rejected = false;
    const host: StoryboardRenderHost = {
      ...inner.host,
      updateStoryboard: async (args) => {
        if (!rejected) {
          rejected = true;
          // Somebody else's write lands first, carrying an edit this render
          // must not clobber.
          inner.state.document = {
            ...inner.state.document,
            shots: [
              inner.state.document.shots[0],
              { ...inner.state.document.shots[1], notes: "edited elsewhere" }
            ]
          };
          inner.state.updatedAt = "t99";
          return null;
        }
        return inner.host.updateStoryboard(args);
      }
    };
    const plans = planShotRenders(doc, NO_ENTITIES, "keyframe", ["s1"]);

    const outcomes = await renderShots(host, { id: "b1" }, plans, {
      newId: ids()
    });

    expect(outcomes[0].ok).toBe(true);
    expect(inner.state.document.shots[0].keyframe?.asset_id).toBe("asset-1");
    expect(inner.state.document.shots[1].notes).toBe("edited elsewhere");
  });

  it("gives up after the retry and says the render could not be saved", async () => {
    const doc = board([shot({ id: "s1", index: 0 })]);
    const { host } = fakeHost(doc, { updateStoryboard: async () => null });
    const plans = planShotRenders(doc, NO_ENTITIES, "keyframe");

    const outcomes = await renderShots(host, { id: "b1" }, plans);

    expect(outcomes[0].ok).toBe(false);
    expect(outcomes[0].error).toContain("being modified concurrently");
  });

  it("marks the shot failed when the provider throws", async () => {
    const doc = board([shot({ id: "s1", index: 0 })]);
    const { host, state } = fakeHost(doc, {
      runGeneration: async () => {
        throw new Error("provider is down");
      }
    });
    const plans = planShotRenders(doc, NO_ENTITIES, "keyframe");

    const outcomes = await renderShots(host, { id: "b1" }, plans);

    expect(outcomes[0].error).toBe("text_to_image failed: provider is down");
    expect(state.document.shots[0].status).toBe("failed");
  });

  it("reports a host with no asset storage rather than attaching nothing", async () => {
    const doc = board([shot({ id: "s1", index: 0 })]);
    const { host } = fakeHost(doc, {
      runGeneration: async () => ({ output: BYTES, assets: [] })
    });
    const plans = planShotRenders(doc, NO_ENTITIES, "keyframe");

    const outcomes = await renderShots(host, { id: "b1" }, plans);

    expect(outcomes[0].error).toContain("could not be saved as an asset");
  });
});
