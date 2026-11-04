import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComfyApiPrompt, ComfyObjectInfo } from "@nodetool-ai/protocol";
import { ComfyCloudProvider } from "../../src/providers/comfy-cloud-provider.js";
import { ComfyGpuClient, comfyGpuCatalog, listedComfyGpuTemplates, prepareComfyGpuPrompt, type ComfyGpuTemplate, type ComfyGpuInput } from "../../src/providers/comfy-gpu-models.js";
import { comfyUiToPrompt } from "../../src/providers/comfy-ui-prompt.js";

const sdk = vi.hoisted(() => ({ graph: vi.fn(), submit: vi.fn(), cancel: vi.fn(), setInput: vi.fn(), asset: vi.fn() }));
vi.mock("@comfyorg/sdk", () => ({ Comfy: class {
  workflows = { fromJson: (graph: unknown) => { sdk.graph(graph); return { setInput: sdk.setInput }; } };
  assets = { fromBytes: sdk.asset };
  submit = sdk.submit;
} }));
afterEach(() => vi.resetAllMocks());

function template(task: string): ComfyGpuTemplate {
  const result = listedComfyGpuTemplates().find((entry) => entry.task === task);
  if (!result) {throw new Error(`No template for ${task}`);}
  return result;
}
class FakeGpu extends ComfyGpuClient {
  calls: Array<{ template: ComfyGpuTemplate; input: ComfyGpuInput }> = [];
  constructor() { super("fake"); }
  override async run(selected: ComfyGpuTemplate, input: ComfyGpuInput) {
    this.calls.push({ template: selected, input });
    return { data: new TextEncoder().encode("result"), mimeType: selected.kind === "audio" ? "audio/flac" : "image/png" };
  }
}
class Provider extends ComfyCloudProvider {
  readonly gpu = new FakeGpu();
  protected override createGpuClient(): ComfyGpuClient { return this.gpu; }
}

describe("Comfy GPU provider catalog", () => {
  it("accounts for every source template and exposes every supported task", async () => {
    const catalog = comfyGpuCatalog();
    const sources = [...catalog.templates, ...catalog.excluded].map((entry) => entry.source);
    expect(sources.length).toBeGreaterThan(0);
    expect(new Set(sources).size).toBe(sources.length);
    expect(catalog.templates.every((entry) => !entry.source.startsWith("api_"))).toBe(true);
    const provider = new Provider();
    const offered = [
      ...await provider.getAvailableImageModels(), ...await provider.getAvailableVideoModels(),
      ...await provider.getAvailableMusicModels(), ...await provider.getAvailableAudioToAudioModels(),
      ...await provider.getAvailableTTSModels(), ...await provider.getAvailable3DModels(), ...await provider.getAvailableLanguageModels()
    ];
    for (const entry of listedComfyGpuTemplates()) {expect(offered.some((model) => model.id === entry.id), entry.id).toBe(true);}
    expect(listedComfyGpuTemplates().some((entry) => entry.restricted)).toBe(false);
    expect(catalog.excluded.every((entry) => entry.reason.length > 0)).toBe(true);
    const families = new Set(catalog.templates.flatMap((entry) => entry.models));
    const uncovered = catalog.excluded.flatMap((entry) => entry.models).filter((model) => model !== "None" && !families.has(model));
    expect(uncovered).toEqual([]);
  });

  it("routes image edits and image-to-video to GPU jobs with media roles intact", async () => {
    const provider = new Provider();
    const image = new Uint8Array([1]);
    const end = new Uint8Array([2]);
    const edit = template("image_to_image");
    await provider.imageToImage([image, end], { model: { ...edit, provider: "comfy_cloud" }, prompt: "edit", seed: 7 });
    expect(provider.gpu.calls[0].input).toMatchObject({ images: [image, end], prompt: "edit", seed: 7 });
    const video = template("image_to_video");
    await provider.imageToVideo(image, { model: { ...video, provider: "comfy_cloud" }, endImage: end, prompt: "animate" });
    expect(provider.gpu.calls[1].input.images).toEqual([image, end]);
    await expect(provider.textToVideo({ model: { ...edit, provider: "comfy_cloud" }, prompt: "wrong task" })).rejects.toThrow("supports image_to_image");
    expect(provider.gpu.calls).toHaveLength(2);
  });

  it("runs music, speech, audio transforms and 3D through their provider methods", async () => {
    const provider = new Provider();
    const bytes = new Uint8Array([1]);
    const music = template("text_to_music");
    expect((await provider.textToMusic({ model: { ...music, provider: "comfy_cloud" }, prompt: "piano", lyrics: "", durationSeconds: 8 })).mimeType).toBe("audio/flac");
    const speech = template("text_to_speech");
    await provider.textToSpeechEncoded({ model: speech.id, text: "hello", referenceAudio: bytes });
    const transform = template("audio_to_audio");
    await provider.audioToAudio(bytes, { model: { ...transform, provider: "comfy_cloud" } });
    const model3d = template("image_to_3d");
    await provider.imageTo3D(bytes, { model: { ...model3d, provider: "comfy_cloud" } });
    expect(provider.gpu.calls.map((call) => call.template.task)).toEqual(["text_to_music", "text_to_speech", "audio_to_audio", "image_to_3d"]);
  });

  it("does not start a GPU job for unsupported chat tool calls", async () => {
    const provider = new Provider();
    const model = template("generate_message");
    await expect(provider.generateMessage({ model: model.id, messages: [{ role: "user", content: "hello" }], tools: [{ name: "test", description: "test", inputSchema: {} }] })).rejects.toThrow("tool calls");
    expect(provider.gpu.calls).toEqual([]);
    expect(await provider.hasToolSupport(model.id)).toBe(false);
    const result = await provider.generateMessage({ model: model.id, messages: [{ role: "user", content: "hello" }] });
    expect(result.content).toBe("result");
  });
});

describe("Comfy UI template conversion", () => {
  const info: ComfyObjectInfo = {
    Encode: { input: { required: { text: ["STRING", {}] } }, output: ["CONDITIONING"] },
    SaveImage: { input: { required: { images: ["IMAGE", {}], filename_prefix: ["STRING", {}] } }, output_node: true }
  };
  it("flattens subgraphs and applies the host's promoted widget values", () => {
    const workflow = {
      nodes: [{ id: 10, type: "group", inputs: [{ name: "text" }], widgets_values: ["host prompt"] }, { id: 20, type: "SaveImage", inputs: [{ name: "images", link: 1 }], widgets_values: ["output"] }],
      links: [[1, 10, 0, 20, 0, "IMAGE"]],
      definitions: { subgraphs: [{ id: "group", inputs: [{ name: "text", type: "STRING" }], outputs: [{ linkIds: [3] }],
        nodes: [{ id: 2, type: "Encode", inputs: [{ name: "text", widget: { name: "text" }, link: 2 }], widgets_values: ["inner default"] }],
        links: [{ id: 2, origin_id: -10, origin_slot: 0, target_id: 2, target_slot: 0 }, { id: 3, origin_id: 2, origin_slot: 0, target_id: -20, target_slot: 0 }] }] }
    };
    const prompt = comfyUiToPrompt(workflow, info);
    expect(prompt["10:2"].inputs.text).toBe("host prompt");
    expect(prompt["20"].inputs.images).toEqual(["10:2", 0]);
  });

  it("does not wire a hidden subgraph widget to an unrelated host input", () => {
    const prompt = comfyUiToPrompt({
      nodes: [
        { id: 1, type: "Size", widgets_values: [1024] },
        { id: 459, type: "qwen", inputs: [{ name: "width", link: 1 }], widgets_values: ["", 1024] }
      ],
      links: [[1, 1, 0, 459, 0, "INT"]],
      definitions: { subgraphs: [{
        id: "qwen",
        inputs: [{ name: "negative_prompt", type: "STRING" }, { name: "width", type: "INT" }],
        nodes: [{ id: 452, type: "Encode", inputs: [{ name: "text", link: 2 }, { name: "width", link: 3 }], widgets_values: ["default"] }],
        links: [[2, -10, 0, 452, 0, "STRING"], [3, -10, 1, 452, 1, "INT"]]
      }] }
    }, { ...info, Encode: { ...info.Encode, output_node: true }, Size: { input: { required: { value: ["INT", {}] } }, output: ["INT"] } });
    expect(prompt["459:452"].inputs.text).toBe("");
    expect(prompt["459:452"].inputs.width).toEqual(["1", 0]);
  });

  it("rejects partner API nodes before submission", () => {
    expect(() => comfyUiToPrompt({ nodes: [{ id: 1, type: "Partner", widgets_values: [] }], links: [] }, { Partner: { api_node: true, output_node: true } })).toThrow("partner API");
  });

  it("decodes nested combo widgets without shifting later values", () => {
    const prompt = comfyUiToPrompt({ nodes: [{ id: 1, type: "SaveAudio", widgets_values: ["mp3", "V0", 42, "fixed"] }], links: [] }, {
      SaveAudio: { input: { required: { format: ["COMFY_DYNAMICCOMBO_V3", { options: [{ key: "mp3", inputs: { required: { quality: [["V0", "320k"], {}] } } }] }], seed: ["INT", { control_after_generate: true }] } }, output_node: true }
    });
    expect(prompt["1"].inputs).toEqual({ format: "mp3", "format.quality": "V0", seed: 42 });
  });
});

describe("GPU prompt binding", () => {
  it("changes positive conditioning through a video wrapper without replacing negative conditioning", () => {
    const graph: ComfyApiPrompt = {
      p: { class_type: "CLIPTextEncode", inputs: { text: "positive" } },
      n: { class_type: "CLIPTextEncode", inputs: { text: "negative" } },
      c: { class_type: "WanImageToVideo", inputs: { positive: ["p", 0], negative: ["n", 0] } },
      k: { class_type: "KSampler", inputs: { positive: ["c", 0], negative: ["c", 1], seed: 0 } },
      s: { class_type: "SaveVideo", inputs: { video: ["k", 0] } }
    };
    const result = prepareComfyGpuPrompt(graph, template("image_to_video"), { prompt: "new", seed: 7 });
    expect(result.p.inputs.text).toBe("new");
    expect(result.n.inputs.text).toBe("negative");
    expect(result.k.inputs.seed).toBe(7);
    expect(graph.p.inputs.text).toBe("positive");
  });
});


describe("Comfy GPU execution", () => {
  it("returns encoded music and injects its prompt, lyrics and duration", async () => {
    const music = template("text_to_music");
    // Prefer a pinned API graph so this also exercises the offline fallback.
    const pinned = comfyGpuCatalog().templates.find((entry) => entry.source === "audio_ace_step1_5_xl_turbo");
    if (!pinned) {throw new Error("Missing ACE-Step template");}
    sdk.submit.mockResolvedValue({ id: "job", status: "succeeded", wait: async () => undefined, cancel: sdk.cancel,
      outputs: [{ name: "song.flac", type: "image", contentType: "audio/flac", toBytes: async () => new Uint8Array([1, 2]) }] });
    const result = await new ComfyGpuClient("test-key").run(pinned, { prompt: "piano", lyrics: "hello", durationSeconds: 8, seed: 7 });
    expect(result).toEqual({ data: new Uint8Array([1, 2]), mimeType: "audio/flac" });
    expect(sdk.graph.mock.calls[0][0]["94"].inputs).toMatchObject({ tags: "piano", lyrics: "hello", duration: 8 });
    expect(sdk.submit).toHaveBeenCalledOnce();
    expect(music.kind).toBe("audio");
  });

  it("refuses mismatched media counts before submitting a paid job", async () => {
    const music = comfyGpuCatalog().templates.find((entry) => entry.source === "audio_ace_step1_5_xl_turbo");
    if (!music) {throw new Error("Missing ACE-Step template");}
    await expect(new ComfyGpuClient("test-key").run(music, { prompt: "piano", audios: [new Uint8Array([1])] })).rejects.toThrow("requires 0 audio");
    expect(sdk.submit).not.toHaveBeenCalled();
    expect(sdk.asset).not.toHaveBeenCalled();
  });

  it("uploads core LoadVideo inputs to the file field", async () => {
    class Client extends ComfyGpuClient {
      protected override objectInfo(): Promise<ComfyObjectInfo> {
        return Promise.resolve({
          LoadVideo: { input: { required: { file: [["demo.mp4"], {}] } }, output: ["VIDEO"] },
          SaveVideo: { input: { required: { video: ["VIDEO", {}], filename_prefix: ["STRING", {}] } }, output_node: true }
        });
      }
    }
    const selected: ComfyGpuTemplate = {
      id: "test", source: "test", name: "Video", models: [], kind: "video", task: "video_to_video", restricted: false, outputNodes: ["2"],
      workflow: { nodes: [{ id: 1, type: "LoadVideo", widgets_values: ["demo.mp4"] }, { id: 2, type: "SaveVideo", inputs: [{ name: "video", link: 1 }], widgets_values: ["output"] }], links: [[1, 1, 0, 2, 0, "VIDEO"]] }
    };
    sdk.asset.mockReturnValue("uploaded");
    sdk.submit.mockResolvedValue({ id: "job", status: "succeeded", wait: async () => undefined, cancel: sdk.cancel,
      outputs: [{ nodeId: "2", name: "clip.mp4", type: "image", contentType: "video/mp4", toBytes: async () => new Uint8Array([1]) }] });
    await new Client("key").run(selected, { videos: [new Uint8Array([1])] });
    expect(sdk.setInput).toHaveBeenCalledWith("1", "file", "uploaded");
  });

  it("honors cancellation before any job is submitted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(new ComfyGpuClient("test-key").run(template("text_to_music"), { prompt: "p", signal: controller.signal })).rejects.toThrow();
    expect(sdk.submit).not.toHaveBeenCalled();
  });
});
