import { describe, expect, it, vi, afterEach } from "vitest";
import { createKieNodeClass } from "../src/kie-factory.js";
import type { KieManifestEntry } from "../src/kie-factory.js";

vi.mock("../src/kie-base.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/kie-base.js")>();
  return {
    ...actual,
    getApiKey: () => "test-key",
    kieExecuteOmniDirect: vi.fn(),
    kieExecuteTask: vi.fn(),
    uploadVideoInput: vi.fn(async () => "https://cdn.example.com/source.mp4")
  };
});

import { kieExecuteOmniDirect, kieExecuteTask, uploadVideoInput } from "../src/kie-base.js";

const audioSpec: KieManifestEntry = {
  className: "GeminiOmniAudio",
  moduleName: "video",
  modelId: "gemini-omni-audio",
  title: "Gemini Omni Audio",
  description: "test",
  outputType: "text",
  pollInterval: 8000,
  maxAttempts: 450,
  useOmniDirect: true,
  submitEndpoint: "/api/v1/omni/audio/create",
  responseIdKey: "audioId",
  fields: [
    { name: "audio_id", type: "enum", values: ["achernar"], default: "achernar" },
    { name: "name", type: "str", default: "", required: true }
  ],
  validation: [{ field: "name", rule: "not_empty", message: "Name is required" }]
};

const videoSpec: KieManifestEntry = {
  className: "GeminiOmniVideo",
  moduleName: "video",
  modelId: "gemini-omni-video",
  title: "Gemini Omni Video",
  description: "test",
  outputType: "video",
  pollInterval: 8000,
  maxAttempts: 450,
  fields: [
    { name: "prompt", type: "str", default: "", required: true },
    { name: "duration", type: "enum", values: ["8"], default: "8", required: true },
    { name: "audio_ids", type: "list[str]", default: [] },
    { name: "character_ids", type: "list[str]", default: [] }
  ]
};

describe("createKieNodeClass omni chaining", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns plain string ID from omni audio node", async () => {
    vi.mocked(kieExecuteOmniDirect).mockResolvedValue({
      data: "audio_abc",
      items: ["audio_abc"],
      taskId: ""
    });

    const NodeClass = createKieNodeClass(audioSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).name = "Test Voice";
    (node as unknown as Record<string, unknown>).audio_id = "achernar";
    node.setDynamic("_secrets", { KIE_API_KEY: "test" });

    const result = await node.process();
    expect(result).toEqual({ output: "audio_abc" });
    expect(kieExecuteOmniDirect).toHaveBeenCalledWith(
      "test-key",
      "/api/v1/omni/audio/create",
      { audio_id: "achernar", name: "Test Voice" },
      "audioId"
    );
  });

  it("submits video_list clip trim metadata to createTask", async () => {
    vi.mocked(kieExecuteTask).mockResolvedValue({
      data: Buffer.from("video-bytes").toString("base64"),
      items: [Buffer.from("video-bytes").toString("base64")],
      taskId: "task_clip"
    });

    const clipVideoSpec: KieManifestEntry = {
      ...videoSpec,
      fields: [
        ...videoSpec.fields,
        { name: "video_list", type: "video_clip_list", default: [] }
      ],
      uploads: [
        {
          field: "video_list",
          kind: "video",
          isList: true,
          isVideoClip: true,
          paramName: "video_list"
        }
      ]
    };

    const NodeClass = createKieNodeClass(clipVideoSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "Neon city";
    (node as unknown as Record<string, unknown>).duration = "8";
    (node as unknown as Record<string, unknown>).video_list = [
      {
        type: "video",
        uri: "asset://clip.mp4",
        metadata: { clipStart: 2, clipEnd: 7 }
      }
    ];
    node.setDynamic("_secrets", { KIE_API_KEY: "test" });

    await node.process();

    expect(uploadVideoInput).toHaveBeenCalled();
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-key",
      "gemini-omni-video",
      expect.objectContaining({
        video_list: [{ url: "https://cdn.example.com/source.mp4", start: 2, ends: 7 }]
      }),
      8000,
      450,
      undefined,
      undefined,
      undefined
    );
  });

  it("submits wired audio_ids to video createTask", async () => {
    vi.mocked(kieExecuteTask).mockResolvedValue({
      data: Buffer.from("video-bytes").toString("base64"),
      items: [Buffer.from("video-bytes").toString("base64")],
      taskId: "task_1"
    });

    const NodeClass = createKieNodeClass(videoSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "Neon city";
    (node as unknown as Record<string, unknown>).duration = "8";
    (node as unknown as Record<string, unknown>).audio_ids = ["audio_abc"];
    node.setDynamic("_secrets", { KIE_API_KEY: "test" });

    await node.process();

    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-key",
      "gemini-omni-video",
      expect.objectContaining({
        prompt: "Neon city",
        duration: "8",
        audio_ids: ["audio_abc"]
      }),
      8000,
      450,
      undefined,
      undefined,
      undefined
    );
  });

  it("wraps single string into audio_ids list", async () => {
    vi.mocked(kieExecuteTask).mockResolvedValue({
      data: Buffer.from("video-bytes").toString("base64"),
      items: [Buffer.from("video-bytes").toString("base64")],
      taskId: "task_1"
    });

    const NodeClass = createKieNodeClass(videoSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "Neon city";
    (node as unknown as Record<string, unknown>).duration = "8";
    (node as unknown as Record<string, unknown>).audio_ids = "audio_abc";
    node.setDynamic("_secrets", { KIE_API_KEY: "test" });

    await node.process();

    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-key",
      "gemini-omni-video",
      expect.objectContaining({ audio_ids: ["audio_abc"] }),
      8000,
      450,
      undefined,
      undefined,
      undefined
    );
  });

  it("exposes audio_ids as inputFields for graph wiring", () => {
    const NodeClass = createKieNodeClass(videoSpec);
    expect((NodeClass as unknown as { inputFields: string[] }).inputFields).toContain(
      "audio_ids"
    );
    expect((NodeClass as unknown as { metadataOutputTypes: { output: string } }).metadataOutputTypes).toEqual({
      output: "video"
    });
  });

  it("reports credits consumed via processing context", async () => {
    vi.mocked(kieExecuteTask).mockResolvedValue({
      data: Buffer.from("video-bytes").toString("base64"),
      items: [Buffer.from("video-bytes").toString("base64")],
      taskId: "task_cost",
      creditsConsumed: 9
    });

    const setProviderCost = vi.fn();
    const NodeClass = createKieNodeClass(videoSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "Neon city";
    (node as unknown as Record<string, unknown>).duration = "8";
    node.setDynamic("_secrets", { KIE_API_KEY: "test" });

    await node.process({ setProviderCost } as never);

    expect(setProviderCost).toHaveBeenCalledWith("kie", 9, "credits");
  });
});

// ---------------------------------------------------------------------------
// Single-output image generation
// ---------------------------------------------------------------------------

const imageSpec: KieManifestEntry = {
  className: "GoogleNanoBanana",
  moduleName: "image",
  modelId: "google/nano-banana",
  title: "Google Nano Banana",
  description: "test",
  outputType: "image",
  pollInterval: 1500,
  maxAttempts: 400,
  fields: [{ name: "prompt", type: "str", default: "", required: true }],
  validation: [{ field: "prompt", rule: "not_empty", message: "Prompt is required" }]
};

const imageSpecWithNativeNumImages: KieManifestEntry = {
  className: "IdeogramCharacter",
  moduleName: "image",
  modelId: "ideogram/character",
  title: "Ideogram Character",
  description: "test",
  outputType: "image",
  pollInterval: 1500,
  maxAttempts: 400,
  fields: [
    { name: "prompt", type: "str", default: "", required: true },
    {
      name: "num_images",
      type: "enum",
      default: "1",
      values: ["1", "2", "3", "4"]
    }
  ],
  validation: [{ field: "prompt", rule: "not_empty", message: "Prompt is required" }]
};

describe("createKieNodeClass single-output", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not register num_images or num_outputs as declared properties", () => {
    const a = createKieNodeClass(imageSpec);
    const b = createKieNodeClass(imageSpecWithNativeNumImages);
    expect(a.getDeclaredProperties().find((p) => p.name === "num_outputs")).toBeUndefined();
    expect(a.getDeclaredProperties().find((p) => p.name === "num_images")).toBeUndefined();
    expect(b.getDeclaredProperties().find((p) => p.name === "num_outputs")).toBeUndefined();
    expect(b.getDeclaredProperties().find((p) => p.name === "num_images")).toBeUndefined();
  });

  it("does not declare streaming output or iteration correlation on image nodes", () => {
    const NodeClass = createKieNodeClass(imageSpec);
    expect((NodeClass as unknown as { isStreamingOutput?: boolean }).isStreamingOutput).toBeFalsy();
    expect(NodeClass.outputCorrelation).toBeUndefined();
  });

  it("process() returns a single image and calls kieExecuteTask once", async () => {
    vi.mocked(kieExecuteTask).mockResolvedValue({
      data: "AAAA",
      items: ["AAAA", "BBBB", "CCCC"],
      taskId: "t"
    });

    const NodeClass = createKieNodeClass(imageSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "a cat";
    node.setDynamic("_secrets", { KIE_API_KEY: "test" });

    const result = await node.process();
    expect((result as { output: { type: string } }).output.type).toBe("image");
    expect(kieExecuteTask).toHaveBeenCalledTimes(1);
  });

  it("forces num_images=1 when the manifest defines a native num_images field", async () => {
    vi.mocked(kieExecuteTask).mockResolvedValue({
      data: "AAAA",
      items: ["AAAA"],
      taskId: "t"
    });

    const NodeClass = createKieNodeClass(imageSpecWithNativeNumImages);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "a cat";
    // Even if a stale value is set, the factory ignores it and pins to 1.
    (node as unknown as Record<string, unknown>).num_images = "4";
    node.setDynamic("_secrets", { KIE_API_KEY: "test" });

    await node.process();
    const params = vi.mocked(kieExecuteTask).mock.calls[0][2] as Record<string, unknown>;
    expect(params.num_images).toBe("1");
  });
});
