import { describe, expect, it } from "vitest";
import { createKieNodeClass } from "../src/kie-factory.js";
import type { KieManifestEntry } from "../src/kie-factory.js";
import { scriptedKie } from "./scripted-kie.js";

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
  it("returns plain string ID from omni audio node", async () => {
    const kie = scriptedKie({
      endpoints: { "*": { output: { code: 200, data: { audioId: "audio_abc" } } } }
    });

    const NodeClass = createKieNodeClass(audioSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).name = "Test Voice";
    (node as unknown as Record<string, unknown>).audio_id = "achernar";

    const result = await node.process(kie.context);
    expect(result).toEqual({ output: "audio_abc" });
    expect(kie.provider.endpointCalls[0]).toMatchObject({
      model: "gemini-omni-audio",
      route: "direct:/api/v1/omni/audio/create",
      input: { audio_id: "achernar", name: "Test Voice" },
      // The run's cancellation signal, threaded through to the transport.
      signal: expect.any(AbortSignal)
    });
  });

  it("submits video_list clip trim metadata to createTask", async () => {

    const clipVideoSpec: KieManifestEntry = {
      ...videoSpec,
      fields: [
        ...videoSpec.fields,
        { name: "video_list", type: "list[video]", default: [] }
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
        uri: "",
        data: new Uint8Array([0, 0, 0, 1]),
        metadata: { clipStart: 2, clipEnd: 7 }
      }
    ];
    const kie = scriptedKie({
      uploadUrl: () => "https://cdn.example.com/source.mp4"
    });

    await node.process(kie.context);

    expect(kie.provider.uploadCalls).toHaveLength(1);
    expect(kie.provider.uploadCalls[0].mimeType).toBe("video/mp4");
    expect(kie.provider.endpointCalls.at(-1)).toMatchObject({
      model: "gemini-omni-video",
      input: expect.objectContaining({
        video_list: [{ url: "https://cdn.example.com/source.mp4", start: 2, ends: 7 }]
      })
    });
  });

  it("submits wired audio_ids to video createTask", async () => {

    const NodeClass = createKieNodeClass(videoSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "Neon city";
    (node as unknown as Record<string, unknown>).duration = "8";
    (node as unknown as Record<string, unknown>).audio_ids = ["audio_abc"];
    const kie = scriptedKie();

    await node.process(kie.context);

    expect(kie.provider.endpointCalls.at(-1)).toMatchObject({
      model: "gemini-omni-video",
      input: expect.objectContaining({
        prompt: "Neon city",
        duration: "8",
        audio_ids: ["audio_abc"]
      })
    });
  });

  it("wraps single string into audio_ids list", async () => {

    const NodeClass = createKieNodeClass(videoSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "Neon city";
    (node as unknown as Record<string, unknown>).duration = "8";
    (node as unknown as Record<string, unknown>).audio_ids = "audio_abc";
    const kie = scriptedKie();

    await node.process(kie.context);

    expect(kie.provider.endpointCalls.at(-1)).toMatchObject({
      model: "gemini-omni-video",
      input: expect.objectContaining({ audio_ids: ["audio_abc"] })
    });
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

  it("reports the credits the provider returned, keyed by the task id", async () => {
    const kie = scriptedKie();
    kie.provider.scriptEndpoint("gemini-omni-video", {
      output: {
        code: 200,
        data: {
          state: "success",
          resultJson: JSON.stringify({ resultUrls: ["https://kie.cdn.test/result.bin"] })
        }
      },
      requestId: "task_cost",
      metadata: { creditsConsumed: 9 }
    });

    const NodeClass = createKieNodeClass(videoSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "Neon city";
    (node as unknown as Record<string, unknown>).duration = "8";

    await node.process(kie.context);

    expect(kie.context.getProviderCost()).toEqual({
      provider: "kie",
      amount: 0.045,
      unit: "USD",
      billing_unit: "credits",
      quantity: 9,
      unit_price: 0.005,
      currency: "USD",
      provider_request_id: "task_cost"
    });
  });

  it("runs through the generation seam and emits a kie prediction", async () => {
    const kie = scriptedKie();
    const NodeClass = createKieNodeClass(videoSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "Neon city";
    (node as unknown as Record<string, unknown>).duration = "8";
    node.assign({ __node_id: "video-node" });

    await node.process(kie.context);

    const predictions = kie.context
      .getMessages()
      .filter((message) => message.type === "prediction");
    expect(predictions.at(-1)).toMatchObject({
      status: "completed",
      provider: "kie",
      capability: "text_to_video",
      model: "gemini-omni-video",
      node_id: "video-node"
    });
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

  it("process() returns a single image from one endpoint call", async () => {

    const NodeClass = createKieNodeClass(imageSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "a cat";
    const kie = scriptedKie();

    const result = await node.process(kie.context);
    expect((result as { output: { type: string } }).output.type).toBe("image");
    expect(kie.provider.endpointCalls).toHaveLength(1);
  });

  it("forces num_images=1 when the manifest defines a native num_images field", async () => {

    const NodeClass = createKieNodeClass(imageSpecWithNativeNumImages);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "a cat";
    // Even if a stale value is set, the factory ignores it and pins to 1.
    (node as unknown as Record<string, unknown>).num_images = "4";
    const kie = scriptedKie();

    await node.process(kie.context);
    const params = kie.provider.endpointCalls.at(-1)!.input;
    expect(params.num_images).toBe("1");
  });
});

const valueListSpec: KieManifestEntry = {
  className: "Kling30OmniTextToVideo",
  moduleName: "video",
  modelId: "kling-3.0-omni/text-to-video",
  title: "Kling 3.0 Omni Text to Video",
  description: "test",
  outputType: "video",
  pollInterval: 8000,
  maxAttempts: 450,
  fields: [
    { name: "prompt", type: "str", default: "", required: true },
    { name: "multi_prompt", type: "list[dict]", default: [] },
    { name: "mask_indexs", type: "list[int]", default: [] },
    { name: "weights", type: "list[float]", default: [] }
  ]
};

describe("createKieNodeClass value lists", () => {
  const runWith = async (values: Record<string, unknown>) => {
    const NodeClass = createKieNodeClass(valueListSpec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    Object.assign(node as unknown as Record<string, unknown>, {
      prompt: "a fox",
      ...values
    });
    const kie = scriptedKie();
    await node.process(kie.context);
    return kie.provider.endpointCalls.at(-1)!.input;
  };

  it("sends object and number lists by value instead of stringifying them", async () => {
    const params = await runWith({
      multi_prompt: [{ prompt: "wide shot", duration: 2 }],
      mask_indexs: [1, "2"],
      weights: [0.5, 1]
    });

    expect(params.multi_prompt).toEqual([{ prompt: "wide shot", duration: 2 }]);
    expect(params.mask_indexs).toEqual([1, 2]);
    expect(params.weights).toEqual([0.5, 1]);
  });

  it("omits an empty value list rather than sending an empty array", async () => {
    const params = await runWith({});

    expect(params).not.toHaveProperty("multi_prompt");
    expect(params).not.toHaveProperty("mask_indexs");
    expect(params).not.toHaveProperty("weights");
  });

  it("parses a JSON string wired into a list[dict] parameter", async () => {
    const params = await runWith({
      multi_prompt: '[{"prompt":"close-up","duration":3}]'
    });

    expect(params.multi_prompt).toEqual([
      { prompt: "close-up", duration: 3 }
    ]);
  });

  it("exposes value lists as input handles", () => {
    const NodeClass = createKieNodeClass(valueListSpec);
    const inputFields = (
      NodeClass as unknown as { inputFields: string[] }
    ).inputFields;

    expect(inputFields).toEqual(
      expect.arrayContaining(["multi_prompt", "mask_indexs", "weights"])
    );
  });

  it("omits a zero its field's minimum forbids and keeps a zero it allows", async () => {
    const spec: KieManifestEntry = {
      className: "ZeroVideo",
      moduleName: "video",
      modelId: "zero-video",
      title: "Zero Video",
      description: "test",
      outputType: "video",
      pollInterval: 8000,
      maxAttempts: 450,
      fields: [
        { name: "prompt", type: "str", default: "" },
        { name: "duration", type: "float", default: 0, min: 4, max: 12 },
        { name: "seed", type: "int", default: 0, min: 0 }
      ]
    };
    const NodeClass = createKieNodeClass(spec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    (node as unknown as Record<string, unknown>).prompt = "a red cube";
    const kie = scriptedKie();

    await node.process(kie.context);

    const params = kie.provider.endpointCalls.at(-1)!.input;
    expect(params).toEqual({ prompt: "a red cube", seed: 0 });
  });
});
