import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import { isCloudNodeType } from "@nodetool-ai/protocol";
import { Wan2GPClient, type ProcessingContext, type Wan2GPRecord } from "@nodetool-ai/runtime";
import {
  WAN2GP_NODES,
  Wan2GPGenerateNode,
  Wan2GPImageToVideoNode,
  Wan2GPListModelsNode,
  Wan2GPTextToVideoNode,
  resolveWan2GPServerUrl,
  resolveWan2GPToken,
  wan2gpCustomFilename,
  wan2gpLoraSettings,
  wan2gpMergedSettings,
  wan2gpResolutionString
} from "../src/nodes/wan2gp.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64"
);
const MP4 = new Uint8Array([0, 0, 0, 0x18, ...Buffer.from("ftypisom")]);

function doneJob(mediaType: string, filename: string): Wan2GPRecord {
  return {
    done: true,
    result: { success: true, gallery_items: [{ media_id: "visual:out", media_type: mediaType, filename }] }
  };
}

/** A stand-in for a connected client that records what the node asked for. */
function stubClient(options: { job?: Wan2GPRecord; output?: Uint8Array; capabilities?: Wan2GPRecord } = {}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const client = {
    getModelDefaults: vi.fn(async (modelType: string) => {
      calls.push(["defaults", modelType]);
      return { model_type: modelType, prompt: "default", seed: 7, num_inference_steps: 30 };
    }),
    getModelCapabilities: vi.fn(async (modelType: string) => {
      calls.push(["capabilities", modelType]);
      return options.capabilities ?? {};
    }),
    uploadMedia: vi.fn(async (filename: string, data: Uint8Array) => {
      calls.push(["uploadMedia", filename, data.length]);
      return `media:${filename}`;
    }),
    uploadFile: vi.fn(async (filename: string) => {
      calls.push(["uploadFile", filename]);
      return `@documents/uploads/1/${filename}`;
    }),
    submit: vi.fn(async (settings: Wan2GPRecord) => {
      calls.push(["submit", settings]);
      return "job-1";
    }),
    pollUntilDone: vi.fn(async (_jobId: string, poll: { onProgress?: (p: Wan2GPRecord) => void }) => {
      poll.onProgress?.({ progress: 40, current_step: 12, total_steps: 30 });
      poll.onProgress?.({ progress: 90 });
      return options.job ?? doneJob("video", "clip.mp4");
    }),
    downloadFirstOutput: vi.fn(async (job: Wan2GPRecord, expected?: string[]) => {
      const item = ((job.result as Wan2GPRecord).gallery_items as Wan2GPRecord[])[0];
      if (expected && !expected.includes(String(item.media_type))) {
        throw new Error(`Wan2GP returned ${String(item.media_type)} output`);
      }
      return { item, data: options.output ?? MP4 };
    }),
    searchAllModels: vi.fn(async (...args: unknown[]) => {
      calls.push(["search", ...args]);
      return [{ model_type: "flux", name: "Flux", family: "flux", capabilities: ["text_to_image"], description: "long" }];
    }),
    close: vi.fn(async () => undefined)
  };
  const connect = vi.spyOn(Wan2GPClient, "connect").mockResolvedValue(client as unknown as Wan2GPClient);
  return { client, calls, connect };
}

function submitted(calls: Array<[string, ...unknown[]]>): Wan2GPRecord {
  return calls.find(([name]) => name === "submit")?.[1] as Wan2GPRecord;
}

const imageRef = { type: "image", uri: "", data: PNG.toString("base64") };

beforeEach(() => {
  delete process.env["WAN2GP_MCP_URL"];
  delete process.env["WAN2GP_MCP_TOKEN"];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Wan2GP node metadata", () => {
  it("registers four lib.wan2gp nodes that stay off the cloud profile", () => {
    expect(WAN2GP_NODES.map((node) => getNodeMetadata(node).node_type)).toEqual([
      "lib.wan2gp.TextToVideo",
      "lib.wan2gp.ImageToVideo",
      "lib.wan2gp.Generate",
      "lib.wan2gp.ListModels"
    ]);
    for (const node of WAN2GP_NODES) expect(isCloudNodeType(node.nodeType)).toBe(false);
  });

  it("declares every output key the nodes return", () => {
    expect(getNodeMetadata(Wan2GPGenerateNode).outputs.map((output) => output.name)).toEqual(["output"]);
    expect(getNodeMetadata(Wan2GPListModelsNode).outputs.map((output) => output.name)).toEqual(["output"]);
    const props = getNodeMetadata(Wan2GPTextToVideoNode).properties.map((property) => property.name);
    expect(props).toEqual(expect.arrayContaining(["server_url", "timeout_seconds", "max_media_bytes", "seed", "prompt"]));
  });
});

describe("settings helpers", () => {
  it("checks the resolution grid", () => {
    expect(wan2gpResolutionString(832, 480)).toBe("832x480");
    expect(() => wan2gpResolutionString(830, 480)).toThrow("Use 816 or 832");
    expect(() => wan2gpResolutionString(0, 480)).toThrow(/positive/);
  });

  it("formats LoRA multipliers", () => {
    expect(wan2gpLoraSettings([], [])).toEqual({});
    expect(wan2gpLoraSettings(["a", "b"], [])).toEqual({ activated_loras: ["a", "b"], loras_multipliers: "1 1" });
    expect(wan2gpLoraSettings(["a"], [0.5])).toEqual({ activated_loras: ["a"], loras_multipliers: "0.5" });
    expect(() => wan2gpLoraSettings(["a"], [1, 2])).toThrow(/one multiplier per LoRA/);
  });

  it("merges defaults, seed, user settings and media in that order", () => {
    expect(
      wan2gpMergedSettings({
        defaults: { prompt: "default", seed: 7, model_type: "other", steps: 30 },
        modelType: "t2v_2_2",
        seed: -1,
        userSettings: { prompt: "mine", seed: 3, _api: { x: 1 }, model_type: "ignored" },
        media: { image_start: "media:1" }
      })
    ).toEqual({ prompt: "mine", seed: 3, steps: 30, image_start: "media:1", model_type: "t2v_2_2" });
  });

  it("takes the custom file name from the field or the URI", () => {
    expect(wan2gpCustomFilename({ type: "asset", uri: "file:///tmp/a%20b/track.npy" }, "")).toBe("track.npy");
    expect(wan2gpCustomFilename({ type: "asset", uri: "asset://123" }, "score.abc")).toBe("score.abc");
    expect(() => wan2gpCustomFilename({ type: "asset", data: "AA==" }, "")).toThrow(/Set custom_file_name/);
    expect(() => wan2gpCustomFilename({ type: "asset", uri: "" }, "dir/x.npy")).toThrow(/without folders/);
    expect(() => wan2gpCustomFilename({ type: "asset", uri: "" }, "noext")).toThrow(/needs an extension/);
    expect(() => wan2gpCustomFilename({ type: "asset", uri: "" }, ".npy")).toThrow(/needs an extension/);
  });

  it("resolves the server URL from the node, the setting, then localhost", async () => {
    expect(await resolveWan2GPServerUrl("")).toBe("http://127.0.0.1:7866/mcp");
    process.env["WAN2GP_MCP_URL"] = "http://gpu-box:7866/mcp";
    expect(await resolveWan2GPServerUrl(" ")).toBe("http://gpu-box:7866/mcp");
    const context = { getSetting: async (key: string) => (key === "WAN2GP_MCP_URL" ? "http://saved:7866/mcp" : null) };
    expect(await resolveWan2GPServerUrl("", context as unknown as ProcessingContext)).toBe("http://saved:7866/mcp");
    expect(await resolveWan2GPServerUrl("http://other:1/mcp", context as unknown as ProcessingContext)).toBe("http://other:1/mcp");
  });
});

describe("TextToVideo", () => {
  it("sends the node fields and returns a video ref with progress", async () => {
    const { calls, connect, client } = stubClient();
    const node = new Wan2GPTextToVideoNode({ prompt: "a fox", loras: ["l1"], lora_multipliers: [0.8], negative_prompt: "blur" });
    node.__node_id = "n1";
    const messages: unknown[] = [];
    const context = {
      postMessage: (message: unknown) => messages.push(message),
      getSetting: async () => null,
      getSecret: async (key: string) => (key === "WAN2GP_MCP_TOKEN" ? "tok" : null)
    } as unknown as ProcessingContext;
    const result = await node.process(context);
    expect(connect).toHaveBeenCalledWith("http://127.0.0.1:7866/mcp", {
      maxTransferBytes: 512 * 1024 ** 2,
      signal: undefined,
      token: "tok"
    });
    expect(submitted(calls)).toEqual({
      model_type: "t2v_2_2",
      prompt: "a fox",
      negative_prompt: "blur",
      resolution: "832x480",
      video_length: 81,
      force_fps: 16,
      num_inference_steps: 30,
      seed: -1,
      activated_loras: ["l1"],
      loras_multipliers: "0.8"
    });
    expect(result).toEqual({ output: { type: "video", uri: "", data: Buffer.from(MP4).toString("base64"), content_type: "video/mp4" } });
    expect(messages).toEqual([
      { type: "node_progress", node_id: "n1", progress: 12, total: 30 },
      { type: "node_progress", node_id: "n1", progress: 90, total: 100 }
    ]);
    expect(client.downloadFirstOutput).toHaveBeenCalledWith(expect.anything(), ["video"]);
    expect(client.close).toHaveBeenCalled();
  });

  it("rejects an empty prompt and a size off the grid before connecting", async () => {
    const { connect } = stubClient();
    await expect(new Wan2GPTextToVideoNode({ prompt: " " }).process()).rejects.toThrow("Prompt is required");
    await expect(new Wan2GPTextToVideoNode({ prompt: "x", width: 100 }).process()).rejects.toThrow(/multiple of 16/);
    expect(connect).not.toHaveBeenCalled();
  });

  it("closes the session when the generation fails", async () => {
    const { client } = stubClient({ job: doneJob("image", "x.png") });
    await expect(new Wan2GPTextToVideoNode({ prompt: "x" }).process()).rejects.toThrow(/returned image output/);
    expect(client.close).toHaveBeenCalled();
  });
});

describe("ImageToVideo", () => {
  it("uploads the image and starts from it", async () => {
    const { calls } = stubClient();
    await new Wan2GPImageToVideoNode({ image: imageRef, prompt: "moves" }).process();
    expect(calls[0]).toEqual(["uploadMedia", "image.png", PNG.length]);
    expect(submitted(calls)).toMatchObject({ model_type: "i2v_2_2", image_start: "media:image.png", image_prompt_type: "S" });
  });

  it("needs an image", async () => {
    stubClient();
    await expect(new Wan2GPImageToVideoNode({ prompt: "x" }).process()).rejects.toThrow(/starting image/);
  });
});

describe("Generate", () => {
  it("sends each connected medium under its Wan2GP setting", async () => {
    const { calls } = stubClient({ job: doneJob("image", "out.png"), output: PNG });
    const video = { type: "video", uri: "", data: Buffer.from(MP4).toString("base64") };
    const audio = { type: "audio", uri: "", data: Buffer.from("RIFF0000WAVE").toString("base64") };
    const result = await new Wan2GPGenerateNode({
      model_type: "qwen_image_edit_20B",
      settings: { prompt: "edit", video_prompt_type: "VA" },
      image: imageRef,
      image_end: imageRef,
      reference_images: [imageRef, { type: "image", uri: "" }, imageRef],
      video,
      video_mask: video,
      source_video: video,
      audio
    }).process();
    const settings = submitted(calls);
    expect(settings).toMatchObject({
      model_type: "qwen_image_edit_20B",
      prompt: "edit",
      video_prompt_type: "VA",
      seed: -1,
      num_inference_steps: 30,
      image_start: "media:image.png",
      image_end: "media:image.png",
      image_refs: ["media:image.png", "media:image.png"],
      video_guide: "media:video.mp4",
      video_mask: "media:video.mp4",
      video_source: "media:video.mp4",
      audio_guide: "media:audio.wav"
    });
    expect(result.output).toEqual({ type: "image", uri: "", data: PNG.toString("base64"), content_type: "image/png" });
  });

  it("uploads a custom file and applies the modes the model declares for it", async () => {
    const { calls } = stubClient({
      job: doneJob("audio", "song.wav"),
      output: new Uint8Array([1, 2]),
      capabilities: { media_inputs: { custom_file: { audio_prompt_type: "1", video_prompt_type: "X", extensions: [".abc"] } } }
    });
    const result = await new Wan2GPGenerateNode({
      model_type: "yue2",
      settings: { video_prompt_type: "mine" },
      custom_file: { type: "asset", uri: "", data: Buffer.from("X:1").toString("base64") },
      custom_file_name: "score.abc"
    }).process();
    expect(calls.find(([name]) => name === "uploadFile")).toEqual(["uploadFile", "score.abc"]);
    expect(submitted(calls)).toMatchObject({
      custom_guide: "@documents/uploads/1/score.abc",
      audio_prompt_type: "1",
      video_prompt_type: "mine"
    });
    expect(result.output).toMatchObject({ type: "audio", content_type: "audio/wav" });
  });

  it("returns a 3D model with its format", async () => {
    stubClient({ job: doneJob("3d", "mesh.glb"), output: new Uint8Array([1]) });
    const result = await new Wan2GPGenerateNode({ model_type: "hunyuan3d" }).process();
    expect(result.output).toEqual({ type: "model_3d", uri: "", data: "AQ==", format: "glb", content_type: "model/gltf-binary" });
  });

  it("asks for the custom file name before any upload", async () => {
    const { calls } = stubClient();
    await expect(
      new Wan2GPGenerateNode({ model_type: "wanmove", custom_file: { type: "asset", uri: "", data: "AA==" } }).process()
    ).rejects.toThrow(/Set custom_file_name/);
    expect(calls).toEqual([]);
  });
});

describe("token", () => {
  it("reads WAN2GP_MCP_TOKEN from the secret, then the environment", async () => {
    expect(await resolveWan2GPToken()).toBe("");
    process.env["WAN2GP_MCP_TOKEN"] = " env-token ";
    expect(await resolveWan2GPToken()).toBe("env-token");
    const context = { getSecret: async () => "saved" } as unknown as ProcessingContext;
    expect(await resolveWan2GPToken(context)).toBe("saved");
  });
});

describe("ListModels", () => {
  it("passes the filters and keeps the row fields", async () => {
    const { calls } = stubClient();
    const result = await new Wan2GPListModelsNode({
      query: "flux",
      main_output: "image",
      media_input: " image ",
      capability: "text_to_image",
      limit: 5
    }).process();
    expect(calls[0]).toEqual(["search", "flux", { main_output: "image", inputs: "image", capabilities: ["text_to_image"] }, 5]);
    expect(result.output).toEqual([{ model_type: "flux", name: "Flux", family: "flux", capabilities: ["text_to_image"] }]);
  });
});
