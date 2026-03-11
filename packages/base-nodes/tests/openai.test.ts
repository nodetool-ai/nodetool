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
  OPENAI_NODES,
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
    await expect(node.process({ input: "hi" })).rejects.toThrow(
      /OPENAI_API_KEY/i
    );
  });

  it("calls embeddings endpoint and returns averaged embedding", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.5, 1.0, 1.5] }],
      }),
    });

    const node = new EmbeddingNode();
    const result = await node.process({
      input: "test",
      _secrets: { OPENAI_API_KEY: "k" },
    });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect(opts.headers.Authorization).toBe("Bearer k");
    expect(result.output).toEqual([0.5, 1.0, 1.5]);
  });

  it("chunks and averages multiple embeddings", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { embedding: [2.0, 4.0] },
          { embedding: [4.0, 6.0] },
        ],
      }),
    });

    const node = new EmbeddingNode();
    const result = await node.process({
      input: "abcdefgh",
      chunk_size: 4,
      _secrets: { OPENAI_API_KEY: "k" },
    });

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
    await expect(
      node.process({ query: "", _secrets: { OPENAI_API_KEY: "k" } })
    ).rejects.toThrow(/query cannot be empty/i);
  });

  it("calls chat/completions with web_search_options", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Search result text" } }],
      }),
    });

    const node = new WebSearchNode();
    const result = await node.process({
      query: "latest news",
      _secrets: { OPENAI_API_KEY: "k" },
    });

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
    await expect(
      node.process({ input: "", _secrets: { OPENAI_API_KEY: "k" } })
    ).rejects.toThrow(/Input text cannot be empty/i);
  });

  it("calls moderations endpoint and returns categories", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            flagged: true,
            categories: { hate: true, violence: false },
            category_scores: { hate: 0.95, violence: 0.01 },
          },
        ],
      }),
    });

    const node = new ModerationNode();
    const result = await node.process({
      input: "test text",
      _secrets: { OPENAI_API_KEY: "k" },
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/moderations");
    expect(result.flagged).toBe(true);
    expect((result.categories as Record<string, boolean>).hate).toBe(true);
  });

  it("returns defaults when no results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const node = new ModerationNode();
    const result = await node.process({
      input: "safe text",
      _secrets: { OPENAI_API_KEY: "k" },
    });

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
    await expect(
      node.process({ prompt: "", _secrets: { OPENAI_API_KEY: "k" } })
    ).rejects.toThrow(/Prompt cannot be empty/i);
  });

  it("returns b64_json image data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ b64_json: "imgbase64data" }],
      }),
    });

    const node = new CreateImageNode();
    const result = await node.process({
      prompt: "a cat",
      _secrets: { OPENAI_API_KEY: "k" },
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    const output = result.output as Record<string, unknown>;
    expect(output.data).toContain("data:image/png;base64,imgbase64data");
  });

  it("returns url when no b64_json", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ url: "https://images.openai.com/img.png" }],
      }),
    });

    const node = new CreateImageNode();
    const result = await node.process({
      prompt: "a cat",
      _secrets: { OPENAI_API_KEY: "k" },
    });

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
    await expect(
      node.process({
        prompt: "",
        image: { data: "abc" },
        _secrets: { OPENAI_API_KEY: "k" },
      })
    ).rejects.toThrow(/Edit prompt cannot be empty/i);
  });

  it("throws when image is missing", async () => {
    const node = new EditImageNode();
    await expect(
      node.process({
        prompt: "edit this",
        image: {},
        _secrets: { OPENAI_API_KEY: "k" },
      })
    ).rejects.toThrow(/Input image is required/i);
  });

  it("sends multipart form data with image", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ b64_json: "editedimg" }],
      }),
    });

    const node = new EditImageNode();
    const b64 = Buffer.from("fake-png").toString("base64");
    const result = await node.process({
      prompt: "make it blue",
      image: { data: b64 },
      _secrets: { OPENAI_API_KEY: "k" },
    });

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
      arrayBuffer: async () => audioBytes.buffer,
    });

    const node = new TextToSpeechNode();
    const result = await node.process({
      input: "Hello",
      _secrets: { OPENAI_API_KEY: "k" },
    });

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
    await expect(
      node.process({ audio: {}, _secrets: { OPENAI_API_KEY: "k" } })
    ).rejects.toThrow(/Audio input is required/i);
  });

  it("sends multipart form data and returns text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "Translated text" }),
    });

    const node = new TranslateNode();
    const b64 = Buffer.from("fake-audio").toString("base64");
    const result = await node.process({
      audio: { data: b64 },
      _secrets: { OPENAI_API_KEY: "k" },
    });

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
    await expect(
      node.process({ audio: {}, _secrets: { OPENAI_API_KEY: "k" } })
    ).rejects.toThrow(/Audio input is required/i);
  });

  it("transcribes audio and returns text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "Hello world" }),
    });

    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");
    const result = await node.process({
      audio: { data: b64 },
      _secrets: { OPENAI_API_KEY: "k" },
    });

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
        words: [{ start: 0, end: 0.5, word: "Hello" }],
      }),
    });

    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");
    const result = await node.process({
      audio: { data: b64 },
      timestamps: true,
      _secrets: { OPENAI_API_KEY: "k" },
    });

    const segments = result.segments as unknown[];
    const words = result.words as unknown[];
    expect(segments).toHaveLength(1);
    expect(words).toHaveLength(1);
  });

  it("throws for timestamps with new models", async () => {
    const node = new TranscribeNode();
    const b64 = Buffer.from("audio").toString("base64");
    await expect(
      node.process({
        audio: { data: b64 },
        model: "gpt-4o-transcribe",
        timestamps: true,
        _secrets: { OPENAI_API_KEY: "k" },
      })
    ).rejects.toThrow(/do not support verbose_json/i);
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
        json: async () => ({ text: "hello from audio" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "assistant reply" } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
      });

    const result = await node.process({
      _secrets: { OPENAI_API_KEY: "k" },
      chunk: { content_type: "audio", content: Buffer.from("wav").toString("base64") },
    });
    expect(result.text).toBe("assistant reply");
    expect(result.audio).toBeTruthy();
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
      json: async () => ({ text: "transcribed text" }),
    });
    const result = await node.process({
      _secrets: { OPENAI_API_KEY: "k" },
      chunk: { content: Buffer.from("wav").toString("base64") },
    });
    expect(result.text).toBe("transcribed text");
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
