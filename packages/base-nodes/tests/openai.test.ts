import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
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
  OPENAI_NODES
} from "../src/nodes/openai.js";

const originalFetch = global.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch;

const savedOpenAIKey = process.env.OPENAI_API_KEY;

afterAll(() => {
  global.fetch = originalFetch;
  if (savedOpenAIKey !== undefined) {
    process.env.OPENAI_API_KEY = savedOpenAIKey;
  }
});

// ---------------------------------------------------------------------------
// EmbeddingNode
// ---------------------------------------------------------------------------
describe("EmbeddingNode (OpenAI)", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(EmbeddingNode.nodeType).toBe("openai.text.Embedding");
    expect(EmbeddingNode.title).toBe("Embedding");
  });

  it("returns expected defaults", () => {
    const d = new EmbeddingNode().serialize();
    expect(d.input).toBe("");
    expect(d.model).toBe("text-embedding-3-small");
    expect(d.chunk_size).toBe(4096);
  });

  it("throws without API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const node = new EmbeddingNode();
    node.assign({ input: "hi" });
    await expect(node.process()).rejects.toThrow(/OPENAI_API_KEY/i);
  });

  it("calls embeddings endpoint and returns averaged embedding", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.5, 1.0, 1.5] }]
      })
    });

    const node = new EmbeddingNode();
    node.assign({
      input: "test"
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    const result = await node.process();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect(opts.headers.Authorization).toBe("Bearer k");
    expect(result.output).toEqual([0.5, 1.0, 1.5]);
  });

  it("chunks and averages multiple embeddings", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: [2.0, 4.0] }, { embedding: [4.0, 6.0] }]
      })
    });

    const node = new EmbeddingNode();
    node.assign({
      input: "abcdefgh",
      chunk_size: 4
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    const result = await node.process();

    const output = result.output as number[];
    expect(output[0]).toBeCloseTo(3.0);
    expect(output[1]).toBeCloseTo(5.0);
  });
});

// ---------------------------------------------------------------------------
// WebSearchNode
// ---------------------------------------------------------------------------
describe("WebSearchNode (OpenAI)", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(WebSearchNode.nodeType).toBe("openai.text.WebSearch");
    expect(WebSearchNode.title).toBe("Web Search");
  });

  it("returns expected defaults", () => {
    const d = new WebSearchNode().serialize();
    expect(d.query).toBe("");
  });

  it("throws when query is empty", async () => {
    const node = new WebSearchNode();
    node.assign({ query: "" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/query cannot be empty/i);
  });

  it("calls chat/completions with web_search_options", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Search result text" } }]
      })
    });

    const node = new WebSearchNode();
    node.assign({
      query: "latest news"
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    const result = await node.process();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-4o-search-preview");
    expect(body.web_search_options).toBeDefined();
    expect(result.output).toBe("Search result text");
  });
});

// ---------------------------------------------------------------------------
// ModerationNode
// ---------------------------------------------------------------------------
describe("ModerationNode", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(ModerationNode.nodeType).toBe("openai.text.Moderation");
    expect(ModerationNode.title).toBe("Moderation");
  });

  it("returns expected defaults", () => {
    const d = new ModerationNode().serialize();
    expect(d.input).toBe("");
    expect(d.model).toBe("omni-moderation-latest");
  });

  it("throws when input is empty", async () => {
    const node = new ModerationNode();
    node.assign({ input: "" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Input text cannot be empty/i);
  });

  it("calls moderations endpoint and returns categories", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            flagged: true,
            categories: { hate: true, violence: false },
            category_scores: { hate: 0.95, violence: 0.01 }
          }
        ]
      })
    });

    const node = new ModerationNode();
    node.assign({
      input: "test text"
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    const result = await node.process();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/moderations");
    expect(result.flagged).toBe(true);
    expect((result.categories as Record<string, boolean>).hate).toBe(true);
  });

  it("returns defaults when no results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] })
    });

    const node = new ModerationNode();
    node.assign({
      input: "safe text"
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    const result = await node.process();

    expect(result.flagged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CreateImageNode
// ---------------------------------------------------------------------------
describe("CreateImageNode", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(CreateImageNode.nodeType).toBe("openai.image.CreateImage");
    expect(CreateImageNode.title).toBe("Create Image");
  });

  it("returns expected defaults", () => {
    const d = new CreateImageNode().serialize();
    expect(d.prompt).toBe("");
    expect(d.model).toBe("gpt-image-1");
    expect(d.size).toBe("1024x1024");
    expect(d.quality).toBe("high");
  });

  it("throws when prompt is empty", async () => {
    const node = new CreateImageNode();
    node.assign({ prompt: "" });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Prompt cannot be empty/i);
  });

  it("returns b64_json image data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ b64_json: "imgbase64data" }]
      })
    });

    const node = new CreateImageNode();
    node.assign({
      prompt: "a cat"
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    const result = await node.process();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    const output = result.output as Record<string, unknown>;
    expect(output.data).toContain("data:image/png;base64,imgbase64data");
  });

  it("returns url when no b64_json", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ url: "https://images.openai.com/img.png" }]
      })
    });

    const node = new CreateImageNode();
    node.assign({
      prompt: "a cat"
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    const result = await node.process();

    const output = result.output as Record<string, unknown>;
    expect(output.uri).toBe("https://images.openai.com/img.png");
  });
});

// ---------------------------------------------------------------------------
// EditImageNode
// ---------------------------------------------------------------------------
describe("EditImageNode", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(EditImageNode.nodeType).toBe("openai.image.EditImage");
    expect(EditImageNode.title).toBe("Edit Image");
  });

  it("returns expected defaults", () => {
    const d = new EditImageNode().serialize();
    expect(d.prompt).toBe("");
    expect(d.model).toBe("gpt-image-1");
  });

  it("throws when prompt is empty", async () => {
    const node = new EditImageNode();
    node.assign({
      prompt: "",
      image: { data: "abc" }
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(
      /Edit prompt cannot be empty/i
    );
  });

  it("throws when image is missing", async () => {
    const node = new EditImageNode();
    node.assign({
      prompt: "edit this",
      image: {}
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Input image is required/i);
  });

  it("sends multipart form data with image", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ b64_json: "editedimg" }]
      })
    });

    const node = new EditImageNode();
    const b64 = Buffer.from("fake-png").toString("base64");
    node.assign({
      prompt: "make it blue",
      image: { data: b64 }
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    const result = await node.process();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    expect(opts.body).toBeInstanceOf(FormData);
    const output = result.output as Record<string, unknown>;
    expect(output.data).toContain("editedimg");
  });
});

// ---------------------------------------------------------------------------
// TextToSpeechNode
// ---------------------------------------------------------------------------
describe("TextToSpeechNode", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(TextToSpeechNode.nodeType).toBe("openai.audio.TextToSpeech");
    expect(TextToSpeechNode.title).toBe("Text To Speech");
  });

  it("returns expected defaults", () => {
    const d = new TextToSpeechNode().serialize();
    expect(d.model).toBe("tts-1");
    expect(d.voice).toBe("alloy");
    expect(d.speed).toBe(1.0);
  });

  it("returns audio data as base64", async () => {
    const audioBytes = new Uint8Array([1, 2, 3, 4]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => audioBytes.buffer
    });

    const node = new TextToSpeechNode();
    node.assign({
      input: "Hello"
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    const result = await node.process();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    const output = result.output as Record<string, unknown>;
    expect((output.data as string).startsWith("data:audio/mp3;base64,")).toBe(
      true
    );
  });
});

// ---------------------------------------------------------------------------
// TranslateNode
// ---------------------------------------------------------------------------
describe("TranslateNode", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(TranslateNode.nodeType).toBe("openai.audio.Translate");
    expect(TranslateNode.title).toBe("Translate");
  });

  it("throws when audio is missing", async () => {
    const node = new TranslateNode();
    node.assign({ audio: {} });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Audio input is required/i);
  });

  it("sends multipart form data and returns text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "Translated text" })
    });

    const node = new TranslateNode();
    const b64 = Buffer.from("fake-audio").toString("base64");
    node.assign({
      audio: { data: b64 }
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    const result = await node.process();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/translations");
    expect(opts.body).toBeInstanceOf(FormData);
    expect(result.output).toBe("Translated text");
  });
});

// ---------------------------------------------------------------------------
// TranscribeNode
// ---------------------------------------------------------------------------
describe("TranscribeNode", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(TranscribeNode.nodeType).toBe("openai.audio.Transcribe");
    expect(TranscribeNode.title).toBe("Transcribe");
  });

  it("returns expected defaults", () => {
    const d = new TranscribeNode().serialize();
    expect(d.model).toBe("whisper-1");
    expect(d.language).toBe("auto_detect");
    expect(d.timestamps).toBe(false);
  });

  it("throws when audio is missing", async () => {
    const node = new TranscribeNode();
    node.assign({ audio: {} });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Audio input is required/i);
  });

  it("transcribes audio and returns text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "Hello world" })
    });

    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");
    node.assign({
      audio: { data: b64 }
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    const result = await node.process();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(result.text).toBe("Hello world");
  });

  it("returns segments and words with timestamps", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        text: "Hello",
        segments: [{ start: 0, end: 1.5, text: "Hello" }],
        words: [{ start: 0, end: 0.5, word: "Hello" }]
      })
    });

    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");
    node.assign({
      audio: { data: b64 },
      timestamps: true
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    const result = await node.process();

    const segments = result.segments as unknown[];
    const words = result.words as unknown[];
    expect(segments).toHaveLength(1);
    expect(words).toHaveLength(1);
  });

  it("throws for timestamps with new models", async () => {
    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");
    node.assign({
      audio: { data: b64 },
      model: "gpt-4o-transcribe",
      timestamps: true
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(
      /do not support verbose_json/i
    );
  });
});

// ---------------------------------------------------------------------------
// RealtimeAgentNode & RealtimeTranscriptionNode
// ---------------------------------------------------------------------------
describe("RealtimeAgentNode", () => {
  it("has correct metadata", () => {
    expect(RealtimeAgentNode.nodeType).toBe("openai.agents.RealtimeAgent");
    expect(RealtimeAgentNode.title).toBe("Realtime Agent");
  });

  it("falls back to transcription + chat + tts", async () => {
    const node = new RealtimeAgentNode();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "hello from audio" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "assistant reply" } }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4)
      });

    node.assign({
      chunk: {
        content_type: "audio",
        content: Buffer.from("wav").toString("base64")
      }
    });
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    const result = await node.process();
    expect(result.text).toBe("assistant reply");
    expect(result.output).toBe("assistant reply");

    // audio should be an object with a base64 data URI
    expect(result.audio).toEqual(
      expect.objectContaining({
        data: expect.stringContaining("data:audio/mp3;base64,")
      })
    );

    // chunk should be a well-formed chunk object
    expect(result.chunk).toEqual({
      type: "chunk",
      content_type: "text",
      content: "assistant reply",
      done: true
    });
  });
});

describe("RealtimeTranscriptionNode", () => {
  it("has correct metadata", () => {
    expect(RealtimeTranscriptionNode.nodeType).toBe(
      "openai.agents.RealtimeTranscription"
    );
  });

  it("transcribes audio content", async () => {
    const node = new RealtimeTranscriptionNode();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "transcribed text" })
    });
    (node as any).chunk = { content: Buffer.from("wav").toString("base64") };
    node.setDynamic("_secrets", { OPENAI_API_KEY: "k" });
    const result = await node.process();
    expect(result.text).toBe("transcribed text");
    expect(result.output).toBe("transcribed text");

    // chunk should be a well-formed chunk object
    expect(result.chunk).toEqual({
      type: "chunk",
      content_type: "text",
      content: "transcribed text",
      done: true
    });
  });
});

// ---------------------------------------------------------------------------
// OPENAI_NODES export
// ---------------------------------------------------------------------------
describe("OPENAI_NODES", () => {
  it("exports all 10 nodes", () => {
    expect(OPENAI_NODES).toHaveLength(10);
    const types = OPENAI_NODES.map((n) => n.nodeType);
    expect(types).toContain("openai.text.Embedding");
    expect(types).toContain("openai.text.WebSearch");
    expect(types).toContain("openai.text.Moderation");
    expect(types).toContain("openai.image.CreateImage");
    expect(types).toContain("openai.image.EditImage");
    expect(types).toContain("openai.audio.TextToSpeech");
    expect(types).toContain("openai.audio.Translate");
    expect(types).toContain("openai.audio.Transcribe");
    expect(types).toContain("openai.agents.RealtimeAgent");
    expect(types).toContain("openai.agents.RealtimeTranscription");
  });
});
