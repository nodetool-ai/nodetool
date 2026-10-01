import { beforeEach, describe, expect, it, vi } from "vitest";
import { Storyboard, TimelineSequence, initTestDb } from "@nodetool-ai/models";
import { BaseProvider, ProcessingContext, loadMediaRefBytes, type Message, type ProviderStreamItem, type VideoModel } from "@nodetool-ai/runtime";
import { productionRequirement } from "@nodetool-ai/protocol";
import { createMediaEditRequest, createMediaEditSourceContext, makeClip } from "@nodetool-ai/timeline";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { timelineMediaEditGenerator } from "../src/capabilities/timeline-media-edit.js";

vi.mock("@nodetool-ai/runtime", async (actual) => ({
  ...await actual<typeof import("@nodetool-ai/runtime")>(),
  loadMediaRefBytes: vi.fn(async () => new Uint8Array([1]))
}));
vi.mock("@nodetool-ai/runtime/trim-video-window", () => ({ trimVideoWindow: vi.fn(async () => new Uint8Array([1])) }));

class VideoEditProvider extends BaseProvider {
  constructor() { super("fake"); }
  protected override declaredCapabilities() { return ["video_to_video"] as const; }
  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [{ id: "video-edit", name: "Edit", provider: "fake", supportedTasks: ["video_to_video"] }];
  }
  async generateMessage(): Promise<Message> { throw new Error("unused"); }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> { throw new Error("unused"); }
}

async function fixture(policy?: unknown) {
  const board = await Storyboard.create<Storyboard>({ user_id: "u1", project_id: "default", name: "Ad", document: JSON.stringify({ shots: [{ id: "shot", type: "shot", index: 0, action: "Product", status: "rendered", production: policy }] }) });
  const clip = makeClip({ id: "clip", trackId: "track", mediaType: "video", sourceType: "imported", currentAssetId: "original", durationMs: 3000, inPointMs: 0, outPointMs: 3000, storyboardBoardId: board.id, storyboardShotId: "shot" });
  const timeline = await TimelineSequence.create<TimelineSequence>({ user_id: "u1", project_id: "default", name: "Ad", document: JSON.stringify({ tracks: [], clips: [clip], markers: [] }) });
  const source = createMediaEditSourceContext({ sequenceId: timeline.id, clipId: clip.id, sourceAssetId: "original", sourceStartMs: 0, sourceEndMs: 3000, timelineStartMs: 0, timelineDurationMs: 3000, speedMultiplier: 1 });
  if (!source.ok) { throw new Error(source.error); }
  const request = createMediaEditRequest({ provider: "fake", model: "video-edit", instruction: "Replace the backdrop", sourceContext: source.context });
  const context = new ProcessingContext({ jobId: "job", userId: "u1" });
  const provider = vi.spyOn(context, "getProvider").mockRejectedValue(new Error("provider reached"));
  const generation = vi.spyOn(context, "runGeneration");
  const run = createCapabilityRun({ context, gate: UNGATED, projectId: "default" });
  return { board, timeline, request, provider, generation, generate: timelineMediaEditGenerator(run) };
}

describe("headless timeline video edit policy", () => {
  beforeEach(() => { initTestDb(); vi.mocked(loadMediaRefBytes).mockClear(); });
  it.each([
    productionRequirement.parse({ media_strategy: "still_motion_graphics" }),
    productionRequirement.parse({ protected_inputs: [{ id: "product", kind: "product", asset_id: "original" }] }),
    productionRequirement.parse({ protected_inputs: [{ id: "logo", kind: "logo", asset_id: "original" }] })
  ])("denies protected owned sources before provider resolution", async (policy) => {
    const value = await fixture(policy);
    await expect(value.generate(value.request)).rejects.toThrow(/forbids video|protected source fidelity/);
    expect(value.provider).not.toHaveBeenCalled();
    expect(value.generation).not.toHaveBeenCalled();
    expect(loadMediaRefBytes).not.toHaveBeenCalled();
  });
  it("retains legacy unprotected video edits", async () => {
    const value = await fixture();
    await expect(value.generate(value.request)).rejects.toThrow("provider reached");
    expect(value.provider).toHaveBeenCalledOnce();
  });
  it("rejects a stale source before provider resolution", async () => {
    const value = await fixture();
    await expect(value.generate({ ...value.request, sourceContext: { ...value.request.sourceContext, sourceAssetId: "replacement" } })).rejects.toThrow("source changed");
    expect(value.provider).not.toHaveBeenCalled();
  });
  it("rejects foreign-owned timelines before provider resolution", async () => {
    const value = await fixture();
    value.timeline.user_id = "other-user"; await value.timeline.save();
    await expect(value.generate(value.request)).rejects.toThrow("not found uniquely");
    expect(value.provider).not.toHaveBeenCalled();
  });
  it("rejects foreign-owned Storyboards before provider resolution", async () => {
    const value = await fixture();
    value.board.user_id = "other-user"; await value.board.save();
    await expect(value.generate(value.request)).rejects.toThrow("Storyboard generation context");
    expect(value.provider).not.toHaveBeenCalled();
  });
  it("accepts the authorized twelve-character Timeline prefix", async () => {
    const value = await fixture();
    await expect(value.generate({ ...value.request, sourceContext: { ...value.request.sourceContext, sequenceId: value.timeline.id.slice(0, 12) } })).rejects.toThrow("provider reached");
    expect(value.provider).toHaveBeenCalledOnce();
  });

  it("dispatches an unprotected edit and retains the persisted output", async () => {
    const value = await fixture();
    value.provider.mockResolvedValue(new VideoEditProvider());
    value.generation.mockResolvedValue({ id: "generation", output: new Uint8Array([2]), assets: [{ type: "video", asset_id: "edited" }], receipt: null, duration_ms: 1 });
    await expect(value.generate(value.request)).resolves.toEqual({ generationId: "generation", assetId: "edited" });
    expect(value.generation).toHaveBeenCalledOnce();
  });
  it("rechecks a policy changed during source preparation before spending", async () => {
    const value = await fixture();
    const provider = new VideoEditProvider();
    vi.spyOn(provider, "getAvailableVideoModels").mockImplementation(async () => {
      const doc = value.board.toDocument();
      doc.shots[0].production = productionRequirement.parse({ media_strategy: "still_motion_graphics" });
      value.board.document = JSON.stringify(doc); await value.board.save();
      return [{ id: "video-edit", name: "Edit", provider: "fake", supportedTasks: ["video_to_video"] }];
    });
    value.provider.mockResolvedValue(provider);
    await expect(value.generate(value.request)).rejects.toThrow("forbids video");
    expect(value.generation).not.toHaveBeenCalled();
  });

});
