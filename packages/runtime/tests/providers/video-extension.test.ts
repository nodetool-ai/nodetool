import { describe, expect, it, vi } from "vitest";
import { FalProvider } from "../../src/providers/fal-provider.js";
import {
  buildVideoModels,
  inferVideoTasks
} from "../../src/providers/manifest-models.js";
import type { ExtendVideoParams } from "../../src/providers/types.js";

const MODEL = "fal-ai/ltx-2.3/extend-video";

describe("genuine video extension", () => {
  it("advertises extension separately from video editing", async () => {
    const provider = new FalProvider();
    expect(provider.getCapabilities()).toContain("extend_video");
    const models = await provider.getAvailableVideoModels();
    expect(models.find((model) => model.id === MODEL)?.supportedTasks).toEqual([
      "extend_video",
      "extend_video_end",
      "extend_video_start"
    ]);
    expect(inferVideoTasks("Edit video", "fal-ai/wan/video-to-video")).toEqual([
      "video_to_video"
    ]);
  });

  it("keeps image continuation out and marks implicit or explicit end-only extensions", () => {
    const models = buildVideoModels(
      [
        {
          endpointId: "image/extend",
          outputType: "video",
          inputFields: [{ name: "image", propType: "image", required: true }]
        },
        {
          endpointId: "video/extend",
          outputType: "video",
          inputFields: [
            { name: "video", propType: "video", required: true },
            { name: "duration", propType: "float" }
          ]
        },
        {
          endpointId: "video/extend-end-only",
          outputType: "video",
          inputFields: [
            { name: "video", propType: "video", required: true },
            { name: "duration", propType: "float" },
            { name: "mode", propType: "str", enumValues: ["end"] }
          ]
        }
      ],
      "fal_ai"
    );
    expect(models).toEqual([
      expect.objectContaining({
        id: "video/extend",
        supportedTasks: ["extend_video", "extend_video_end"]
      }),
      expect.objectContaining({
        id: "video/extend-end-only",
        supportedTasks: ["extend_video", "extend_video_end"]
      })
    ]);
  });

  it.each(["start", "end"] as const)(
    "sends %s mode and added seconds to the extension endpoint",
    async (mode) => {
      const provider = new FalProvider();
      // Capture at the provider's upload/dispatch boundary, keeping its real
      // manifest-driven argument builder and model eligibility checks.
      const transport = provider as unknown as {
        upload(bytes: Uint8Array, mime: string): Promise<string>;
        runVideoEndpoint(
          id: string,
          input: Record<string, unknown>
        ): Promise<Uint8Array>;
      };
      const upload = vi
        .spyOn(transport, "upload")
        .mockResolvedValue("https://fal.media/source.mp4");
      const dispatch = vi
        .spyOn(transport, "runVideoEndpoint")
        .mockResolvedValue(new Uint8Array([1]));
      const video = new Uint8Array([9]);
      await provider.extendVideo(video, {
        model: { id: MODEL, provider: "fal_ai", name: MODEL },
        prompt: "Continue the pan",
        mode,
        durationSeconds: 3
      });
      expect(upload).toHaveBeenCalledWith(video, "video/mp4");
      expect(dispatch).toHaveBeenCalledWith(MODEL, {
        video_url: "https://fal.media/source.mp4",
        prompt: "Continue the pan",
        mode,
        duration: 3
      });
    }
  );

  it("formats Veo extension duration using the manifest's seconds string", async () => {
    const modelId = "fal-ai/veo3.1/fast/extend-video";
    const provider = new FalProvider();
    const transport = provider as unknown as {
      upload(bytes: Uint8Array, mime: string): Promise<string>;
      runVideoEndpoint(
        id: string,
        input: Record<string, unknown>
      ): Promise<Uint8Array>;
    };
    vi.spyOn(transport, "upload").mockResolvedValue(
      "https://fal.media/source.mp4"
    );
    const dispatch = vi
      .spyOn(transport, "runVideoEndpoint")
      .mockResolvedValue(new Uint8Array([1]));

    await provider.extendVideo(new Uint8Array([9]), {
      model: { id: modelId, provider: "fal_ai", name: modelId },
      prompt: "Continue the pan",
      mode: "end",
      durationSeconds: 7
    });

    expect(dispatch).toHaveBeenCalledWith(modelId, {
      video_url: "https://fal.media/source.mp4",
      prompt: "Continue the pan",
      duration: "7s"
    });
  });

  it("extends H3 Max from the end only, within its 5 to 15 second range", async () => {
    const modelId = "minimax/h3-max/extend-video";
    const provider = new FalProvider();
    const models = await provider.getAvailableVideoModels();
    expect(
      models.find((model) => model.id === modelId)?.supportedTasks
    ).toEqual(["extend_video", "extend_video_end"]);

    const transport = provider as unknown as {
      upload(bytes: Uint8Array, mime: string): Promise<string>;
      runVideoEndpoint(
        id: string,
        input: Record<string, unknown>
      ): Promise<Uint8Array>;
    };
    const upload = vi
      .spyOn(transport, "upload")
      .mockResolvedValue("https://fal.media/source.mp4");
    const dispatch = vi
      .spyOn(transport, "runVideoEndpoint")
      .mockResolvedValue(new Uint8Array([1]));
    const params: ExtendVideoParams = {
      model: { id: modelId, provider: "fal_ai", name: modelId },
      prompt: "The panda looks up",
      mode: "end",
      durationSeconds: 8
    };

    for (const rejected of [
      { mode: "start" as const },
      { durationSeconds: 4 },
      { durationSeconds: 16 }
    ]) {
      await expect(
        provider.extendVideo(new Uint8Array([9]), { ...params, ...rejected })
      ).rejects.toThrow();
    }
    expect(upload).not.toHaveBeenCalled();

    await provider.extendVideo(new Uint8Array([9]), params);
    expect(dispatch).toHaveBeenCalledWith(modelId, {
      video_url: "https://fal.media/source.mp4",
      prompt: "The panda looks up",
      duration: 8
    });
  });

  it("refuses ordinary editors and invalid extension durations before upload", async () => {
    const provider = new FalProvider();
    const upload = vi.spyOn(
      provider as unknown as {
        upload(bytes: Uint8Array, mime: string): Promise<string>;
      },
      "upload"
    );
    const params: ExtendVideoParams = {
      model: { id: MODEL, name: MODEL, provider: "fal_ai" },
      mode: "end",
      durationSeconds: 3,
      prompt: "Continue"
    };
    for (const durationSeconds of [0, 1, 21, NaN, Infinity]) {
      await expect(
        provider.extendVideo(new Uint8Array([1]), {
          ...params,
          durationSeconds
        })
      ).rejects.toThrow(/duration/);
    }
    await expect(
      provider.extendVideo(new Uint8Array([1]), {
        ...params,
        model: { ...params.model, id: "fal-ai/wan/v2.2-a14b/video-to-video" }
      })
    ).rejects.toThrow(/extend_video/);
    expect(upload).not.toHaveBeenCalled();
  });
});
