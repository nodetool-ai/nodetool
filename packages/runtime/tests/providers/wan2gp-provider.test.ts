import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCloudProvider } from "@nodetool-ai/protocol";
import { getRegisteredProvider } from "../../src/providers/provider-registry.js";
import "../../src/providers/index.js";
import {
  Wan2GPProvider,
  resetWan2GPListings,
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
  resetWan2GPListings();
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
    expect(registration?.optionalKwargs).toEqual({ WAN2GP_MCP_URL: "", WAN2GP_MCP_TOKEN: "" });
    expect(isCloudProvider("wangp")).toBe(false);
  });

  it("authenticates with WAN2GP_MCP_TOKEN", async () => {
    fake.token = "tok";
    fake.modelPages = [{ models: [{ model_type: "flux" }], has_more: false }];
    expect(await provider.getAvailableImageModels()).toEqual([]);
    const authed = new Wan2GPProvider({ WAN2GP_MCP_URL: fake.url, WAN2GP_MCP_TOKEN: "tok" });
    expect((await authed.getAvailableImageModels()).map((model) => model.id)).toEqual(["flux"]);
  });

  it("leaves the server to the installed Wan2GP when no URL is set", () => {
    expect(new Wan2GPProvider({ WAN2GP_MCP_URL: " " }).serverUrl).toBe("");
  });
});

describe("models", () => {
  it("lists video models with the tasks their capabilities enable", async () => {
    fake.modelPages = [{ models: [{ model_type: "ti2v_2_2_fastwan" }, { model_type: "flux" }], has_more: false }];
    const models = await provider.getAvailableVideoModels();
    expect(models).toEqual([
      { id: "ti2v_2_2_fastwan", name: expect.any(String), provider: "wangp", supportedTasks: ["text_to_video", "image_to_video"] }
    ]);
    expect(fake.calls[0].args).toEqual({ action: "search", arguments: { query: "", limit: 100 } });
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

describe("audio", () => {
  const audio = wan2gpFixture("audio_models").models as Record<string, Record<string, unknown>>;

  function audioJob(filename: string): Record<string, unknown> {
    const job = wan2gpFixture("job_done");
    (job.result as Record<string, unknown>).gallery_items = [{ media_id: "audio:out", media_type: "audio", filename }];
    return job;
  }

  beforeEach(() => {
    Object.assign(fake.capabilities, audio);
    fake.modelPages = [{ models: Object.keys(audio).map((model_type) => ({ model_type })), has_more: false }];
    fake.handlers.wangp_model = (args) => {
      if (args.action === "capabilities") return fake.capabilities[String(args.model_type)];
      if (args.action === "definition") {
        if (args.model_type === "qwen3_tts_customvoice") {
          return { model_modes: { label: "Speaker", choices: [["Aiden (English)", "aiden"], ["Serena (Chinese)", "serena"]] } };
        }
        if (args.model_type === "chatterbox") {
          return { model_modes: { label: "Language", choices: [["English (en)", "en"], ["German (de)", "de"]] } };
        }
        throw new Error("Unknown model definition property: model_modes");
      }
      return { model_type: args.model_type };
    };
  });

  it("lists speech models with their voices, languages and abilities", async () => {
    const models = await provider.getAvailableTTSModels();
    expect(models).toEqual([
      {
        id: "qwen3_tts_customvoice",
        name: "TTS Qwen3 Custom Voice (12Hz) 1.7B",
        provider: "wangp",
        voices: ["aiden", "serena"],
        capabilities: ["text_to_speech", "instruction_control", "preset_voice"]
      },
      {
        id: "chatterbox",
        name: "Chatterbox",
        provider: "wangp",
        languages: ["en", "de"],
        capabilities: ["text_to_speech", "voice_cloning", "language_selection"]
      }
    ]);
  });

  it("lists music models and leaves out one that needs a score file", async () => {
    const models = await provider.getAvailableMusicModels();
    expect(models.map((model) => [model.id, model.supportedTasks])).toEqual([
      ["ace_step_v1", ["text_to_music"]],
      ["stable_audio3_small", ["text_to_music"]]
    ]);
  });

  it("sends the text, voice and instructions for speech and returns the audio", async () => {
    fake.jobs = [audioJob("speech.mp3")];
    fake.downloadBody = new Uint8Array([1, 2, 3]);
    const result = await provider.textToSpeechEncoded({
      text: "Hello there",
      model: "qwen3_tts_customvoice",
      voice: "serena",
      instructions: "calm"
    });
    expect(result).toEqual({ data: new Uint8Array([1, 2, 3]), mimeType: "audio/mpeg" });
    expect(generated()).toEqual({ model_type: "qwen3_tts_customvoice", prompt: "Hello there", alt_prompt: "calm", model_mode: "serena" });
  });

  it("uploads a reference voice and sends the language", async () => {
    fake.jobs = [audioJob("speech.wav")];
    const wav = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WAVE")]);
    await provider.textToSpeechEncoded({ text: "Hallo", model: "chatterbox", language: "de", referenceAudio: wav, referenceText: "Guten Tag" });
    expect(fake.calls.find((call) => call.args.action === "create_gallery_upload")?.args).toEqual({
      action: "create_gallery_upload",
      arguments: { filename: "audio.wav" }
    });
    expect(generated()).toMatchObject({ prompt: "Hallo", model_mode: "de", alt_prompt: "Guten Tag", audio_guide: "visual:0a1b2c3d4e5f" });
  });

  it("refuses a reference voice for a model that takes none", async () => {
    await expect(
      provider.textToSpeechEncoded({ text: "x", model: "qwen3_tts_customvoice", referenceAudio: new Uint8Array([1]) })
    ).rejects.toThrow(/takes no reference voice/);
    expect(fake.calls.some((call) => call.name === "wangp_generate")).toBe(false);
  });

  it("sends lyrics and style for a song, and the style alone for Stable Audio", async () => {
    fake.jobs = [audioJob("song.flac")];
    const song = await provider.textToMusic({
      model: { id: "ace_step_v1", name: "ACE", provider: "wangp" },
      prompt: "dreamy synth-pop",
      lyrics: "[Verse]\nNeon rain",
      durationSeconds: 30,
      seed: 0
    });
    expect(song.mimeType).toBe("audio/flac");
    expect(generated()).toEqual({
      model_type: "ace_step_v1",
      prompt: "[Verse]\nNeon rain",
      alt_prompt: "dreamy synth-pop",
      duration_seconds: 30,
      seed: 0
    });
    fake.calls = [];
    await provider.textToMusic({ model: { id: "stable_audio3_small", name: "SA", provider: "wangp" }, prompt: "rain on a tin roof" });
    expect(generated()).toEqual({ model_type: "stable_audio3_small", prompt: "rain on a tin roof" });
  });

  it("asks for an instrumental when no lyrics are given", async () => {
    fake.jobs = [audioJob("song.wav")];
    await provider.textToMusic({ model: { id: "ace_step_v1", name: "ACE", provider: "wangp" }, prompt: "lofi beat" });
    expect(generated()).toMatchObject({ prompt: "[Instrumental]", alt_prompt: "lofi beat" });
  });
});
