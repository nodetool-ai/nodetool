import { beforeEach, describe, expect, it, vi } from "vitest";
import { Asset } from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import type { VideoToVideoParams } from "@nodetool-ai/runtime";
import { generateMediaDataSchema } from "@nodetool-ai/protocol";
import { DirectInferenceHandler } from "../src/session/inference.js";
import type { DirectMediaGenerationRequest } from "../src/session/inference.js";
import { FakeClientSession } from "./fake-client-session.js";
import { WebSocketClientSession } from "../src/websocket-client-session.js";

const generation = vi.hoisted(() => vi.fn());
const trim = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/media.js", () => ({ trimVideoWindow: trim }));
vi.mock("../src/lib/asset-paths.js", () => ({
  retrieveAssetBytes: async (_adapter: unknown, _user: string, id: string) =>
    new Uint8Array([id === "entity" ? 2 : id === "reference" ? 3 : 1])
}));
vi.mock("../src/session/media-generation.js", () => ({
  createGenerationRun: () => ({ generate: generation, seamAssetId: () => "candidate" })
}));

class EditProvider extends BaseProvider {
  readonly calls: VideoToVideoParams[] = [];
  tasks = ["video_to_video", "video_to_video_reference"];
  constructor() { super("fal_ai"); }
  override async getAvailableVideoModels() {
    return [{ id: "edit", name: "Edit", provider: "fal_ai", supportedTasks: this.tasks }];
  }
  override async videoToVideo(_source: Uint8Array, params: VideoToVideoParams) {
    this.calls.push(params);
    return new Uint8Array([9]);
  }
}

const request = (): DirectMediaGenerationRequest => ({
  mode: "video_edit", provider: "fal_ai", model: "edit", prompt: "Keep entity://entity",
  sourceAssetId: "source", referenceAssetIds: ["reference", "entity"],
  sourceContext: {
    sequenceId: "sequence", clipId: "clip", sourceAssetId: "source",
    sourceStartMs: 40000, sourceEndMs: 44000, timelineStartMs: 0,
    timelineDurationMs: 4000, speedMultiplier: 1
  }
});

function handler(provider: EditProvider): DirectInferenceHandler {
  return new DirectInferenceHandler(new FakeClientSession({
    userId: "user", resolveProvider: async () => provider
  }), {
    defaults: { provider: "fal_ai", model: "edit" },
    currentRequestSeq: () => 1, registerAbort: () => () => {}
  });
}

describe("video edit references", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Asset, "find").mockImplementation(async (_user, id) =>
      id === "missing" ? null : new Asset({
        id, user_id: "user", name: id,
        content_type: id === "source" ? "video/mp4" : "image/png",
        metadata: id === "entity" ? { nodetool_entity: { name: "Hero", descriptor: "Red coat" } } : {}
      })
    );
    trim.mockResolvedValue(new Uint8Array([4]));
    generation.mockImplementation(async (_task, _params, _persist, execute) => ({ output: await execute() }));
  });

  it("forwards ordered deduplicated references and records the ids on the generation", async () => {
    const provider = new EditProvider();
    await expect(handler(provider).runDirectMediaGeneration(request())).resolves.toMatchObject({ asset_ids: ["candidate"] });
    expect(provider.calls[0]).toMatchObject({
      prompt: "Keep Hero\n\nConsistency references:\n- Hero: Red coat",
      referenceAssetIds: ["reference", "entity"],
      referenceImages: [new Uint8Array([3]), new Uint8Array([2])]
    });
    expect(generation.mock.calls[0][1]).toMatchObject({
      reference_asset_ids: ["reference", "entity"],
      reference_images: [new Uint8Array([3]), new Uint8Array([2])]
    });
    expect(trim).toHaveBeenCalledWith(new Uint8Array([1]), 40000, 44000);
    expect(Asset.find).toHaveBeenCalledWith("user", "entity");
  });

  it.each([false, true])("resolves marker references and reports take provenance (explicit: %s)", async (explicit) => {
    vi.spyOn(Asset, "find").mockImplementation(async (_user, id) => new Asset({
      id, user_id: "user", name: id,
      content_type: id === "source" ? "video/mp4" : "image/png",
      metadata: id === "entity" ? { nodetool_entity: {
        name: "Hero", descriptor: "Red coat", reference_asset_id: "reference"
      } } : {}
    }));
    const provider = new EditProvider();
    const result = await handler(provider).runDirectMediaGeneration({
      ...request(), referenceAssetIds: [],
      prompt: explicit ? "Keep identity" : "Keep entity://entity",
      ...(explicit ? { entityIds: ["entity"] } : {})
    });
    expect(provider.calls[0]).toMatchObject({
      referenceAssetIds: ["reference"], referenceImages: [new Uint8Array([3])]
    });
    const provenance = { referenceAssetIds: ["reference"], entityIds: ["entity"] };
    expect(result).toMatchObject({ media_edit_references: provenance });
    expect(generation.mock.calls[0][1]).toMatchObject({
      reference_asset_ids: ["reference"], entity_ids: ["entity"],
      media_edit_references: provenance
    });
  });

  it("rejects unsupported references before generation or source trimming", async () => {
    const provider = new EditProvider();
    provider.tasks = ["video_to_video"];
    await expect(handler(provider).runDirectMediaGeneration(request())).rejects.toThrow(/reference/);
    expect(generation).not.toHaveBeenCalled();
    expect(trim).not.toHaveBeenCalled();
  });

  it("accepts owned image reference objects on video edits", async () => {
    const provider = new EditProvider();
    await handler(provider).runDirectMediaGeneration({ ...request(), prompt: "Match the reference",
      referenceAssetIds: [], referenceImages: [{ type: "image", asset_id: "reference" }] });
    expect(provider.calls[0]).toMatchObject({ referenceAssetIds: ["reference"], referenceImages: [new Uint8Array([3])] });
  });

  it.each(["missing", "source"])("rejects unavailable or non-image reference %s", async (id) => {
    await expect(handler(new EditProvider()).runDirectMediaGeneration({ ...request(), referenceAssetIds: [id] })).rejects.toThrow(/Reference image/);
    expect(generation).not.toHaveBeenCalled();
    expect(trim).not.toHaveBeenCalled();
  });

  it("validates explicit ids on the wire", () => {
    expect(generateMediaDataSchema.safeParse({ mode: "video_edit", reference_asset_ids: [""] }).success).toBe(false);
    expect(generateMediaDataSchema.parse({ mode: "video_edit", reference_asset_ids: ["reference"] }).reference_asset_ids).toEqual(["reference"]);
  });

  it("forwards reference and Entity selections through the generate_media command", async () => {
    const provider = new EditProvider();
    const session = new WebSocketClientSession({
      userId: "user", resolveProvider: async () => provider,
      resolveExecutor: () => ({ process: async () => ({}) })
    });
    try {
      await session.handleCommand({ command: "generate_media", request_id: "edit-request", data: {
        mode: "video_edit", provider: "fal_ai", model: "edit", prompt: "Keep identity",
        source_asset_id: "source", reference_asset_ids: ["reference"], entity_ids: ["entity"]
      } });
      expect(provider.calls[0]).toMatchObject({
        referenceAssetIds: ["reference", "entity"], referenceImages: [new Uint8Array([3]), new Uint8Array([2])]
      });
    } finally {
      await session.disconnect();
    }
  });

  it("expands an explicit Entity selection without changing its definition", async () => {
    const entity = new Asset({ id: "entity", user_id: "user", name: "Hero", content_type: "image/png",
      metadata: { nodetool_entity: { name: "Hero", descriptor: "Red coat" } } });
    vi.spyOn(Asset, "find").mockResolvedValue(entity);
    const original = structuredClone(entity.metadata);
    const provider = new EditProvider();
    await handler(provider).runDirectMediaGeneration({ ...request(), prompt: "Keep identity", entityIds: ["entity"], referenceAssetIds: [] });
    expect(provider.calls[0]).toMatchObject({ referenceAssetIds: ["entity"], referenceImages: [new Uint8Array([2])] });
    expect(provider.calls[0].prompt).toContain("Hero: Red coat");
    expect(entity.metadata).toEqual(original);
  });
});
