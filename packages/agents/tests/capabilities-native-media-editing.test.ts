import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BaseProvider,
  ProcessingContext,
  type Message,
  type AudioToAudioModel,
  type EncodedAudioResult,
  type ProviderStreamItem,
  type VideoModel
} from "@nodetool-ai/runtime";
import { TimelineSequence, initTestDb } from "@nodetool-ai/models";
import { makeClip } from "@nodetool-ai/timeline";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";

class NativeMediaProvider extends BaseProvider {
  constructor() {
    super("fake");
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [
      {
        id: "outpaint-model",
        name: "Outpaint model",
        provider: "fake",
        supportedTasks: ["outpaint_video"]
      },
      {
        id: "upscale-model",
        name: "Upscale model",
        provider: "fake",
        supportedTasks: ["upscale_video"]
      },
      {
        id: "sound-model",
        name: "Sound model",
        provider: "fake",
        supportedTasks: ["video_to_audio"]
      },
      {
        id: "lip-sync-model",
        name: "Lip-sync model",
        provider: "fake",
        supportedTasks: ["lip_sync"]
      }
    ];
  }

  override async getAvailableAudioToAudioModels(): Promise<
    AudioToAudioModel[]
  > {
    return [
      {
        id: "voice-model",
        name: "Voice model",
        provider: "fake",
        supportedTasks: ["audio_to_audio"]
      }
    ];
  }

  override async outpaintVideo(): Promise<Uint8Array> {
    return new Uint8Array([1]);
  }

  override async upscaleVideo(): Promise<Uint8Array> {
    return new Uint8Array([2]);
  }

  override async videoToAudio(): Promise<EncodedAudioResult> {
    return { data: new Uint8Array([3]), mimeType: "audio/mpeg" };
  }

  override async audioToAudio(): Promise<EncodedAudioResult> {
    return { data: new Uint8Array([4]), mimeType: "audio/mpeg" };
  }

  override async lipSync(): Promise<Uint8Array> {
    return new Uint8Array([5]);
  }

  async generateMessage(): Promise<Message> {
    throw new Error("unused");
  }

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("unused");
  }
}

function sourceDocument(): string {
  const clip = makeClip({
    id: "clip-video",
    trackId: "track-video",
    name: "Source shot",
    startMs: 1000,
    durationMs: 4000,
    inPointMs: 40000,
    outPointMs: 44000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "source-video"
  });
  return JSON.stringify({
    tracks: [
      {
        id: "track-video",
        name: "Video",
        type: "video",
        index: 0,
        visible: true,
        locked: false
      },
      {
        id: "track-audio",
        name: "Audio",
        type: "audio",
        index: 1,
        visible: true,
        locked: false
      }
    ],
    clips: [
      clip,
      makeClip({
        id: "clip-audio",
        trackId: "track-audio",
        name: "Recorded dialogue",
        startMs: 1000,
        durationMs: 3000,
        mediaType: "audio",
        sourceType: "imported",
        status: "generated",
        currentAssetId: "recorded-audio"
      })
    ],
    markers: []
  });
}

async function makeTimeline(): Promise<TimelineSequence> {
  return TimelineSequence.create<TimelineSequence>({
    user_id: "u1",
    project_id: "default",
    name: "Native media test",
    fps: 30,
    width: 1920,
    height: 1080,
    duration_ms: 5000,
    document: sourceDocument()
  });
}

function nativeContext() {
  const context = new ProcessingContext({ jobId: "job-1", userId: "u1" });
  context.registerProvider("fake", new NativeMediaProvider());
  vi.spyOn(context, "resolveAssetBytes").mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]),
    attempts: []
  });
  const dispatch = vi.spyOn(context, "runGeneration").mockImplementation(
    async (request) => {
      const audio =
        request.capability === "video_to_audio" ||
        request.capability === "audio_to_audio";
      const assetId = `candidate-${request.id ?? "generation"}`;
      return {
        id: request.id ?? "generation",
        output: new Uint8Array([4]),
        assets: [
          {
            type: audio ? "audio" : "video",
            uri: `asset://${assetId}`,
            asset_id: assetId
          }
        ],
        receipt: null,
        duration_ms: 1
      };
    }
  );
  return { context, dispatch };
}

function runNativeCapability(
  context: ProcessingContext,
  name: string
) {
  return toolForCapabilityName(
    name,
    () => createCapabilityRun({ context, gate: UNGATED })
  );
}

describe("native timeline media capabilities", () => {
  beforeEach(() => initTestDb());

  it("exposes expand_frame as an inactive spatial candidate", async () => {
    const timeline = await makeTimeline();
    const context = new ProcessingContext({ jobId: "job-1", userId: "u1" });
    context.registerProvider("fake", new NativeMediaProvider());
    vi.spyOn(context, "resolveAssetBytes").mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      attempts: []
    });
    const dispatch = vi.spyOn(context, "runGeneration").mockResolvedValue({
      id: "generation-expand",
      output: new Uint8Array([4]),
      assets: [
        {
          type: "video",
          uri: "asset://candidate-video.mp4",
          asset_id: "candidate-video"
        }
      ],
      receipt: null,
      duration_ms: 1
    });
    const before = timeline.toDocument();
    const result = (await toolForCapabilityName(
      "expand_frame",
      () => createCapabilityRun({ context, gate: UNGATED })
    ).process(context, {
      timeline_id: timeline.id,
      clip_id: "clip-video",
      provider: "fake",
      model: "outpaint-model",
      request_id: "request-expand",
      target_aspect_ratio: "9:16",
      padding: { top: 200, bottom: 200 }
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      accepted: false,
      timeline_mutated: false,
      generation_id: "generation-expand",
      clip_id: "clip-video"
    });
    expect(result.candidate).toBeDefined();
    expect(result.provenance).toMatchObject({
      request_id: "request-expand",
      provider: "fake",
      model: "outpaint-model",
      source_context: {
        sequenceId: timeline.id,
        clipId: "clip-video",
        sourceAssetId: "source-video",
        sourceStartMs: 40000,
        sourceEndMs: 44000,
        timelineStartMs: 1000,
        timelineDurationMs: 4000,
        speedMultiplier: 1
      }
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "outpaint_video",
        provider: "fake",
        model: "outpaint-model",
        params: expect.objectContaining({
          video: new Uint8Array([1, 2, 3]),
          aspect_ratio: "9:16"
        })
      })
    );
    expect(timeline.toDocument()).toEqual(before);
  });

  it("exposes upscale_video as a candidate without changing framing", async () => {
    const timeline = await makeTimeline();
    const { context, dispatch } = nativeContext();
    const before = timeline.toDocument();
    const result = (await runNativeCapability(context, "upscale_video").process(
      context,
      {
        timeline_id: timeline.id,
        clip_id: "clip-video",
        provider: "fake",
        model: "upscale-model",
        request_id: "request-upscale",
        source_asset_id: "source-video",
        target_resolution: "1080p",
        scale: 2,
        creativity: 0.25,
        seed: 7
      }
    )) as Record<string, unknown>;

    expect(result).toMatchObject({
      action: "upscale",
      accepted: false,
      candidate_only: true,
      timeline_mutated: false,
      generation_id: "request-upscale"
    });
    expect(result.provenance).toMatchObject({
      request_id: "request-upscale",
      model_task: "upscale_video",
      source_context: {
        sourceAssetId: "source-video",
        sourceStartMs: 40000,
        sourceEndMs: 44000
      }
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "upscale_video",
        params: expect.objectContaining({
          video: new Uint8Array([1, 2, 3]),
          target_resolution: "1080p",
          scale: 2,
          creativity: 0.25,
          seed: 7
        })
      })
    );
    expect(timeline.toDocument()).toEqual(before);
  });

  it("exposes video_to_audio with the selected window and scene context", async () => {
    const timeline = await makeTimeline();
    const { context, dispatch } = nativeContext();
    const before = timeline.toDocument();
    const result = (await runNativeCapability(context, "video_to_audio").process(
      context,
      {
        timeline_id: timeline.id,
        clip_id: "clip-video",
        provider: "fake",
        model: "sound-model",
        request_id: "request-sound",
        source_asset_id: "source-video",
        source_duration_ms: 60000,
        scene_context: "A train brakes in a quiet station with metal clatter."
      }
    )) as Record<string, unknown>;

    expect(result).toMatchObject({
      action: "video_to_audio",
      accepted: false,
      candidate_only: true,
      timeline_mutated: false,
      generation_id: "request-sound",
      candidate: {
        media_type: "audio",
        disposition: "candidate",
        alignment: { timeline_start_ms: 1000, duration_ms: 4000 }
      },
      provenance: {
        model_task: "video_to_audio",
        source_context: {
          sourceAssetId: "source-video",
          sourceStartMs: 40000,
          sourceEndMs: 44000
        },
        scene_context: "A train brakes in a quiet station with metal clatter."
      }
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "video_to_audio",
        params: expect.objectContaining({
          video: new Uint8Array([1, 2, 3]),
          source: {
            assetId: "source-video",
            durationSeconds: 60,
            startSeconds: 40,
            endSeconds: 44
          },
          scene_context: "A train brakes in a quiet station with metal clatter."
        })
      })
    );
    expect(timeline.toDocument()).toEqual(before);
  });

  it("exposes recorded_voice_replacement with an explicit speech source", async () => {
    const timeline = await makeTimeline();
    const { context, dispatch } = nativeContext();
    const before = timeline.toDocument();
    const result = (await runNativeCapability(
      context,
      "recorded_voice_replacement"
    ).process(context, {
      timeline_id: timeline.id,
      clip_id: "clip-audio",
      provider: "fake",
      model: "voice-model",
      request_id: "request-voice",
      source: { kind: "clean_speech", asset_id: "clean-speech" },
      target: { kind: "voice", voice_id: "voice-two" },
      target_current_asset_id: "recorded-audio",
      supported_operations: ["recorded_voice_replacement"]
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      action: "recorded_voice_replacement",
      accepted: false,
      candidate_only: true,
      timeline_mutated: false,
      generation_id: "request-voice",
      candidate: {
        media_type: "audio",
        disposition: "candidate",
        source_asset_id: "clean-speech",
        target_voice_id: "voice-two"
      },
      provenance: {
        operation: "recorded_voice_replacement",
        resultDisposition: "candidate",
        request: {
          source: { kind: "clean_speech", assetId: "clean-speech" },
          target: { kind: "voice", voiceId: "voice-two" }
        },
        target_context: {
          sequenceId: timeline.id,
          clipId: "clip-audio",
          sourceAssetId: "recorded-audio"
        }
      }
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "audio_to_audio",
        params: expect.objectContaining({
          audio: new Uint8Array([1, 2, 3]),
          voice: "voice-two",
          source_asset_id: "clean-speech",
          operation: "recorded_voice_replacement"
        })
      })
    );
    expect(timeline.toDocument()).toEqual(before);
  });

  it("exposes lip_sync only for accepted replacement audio", async () => {
    const timeline = await makeTimeline();
    const { context, dispatch } = nativeContext();
    const before = timeline.toDocument();
    const result = (await runNativeCapability(context, "lip_sync").process(
      context,
      {
        timeline_id: timeline.id,
        clip_id: "clip-video",
        provider: "fake",
        model: "lip-sync-model",
        request_id: "request-lip-sync",
        source_asset_id: "source-video",
        replacement_audio: {
          asset_id: "replacement-audio",
          status: "accepted",
          provenance: {
            request_id: "request-voice",
            operation: "recorded_voice_replacement"
          }
        }
      }
    )) as Record<string, unknown>;

    expect(result).toMatchObject({
      action: "lip_sync",
      accepted: false,
      candidate_only: true,
      timeline_mutated: false,
      generation_id: "request-lip-sync",
      candidate: {
        media_type: "video",
        disposition: "candidate",
        source_asset_id: "source-video",
        replacement_audio_asset_id: "replacement-audio"
      },
      provenance: {
        operation: "lip_sync",
        model_task: "lip_sync",
        source_context: {
          sourceAssetId: "source-video",
          sourceStartMs: 40000,
          sourceEndMs: 44000
        },
        request: {
          replacementAudio: {
            assetId: "replacement-audio",
            status: "accepted",
            provenance: {
              requestId: "request-voice",
              operation: "recorded_voice_replacement"
            }
          }
        }
      }
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "lip_sync",
        params: {
          video: new Uint8Array([1, 2, 3]),
          audio: new Uint8Array([1, 2, 3])
        }
      })
    );
    expect(timeline.toDocument()).toEqual(before);
  });

  it("refuses stale, unsupported, and unaccepted inputs before dispatch", async () => {
    const staleTimeline = await makeTimeline();
    const stale = nativeContext();
    const staleResult = (await runNativeCapability(
      stale.context,
      "expand_frame"
    ).process(stale.context, {
      timeline_id: staleTimeline.id,
      clip_id: "clip-video",
      provider: "fake",
      model: "outpaint-model",
      target_aspect_ratio: "9:16",
      padding: { top: 10 },
      source_asset_id: "old-video"
    })) as Record<string, unknown>;
    expect(staleResult).toMatchObject({ code: "source_stale" });
    expect(stale.dispatch).not.toHaveBeenCalled();

    const unsupportedTimeline = await makeTimeline();
    const unsupported = nativeContext();
    const unsupportedResult = (await runNativeCapability(
      unsupported.context,
      "upscale_video"
    ).process(unsupported.context, {
      timeline_id: unsupportedTimeline.id,
      clip_id: "clip-video",
      provider: "fake",
      model: "outpaint-model",
      target_resolution: "1080p"
    })) as Record<string, unknown>;
    expect(unsupportedResult).toMatchObject({
      code: "unsupported_model_task"
    });
    expect(unsupported.dispatch).not.toHaveBeenCalled();

    const undeclaredOperationTimeline = await makeTimeline();
    const undeclaredOperation = nativeContext();
    const undeclaredOperationResult = (await runNativeCapability(
      undeclaredOperation.context,
      "recorded_voice_replacement"
    ).process(undeclaredOperation.context, {
      timeline_id: undeclaredOperationTimeline.id,
      clip_id: "clip-audio",
      provider: "fake",
      model: "voice-model",
      source: { kind: "clean_speech", asset_id: "clean-speech" },
      target: { kind: "voice", voice_id: "voice-two" }
    })) as Record<string, unknown>;
    expect(undeclaredOperationResult).toMatchObject({
      code: "unsupported_model_operation"
    });
    expect(undeclaredOperation.dispatch).not.toHaveBeenCalled();

    const unacceptedTimeline = await makeTimeline();
    const unaccepted = nativeContext();
    const unacceptedResult = (await runNativeCapability(
      unaccepted.context,
      "lip_sync"
    ).process(unaccepted.context, {
      timeline_id: unacceptedTimeline.id,
      clip_id: "clip-video",
      provider: "fake",
      model: "lip-sync-model",
      replacement_audio: {
        asset_id: "replacement-audio",
        status: "candidate",
        provenance: {
          request_id: "request-voice",
          operation: "recorded_voice_replacement"
        }
      }
    })) as Record<string, unknown>;
    expect(unacceptedResult).toMatchObject({
      code: "replacement_audio_not_accepted"
    });
    expect(unaccepted.dispatch).not.toHaveBeenCalled();
  });

  it("refuses a recorded voice target whose current asset is stale", async () => {
    const timeline = await makeTimeline();
    const { context, dispatch } = nativeContext();
    const result = (await runNativeCapability(
      context,
      "recorded_voice_replacement"
    ).process(context, {
      timeline_id: timeline.id,
      clip_id: "clip-audio",
      provider: "fake",
      model: "voice-model",
      source: { kind: "isolated_speech", asset_id: "isolated-speech" },
      target: { kind: "reference_audio", asset_id: "voice-reference" },
      target_current_asset_id: "old-recording"
    })) as Record<string, unknown>;

    expect(result).toMatchObject({ code: "source_stale" });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
