import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BufferTarget,
  Mp4OutputFormat,
  Output,
  VideoSample,
  VideoSampleSource,
  getFirstEncodableVideoCodec
} from "mediabunny";
import { registerMediabunnyServer } from "@mediabunny/server";
import { inspectTimelineClipFrames } from "../src/capabilities/timeline-clip-frames.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  Asset,
  Prediction,
  TimelineSequence,
  TimelineSequenceVersion,
  initTestDb
} from "@nodetool-ai/models";
import {
  BaseProvider,
  ProcessingContext,
  type Message,
  type ProviderStreamItem,
  type VideoModel
} from "@nodetool-ai/runtime";
import { createFalGenerationLifecycleHooks } from "@nodetool-ai/execution";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { createTimelineToolBridge } from "../src/evals/surfaces/timeline.js";
import { timelineMediaEditGenerator } from "../src/capabilities/timeline-media-edit.js";
import {
  makeClip,
  makeTrack,
  captureMediaEditSourceContext,
  createMediaEditRequest
} from "@nodetool-ai/timeline";

vi.mock("@nodetool-ai/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nodetool-ai/runtime")>()),
  trimVideoWindow: async () => new Uint8Array([4, 5, 6])
}));

class EditProvider extends BaseProvider {
  constructor() {
    super("fal_ai");
  }
  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [
      {
        id: "edit",
        name: "Edit",
        provider: "fal_ai",
        supportedTasks: ["video_to_video"]
      }
    ];
  }
  override async videoToVideo(): Promise<Uint8Array> {
    return new Uint8Array([1]);
  }
  async generateMessage(): Promise<Message> {
    throw new Error("unused");
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("unused");
  }
}

const clip = makeClip({
  id: "clip-1",
  trackId: "track-1",
  name: "hero",
  startMs: 1200,
  durationMs: 4000,
  mediaType: "video",
  sourceType: "imported",
  status: "generated",
  currentAssetId: "source-asset"
});

describe("headless timeline media parity", () => {
  beforeEach(() => initTestDb());

  it("uses the host's persisted generation candidate rather than a fabricated asset", async () => {
    const bridge = createTimelineToolBridge({
      sequenceId: "sequence-1",
      sequence: {
        tracks: [makeTrack({ id: "track-1", type: "video" })],
        clips: [clip]
      },
      // This is the generation transport boundary supplied by database hosts.
      generateMediaEdit: async () => ({
        generationId: "generation-1",
        assetId: "result-asset"
      })
    });
    const tool = bridge.tools.find(
      (candidate) => candidate.name === "ui_timeline_generatively_edit_clip"
    );
    const result = await tool!.execute({
      clip_id: clip.id,
      instruction: "night",
      provider: "fake",
      model: "edit"
    });
    expect(result).toMatchObject({
      generationId: "generation-1",
      activeTakeId: "clip-1:baseline:source-asset",
      candidate: { id: "generation-1" }
    });
    expect(bridge.finalState().documentClips[0]).toMatchObject({
      currentAssetId: "source-asset",
      versions: expect.arrayContaining([
        expect.objectContaining({ id: "generation-1", assetId: "result-asset" })
      ])
    });
  });

  it("replays clip frame inspection headlessly with real pixels and no document write", async () => {
    const sequence = await TimelineSequence.create({
      user_id: "u1",
      project_id: "default",
      name: "frames",
      fps: 30,
      width: 160,
      height: 90,
      duration_ms: 4000,
      document: JSON.stringify({
        tracks: [makeTrack({ id: "track-1", type: "video" })],
        markers: [],
        clips: [
          makeClip({
            ...clip,
            startMs: 0,
            mediaType: "shape",
            currentAssetId: undefined,
            shapeStyle: {
              kind: "rect",
              fill: "#ff0000",
              x: 0,
              y: 0,
              width: 1,
              height: 1
            }
          }),
          makeClip({
            ...clip,
            id: "obscuring-sibling",
            startMs: 0,
            mediaType: "shape",
            currentAssetId: undefined,
            shapeStyle: {
              kind: "rect",
              fill: "#0000ff",
              x: 0,
              y: 0,
              width: 1,
              height: 1
            }
          })
        ]
      })
    });
    const context = new ProcessingContext({ jobId: "job-1", userId: "u1" });
    const run = createCapabilityRun({ context, gate: UNGATED });
    const result = await run.invoke("edit_timeline", {
      timeline_id: sequence.id,
      ops: [
        {
          op: "get_clip_frames",
          target: "clip-1",
          timesMs: [1000, 4000],
          width: 160
        }
      ]
    });
    expect(result).toMatchObject({
      failed: 0,
      ops: [
        {
          ok: true,
          result: {
            frames: [
              {
                clipId: "clip-1",
                timelineTimeMs: 1000,
                width: 160,
                height: 90,
                complete: true,
                dataUrl: expect.stringMatching(/^data:image\//)
              },
              { clipId: "clip-1", timelineTimeMs: 3999, complete: true }
            ]
          }
        }
      ]
    });
    const inspected = result as {
      ops: Array<{ result: { frames: Array<{ dataUrl: string }> } }>;
    };
    expect(inspected.ops[0].result.frames).toHaveLength(2);
    const image = await loadImage(inspected.ops[0].result.frames[1].dataUrl);
    const canvas = createCanvas(image.width, image.height);
    canvas.getContext("2d").drawImage(image, 0, 0);
    expect(
      Array.from(canvas.getContext("2d").getImageData(80, 45, 1, 1).data)
    ).toEqual([255, 0, 0, 255]);
    const saved = await TimelineSequence.findById(sequence.id);
    expect(saved!.updated_at).toEqual(sequence.updated_at);
  });
  it("persists one candidate across a CAS retry, applies it explicitly, and restores its undo snapshot", async () => {
    const sequence = await TimelineSequence.create({
      user_id: "u1",
      project_id: "default",
      name: "generation",
      fps: 30,
      width: 160,
      height: 90,
      duration_ms: 5200,
      document: JSON.stringify({
        tracks: [makeTrack({ id: "track-1", type: "video" })],
        markers: [],
        clips: [clip]
      })
    });
    const context = new ProcessingContext({
      jobId: "job-1",
      userId: "u1",
      generationLifecycle: createFalGenerationLifecycleHooks({
        userId: "u1",
        callbacks: false
      })
    });
    context.registerProvider("fal_ai", new EditProvider());
    const persistedAssetId = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    context.setModelInterfaces({
      createAsset: async (args) => {
        await Asset.create<Asset>({
          id: persistedAssetId,
          user_id: "u1",
          name: args.name,
          content_type: args.contentType,
          size: args.content.length,
          metadata: args.metadata
        });
        return { id: persistedAssetId, content_type: args.contentType };
      }
    });
    vi.spyOn(context, "resolveAssetBytes").mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      attempts: []
    });
    const dispatch = vi.spyOn(context, "runGeneration");
    const originalWrite =
      TimelineSequence.updateDocumentIfUnchanged.bind(TimelineSequence);
    const write = vi
      .spyOn(TimelineSequence, "updateDocumentIfUnchanged")
      .mockResolvedValueOnce(null);
    write.mockImplementationOnce(originalWrite);
    const run = createCapabilityRun({ context, gate: UNGATED });
    const generated = await run.invoke("edit_timeline", {
      timeline_id: sequence.id,
      ops: [
        {
          op: "generatively_edit_clip",
          clip_id: clip.id,
          instruction: "night",
          provider: "fal_ai",
          model: "edit"
        }
      ]
    });
    expect(generated).toMatchObject({ failed: 0, applied: 1 });
    expect(dispatch).toHaveBeenCalledTimes(1);
    const submitted = dispatch.mock.calls[0][0];
    expect(submitted).toMatchObject({
      capability: "video_to_video",
      provider: "fal_ai",
      model: "edit",
      destination: {
        document_id: sequence.id,
        target_type: "timeline_clip",
        target_id: "clip-1",
        selected: false
      },
      params: {
        media_edit: {
          instruction: "night",
          sourceContext: {
            sourceAssetId: "source-asset",
            timelineStartMs: 1200
          }
        }
      }
    });
    const candidateId = submitted.id!;
    const durable = await Prediction.find(candidateId);
    expect(durable).toMatchObject({
      status: "completed",
      document_id: sequence.id,
      capability: "video_to_video",
      asset_ids: [persistedAssetId]
    });
    expect(await Asset.find("u1", persistedAssetId)).toMatchObject({
      content_type: "video/mp4",
      size: 1
    });
    const beforeApply = (await TimelineSequence.findById(
      sequence.id
    ))!.toDocument();
    expect(beforeApply.clips[0]).toMatchObject({
      currentAssetId: "source-asset",
      startMs: 1200,
      versions: expect.arrayContaining([
        expect.objectContaining({
          id: candidateId,
          assetId: persistedAssetId,
          source: "video_to_video"
        })
      ])
    });
    write.mockResolvedValueOnce(null);
    write.mockImplementationOnce(originalWrite);
    const applied = (await run.invoke("edit_timeline", {
      timeline_id: sequence.id,
      ops: [{ op: "apply_take", clip_id: "clip-1", take_id: candidateId }]
    })) as { undo_version: number };
    expect(applied.undo_version).toBeGreaterThan(0);
    expect(
      await TimelineSequenceVersion.listForTimeline(sequence.id)
    ).toHaveLength(1);
    expect(
      (await TimelineSequence.findById(sequence.id))!.toDocument().clips[0]
    ).toMatchObject({
      currentAssetId: persistedAssetId,
      activeTakeId: candidateId,
      inPointMs: 0,
      outPointMs: 4000,
      startMs: 1200
    });
    await run.invoke("restore_timeline_version", {
      timeline_id: sequence.id,
      version: applied.undo_version
    });
    expect(
      (await TimelineSequence.findById(sequence.id))!.toDocument()
    ).toEqual(beforeApply);
    vi.restoreAllMocks();
  });

  it("deduplicates CAS retries per operation while allowing two identical requested edits", async () => {
    const context = new ProcessingContext({ jobId: "job-1", userId: "u1" });
    context.registerProvider("fal_ai", new EditProvider());
    vi.spyOn(context, "resolveAssetBytes").mockResolvedValue({
      bytes: new Uint8Array([1]),
      attempts: []
    });
    const dispatch = vi
      .spyOn(context, "runGeneration")
      .mockImplementation(async (request) => ({
        id: request.id!,
        output: new Uint8Array([7]),
        assets: [{ type: "video", asset_id: "result-asset" }],
        receipt: null,
        duration_ms: 1
      }));
    const source = captureMediaEditSourceContext("sequence-1", clip);
    if (!source.ok) throw new Error(source.error);
    const request = createMediaEditRequest({
      sourceContext: source.context,
      instruction: "night",
      provider: "fal_ai",
      model: "edit"
    });
    const generate = timelineMediaEditGenerator(
      createCapabilityRun({ context, gate: UNGATED })
    );
    const first = await generate(request, 0);
    expect(await generate(request, 0)).toEqual(first);
    const second = await generate(request, 1);
    expect(second.generationId).not.toBe(first.generationId);
    expect(dispatch).toHaveBeenCalledTimes(2);
    await expect(
      generate(
        {
          ...request,
          sourceContext: {
            ...request.sourceContext,
            sourceAssetId: "changed-source"
          }
        },
        0
      )
    ).rejects.toThrow(/source clip changed/i);
    expect(dispatch).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
  it("decodes the active video source window and resolves media URIs", async () => {
    registerMediabunnyServer();
    const codec = await getFirstEncodableVideoCodec(
      ["avc", "vp9", "vp8", "av1"],
      { width: 32, height: 32 }
    );
    if (!codec) throw new Error("No software video codec is available");
    const output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget()
    });
    const source = new VideoSampleSource({
      codec,
      bitrate: 1_000_000,
      hardwareAcceleration: "prefer-software"
    });
    output.addVideoTrack(source, { frameRate: 1 });
    await output.start();
    for (const index of [0, 1]) {
      const rgba = new Uint8Array(32 * 32 * 4);
      for (let pixel = 0; pixel < 32 * 32; pixel++) {
        rgba[pixel * 4 + (index === 0 ? 0 : 2)] = 255;
        rgba[pixel * 4 + 3] = 255;
      }
      const sample = new VideoSample(rgba, {
        format: "RGBA",
        codedWidth: 32,
        codedHeight: 32,
        timestamp: index,
        duration: 1
      });
      try {
        await source.add(sample);
      } finally {
        sample.close();
      }
    }
    await output.finalize();
    if (!output.target.buffer) throw new Error("Encoded video is empty");
    const encoded = new Uint8Array(output.target.buffer);
    const context = new ProcessingContext({ jobId: "job-1", userId: "u1" });
    vi.spyOn(context, "resolveAssetBytes").mockResolvedValue({
      bytes: encoded,
      attempts: []
    });
    const video = makeClip({
      ...clip,
      durationMs: 500,
      inPointMs: 1000,
      outPointMs: 1500,
      currentAssetId: "asset://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mp4"
    });
    const frames = await inspectTimelineClipFrames(
      context,
      {
        id: "seq",
        projectId: "default",
        name: "source",
        fps: 30,
        width: 32,
        height: 32,
        durationMs: 1700,
        tracks: [makeTrack({ id: "track-1", type: "video" })],
        clips: [video],
        markers: [],
        createdAt: "",
        updatedAt: ""
      },
      video,
      { timesMs: [1200], width: 32 }
    );
    expect(frames).toMatchObject([
      {
        clipId: "clip-1",
        timelineTimeMs: 1200,
        sourceTimeMs: 1000,
        complete: true
      }
    ]);
    const image = await loadImage(frames[0].dataUrl);
    const canvas = createCanvas(32, 32);
    canvas.getContext("2d").drawImage(image, 0, 0);
    const pixel = canvas.getContext("2d").getImageData(16, 16, 1, 1).data;
    expect(pixel[0]).toBeLessThan(10);
    expect(pixel[2]).toBeGreaterThan(240);
    vi.restoreAllMocks();
  });
});
