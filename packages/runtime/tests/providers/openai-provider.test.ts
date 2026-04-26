import { describe, it, expect, vi } from "vitest";
import { OpenAIProvider } from "../../src/providers/openai-provider.js";
import type {
  Message,
  TextToImageParams,
  ImageToImageParams,
  TextTo3DParams,
  ImageTo3DParams,
  Model3D,
  TextToVideoParams,
  ImageToVideoParams
} from "../../src/providers/types.js";

function makeAsyncIterable(items: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
    async close() {
      return;
    }
  };
}

describe("OpenAIProvider", () => {
  it("reports tool support with o1/o3 exceptions", async () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    expect(await provider.hasToolSupport("gpt-4o")).toBe(true);
    expect(await provider.hasToolSupport("o1-mini")).toBe(false);
    expect(await provider.hasToolSupport("o3-mini")).toBe(false);
  });

  it("resolves image/video size helpers", () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    expect(provider.resolveImageSize(1024, 1024)).toBe("1024x1024");
    expect(OpenAIProvider.resolveVideoSize("16:9", "720p")).toBe("1280x720");
    expect(OpenAIProvider.secondsFromParams({ numFrames: 12 })).toBe(4);
    expect(OpenAIProvider.snapToValidVideoDimensions(1920, 1080)).toBe(
      "1280x720"
    );
  });

  it("converts messages into OpenAI format", async () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    const user: Message = { role: "user", content: "hello" };
    const assistant: Message = {
      role: "assistant",
      content: "ok",
      toolCalls: [{ id: "tc1", name: "sum", args: { a: 1 } }]
    };

    await expect(provider.convertMessage(user)).resolves.toEqual({
      role: "user",
      content: "hello"
    });

    await expect(provider.convertMessage(assistant)).resolves.toEqual({
      role: "assistant",
      content: "ok",
      tool_calls: [
        {
          type: "function",
          id: "tc1",
          function: {
            name: "sum",
            arguments: '{"a":1}'
          }
        }
      ]
    });
  });

  it("generates non-streaming message and parses tool calls", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "done",
            tool_calls: [
              {
                id: "tc1",
                function: { name: "sum", arguments: '{"a":1}' }
              }
            ]
          }
        }
      ]
    });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } }
        } as any
      }
    );

    const result = await provider.generateMessage({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }]
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      role: "assistant",
      content: "done",
      toolCalls: [{ id: "tc1", name: "sum", args: { a: 1 } }]
    });
  });

  it("streams chunks and tool calls", async () => {
    const stream = makeAsyncIterable([
      {
        choices: [{ delta: { content: "Hello" }, finish_reason: null }]
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "tc1",
                  function: { name: "lookup", arguments: '{"q":' }
                }
              ]
            },
            finish_reason: null
          }
        ]
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '"x"}' }
                }
              ]
            },
            finish_reason: "tool_calls"
          }
        ]
      },
      {
        choices: [{ delta: { content: "" }, finish_reason: "stop" }]
      }
    ]);

    const create = vi.fn().mockResolvedValue(stream);

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      {
        client: {
          chat: { completions: { create } }
        } as any
      }
    );

    const out: Array<unknown> = [];
    for await (const item of provider.generateMessages({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }]
    })) {
      out.push(item);
    }

    expect(out).toEqual([
      { type: "chunk", content: "Hello", done: false },
      { id: "tc1", name: "lookup", args: { q: "x" } },
      { type: "chunk", content: "", done: true }
    ]);
  });

  it("returns static model lists", async () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    await expect(provider.getAvailableASRModels()).resolves.toHaveLength(1);
    await expect(provider.getAvailableTTSModels()).resolves.toHaveLength(2);
    await expect(provider.getAvailableImageModels()).resolves.toHaveLength(4);
    await expect(provider.getAvailableVideoModels()).resolves.toHaveLength(2);
    await expect(provider.getAvailableEmbeddingModels()).resolves.toHaveLength(
      3
    );
  });

  // ─── defaultSerializer tests (exercised through convertMessage) ───

  describe("defaultSerializer (via convertMessage)", () => {
    function makeProvider() {
      return new OpenAIProvider({ OPENAI_API_KEY: "k" }, { client: {} as any });
    }

    it("serializes BigInt values as numbers in tool message content", async () => {
      const provider = makeProvider();
      const msg: Message = {
        role: "tool",
        toolCallId: "tc1",
        content: { value: BigInt(9007199254740991) } as any
      };
      const result = await provider.convertMessage(msg);
      expect(result.content).toBe('{"value":9007199254740991}');
    });

    it("serializes Date objects as ISO strings in tool message content", async () => {
      const provider = makeProvider();
      const date = new Date("2025-06-15T12:00:00.000Z");
      const msg: Message = {
        role: "tool",
        toolCallId: "tc1",
        content: { timestamp: date } as any
      };
      const result = await provider.convertMessage(msg);
      expect(result.content).toBe('{"timestamp":"2025-06-15T12:00:00.000Z"}');
    });

    it("serializes Map objects as plain objects in tool message content", async () => {
      const provider = makeProvider();
      const map = new Map<string, number>([
        ["a", 1],
        ["b", 2]
      ]);
      const msg: Message = {
        role: "tool",
        toolCallId: "tc1",
        content: { data: map } as any
      };
      const result = await provider.convertMessage(msg);
      expect(result.content).toBe('{"data":{"a":1,"b":2}}');
    });

    it("serializes Set objects as arrays in tool message content", async () => {
      const provider = makeProvider();
      const set = new Set([10, 20, 30]);
      const msg: Message = {
        role: "tool",
        toolCallId: "tc1",
        content: { items: set } as any
      };
      const result = await provider.convertMessage(msg);
      expect(result.content).toBe('{"items":[10,20,30]}');
    });

    it("uses toJSON() method when present in tool message content", async () => {
      const provider = makeProvider();
      const custom = {
        internal: "secret",
        toJSON() {
          return { exposed: true };
        }
      };
      const msg: Message = {
        role: "tool",
        toolCallId: "tc1",
        content: { obj: custom } as any
      };
      const result = await provider.convertMessage(msg);
      expect(result.content).toBe('{"obj":{"exposed":true}}');
    });

    it("passes regular primitives and objects through unchanged", async () => {
      const provider = makeProvider();
      const msg: Message = {
        role: "tool",
        toolCallId: "tc1",
        content: { num: 42, str: "hello", flag: true, nothing: null } as any
      };
      const result = await provider.convertMessage(msg);
      expect(result.content).toBe(
        '{"num":42,"str":"hello","flag":true,"nothing":null}'
      );
    });

    it("handles nested structures with mixed types", async () => {
      const provider = makeProvider();
      const nested = {
        bigVal: BigInt(123),
        date: new Date("2024-01-01T00:00:00.000Z"),
        mapping: new Map([["key", "val"]]),
        unique: new Set(["x", "y"]),
        custom: { toJSON: () => "custom-json" },
        plain: { a: 1 }
      };
      const msg: Message = {
        role: "tool",
        toolCallId: "tc1",
        content: nested as any
      };
      const result = await provider.convertMessage(msg);
      const parsed = JSON.parse(result.content as string);
      expect(parsed).toEqual({
        bigVal: 123,
        date: "2024-01-01T00:00:00.000Z",
        mapping: { key: "val" },
        unique: ["x", "y"],
        custom: "custom-json",
        plain: { a: 1 }
      });
    });

    it("serializes BigInt in assistant tool call arguments", async () => {
      const provider = makeProvider();
      const msg: Message = {
        role: "assistant",
        content: "ok",
        toolCalls: [{ id: "tc1", name: "calc", args: { n: BigInt(42) } as any }]
      };
      const result = await provider.convertMessage(msg);
      expect(result.tool_calls).toEqual([
        {
          type: "function",
          id: "tc1",
          function: { name: "calc", arguments: '{"n":42}' }
        }
      ]);
    });

    it("handles null and undefined values", async () => {
      const provider = makeProvider();
      const msg: Message = {
        role: "tool",
        toolCallId: "tc1",
        content: { a: null, b: undefined } as any
      };
      const result = await provider.convertMessage(msg);
      // JSON.stringify omits undefined values by default
      expect(result.content).toBe('{"a":null}');
    });

    it("serializes string content directly without JSON.stringify", async () => {
      const provider = makeProvider();
      const msg: Message = {
        role: "tool",
        toolCallId: "tc1",
        content: "plain string result"
      };
      const result = await provider.convertMessage(msg);
      expect(result.content).toBe("plain string result");
    });
  });

  // ─── Type interface compile-time checks ───

  describe("new type interfaces", () => {
    it("TextToImageParams accepts guidanceScale, numInferenceSteps, seed, scheduler, safetyCheck", () => {
      const params: TextToImageParams = {
        model: { id: "test", name: "Test", provider: "openai" },
        prompt: "a cat",
        guidanceScale: 7.5,
        numInferenceSteps: 30,
        seed: 42,
        scheduler: "euler",
        safetyCheck: false
      };
      expect(params.guidanceScale).toBe(7.5);
      expect(params.numInferenceSteps).toBe(30);
      expect(params.seed).toBe(42);
      expect(params.scheduler).toBe("euler");
      expect(params.safetyCheck).toBe(false);
    });

    it("TextToImageParams fields are optional (nullable)", () => {
      const params: TextToImageParams = {
        model: { id: "test", name: "Test", provider: "openai" },
        prompt: "a cat",
        guidanceScale: null,
        numInferenceSteps: null,
        seed: null,
        scheduler: null,
        safetyCheck: null
      };
      expect(params.guidanceScale).toBeNull();
    });

    it("ImageToImageParams accepts strength and other new fields", () => {
      const params: ImageToImageParams = {
        model: { id: "test", name: "Test", provider: "openai" },
        prompt: "transform",
        strength: 0.8,
        guidanceScale: 7.0,
        numInferenceSteps: 20,
        seed: 123,
        scheduler: "ddim"
      };
      expect(params.strength).toBe(0.8);
      expect(params.guidanceScale).toBe(7.0);
      expect(params.numInferenceSteps).toBe(20);
      expect(params.seed).toBe(123);
      expect(params.scheduler).toBe("ddim");
    });

    it("Model3D interface has expected shape", () => {
      const model: Model3D = {
        id: "mesh-gen-1",
        name: "Mesh Generator",
        provider: "openai",
        supportedTasks: ["text_to_3d", "image_to_3d"]
      };
      expect(model.id).toBe("mesh-gen-1");
      expect(model.supportedTasks).toContain("text_to_3d");
    });

    it("TextTo3DParams interface has expected shape", () => {
      const params: TextTo3DParams = {
        model: { id: "m1", name: "M1", provider: "test" },
        prompt: "a chair",
        negativePrompt: "broken",
        artStyle: "realistic",
        outputFormat: "glb",
        seed: 99
      };
      expect(params.prompt).toBe("a chair");
      expect(params.artStyle).toBe("realistic");
      expect(params.outputFormat).toBe("glb");
    });

    it("ImageTo3DParams interface has expected shape", () => {
      const params: ImageTo3DParams = {
        model: { id: "m2", name: "M2", provider: "test" },
        prompt: "convert to 3d",
        outputFormat: "obj",
        seed: 7
      };
      expect(params.prompt).toBe("convert to 3d");
      expect(params.outputFormat).toBe("obj");
      expect(params.seed).toBe(7);
    });

    it("TextToVideoParams and ImageToVideoParams accept new fields", () => {
      const textToVideo: TextToVideoParams = {
        model: { id: "v1", name: "V1", provider: "openai" },
        prompt: "a sunset",
        guidanceScale: 5.0,
        numInferenceSteps: 50,
        seed: 1234
      };
      expect(textToVideo.guidanceScale).toBe(5.0);

      const imageToVideo: ImageToVideoParams = {
        model: { id: "v2", name: "V2", provider: "openai" },
        guidanceScale: 3.0,
        numInferenceSteps: 25,
        seed: 5678
      };
      expect(imageToVideo.seed).toBe(5678);
    });
  });
});
