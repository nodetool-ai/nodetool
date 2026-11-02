import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCloudProvider } from "@nodetool-ai/protocol";
import { getRegisteredProvider } from "../../src/providers/provider-registry.js";
import "../../src/providers/index.js";
import {
  Wan2GPProvider,
  wan2gpBaseSettings,
  wan2gpResolution
} from "../../src/providers/wan2gp-provider.js";
import { FakeWan2GP, wan2gpFixture, wan2gpFixtureBytes } from "./wan2gp-fake-server.js";

let fake: FakeWan2GP;
let provider: Wan2GPProvider;
const png = wan2gpFixtureBytes("tiny.png");
const videoModel = { id: "ti2v_2_2_fastwan", name: "FastWan", provider: "wangp" as const };
const imageModel = { id: "flux", name: "Flux", provider: "wangp" as const };

beforeEach(async () => {
  fake = await new FakeWan2GP().start();
  fake.jobs = [wan2gpFixture("job_done")];
  provider = new Wan2GPProvider({ WAN2GP_MCP_URL: fake.url });
});

afterEach(async () => {
  await fake.stop();
});

function generated(): Record<string, unknown> {
  const call = fake.calls.find((entry) => entry.name === "wangp_generate");
  return call?.args.settings as Record<string, unknown>;
}

function imageJob(): Record<string, unknown> {
  const job = wan2gpFixture("job_done");
  const result = job.result as Record<string, unknown>;
  result.gallery_items = [{ media_id: "visual:img", media_type: "image", filename: "out.png" }];
  return job;
}

describe("registration", () => {
  it("registers wangp as a local service that stays off the cloud profile", () => {
    const registration = getRegisteredProvider("wangp");
    expect(registration?.metadata).toEqual({ access: "local_service", displayName: "Wan2GP" });
    expect(registration?.optionalKwargs).toEqual({ WAN2GP_MCP_URL: "" });
    expect(isCloudProvider("wangp")).toBe(false);
  });

  it("defaults to the local Wan2GP port", () => {
    expect(new Wan2GPProvider({ WAN2GP_MCP_URL: "" }).serverUrl).toBe("http://127.0.0.1:7866/mcp");
  });
});

describe("models", () => {
  it("lists video models with the tasks their capabilities enable", async () => {
    fake.modelPages = [{ models: [{ model_type: "ti2v_2_2_fastwan" }, { model_type: "flux" }], has_more: false }];
    const models = await provider.getAvailableVideoModels();
    expect(models).toEqual([
      { id: "ti2v_2_2_fastwan", name: expect.any(String), provider: "wangp", supportedTasks: ["text_to_video", "image_to_video"] }
    ]);
    expect(fake.calls[0].args).toEqual({ action: "search", arguments: { query: "", limit: 100, filters: { main_output: "video" } } });
  });

  it("lists image models", async () => {
    fake.modelPages = [{ models: [{ model_type: "flux" }], has_more: false }];
    const models = await provider.getAvailableImageModels();
    expect(models.map((model) => [model.id, model.supportedTasks])).toEqual([["flux", ["text_to_image"]]]);
  });

  it("lists nothing while no server answers", async () => {
    await fake.stop();
    expect(await provider.getAvailableVideoModels()).toEqual([]);
    fake = await new FakeWan2GP().start();
  });
});

describe("settings", () => {
  it("turns a resolution tier and aspect ratio into WxH", () => {
    expect(wan2gpResolution({ model: videoModel, resolution: "720p" })).toBe("1280x720");
    expect(wan2gpResolution({ model: videoModel, resolution: "480p", aspectRatio: "9:16" })).toBe("480x853");
    expect(wan2gpResolution({ model: videoModel, resolution: "832x480" })).toBe("832x480");
    expect(wan2gpResolution({ model: videoModel, width: 640, height: 368 })).toBe("640x368");
    expect(wan2gpResolution({ model: videoModel })).toBeUndefined();
    expect(() => wan2gpResolution({ model: videoModel, resolution: "720p", aspectRatio: "wide" })).toThrow(/aspect ratio/);
  });

  it("maps generation params and keeps zero values", () => {
    expect(
      wan2gpBaseSettings("video", {
        model: videoModel,
        prompt: "a fox",
        negativePrompt: "",
        seed: 0,
        numInferenceSteps: 8,
        guidanceScale: 5,
        durationSeconds: 5
      })
    ).toEqual({
      model_type: "ti2v_2_2_fastwan",
      prompt: "a fox",
      seed: 0,
      num_inference_steps: 8,
      guidance_scale: 5,
      video_length: "5s"
    });
    expect(wan2gpBaseSettings("video", { model: videoModel, numFrames: 81, durationSeconds: 5 }).video_length).toBe(81);
    expect(wan2gpBaseSettings("image", { model: imageModel, strength: 0.4 })).toMatchObject({
      denoising_strength: 0.4,
      image_mode: 1
    });
    expect(() => wan2gpBaseSettings("video", { model: { id: " " } })).toThrow(/names no Wan2GP model/);
  });
});

describe("generation", () => {
  it("runs text-to-video and returns the downloaded clip", async () => {
    const bytes = await provider.textToVideo({ model: videoModel, prompt: "a fox", resolution: "480p" });
    expect(bytes).toEqual(wan2gpFixtureBytes("tiny.mp4"));
    expect(generated()).toEqual({ model_type: "ti2v_2_2_fastwan", prompt: "a fox", resolution: "853x480" });
    expect(fake.toolNames()).toEqual([
      "wangp_generate",
      "wangp_session:get_job",
      "wangp_session:create_gallery_download"
    ]);
  });

  it("uploads the start and end frames for image-to-video", async () => {
    await provider.imageToVideo(png, { model: videoModel, prompt: "moves", endImage: png });
    expect(fake.uploads).toHaveLength(2);
    expect(generated()).toMatchObject({ image_start: "visual:0a1b2c3d4e5f", image_end: "visual:0a1b2c3d4e5f" });
    expect(fake.calls[0].args).toEqual({ action: "create_gallery_upload", arguments: { filename: "image.png" } });
  });

  it("sends reference images in order and refuses reference videos", async () => {
    await provider.referenceToVideo({ images: [png, png], videos: [] }, { model: videoModel, prompt: "x" });
    expect(generated().image_refs).toEqual(["visual:0a1b2c3d4e5f", "visual:0a1b2c3d4e5f"]);
    await expect(
      provider.referenceToVideo({ images: [png], videos: [new Uint8Array([1])] }, { model: videoModel, prompt: "x" })
    ).rejects.toThrow(/reference images only/);
    await expect(
      provider.referenceToVideo({ images: [], videos: [] }, { model: videoModel, prompt: "x" })
    ).rejects.toThrow(/at least one reference image/);
  });

  it("selects the image output for text-to-image", async () => {
    fake.jobs = [imageJob()];
    fake.downloadBody = png;
    expect(await provider.textToImage({ model: imageModel, prompt: "a cat", width: 512, height: 512 })).toEqual(png);
    expect(generated()).toEqual({ model_type: "flux", prompt: "a cat", resolution: "512x512", image_mode: 1 });
  });

  it("sends an edit's images as references when the model takes no start image", async () => {
    fake.jobs = [imageJob()];
    await provider.imageToImage([png], { model: { ...imageModel, id: "qwen_image_edit_20B" }, prompt: "edit", targetWidth: 1024, targetHeight: 1024 });
    expect(generated()).toMatchObject({ image_refs: ["visual:0a1b2c3d4e5f"], resolution: "1024x1024" });
    expect(generated().image_start).toBeUndefined();
  });

  it("refuses an edit on a model that takes no input image", async () => {
    await expect(provider.imageToImage([png], { model: imageModel, prompt: "edit" })).rejects.toThrow(/takes no input image/);
  });

  it("refuses an output of the wrong media type", async () => {
    await expect(provider.textToImage({ model: imageModel, prompt: "x" })).rejects.toThrow(/returned video output/);
  });

  it("reports the job's error", async () => {
    fake.jobs = [wan2gpFixture("job_failed")];
    await expect(provider.textToVideo({ model: videoModel, prompt: "x" })).rejects.toThrow("CUDA out of memory");
  });

  it("cancels the remote job when the caller aborts", async () => {
    fake.jobs = [wan2gpFixture("job_running")];
    const controller = new AbortController();
    const run = provider.textToVideo({ model: videoModel, prompt: "x", signal: controller.signal });
    setTimeout(() => controller.abort(new Error("stopped")), 100);
    await expect(run).rejects.toThrow("stopped");
    expect(fake.toolNames().at(-1)).toBe("wangp_session:cancel_job");
  });
});
