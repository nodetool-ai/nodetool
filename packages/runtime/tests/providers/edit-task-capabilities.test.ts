/**
 * The four editing task types that take existing media and hand back more of
 * it: image outpainting, and video upscaling / frame interpolation /
 * outpainting. Covers all three seams they cross — the capability a provider
 * advertises, the `runProviderPrediction` dispatch, and the catalog tagging
 * that decides which models are offered for each.
 */
import { describe, it, expect } from "vitest";
import {
  BaseProvider,
  providerCapabilities
} from "../../src/providers/base-provider.js";
import { ProcessingContext } from "../../src/context.js";
import {
  buildImageModels,
  buildVideoModels,
  inferImageTasks
} from "../../src/providers/manifest-models.js";
import type {
  InterpolateVideoParams,
  Message,
  MessageContent,
  OutpaintImageParams,
  OutpaintVideoParams,
  UpscaleVideoParams
} from "../../src/providers/types.js";

class SilentProvider extends BaseProvider {
  constructor() {
    super("fake");
  }
  async generateMessage(): Promise<Message> {
    return { role: "assistant", content: "" };
  }
  async *generateMessages(): AsyncGenerator<MessageContent> {}
}

class EditProvider extends SilentProvider {
  outpaintImageParams?: OutpaintImageParams;
  upscaleVideoParams?: UpscaleVideoParams;
  interpolateVideoParams?: InterpolateVideoParams;
  outpaintVideoParams?: OutpaintVideoParams;
  lastVideo?: Uint8Array;
  lastImages?: Uint8Array[];

  override async outpaintImage(
    images: Uint8Array[],
    params: OutpaintImageParams
  ): Promise<Uint8Array> {
    this.lastImages = images;
    this.outpaintImageParams = params;
    return new Uint8Array([1]);
  }
  override async upscaleVideo(
    video: Uint8Array,
    params: UpscaleVideoParams
  ): Promise<Uint8Array> {
    this.lastVideo = video;
    this.upscaleVideoParams = params;
    return new Uint8Array([2]);
  }
  override async interpolateVideo(
    video: Uint8Array,
    params: InterpolateVideoParams
  ): Promise<Uint8Array> {
    this.lastVideo = video;
    this.interpolateVideoParams = params;
    return new Uint8Array([3]);
  }
  override async outpaintVideo(
    video: Uint8Array,
    params: OutpaintVideoParams
  ): Promise<Uint8Array> {
    this.lastVideo = video;
    this.outpaintVideoParams = params;
    return new Uint8Array([4]);
  }
}

const NEW_CAPABILITIES = [
  "outpaint_image",
  "upscale_video",
  "interpolate_video",
  "outpaint_video"
] as const;

describe("editing task capabilities", () => {
  it("are advertised only by a provider that implements them", () => {
    const silent = providerCapabilities(new SilentProvider());
    const editing = providerCapabilities(new EditProvider());
    for (const capability of NEW_CAPABILITIES) {
      expect(silent).not.toContain(capability);
      expect(editing).toContain(capability);
    }
  });

  it("refuse the call on a provider that does not implement them", async () => {
    const provider = new SilentProvider();
    await expect(
      provider.outpaintImage([], { model: { id: "m", name: "m", provider: "fake" } })
    ).rejects.toThrow("does not support outpaintImage");
    await expect(
      provider.upscaleVideo(new Uint8Array(), {
        model: { id: "m", name: "m", provider: "fake" }
      })
    ).rejects.toThrow("does not support upscaleVideo");
    await expect(
      provider.interpolateVideo(new Uint8Array(), {
        model: { id: "m", name: "m", provider: "fake" }
      })
    ).rejects.toThrow("does not support interpolateVideo");
    await expect(
      provider.outpaintVideo(new Uint8Array(), {
        model: { id: "m", name: "m", provider: "fake" }
      })
    ).rejects.toThrow("does not support outpaintVideo");
  });
});

describe("editing task dispatch", () => {
  const contextWith = (provider: EditProvider) => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("fake", provider);
    return ctx;
  };

  it("routes outpaint_image with its padding and source images", async () => {
    const provider = new EditProvider();
    const result = await contextWith(provider).runProviderPrediction({
      provider: "fake",
      capability: "outpaint_image",
      model: "m",
      params: {
        images: [new Uint8Array([9])],
        prompt: "more beach",
        padding: { left: 128, right: 64 },
        aspect_ratio: "16:9"
      }
    });
    expect(result).toEqual(new Uint8Array([1]));
    expect(provider.lastImages).toEqual([new Uint8Array([9])]);
    expect(provider.outpaintImageParams?.prompt).toBe("more beach");
    expect(provider.outpaintImageParams?.aspectRatio).toBe("16:9");
    expect(provider.outpaintImageParams?.padding).toEqual({
      left: 128,
      right: 64,
      top: undefined,
      bottom: undefined
    });
  });

  it("leaves padding unset when the caller names no side", async () => {
    const provider = new EditProvider();
    await contextWith(provider).runProviderPrediction({
      provider: "fake",
      capability: "outpaint_image",
      model: "m",
      params: { images: [new Uint8Array([9])], padding: { left: "wide" } }
    });
    expect(provider.outpaintImageParams?.padding).toBeUndefined();
  });

  it("routes upscale_video with both size spellings", async () => {
    const provider = new EditProvider();
    const result = await contextWith(provider).runProviderPrediction({
      provider: "fake",
      capability: "upscale_video",
      model: "m",
      params: {
        video: new Uint8Array([7]),
        scale: 4,
        target_resolution: "2160p",
        creativity: 0.5
      }
    });
    expect(result).toEqual(new Uint8Array([2]));
    expect(provider.lastVideo).toEqual(new Uint8Array([7]));
    expect(provider.upscaleVideoParams?.scale).toBe(4);
    expect(provider.upscaleVideoParams?.targetResolution).toBe("2160p");
    expect(provider.upscaleVideoParams?.creativity).toBe(0.5);
  });

  it("routes interpolate_video with a target frame rate", async () => {
    const provider = new EditProvider();
    const result = await contextWith(provider).runProviderPrediction({
      provider: "fake",
      capability: "interpolate_video",
      model: "m",
      params: { video: new Uint8Array([7]), target_fps: 60, factor: 2 }
    });
    expect(result).toEqual(new Uint8Array([3]));
    expect(provider.interpolateVideoParams?.targetFps).toBe(60);
    expect(provider.interpolateVideoParams?.factor).toBe(2);
  });

  it("routes outpaint_video with its padding and expand ratio", async () => {
    const provider = new EditProvider();
    const result = await contextWith(provider).runProviderPrediction({
      provider: "fake",
      capability: "outpaint_video",
      model: "m",
      params: {
        video: new Uint8Array([7]),
        prompt: "wider shot",
        padding: { top: 0, bottom: 200 },
        expand_ratio: 0.25,
        aspect_ratio: "21:9"
      }
    });
    expect(result).toEqual(new Uint8Array([4]));
    expect(provider.outpaintVideoParams?.prompt).toBe("wider shot");
    expect(provider.outpaintVideoParams?.expandRatio).toBe(0.25);
    expect(provider.outpaintVideoParams?.padding).toEqual({
      left: undefined,
      right: undefined,
      top: 0,
      bottom: 200
    });
  });
});

describe("editing task model tagging", () => {
  const videoEntry = (endpointId: string, withVideoInput = true) => ({
    endpointId,
    className: endpointId,
    outputType: "video",
    inputFields: withVideoInput
      ? [{ name: "video_url", propType: "video", required: true }]
      : [{ name: "task_id", propType: "str", required: true }]
  });

  it("tags each specialized video transform with its own task", () => {
    const models = buildVideoModels(
      [
        videoEntry("fal-ai/seedvr/upscale/video"),
        videoEntry("fal-ai/amt-interpolation"),
        videoEntry("fal-ai/wan-vace-14b/outpainting")
      ],
      "fal_ai"
    );
    expect(models.map((m) => m.supportedTasks)).toEqual([
      ["upscale_video"],
      ["interpolate_video"],
      ["outpaint_video"]
    ]);
  });

  it("drops a transform task from a model that declares no video input", () => {
    // `grok-imagine/upscale` upscales a previous task by id. Offered as an
    // upscale_video model it fails at call time with nothing to work on.
    expect(
      buildVideoModels([videoEntry("grok-imagine/upscale", false)], "kie")
    ).toEqual([]);
  });

  it("keeps an outpaint image endpoint out of the generation pickers", () => {
    expect(inferImageTasks("Outpaint", "fal-ai/image-apps-v2/outpaint")).toEqual(
      ["outpaint"]
    );
    const [model] = buildImageModels(
      [
        {
          endpointId: "fal-ai/flux-2-pro/outpaint",
          className: "Flux2ProOutpaint",
          outputType: "image",
          inputFields: [{ name: "image_url", propType: "image", required: true }]
        }
      ],
      "fal_ai"
    );
    expect(model.supportedTasks).toEqual(["outpaint"]);
  });

  it("adds the inpainting tag without removing the editing tasks", () => {
    expect(inferImageTasks("Lora Inpaint", "fal-ai/lora/inpaint")).toEqual([
      "text_to_image",
      "image_to_image",
      "inpainting"
    ]);
    expect(inferImageTasks("Flux Schnell", "fal-ai/flux/schnell")).toEqual([
      "text_to_image",
      "image_to_image"
    ]);
  });
});
