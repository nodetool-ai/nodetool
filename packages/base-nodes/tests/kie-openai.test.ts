import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { getNodeMetadata } from "@nodetool/node-sdk";
import {
  EmbeddingNode,
  WebSearchNode,
  ModerationNode,
  CreateImageNode,
  EditImageNode,
  TextToSpeechNode,
  TranslateNode,
  TranscribeNode,
  RealtimeAgentNode,
  RealtimeTranscriptionNode,
} from "../src/nodes/openai.js";

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.OPENAI_API_KEY;
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    blob: async () => new Blob([new Uint8Array([1, 2, 3])]),
  } as unknown as Response;
}

function metadataDefaults(NodeCls: any) {
  const metadata = getNodeMetadata(NodeCls);
  return Object.fromEntries(
    metadata.properties
      .filter((prop) => Object.prototype.hasOwnProperty.call(prop, "default"))
      .map((prop) => [prop.name, prop.default])
  );
}

function expectMetadataDefaults(NodeCls: any) {
  expect(new NodeCls().serialize()).toEqual(metadataDefaults(NodeCls));
}

const secrets = { _secrets: { OPENAI_API_KEY: "test-key" } };

// ── EmbeddingNode ──────────────────────────────────────────────────────────

describe("EmbeddingNode", () => {
  it("returns averaged embedding", async () => {
    const node = new EmbeddingNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      })
    );
    const result = await node.process({ input: "hello", ...secrets });
    expect(result.output).toEqual([0.1, 0.2, 0.3]);
  });

  it("averages multiple chunk embeddings", async () => {
    const node = new EmbeddingNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { embedding: [1.0, 2.0] },
          { embedding: [3.0, 4.0] },
        ],
      })
    );
    const result = await node.process({
      input: "a".repeat(5000),
      chunk_size: 4096,
      ...secrets,
    });
    expect((result.output as number[])[0]).toBeCloseTo(2.0);
    expect((result.output as number[])[1]).toBeCloseTo(3.0);
  });

  it("handles empty input text", async () => {
    const node = new EmbeddingNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ embedding: [0] }] })
    );
    const result = await node.process({ input: "", ...secrets });
    expect(result.output).toEqual([0]);
  });

  it("throws on API error", async () => {
    const node = new EmbeddingNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("rate limited", 429));
    await expect(node.process({ input: "hi", ...secrets })).rejects.toThrow(
      "OpenAI Embedding API error 429"
    );
  });

  it("throws when API key missing", async () => {
    const node = new EmbeddingNode();
    await expect(node.process({ input: "hi" })).rejects.toThrow(
      "OPENAI_API_KEY is not configured"
    );
  });

  it("uses env var API key", async () => {
    process.env.OPENAI_API_KEY = "env-key";
    const node = new EmbeddingNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ embedding: [1] }] })
    );
    const result = await node.process({ input: "hi" });
    expect(result.output).toEqual([1]);
  });
});

// ── WebSearchNode ──────────────────────────────────────────────────────────

describe("WebSearchNode", () => {
  it("returns content from chat completion response", async () => {
    const node = new WebSearchNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "search result text" } }],
      })
    );
    const result = await node.process({ query: "test query", ...secrets });
    expect(result.output).toBe("search result text");
  });

  it("returns JSON string when no choices", async () => {
    const node = new WebSearchNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ some: "data" }));
    const result = await node.process({ query: "test", ...secrets });
    expect(result.output).toBe(JSON.stringify({ some: "data" }));
  });

  it("throws on empty query", async () => {
    const node = new WebSearchNode();
    await expect(node.process({ query: "", ...secrets })).rejects.toThrow(
      "Search query cannot be empty"
    );
  });

  it("throws on API error", async () => {
    const node = new WebSearchNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("error", 500));
    await expect(
      node.process({ query: "test", ...secrets })
    ).rejects.toThrow("OpenAI WebSearch API error 500");
  });
});

// ── ModerationNode ─────────────────────────────────────────────────────────

describe("ModerationNode", () => {
  it("returns moderation results", async () => {
    const node = new ModerationNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            flagged: true,
            categories: { hate: true },
            category_scores: { hate: 0.9 },
          },
        ],
      })
    );
    const result = await node.process({ input: "bad text", ...secrets });
    expect(result.flagged).toBe(true);
    expect(result.categories).toEqual({ hate: true });
  });

  it("returns defaults when no results", async () => {
    const node = new ModerationNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));
    const result = await node.process({ input: "clean text", ...secrets });
    expect(result.flagged).toBe(false);
  });

  it("throws on empty input", async () => {
    const node = new ModerationNode();
    await expect(node.process({ input: "", ...secrets })).rejects.toThrow(
      "Input text cannot be empty"
    );
  });

  it("throws on API error", async () => {
    const node = new ModerationNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 403));
    await expect(
      node.process({ input: "text", ...secrets })
    ).rejects.toThrow("OpenAI Moderation API error 403");
  });
});

// ── CreateImageNode ────────────────────────────────────────────────────────

describe("CreateImageNode", () => {
  it("returns image from b64_json", async () => {
    const node = new CreateImageNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ b64_json: "abc123" }] })
    );
    const result = await node.process({ prompt: "a cat", ...secrets });
    expect(result.output).toEqual({
      data: "data:image/png;base64,abc123",
    });
  });

  it("returns image from url", async () => {
    const node = new CreateImageNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [{ url: "https://example.com/img.png" }],
      })
    );
    const result = await node.process({ prompt: "a cat", ...secrets });
    expect(result.output).toEqual({ uri: "https://example.com/img.png" });
  });

  it("throws when no image data", async () => {
    const node = new CreateImageNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [{}] }));
    await expect(
      node.process({ prompt: "a cat", ...secrets })
    ).rejects.toThrow("No image data in response");
  });

  it("throws on empty prompt", async () => {
    const node = new CreateImageNode();
    await expect(node.process({ prompt: "", ...secrets })).rejects.toThrow(
      "Prompt cannot be empty"
    );
  });

  it("throws on API error", async () => {
    const node = new CreateImageNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 400));
    await expect(
      node.process({ prompt: "x", ...secrets })
    ).rejects.toThrow("OpenAI CreateImage API error 400");
  });
});

// ── EditImageNode ──────────────────────────────────────────────────────────

describe("EditImageNode", () => {
  it("returns edited image from b64_json", async () => {
    const node = new EditImageNode();
    const b64 = Buffer.from("fake-img").toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ b64_json: "edited123" }] })
    );
    const result = await node.process({
      prompt: "add hat",
      image: { data: b64 },
      ...secrets,
    });
    expect(result.output).toEqual({
      data: "data:image/png;base64,edited123",
    });
  });

  it("returns edited image from url", async () => {
    const node = new EditImageNode();
    const b64 = Buffer.from("fake").toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ url: "https://x.com/edited.png" }] })
    );
    const result = await node.process({
      prompt: "edit",
      image: { data: b64 },
      ...secrets,
    });
    expect(result.output).toEqual({ uri: "https://x.com/edited.png" });
  });

  it("supports data URI image input", async () => {
    const node = new EditImageNode();
    const b64 = Buffer.from("fake").toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ b64_json: "result" }] })
    );
    const result = await node.process({
      prompt: "edit",
      image: { data: `data:image/png;base64,${b64}` },
      ...secrets,
    });
    expect(result.output).toEqual({
      data: "data:image/png;base64,result",
    });
  });

  it("supports image with uri and optional mask", async () => {
    const node = new EditImageNode();
    // First fetch for image uri -> blob, second for mask uri -> blob, third for API
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob([new Uint8Array([1])]),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob([new Uint8Array([2])]),
      } as unknown as Response)
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ b64_json: "masked" }] })
      );
    const result = await node.process({
      prompt: "inpaint",
      image: { uri: "https://example.com/img.png" },
      mask: { uri: "https://example.com/mask.png" },
      ...secrets,
    });
    expect(result.output).toEqual({
      data: "data:image/png;base64,masked",
    });
  });

  it("refToBlob throws when ref has no data or uri (via TranslateNode audio)", async () => {
    // TranslateNode calls refToBlob on audio. We pass an audio ref with numeric data (not string)
    // and no uri to trigger the "Cannot convert ref to blob" error
    const node = new TranslateNode();
    await expect(
      node.process({
        audio: { data: 123, uri: 456 },
        ...secrets,
      })
    ).rejects.toThrow();
  });

  it("throws on empty prompt", async () => {
    const node = new EditImageNode();
    await expect(
      node.process({ prompt: "", image: { data: "abc" }, ...secrets })
    ).rejects.toThrow("Edit prompt cannot be empty");
  });

  it("throws when no image provided", async () => {
    const node = new EditImageNode();
    await expect(
      node.process({ prompt: "edit", ...secrets })
    ).rejects.toThrow("Input image is required");
  });

  it("throws when image has no data or uri", async () => {
    const node = new EditImageNode();
    await expect(
      node.process({ prompt: "edit", image: {}, ...secrets })
    ).rejects.toThrow("Input image is required");
  });

  it("throws on no image data in response", async () => {
    const node = new EditImageNode();
    const b64 = Buffer.from("fake").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [{}] }));
    await expect(
      node.process({ prompt: "edit", image: { data: b64 }, ...secrets })
    ).rejects.toThrow("No image data in response");
  });

  it("throws on API error", async () => {
    const node = new EditImageNode();
    const b64 = Buffer.from("fake").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));
    await expect(
      node.process({ prompt: "edit", image: { data: b64 }, ...secrets })
    ).rejects.toThrow("OpenAI EditImage API error 500");
  });
});

// ── TextToSpeechNode ───────────────────────────────────────────────────────

describe("TextToSpeechNode", () => {
  it("returns base64 audio", async () => {
    const node = new TextToSpeechNode();
    const audioBytes = new Uint8Array([10, 20, 30]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => audioBytes.buffer,
    } as unknown as Response);
    const result = await node.process({ input: "hello", ...secrets });
    const output = result.output as Record<string, string>;
    expect(output.data).toMatch(/^data:audio\/mp3;base64,/);
  });

  it("throws on API error", async () => {
    const node = new TextToSpeechNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));
    await expect(
      node.process({ input: "hello", ...secrets })
    ).rejects.toThrow("OpenAI TTS API error 500");
  });
});

// ── TranslateNode ──────────────────────────────────────────────────────────

describe("TranslateNode", () => {
  it("returns translated text", async () => {
    const node = new TranslateNode();
    const b64 = Buffer.from("audio-data").toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ text: "Hello world" })
    );
    const result = await node.process({
      audio: { data: b64 },
      ...secrets,
    });
    expect(result.output).toBe("Hello world");
  });

  it("throws when audio not provided", async () => {
    const node = new TranslateNode();
    await expect(node.process({ ...secrets })).rejects.toThrow(
      "Audio input is required"
    );
  });

  it("throws when audio has no data", async () => {
    const node = new TranslateNode();
    await expect(
      node.process({ audio: {}, ...secrets })
    ).rejects.toThrow("Audio input is required");
  });

  it("throws on API error", async () => {
    const node = new TranslateNode();
    const b64 = Buffer.from("audio").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 400));
    await expect(
      node.process({ audio: { data: b64 }, ...secrets })
    ).rejects.toThrow("OpenAI Translate API error 400");
  });
});

// ── TranscribeNode ─────────────────────────────────────────────────────────

describe("TranscribeNode", () => {
  it("returns transcribed text", async () => {
    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ text: "Transcribed text" })
    );
    const result = await node.process({
      audio: { data: b64 },
      ...secrets,
    });
    expect(result.text).toBe("Transcribed text");
    expect(result.words).toEqual([]);
    expect(result.segments).toEqual([]);
  });

  it("returns timestamps with verbose_json", async () => {
    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        text: "Hello",
        segments: [{ start: 0, end: 1.5, text: "Hello" }],
        words: [{ start: 0, end: 0.5, word: "Hello" }],
      })
    );
    const result = await node.process({
      audio: { data: b64 },
      timestamps: true,
      model: "whisper-1",
      ...secrets,
    });
    expect(result.text).toBe("Hello");
    expect((result.segments as unknown[]).length).toBe(1);
    expect((result.words as unknown[]).length).toBe(1);
  });

  it("throws on new model with timestamps", async () => {
    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");
    await expect(
      node.process({
        audio: { data: b64 },
        timestamps: true,
        model: "gpt-4o-transcribe",
        ...secrets,
      })
    ).rejects.toThrow("New transcription models do not support");
  });

  it("throws when audio not provided", async () => {
    const node = new TranscribeNode();
    await expect(node.process({ ...secrets })).rejects.toThrow(
      "Audio input is required"
    );
  });

  it("throws on API error", async () => {
    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));
    await expect(
      node.process({ audio: { data: b64 }, ...secrets })
    ).rejects.toThrow("OpenAI Transcribe API error 500");
  });

  it("passes language and prompt when set", async () => {
    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse({ text: "Bonjour" }));
    const result = await node.process({
      audio: { data: b64 },
      language: "fr",
      prompt: "French audio",
      ...secrets,
    });
    expect(result.text).toBe("Bonjour");
  });
});

// ── defaults coverage ────────────────────────────────────────────────────

describe("Node defaults coverage", () => {
  it("EmbeddingNode defaults", () => {
    const node = new EmbeddingNode();
    const d = node.serialize();
    expect(d.input).toBe("");
    expect(d.model).toBe("text-embedding-3-small");
    expect(d.chunk_size).toBe(4096);
  });

  it("WebSearchNode defaults", () => {
    const node = new WebSearchNode();
    expect(node.serialize()).toEqual({ query: "" });
  });

  it("ModerationNode defaults", () => {
    const node = new ModerationNode();
    const d = node.serialize();
    expect(d.input).toBe("");
    expect(d.model).toBe("omni-moderation-latest");
  });

  it("CreateImageNode defaults", () => {
    const node = new CreateImageNode();
    const d = node.serialize();
    expect(d.prompt).toBe("");
    expect(d.model).toBe("gpt-image-1");
    expect(d.size).toBe("1024x1024");
    expect(d.background).toBe("auto");
    expect(d.quality).toBe("high");
  });

  it("EditImageNode defaults", () => {
    const node = new EditImageNode();
    const d = node.serialize();
    expect(d.prompt).toBe("");
    expect(d.model).toBe("gpt-image-1");
  });

  it("TextToSpeechNode defaults", () => {
    const node = new TextToSpeechNode();
    const d = node.serialize();
    expect(d.model).toBe("tts-1");
    expect(d.voice).toBe("alloy");
    expect(d.speed).toBe(1.0);
  });

  it("TranslateNode defaults", () => {
    const node = new TranslateNode();
    expect(node.serialize().temperature).toBe(0.0);
  });

  it("TranscribeNode defaults", () => {
    const node = new TranscribeNode();
    const d = node.serialize();
    expect(d.model).toBe("whisper-1");
    expect(d.language).toBe("auto_detect");
    expect(d.timestamps).toBe(false);
  });
});

// ── RealtimeAgentNode ──────────────────────────────────────────────────────

describe("RealtimeAgentNode", () => {
  it("returns realtime fallback output", async () => {
    const node = new RealtimeAgentNode();
    mockFetch
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: "ok" } }],
      }))
      .mockResolvedValueOnce(jsonResponse({}));
    const result = await node.process({ prompt: "hi", ...secrets });
    expect(result.text).toBe("ok");
  });

  it("has correct nodeType", () => {
    expect(RealtimeAgentNode.nodeType).toBe("openai.agents.RealtimeAgent");
  });

  it("returns correct defaults", () => {
    expectMetadataDefaults(RealtimeAgentNode);
  });
});

// ── RealtimeTranscriptionNode ──────────────────────────────────────────────

describe("RealtimeTranscriptionNode", () => {
  it("returns transcription fallback output", async () => {
    const node = new RealtimeTranscriptionNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ text: "heard" }));
    const result = await node.process({
      chunk: { content: Buffer.from("wav").toString("base64") },
      ...secrets,
    });
    expect(result.text).toBe("heard");
  });

  it("has correct nodeType", () => {
    expect(RealtimeTranscriptionNode.nodeType).toBe(
      "openai.agents.RealtimeTranscription"
    );
  });

  it("returns correct defaults", () => {
    const node = new RealtimeTranscriptionNode();
    const d = node.serialize();
    expect(d.system).toBe("");
    expect(d.temperature).toBe(0.8);
  });
});
