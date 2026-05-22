import { describe, expect, it, vi, afterEach } from "vitest";
import { createKieNodeClass } from "../src/kie-factory.js";
import type { KieManifestEntry } from "../src/kie-factory.js";

vi.mock("../src/kie-base.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/kie-base.js")>();
  return {
    ...actual,
    getApiKey: () => "test-key",
    kieExecuteOmniDirect: vi.fn(),
    kieExecuteTask: vi.fn()
  };
});

import { kieExecuteOmniDirect, kieExecuteTask } from "../src/kie-base.js";

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

  it("submits wired audio_ids to video createTask", async () => {
    vi.mocked(kieExecuteTask).mockResolvedValue({
      data: Buffer.from("video-bytes").toString("base64"),
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
});
