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
// Multi-variant output (num_outputs / native num_images)
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

async function consumeAsync<T>(iter: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe("createKieNodeClass multi-variant", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registers num_outputs and isStreamingOutput on image nodes without native num_images", () => {
    const NodeClass = createKieNodeClass(imageSpec);
    const props = (NodeClass as any).getDeclaredProperties() as Array<{
      name: string;
      options: { type: string; min?: number; max?: number; default?: unknown };
    }>;
    const numOutputs = props.find((p) => p.name === "num_outputs");
    expect(numOutputs).toBeDefined();
    expect(numOutputs!.options.type).toBe("int");
    expect(numOutputs!.options.min).toBe(1);
    expect(numOutputs!.options.max).toBe(8);
    expect(numOutputs!.options.default).toBe(1);
    expect((NodeClass as unknown as { isStreamingOutput: boolean }).isStreamingOutput).toBe(true);
    expect(NodeClass.outputCorrelation).toEqual({
      output: { kind: "iteration", source: "__execution__" }
    });
    expect(NodeClass.toDescriptor("kie").output_correlation).toEqual({
      output: { kind: "iteration", source: "__execution__" }
    });
  });

  it("does not register num_outputs on nodes with native num_images", () => {
    const NodeClass = createKieNodeClass(imageSpecWithNativeNumImages);
    const props = (NodeClass as any).getDeclaredProperties() as Array<{ name: string }>;
    expect(props.find((p) => p.name === "num_outputs")).toBeUndefined();
    expect(props.find((p) => p.name === "num_images")).toBeDefined();
    expect((NodeClass as unknown as { isStreamingOutput: boolean }).isStreamingOutput).toBe(true);
  });

  it("does not register num_outputs or isStreamingOutput on omni or text-output nodes", () => {
    const NodeClass = createKieNodeClass(audioSpec);
    const props = (NodeClass as any).getDeclaredProperties() as Array<{ name: string }>;
    expect(props.find((p) => p.name === "num_outputs")).toBeUndefined();
    expect((NodeClass as unknown as { isStreamingOutput?: boolean }).isStreamingOutput).toBeFalsy();
    expect(NodeClass.outputCorrelation).toBeUndefined();
  });

  it("fans out N parallel kieExecuteTask calls when num_outputs > 1 (no native field)", async () => {
    vi.mocked(kieExecuteTask).mockImplementation(async () => ({
      data: "AAAA",
      items: ["AAAA"],
      taskId: "t"
    }));

    const NodeClass = createKieNodeClass(imageSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "a cat";
    (node as unknown as Record<string, unknown>).num_outputs = 4;
    node.setDynamic("_secrets", { KIE_API_KEY: "test" });

    const outputs = await consumeAsync(node.genProcess());
    expect(outputs).toHaveLength(4);
    expect(kieExecuteTask).toHaveBeenCalledTimes(4);
    // num_outputs should NOT be sent to the API
    for (const call of vi.mocked(kieExecuteTask).mock.calls) {
      const params = call[2] as Record<string, unknown>;
      expect(params).not.toHaveProperty("num_outputs");
      expect(params).toMatchObject({ prompt: "a cat" });
    }
    for (const o of outputs) {
      expect((o as { output: { type: string } }).output.type).toBe("image");
    }
  });

  it("clamps num_outputs to [1, 8]", async () => {
    vi.mocked(kieExecuteTask).mockResolvedValue({
      data: "AAAA",
      items: ["AAAA"],
      taskId: "t"
    });

    const NodeClass = createKieNodeClass(imageSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "a cat";
    (node as unknown as Record<string, unknown>).num_outputs = 999;
    node.setDynamic("_secrets", { KIE_API_KEY: "test" });

    const outputs = await consumeAsync(node.genProcess());
    expect(outputs).toHaveLength(8);
    expect(kieExecuteTask).toHaveBeenCalledTimes(8);
  });

  it("uses native num_images: single API call yields multiple items", async () => {
    vi.mocked(kieExecuteTask).mockResolvedValue({
      data: "AAAA",
      items: ["AAAA", "BBBB", "CCCC"],
      taskId: "t"
    });

    const NodeClass = createKieNodeClass(imageSpecWithNativeNumImages);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "a cat";
    (node as unknown as Record<string, unknown>).num_images = "3";
    node.setDynamic("_secrets", { KIE_API_KEY: "test" });

    const outputs = await consumeAsync(node.genProcess());
    expect(outputs).toHaveLength(3);
    expect(kieExecuteTask).toHaveBeenCalledTimes(1);
    const params = vi.mocked(kieExecuteTask).mock.calls[0][2] as Record<string, unknown>;
    expect(params.num_images).toBe("3");
  });

  it("genProcess yields once at num_outputs=1 and calls kieExecuteTask once", async () => {
    vi.mocked(kieExecuteTask).mockResolvedValue({
      data: "AAAA",
      items: ["AAAA"],
      taskId: "t"
    });

    const NodeClass = createKieNodeClass(imageSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "a cat";
    node.setDynamic("_secrets", { KIE_API_KEY: "test" });

    const outputs = await consumeAsync(node.genProcess());
    expect(outputs).toHaveLength(1);
    expect(kieExecuteTask).toHaveBeenCalledTimes(1);
  });

  it("propagates errors from fanned-out tasks", async () => {
    vi.mocked(kieExecuteTask)
      .mockResolvedValueOnce({ data: "AAAA", items: ["AAAA"], taskId: "t1" })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ data: "CCCC", items: ["CCCC"], taskId: "t3" });

    const NodeClass = createKieNodeClass(imageSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "a cat";
    (node as unknown as Record<string, unknown>).num_outputs = 3;
    node.setDynamic("_secrets", { KIE_API_KEY: "test" });

    await expect(consumeAsync(node.genProcess())).rejects.toThrow("boom");
  });
});
