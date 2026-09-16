import { describe, expect, it, vi } from "vitest";
import { BaseProvider } from "../../src/providers/base-provider.js";
import {
  requestVideoToAudio,
  VideoToAudioRequest,
  type VideoToAudioParams
} from "../../src/providers/video-to-audio.js";
import type {
  EncodedAudioResult,
  Message,
  MessageContent,
  VideoModel
} from "../../src/providers/types.js";

class UnsupportedProvider extends BaseProvider {
  constructor() {
    super("fake");
  }
  async generateMessage(): Promise<Message> {
    return { role: "assistant", content: "" };
  }
  async *generateMessages(): AsyncGenerator<MessageContent> {}
}

class VideoProvider extends UnsupportedProvider {
  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [];
  }
}

const submitted = new Error("Reached the provider submission boundary");
class RecordingProvider extends UnsupportedProvider {
  models: VideoModel[] = [{
    id: "sound-model", name: "Sound", provider: "fake",
    supportedTasks: ["video_to_audio"]
  }];

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return this.models;
  }
  readonly submit = vi
    .fn<
      (
        video: Uint8Array,
        params: VideoToAudioParams
      ) => Promise<EncodedAudioResult>
    >()
    .mockRejectedValue(submitted);

  override async videoToAudio(
    video: Uint8Array,
    params: VideoToAudioParams
  ): Promise<EncodedAudioResult> {
    return this.submit(video, params);
  }

  // Capture failures without writing provider request logs during these tests.
  override recordCallFailure = vi.fn();
}

const source = {
  assetId: "source-video",
  durationSeconds: 60,
  startSeconds: 40,
  endSeconds: 44
};
const request = {
  task: "video_to_audio",
  model: {
    id: "sound-model",
    provider: "fake",
    supportedTasks: ["video_to_audio"]
  },
  source,
  sceneContext: "A door closes, then footsteps cross a quiet room."
};
const video = new Uint8Array([1, 2, 3]);

describe("video_to_audio foundation", () => {
  it("forwards catalog capabilities and refuses a catalog lookup failure", async () => {
    const provider = new RecordingProvider();
    await expect(requestVideoToAudio(provider, video, {
      ...request, model: { ...request.model, supportedTasks: ["video_to_audio", "invented"] }
    })).rejects.toBe(submitted);
    expect(provider.submit).toHaveBeenCalledExactlyOnceWith(video, request);
    provider.submit.mockClear();
    const error = new Error("Catalog unavailable");
    vi.spyOn(provider, "getAvailableVideoModels").mockRejectedValue(error);
    await expect(requestVideoToAudio(provider, video, request)).rejects.toBe(error);
    expect(provider.submit).not.toHaveBeenCalled();
  });

  it("honors cancellation while awaiting the catalog", async () => {
    const provider = new RecordingProvider();
    const controller = new AbortController();
    vi.spyOn(provider, "getAvailableVideoModels").mockImplementation(async () => {
      controller.abort();
      return provider.models;
    });
    await expect(requestVideoToAudio(provider, video, request, { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(provider.submit).not.toHaveBeenCalled();
  });

  it.each([
    [],
    [{ id: "other", name: "Other", provider: "fake", supportedTasks: ["video_to_audio"] }],
    [{ id: "sound-model", name: "Sound", provider: "other", supportedTasks: ["video_to_audio"] }],
    [{ id: "sound-model", name: "Sound", provider: "fake", supportedTasks: ["text_to_video"] }],
    [{ id: "sound-model", name: "Sound", provider: "fake" }]
  ])("rejects caller-claimed support absent from the provider catalog: %j", async (...models) => {
    const provider = new RecordingProvider();
    provider.models = models;
    await expect(requestVideoToAudio(provider, video, request)).rejects.toThrow(/Model.*video_to_audio/);
    expect(provider.submit).not.toHaveBeenCalled();
  });

  it("advertises only an overridden method, including after failure wrapping", () => {
    expect(new UnsupportedProvider().getCapabilities()).not.toContain(
      "video_to_audio"
    );
    expect(new VideoProvider().getCapabilities()).not.toContain(
      "video_to_audio"
    );
    expect(new RecordingProvider().getCapabilities()).toContain(
      "video_to_audio"
    );
  });

  it("rejects the default method without fabricating an audio result", async () => {
    const provider = new UnsupportedProvider();
    await expect(
      provider.videoToAudio(video, VideoToAudioRequest.parse(request))
    ).rejects.toThrow("does not support videoToAudio");
    await expect(requestVideoToAudio(provider, video, request)).rejects.toThrow(
      "does not support video_to_audio"
    );
  });

  it("forwards captured source seconds 40–44, scene context, and cancellation", async () => {
    const provider = new RecordingProvider();
    const controller = new AbortController();
    const input = structuredClone(request);
    const pending = requestVideoToAudio(provider, video, input, {
      signal: controller.signal
    });
    input.source.startSeconds = 0;
    input.sceneContext = "Changed after submission";
    await expect(pending).rejects.toBe(submitted);
    expect(provider.submit).toHaveBeenCalledExactlyOnceWith(video, {
      ...request,
      signal: controller.signal
    });
    expect(provider.recordCallFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "videoToAudio",
        model: "sound-model",
        error: submitted
      })
    );
  });

  it.each([
    ["missing request", undefined],
    ["missing source", { ...request, source: undefined }],
    ["blank asset", { ...request, source: { ...source, assetId: "  " } }],
    ["missing window", { ...request, source: { assetId: "source-video" } }],
    ["negative start", { ...request, source: { ...source, startSeconds: -1 } }],
    ["empty window", { ...request, source: { ...source, endSeconds: 40 } }],
    ["reversed window", { ...request, source: { ...source, endSeconds: 39 } }],
    ["past asset end", { ...request, source: { ...source, endSeconds: 61 } }],
    [
      "nonfinite start",
      { ...request, source: { ...source, startSeconds: NaN } }
    ],
    [
      "nonfinite end",
      { ...request, source: { ...source, endSeconds: Infinity } }
    ],
    [
      "nonfinite duration",
      { ...request, source: { ...source, durationSeconds: Infinity } }
    ],
    ["missing scene", { ...request, sceneContext: undefined }],
    ["blank scene", { ...request, sceneContext: " \n " }],
    ["missing model", { ...request, model: undefined }],
    ["blank model", { ...request, model: { ...request.model, id: " " } }],
    [
      "implicit model support",
      { ...request, model: { id: "sound-model", provider: "fake" } }
    ],
    [
      "music model",
      {
        ...request,
        model: { ...request.model, supportedTasks: ["text_to_music"] }
      }
    ],
    ["speech task", { ...request, task: "text_to_speech" }],
    ["audio transform task", { ...request, task: "audio_to_audio" }],
    ["unexpected input", { ...request, soundtrackReplacement: true }]
  ])("refuses %s before submission", async (_name, input) => {
    const provider = new RecordingProvider();
    await expect(requestVideoToAudio(provider, video, input)).rejects.toThrow();
    expect(provider.submit).not.toHaveBeenCalled();
  });

  it("accepts a window that starts at zero and ends at the asset boundary", () => {
    expect(
      VideoToAudioRequest.parse({
        ...request,
        source: { ...source, startSeconds: 0, endSeconds: 60 }
      }).source
    ).toEqual({ ...source, startSeconds: 0, endSeconds: 60 });
  });

  it("submits without cancellation options and propagates provider failure", async () => {
    const provider = new RecordingProvider();
    await expect(requestVideoToAudio(provider, video, request)).rejects.toBe(
      submitted
    );
    expect(provider.submit).toHaveBeenCalledExactlyOnceWith(video, request);
  });

  it("rejects empty video, a different provider, and cancellation before submission", async () => {
    const provider = new RecordingProvider();
    await expect(
      requestVideoToAudio(provider, new Uint8Array(), request)
    ).rejects.toThrow("nonempty source video bytes");
    await expect(
      requestVideoToAudio(provider, video, {
        ...request,
        model: { ...request.model, provider: "other" }
      })
    ).rejects.toThrow("different provider");
    const controller = new AbortController();
    controller.abort();
    await expect(
      requestVideoToAudio(provider, video, request, {
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(provider.submit).not.toHaveBeenCalled();
  });
});
