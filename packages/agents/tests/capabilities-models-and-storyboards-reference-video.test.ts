import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingContext, ProviderId, VideoModel } from "@nodetool-ai/runtime";
import { Asset, ModelObserver, Storyboard, initTestDb } from "@nodetool-ai/models";
import type { Shot } from "@nodetool-ai/protocol";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { withGenerationSeam } from "./_helpers/generation-seam.js";

class ReferenceVideoProvider extends BaseProvider {
  constructor(private readonly models: VideoModel[]) {
    super("fal_ai" as ProviderId);
  }
  override async referenceToVideo(): Promise<Uint8Array> { return new Uint8Array(); }
  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return this.models;
  }
}

const ctx = { userId: "u1" } as ProcessingContext;
const shot = (overrides: Partial<Shot> & { id: string; index: number }): Shot => ({
  type: "shot",
  action: `action ${overrides.index}`,
  status: "planned",
  ...overrides
});

function renderContext(referenceIds: [string, string]) {
  return withGenerationSeam({
    userId: "u1",
    runProviderPrediction: vi.fn(async () => new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])),
    hasModelInterface: () => true,
    createAsset: vi.fn(async (args: { name: string; contentType: string; content: Uint8Array }) => {
      return Asset.create<Asset>({ user_id: "u1", name: args.name, content_type: args.contentType });
    }),
    resolveAssetBytes: vi.fn(async (uri: string) => ({
      bytes: uri.includes(referenceIds[0]) ? new Uint8Array([1, 2]) : new Uint8Array([3, 4])
    }))
  }) as ProcessingContext & { runProviderPrediction: ReturnType<typeof vi.fn> };
}

describe("reference_to_video capability contracts", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("find_model filters video models by reference_to_video", async () => {
    const provider = new ReferenceVideoProvider([
      { id: "image-model", name: "Image model", provider: "fal_ai", supportedTasks: ["image_to_video"] },
      { id: "reference-model", name: "Reference model", provider: "fal_ai", supportedTasks: ["reference_to_video"] }
    ]);
    const tool = toolForCapabilityName("find_model", (context) =>
      createCapabilityRun({ context, gate: UNGATED, providers: { fal_ai: provider } })
    );
    const result = (await tool.process(ctx, { capability: "reference_to_video" })) as {
      results: Array<{ model_id: string }>;
    };
    expect(result.results.map((model) => model.model_id)).toEqual(["reference-model"]);
  });

  it("render_storyboard_clips dispatches a reference shot through reference_to_video", async () => {
    const first = await Asset.create<Asset>({
      user_id: "u1", name: "ref-a.png", content_type: "image/png",
      metadata: { nodetool_entity: { kind: "character", name: "A", descriptor: "first" } }
    });
    const second = await Asset.create<Asset>({
      user_id: "u1", name: "ref-b.png", content_type: "image/png",
      metadata: { nodetool_entity: { kind: "character", name: "B", descriptor: "second" } }
    });
    const board = await Storyboard.create<Storyboard>({
      user_id: "u1", project_id: "default", name: "Reference board",
      document: JSON.stringify({
        screenplay: null,
        shots: [shot({ id: "s1", index: 0, render_mode: "reference", entity_ids: [first.id, second.id] })],
        brief: "", style: "", entityIds: [first.id, second.id], aspectRatio: "16:9",
        directorModel: null, imageModel: null,
        videoModel: { type: "video_model", id: "reference-model", provider: "fal_ai" }
      })
    });
    const context = renderContext([first.id, second.id]);
    const result = (await toolForCapabilityName("render_storyboard_clips").process(context, {
      storyboard_id: board.id
    })) as { rendered: number };
    expect(result.rendered).toBe(1);
    expect(context.runProviderPrediction.mock.calls[0][0]).toMatchObject({
      capability: "reference_to_video",
      model: "reference-model",
      params: { reference_images: [new Uint8Array([1, 2]), new Uint8Array([3, 4])] }
    });
  });
});
