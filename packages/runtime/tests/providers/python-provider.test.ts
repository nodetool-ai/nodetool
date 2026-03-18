import { describe, it, expect, vi, beforeEach } from "vitest";
import { PythonProvider } from "../../src/providers/python-provider.js";
import type { PythonBridge } from "../../src/python-bridge.js";

// ---------------------------------------------------------------------------
// Mock PythonBridge
// ---------------------------------------------------------------------------

function createMockBridge(overrides: Partial<PythonBridge> = {}): PythonBridge {
  return {
    getProviderModels: vi.fn().mockResolvedValue([]),
    providerGenerate: vi.fn().mockResolvedValue({ role: "assistant", content: "ok" }),
    providerStream: vi.fn().mockReturnValue(
      (async function* () {
        yield { type: "chunk", content: "hi", done: true };
      })()
    ),
    providerTextToImage: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    providerImageToImage: vi.fn().mockResolvedValue(new Uint8Array([4, 5, 6])),
    providerTTS: vi.fn().mockReturnValue(
      (async function* () {
        yield new Uint8Array(new Int16Array([100, 200]).buffer);
      })()
    ),
    providerASR: vi.fn().mockResolvedValue("transcribed text"),
    providerEmbedding: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    ...overrides,
  } as unknown as PythonBridge;
}

describe("PythonProvider constructor", () => {
  it("creates with provider id", () => {
    const bridge = createMockBridge();
    const p = new PythonProvider("huggingface", bridge);
    expect(p.provider).toBe("huggingface");
  });

  it("has no required secrets", () => {
    expect(PythonProvider.requiredSecrets()).toEqual([]);
  });
});

describe("PythonProvider model discovery", () => {
  let bridge: PythonBridge;
  let provider: PythonProvider;

  beforeEach(() => {
    bridge = createMockBridge({
      getProviderModels: vi.fn().mockResolvedValue([
        { id: "model-1", name: "Model 1", provider: "huggingface" },
      ]),
    });
    provider = new PythonProvider("huggingface", bridge);
  });

  it("getAvailableLanguageModels calls bridge with 'language'", async () => {
    const models = await provider.getAvailableLanguageModels();
    expect(bridge.getProviderModels).toHaveBeenCalledWith(
      "huggingface",
      "language",
      {}
    );
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("model-1");
  });

  it("getAvailableImageModels calls bridge with 'image'", async () => {
    await provider.getAvailableImageModels();
    expect(bridge.getProviderModels).toHaveBeenCalledWith(
      "huggingface",
      "image",
      {}
    );
  });

  it("getAvailableTTSModels calls bridge with 'tts'", async () => {
    await provider.getAvailableTTSModels();
    expect(bridge.getProviderModels).toHaveBeenCalledWith(
      "huggingface",
      "tts",
      {}
    );
  });

  it("getAvailableASRModels calls bridge with 'asr'", async () => {
    await provider.getAvailableASRModels();
    expect(bridge.getProviderModels).toHaveBeenCalledWith(
      "huggingface",
      "asr",
      {}
    );
  });

  it("getAvailableEmbeddingModels calls bridge with 'embedding'", async () => {
    await provider.getAvailableEmbeddingModels();
    expect(bridge.getProviderModels).toHaveBeenCalledWith(
      "huggingface",
      "embedding",
      {}
    );
  });

  it("getAvailableVideoModels calls bridge with 'video'", async () => {
    await provider.getAvailableVideoModels();
    expect(bridge.getProviderModels).toHaveBeenCalledWith(
      "huggingface",
      "video",
      {}
    );
  });

  it("passes secrets to bridge for model discovery", async () => {
    const secretBridge = createMockBridge({
      getProviderModels: vi.fn().mockResolvedValue([]),
    });
    const p = new PythonProvider("mlx", secretBridge, {
      HF_TOKEN: "tok-123",
    });
    await p.getAvailableLanguageModels();
    expect(secretBridge.getProviderModels).toHaveBeenCalledWith(
      "mlx",
      "language",
      { HF_TOKEN: "tok-123" }
    );
  });
});

describe("PythonProvider.generateMessage", () => {
  it("serializes messages and returns deserialized response", async () => {
    const bridge = createMockBridge({
      providerGenerate: vi.fn().mockResolvedValue({
        role: "assistant",
        content: "Hello from Python",
      }),
    });
    const provider = new PythonProvider("hf", bridge);

    const result = await provider.generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "llama-3",
      maxTokens: 100,
      temperature: 0.7,
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("Hello from Python");
    expect(bridge.providerGenerate).toHaveBeenCalledWith(
      "hf",
      [{ role: "user", content: "hi" }],
      "llama-3",
      expect.objectContaining({
        secrets: {},
        max_tokens: 100,
        temperature: 0.7,
      })
    );
  });

  it("deserializes tool_calls from wire format", async () => {
    const bridge = createMockBridge({
      providerGenerate: vi.fn().mockResolvedValue({
        role: "assistant",
        tool_calls: [{ id: "tc1", name: "search", args: { q: "test" } }],
      }),
    });
    const provider = new PythonProvider("hf", bridge);

    const result = await provider.generateMessage({
      messages: [{ role: "user", content: "search for test" }],
      model: "m",
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe("search");
  });

  it("serializes tool call messages properly", async () => {
    const bridge = createMockBridge({
      providerGenerate: vi.fn().mockResolvedValue({
        role: "assistant",
        content: "result",
      }),
    });
    const provider = new PythonProvider("hf", bridge);

    await provider.generateMessage({
      messages: [
        {
          role: "assistant",
          toolCalls: [{ id: "tc1", name: "fn", args: { x: 1 } }],
        },
        {
          role: "tool",
          content: "tool result",
          toolCallId: "tc1",
        },
      ],
      model: "m",
    });

    const sentMessages = (bridge.providerGenerate as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(sentMessages[0]).toMatchObject({
      role: "assistant",
      tool_calls: [{ id: "tc1", name: "fn", args: { x: 1 } }],
    });
    expect(sentMessages[1]).toMatchObject({
      role: "tool",
      content: "tool result",
      tool_call_id: "tc1",
    });
  });
});

describe("PythonProvider.generateMessages (streaming)", () => {
  it("yields text chunks", async () => {
    const bridge = createMockBridge({
      providerStream: vi.fn().mockReturnValue(
        (async function* () {
          yield { type: "chunk", content: "hello ", done: false };
          yield { type: "chunk", content: "world", done: true };
        })()
      ),
    });
    const provider = new PythonProvider("hf", bridge);

    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "hi" }],
      model: "m",
    })) {
      items.push(item);
    }

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: "chunk", content: "hello " });
    expect(items[1]).toMatchObject({ type: "chunk", content: "world", done: true });
  });

  it("yields tool calls", async () => {
    const bridge = createMockBridge({
      providerStream: vi.fn().mockReturnValue(
        (async function* () {
          yield {
            type: "tool_call",
            id: "tc1",
            name: "calculator",
            args: { expr: "2+2" },
          };
        })()
      ),
    });
    const provider = new PythonProvider("hf", bridge);

    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages: [],
      model: "m",
    })) {
      items.push(item);
    }

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "tc1",
      name: "calculator",
      args: { expr: "2+2" },
    });
  });
});

describe("PythonProvider.textToImage", () => {
  it("delegates to bridge", async () => {
    const expected = new Uint8Array([10, 20, 30]);
    const bridge = createMockBridge({
      providerTextToImage: vi.fn().mockResolvedValue(expected),
    });
    const provider = new PythonProvider("hf", bridge);

    const result = await provider.textToImage({
      model: { id: "sdxl", name: "SDXL", provider: "hf" },
      prompt: "a cat",
    });

    expect(result).toBe(expected);
    expect(bridge.providerTextToImage).toHaveBeenCalledWith(
      "hf",
      expect.objectContaining({ prompt: "a cat" }),
      {}
    );
  });
});

describe("PythonProvider.imageToImage", () => {
  it("delegates to bridge", async () => {
    const input = new Uint8Array([1, 2]);
    const expected = new Uint8Array([3, 4]);
    const bridge = createMockBridge({
      providerImageToImage: vi.fn().mockResolvedValue(expected),
    });
    const provider = new PythonProvider("hf", bridge);

    const result = await provider.imageToImage(input, {
      model: { id: "sdxl", name: "SDXL", provider: "hf" },
      prompt: "stylize",
    });

    expect(result).toBe(expected);
  });
});

describe("PythonProvider.textToSpeech", () => {
  it("yields streaming audio chunks", async () => {
    const audioBytes = new Uint8Array(new Int16Array([100, 200, 300]).buffer);
    const bridge = createMockBridge({
      providerTTS: vi.fn().mockReturnValue(
        (async function* () {
          yield audioBytes;
        })()
      ),
    });
    const provider = new PythonProvider("hf", bridge);

    const chunks: unknown[] = [];
    for await (const chunk of provider.textToSpeech({
      text: "hello",
      model: "tts-1",
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    const samples = (chunks[0] as { samples: Int16Array }).samples;
    expect(samples).toBeInstanceOf(Int16Array);
  });
});

describe("PythonProvider.automaticSpeechRecognition", () => {
  it("delegates to bridge and returns text", async () => {
    const bridge = createMockBridge({
      providerASR: vi.fn().mockResolvedValue("hello world"),
    });
    const provider = new PythonProvider("hf", bridge);

    const result = await provider.automaticSpeechRecognition({
      audio: new Uint8Array([1, 2, 3]),
      model: "whisper-large",
      language: "en",
    });

    expect(result).toBe("hello world");
  });
});

describe("PythonProvider.generateEmbedding", () => {
  it("delegates to bridge and returns vectors", async () => {
    const bridge = createMockBridge({
      providerEmbedding: vi.fn().mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]),
    });
    const provider = new PythonProvider("hf", bridge);

    const result = await provider.generateEmbedding({
      text: ["hello", "world"],
      model: "bge-small",
      dimensions: 384,
    });

    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(bridge.providerEmbedding).toHaveBeenCalledWith(
      "hf",
      ["hello", "world"],
      "bge-small",
      384
    );
  });
});
