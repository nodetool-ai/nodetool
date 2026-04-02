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
  RealtimeTranscriptionNode
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
    blob: async () => new Blob([new Uint8Array([1, 2, 3])])
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
        data: [{ embedding: [0.1, 0.2, 0.3] }]
      })
    );

    node.assign({
      input: "hello"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([0.1, 0.2, 0.3]);
  });

  it("averages multiple chunk embeddings", async () => {
    const node = new EmbeddingNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [{ embedding: [1.0, 2.0] }, { embedding: [3.0, 4.0] }]
      })
    );

    node.assign({
      input: "a".repeat(5000),
      chunk_size: 4096
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect((result.output as number[])[0]).toBeCloseTo(2.0);
    expect((result.output as number[])[1]).toBeCloseTo(3.0);
  });

  it("handles empty input text", async () => {
    const node = new EmbeddingNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ embedding: [0] }] })
    );

    node.assign({
      input: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([0]);
  });

  it("throws on API error", async () => {
    const node = new EmbeddingNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("rate limited", 429));

    node.assign({
      input: "hi"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "OpenAI Embedding API error 429"
    );
  });

  it("throws when API key missing", async () => {
    const node = new EmbeddingNode();

    node.assign({
      input: "hi"
    });

    await expect(node.process()).rejects.toThrow(
      "OPENAI_API_KEY is not configured"
    );
  });

  it("uses env var API key", async () => {
    process.env.OPENAI_API_KEY = "env-key";
    const node = new EmbeddingNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ embedding: [1] }] })
    );

    node.assign({
      input: "hi"
    });

    const result = await node.process();
    expect(result.output).toEqual([1]);
  });
});

// ── WebSearchNode ──────────────────────────────────────────────────────────

describe("WebSearchNode", () => {
  it("returns content from chat completion response", async () => {
    const node = new WebSearchNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "search result text" } }]
      })
    );

    node.assign({
      query: "test query"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toBe("search result text");
  });

  it("returns JSON string when no choices", async () => {
    const node = new WebSearchNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ some: "data" }));

    node.assign({
      query: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toBe(JSON.stringify({ some: "data" }));
  });

  it("throws on empty query", async () => {
    const node = new WebSearchNode();

    node.assign({
      query: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "Search query cannot be empty"
    );
  });

  it("throws on API error", async () => {
    const node = new WebSearchNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("error", 500));

    node.assign({
      query: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "OpenAI WebSearch API error 500"
    );
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
            category_scores: { hate: 0.9 }
          }
        ]
      })
    );

    node.assign({
      input: "bad text"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.flagged).toBe(true);
    expect(result.categories).toEqual({ hate: true });
  });

  it("returns defaults when no results", async () => {
    const node = new ModerationNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));

    node.assign({
      input: "clean text"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.flagged).toBe(false);
  });

  it("throws on empty input", async () => {
    const node = new ModerationNode();

    node.assign({
      input: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Input text cannot be empty");
  });

  it("throws on API error", async () => {
    const node = new ModerationNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 403));

    node.assign({
      input: "text"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "OpenAI Moderation API error 403"
    );
  });
});

// ── CreateImageNode ────────────────────────────────────────────────────────

describe("CreateImageNode", () => {
  it("returns image from b64_json", async () => {
    const node = new CreateImageNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ b64_json: "abc123" }] })
    );

    node.assign({
      prompt: "a cat"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual({
      data: "data:image/png;base64,abc123"
    });
  });

  it("returns image from url", async () => {
    const node = new CreateImageNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [{ url: "https://example.com/img.png" }]
      })
    );

    node.assign({
      prompt: "a cat"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual({ uri: "https://example.com/img.png" });
  });

  it("throws when no image data", async () => {
    const node = new CreateImageNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [{}] }));

    node.assign({
      prompt: "a cat"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("No image data in response");
  });

  it("throws on empty prompt", async () => {
    const node = new CreateImageNode();

    node.assign({
      prompt: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Prompt cannot be empty");
  });

  it("throws on API error", async () => {
    const node = new CreateImageNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 400));

    node.assign({
      prompt: "x"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "OpenAI CreateImage API error 400"
    );
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

    node.assign({
      prompt: "add hat",
      image: { data: b64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual({
      data: "data:image/png;base64,edited123"
    });
  });

  it("returns edited image from url", async () => {
    const node = new EditImageNode();
    const b64 = Buffer.from("fake").toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ url: "https://x.com/edited.png" }] })
    );

    node.assign({
      prompt: "edit",
      image: { data: b64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual({ uri: "https://x.com/edited.png" });
  });

  it("supports data URI image input", async () => {
    const node = new EditImageNode();
    const b64 = Buffer.from("fake").toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ b64_json: "result" }] })
    );

    node.assign({
      prompt: "edit",
      image: { data: `data:image/png;base64,${b64}` }
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual({
      data: "data:image/png;base64,result"
    });
  });

  it("supports image with uri and optional mask", async () => {
    const node = new EditImageNode();
    // First fetch for image uri -> blob, second for mask uri -> blob, third for API
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob([new Uint8Array([1])])
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob([new Uint8Array([2])])
      } as unknown as Response)
      .mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: "masked" }] }));

    node.assign({
      prompt: "inpaint",
      image: { uri: "https://example.com/img.png" },
      mask: { uri: "https://example.com/mask.png" }
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual({
      data: "data:image/png;base64,masked"
    });
  });

  it("refToBlob throws when ref has no data or uri (via TranslateNode audio)", async () => {
    // TranslateNode calls refToBlob on audio. We pass an audio ref with numeric data (not string)
    // and no uri to trigger the "Cannot convert ref to blob" error
    const node = new TranslateNode();

    node.assign({
      audio: { data: 123, uri: 456 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow();
  });

  it("throws on empty prompt", async () => {
    const node = new EditImageNode();

    node.assign({
      prompt: "",
      image: { data: "abc" }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Edit prompt cannot be empty");
  });

  it("throws when no image provided", async () => {
    const node = new EditImageNode();

    node.assign({
      prompt: "edit"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Input image is required");
  });

  it("throws when image has no data or uri", async () => {
    const node = new EditImageNode();

    node.assign({
      prompt: "edit",
      image: {}
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Input image is required");
  });

  it("throws on no image data in response", async () => {
    const node = new EditImageNode();
    const b64 = Buffer.from("fake").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [{}] }));

    node.assign({
      prompt: "edit",
      image: { data: b64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("No image data in response");
  });

  it("throws on API error", async () => {
    const node = new EditImageNode();
    const b64 = Buffer.from("fake").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));

    node.assign({
      prompt: "edit",
      image: { data: b64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "OpenAI EditImage API error 500"
    );
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
      arrayBuffer: async () => audioBytes.buffer
    } as unknown as Response);

    node.assign({
      input: "hello"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    const output = result.output as Record<string, string>;
    expect(output.data).toMatch(/^data:audio\/mp3;base64,/);
  });

  it("throws on API error", async () => {
    const node = new TextToSpeechNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));

    node.assign({
      input: "hello"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("OpenAI TTS API error 500");
  });
});

// ── TranslateNode ──────────────────────────────────────────────────────────

describe("TranslateNode", () => {
  it("returns translated text", async () => {
    const node = new TranslateNode();
    const b64 = Buffer.from("audio-data").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse({ text: "Hello world" }));

    node.assign({
      audio: { data: b64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toBe("Hello world");
  });

  it("throws when audio not provided", async () => {
    const node = new TranslateNode();
    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Audio input is required");
  });

  it("throws when audio has no data", async () => {
    const node = new TranslateNode();

    node.assign({
      audio: {}
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Audio input is required");
  });

  it("throws on API error", async () => {
    const node = new TranslateNode();
    const b64 = Buffer.from("audio").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 400));

    node.assign({
      audio: { data: b64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "OpenAI Translate API error 400"
    );
  });
});

// ── TranscribeNode ─────────────────────────────────────────────────────────

describe("TranscribeNode", () => {
  it("returns transcribed text", async () => {
    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse({ text: "Transcribed text" }));

    node.assign({
      audio: { data: b64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
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
        words: [{ start: 0, end: 0.5, word: "Hello" }]
      })
    );

    node.assign({
      audio: { data: b64 },
      timestamps: true,
      model: "whisper-1"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.text).toBe("Hello");
    expect((result.segments as unknown[]).length).toBe(1);
    expect((result.words as unknown[]).length).toBe(1);
  });

  it("throws on new model with timestamps", async () => {
    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");

    node.assign({
      audio: { data: b64 },
      timestamps: true,
      model: "gpt-4o-transcribe"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "New transcription models do not support"
    );
  });

  it("throws when audio not provided", async () => {
    const node = new TranscribeNode();
    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Audio input is required");
  });

  it("throws on API error", async () => {
    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));

    node.assign({
      audio: { data: b64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "OpenAI Transcribe API error 500"
    );
  });

  it("passes language and prompt when set", async () => {
    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse({ text: "Bonjour" }));

    node.assign({
      audio: { data: b64 },
      language: "fr",
      prompt: "French audio"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
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
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "ok" } }]
        })
      )
      .mockResolvedValueOnce(jsonResponse({}));

    node.assign({
      prompt: "hi"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
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

    (node as any).chunk = { content: Buffer.from("wav").toString("base64") };

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
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
