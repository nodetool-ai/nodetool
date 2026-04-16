import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
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
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(8),
    blob: async () => new Blob([])
  } as unknown as Response;
}

const secrets = { _secrets: { OPENAI_API_KEY: "test-key" } };

// ── EmbeddingNode ─────────────────────────────────────────────────────────

describe("EmbeddingNode (OpenAI)", () => {
  it("returns embedding", async () => {
    const node = new EmbeddingNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ embedding: [0.1, 0.2, 0.3] }] })
    );
    node.assign({ input: "test" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    const result = await node.process();
    expect(result.output).toEqual([0.1, 0.2, 0.3]);
  });

  it("throws on API error", async () => {
    const node = new EmbeddingNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 400));
    node.assign({ input: "test" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow(
      "OpenAI Embedding API error 400"
    );
  });

  it("throws when API key missing", async () => {
    const node = new EmbeddingNode();
    node.assign({ input: "test" });
    await expect(node.process()).rejects.toThrow(
      "OPENAI_API_KEY is not configured"
    );
  });
});

// ── WebSearchNode ─────────────────────────────────────────────────────────

describe("WebSearchNode", () => {
  it("returns search content", async () => {
    const node = new WebSearchNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "Search result" } }]
      })
    );
    node.assign({ query: "test" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    const result = await node.process();
    expect(result.output).toBe("Search result");
  });

  it("throws on empty query", async () => {
    const node = new WebSearchNode();
    node.assign({ query: "" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow(
      "Search query cannot be empty"
    );
  });

  it("handles response without choices", async () => {
    const node = new WebSearchNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ result: "raw" }));
    node.assign({ query: "test" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    const result = await node.process();
    expect(result.output).toContain("raw");
  });
});

// ── ModerationNode ────────────────────────────────────────────────────────

describe("ModerationNode", () => {
  it("returns moderation result", async () => {
    const node = new ModerationNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            flagged: true,
            categories: { violence: true },
            category_scores: { violence: 0.95 }
          }
        ]
      })
    );
    node.assign({ input: "test" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    const result = await node.process();
    expect(result.flagged).toBe(true);
    expect((result.categories as Record<string, boolean>).violence).toBe(true);
  });

  it("returns defaults when no results", async () => {
    const node = new ModerationNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));
    node.assign({ input: "test" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    const result = await node.process();
    expect(result.flagged).toBe(false);
  });

  it("throws on empty input", async () => {
    const node = new ModerationNode();
    node.assign({ input: "" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("Input text cannot be empty");
  });
});

// ── CreateImageNode ───────────────────────────────────────────────────────

describe("CreateImageNode", () => {
  it("returns base64 image", async () => {
    const node = new CreateImageNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ b64_json: "imgdata" }] })
    );
    node.assign({ prompt: "a cat" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    const result = await node.process();
    const output = result.output as Record<string, string>;
    expect(output.data).toContain("imgdata");
  });

  it("returns URL image", async () => {
    const node = new CreateImageNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ url: "https://img.com/cat.png" }] })
    );
    node.assign({ prompt: "a cat" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    const result = await node.process();
    const output = result.output as Record<string, string>;
    expect(output.uri).toBe("https://img.com/cat.png");
  });

  it("throws on empty prompt", async () => {
    const node = new CreateImageNode();
    node.assign({ prompt: "" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("Prompt cannot be empty");
  });

  it("throws when no image data", async () => {
    const node = new CreateImageNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [{}] }));
    node.assign({ prompt: "cat" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("No image data in response");
  });
});

// ── EditImageNode ─────────────────────────────────────────────────────────

describe("EditImageNode", () => {
  it("throws when image missing", async () => {
    const node = new EditImageNode();
    node.assign({ prompt: "edit" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("Input image is required");
  });

  it("throws on empty prompt", async () => {
    const node = new EditImageNode();
    node.assign({
      prompt: "",
      image: { data: "b64" }
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("Edit prompt cannot be empty");
  });

  it("sends multipart with image", async () => {
    const node = new EditImageNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ b64_json: "edited" }] })
    );
    node.assign({
      prompt: "make blue",
      image: { data: "base64data" }
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    const result = await node.process();
    const output = result.output as Record<string, string>;
    expect(output.data).toContain("edited");
  });
});

// ── TextToSpeechNode ──────────────────────────────────────────────────────

describe("TextToSpeechNode (OpenAI)", () => {
  it("returns audio data", async () => {
    const node = new TextToSpeechNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    node.assign({ input: "Hello" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    const result = await node.process();
    const output = result.output as Record<string, string>;
    expect(output.data).toContain("base64");
  });

  it("throws on API error", async () => {
    const node = new TextToSpeechNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));
    node.assign({ input: "Hello" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("OpenAI TTS API error 500");
  });
});

// ── TranslateNode ─────────────────────────────────────────────────────────

describe("TranslateNode", () => {
  it("throws when audio missing", async () => {
    const node = new TranslateNode();
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("Audio input is required");
  });

  it("translates audio with base64 data", async () => {
    const node = new TranslateNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ text: "Hello" }));
    node.assign({
      audio: { data: Buffer.from("audio").toString("base64") }
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    const result = await node.process();
    expect(result.output).toBe("Hello");
  });
});

// ── TranscribeNode ────────────────────────────────────────────────────────

describe("TranscribeNode", () => {
  it("throws when audio missing", async () => {
    const node = new TranscribeNode();
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("Audio input is required");
  });

  it("transcribes audio", async () => {
    const node = new TranscribeNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ text: "Transcribed text" }));
    node.assign({
      audio: { data: Buffer.from("audio").toString("base64") }
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    const result = await node.process();
    expect(result.text).toBe("Transcribed text");
  });

  it("throws on new model with timestamps", async () => {
    const node = new TranscribeNode();
    node.assign({
      audio: { data: Buffer.from("audio").toString("base64") },
      model: "gpt-4o-transcribe",
      timestamps: true
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow(
      "New transcription models do not support verbose_json"
    );
  });

  it("parses timestamps from whisper", async () => {
    const node = new TranscribeNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        text: "Hello",
        segments: [{ start: 0, end: 1, text: "Hello" }],
        words: [{ start: 0, end: 0.5, word: "Hello" }]
      })
    );
    node.assign({
      audio: { data: Buffer.from("audio").toString("base64") },
      timestamps: true
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "test-key" });
    const result = await node.process();
    expect((result.segments as unknown[]).length).toBe(1);
    expect((result.words as unknown[]).length).toBe(1);
  });
});

// ── Stubs ─────────────────────────────────────────────────────────────────

describe("RealtimeAgentNode", () => {
  it("returns realtime fallback output", async () => {
    const node = new RealtimeAgentNode();
    // process() is now a no-op stub; real logic is in run() via WebSocket
    const result = await node.process();
    expect(result).toEqual({});
  });
});

describe("RealtimeTranscriptionNode", () => {
  it("returns transcription fallback output", async () => {
    const node = new RealtimeTranscriptionNode();
    // process() is now a no-op stub; real logic is in run() via WebSocket
    const result = await node.process();
    expect(result).toEqual({
    });
  });
});
