import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import {
  GroundedSearchNode,
  EmbeddingNode,
  ImageGenerationNode,
  TextToVideoGeminiNode,
  ImageToVideoGeminiNode,
  TextToSpeechGeminiNode,
  TranscribeGeminiNode,
  GEMINI_NODES
} from "../src/nodes/gemini.js";

const originalFetch = global.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch;

afterAll(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// GroundedSearchNode
// ---------------------------------------------------------------------------
describe("GroundedSearchNode", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("has correct metadata", () => {
    expect(GroundedSearchNode.nodeType).toBe("gemini.text.GroundedSearch");
    expect(GroundedSearchNode.title).toBe("Grounded Search");
    expect(GroundedSearchNode.description).toBeDefined();
  });

  it("returns expected defaults", () => {
    const node = new GroundedSearchNode();
    const d = node.serialize();
    expect(d.query).toBe("");
    expect(d.model).toBe("gemini-2.0-flash");
  });

  it("throws without API key", async () => {
    const node = new GroundedSearchNode();
    node.assign({ query: "test" });
    await expect(node.process()).rejects.toThrow(/GEMINI_API_KEY/i);
  });

  it("throws when query is empty", async () => {
    const node = new GroundedSearchNode();
    node.assign({
      query: ""
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow(/query is required/i);
  });

  it("calls API and returns results with sources", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: { parts: [{ text: "Result text" }] },
            groundingMetadata: {
              groundingChunks: [
                { web: { title: "Source 1", uri: "https://example.com" } }
              ]
            }
          }
        ]
      })
    });

    const node = new GroundedSearchNode();
    node.assign({
      query: "test query"
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    const result = await node.process();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("gemini-2.0-flash:generateContent");
    expect(url).toContain("key=test-key");
    expect(opts.method).toBe("POST");

    expect(result.results).toEqual(["Result text"]);
    expect(result.sources).toEqual([
      { title: "Source 1", url: "https://example.com" }
    ]);
  });

  it("handles API error responses", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Bad request"
    });

    const node = new GroundedSearchNode();
    node.assign({
      query: "test"
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow(/Gemini API error 400/);
  });

  it("throws when no candidates returned", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [] })
    });

    const node = new GroundedSearchNode();
    node.assign({
      query: "test"
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow(/No response/);
  });

  it("deduplicates sources by URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: { parts: [{ text: "text" }] },
            groundingMetadata: {
              groundingChunks: [
                { web: { title: "A", uri: "https://a.com" } },
                { web: { title: "A duplicate", uri: "https://a.com" } },
                { web: { title: "B", uri: "https://b.com" } }
              ]
            }
          }
        ]
      })
    });

    const node = new GroundedSearchNode();
    node.assign({
      query: "test"
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    const result = await node.process();
    expect((result.sources as unknown[]).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// EmbeddingNode
// ---------------------------------------------------------------------------
describe("EmbeddingNode (Gemini)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("has correct metadata", () => {
    expect(EmbeddingNode.nodeType).toBe("gemini.text.Embedding");
    expect(EmbeddingNode.title).toBe("Embedding");
  });

  it("returns expected defaults", () => {
    const node = new EmbeddingNode();
    const d = node.serialize();
    expect(d.input).toBe("");
    expect(d.model).toBe("text-embedding-004");
  });

  it("throws without API key", async () => {
    const node = new EmbeddingNode();
    node.assign({ input: "hello" });
    await expect(node.process()).rejects.toThrow(/GEMINI_API_KEY/i);
  });

  it("throws when input is empty", async () => {
    const node = new EmbeddingNode();
    node.assign({ input: "" });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Input text is required/i);
  });

  it("calls embedContent and returns values", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        embedding: { values: [0.1, 0.2, 0.3] }
      })
    });

    const node = new EmbeddingNode();
    node.assign({
      input: "hello"
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    const result = await node.process();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("text-embedding-004:embedContent");
    expect(result.output).toEqual([0.1, 0.2, 0.3]);
  });
});

// ---------------------------------------------------------------------------
// ImageGenerationNode
// ---------------------------------------------------------------------------
describe("ImageGenerationNode", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("has correct metadata", () => {
    expect(ImageGenerationNode.nodeType).toBe("gemini.image.ImageGeneration");
    expect(ImageGenerationNode.title).toBe("Image Generation");
  });

  it("returns expected defaults", () => {
    const node = new ImageGenerationNode();
    const d = node.serialize();
    expect(d.prompt).toBe("");
    expect(d.model).toBe("imagen-3.0-generate-002");
  });

  it("throws when prompt is empty", async () => {
    const node = new ImageGenerationNode();
    node.assign({ prompt: "" });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/prompt cannot be empty/i);
  });

  it("uses generateImages endpoint for imagen models", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        generatedImages: [{ image: { imageBytes: "abc123base64" } }]
      })
    });

    const node = new ImageGenerationNode();
    node.assign({
      prompt: "a cat"
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    const result = await node.process();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain(":generateImages");
    expect((result.output as Record<string, unknown>).data).toBe(
      "abc123base64"
    );
  });

  it("uses generateContent for gemini models", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: "imagedata" } }]
            }
          }
        ]
      })
    });

    const node = new ImageGenerationNode();
    node.assign({
      prompt: "a dog",
      model: "gemini-2.0-flash"
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    const result = await node.process();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain(":generateContent");
    expect((result.output as Record<string, unknown>).data).toBe("imagedata");
  });

  it("handles PROHIBITED_CONTENT response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: "PROHIBITED_CONTENT", content: null }]
      })
    });

    const node = new ImageGenerationNode();
    node.assign({
      prompt: "bad content",
      model: "gemini-2.0-flash"
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow(/Prohibited content/);
  });
});

// ---------------------------------------------------------------------------
// TextToVideoGeminiNode
// ---------------------------------------------------------------------------
describe("TextToVideoGeminiNode", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("has correct metadata", () => {
    expect(TextToVideoGeminiNode.nodeType).toBe("gemini.video.TextToVideo");
    expect(TextToVideoGeminiNode.title).toBe("Text To Video");
  });

  it("returns expected defaults", () => {
    const node = new TextToVideoGeminiNode();
    const d = node.serialize();
    expect(d.prompt).toBe("");
    expect(d.model).toBe("veo-3.1-generate-preview");
    expect(d.aspect_ratio).toBe("16:9");
  });

  it("throws when prompt is empty", async () => {
    const node = new TextToVideoGeminiNode();
    node.assign({ prompt: "" });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/prompt is required/i);
  });

  it("handles immediate done response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        done: true,
        response: {
          generatedVideos: [{ video: { videoBytes: "videobase64" } }]
        }
      })
    });

    const node = new TextToVideoGeminiNode();
    node.assign({
      prompt: "a sunset"
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    const result = await node.process();

    expect((result.output as Record<string, unknown>).data).toBe("videobase64");
  });

  it("polls operation until done", async () => {
    // Initial response: not done, returns operation name
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ done: false, name: "operations/123" })
    });
    // First poll: not done
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ done: false })
    });
    // Second poll: done
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        done: true,
        response: {
          generatedVideos: [{ video: { videoBytes: "finalvideo" } }]
        }
      })
    });

    const node = new TextToVideoGeminiNode();
    // Override setTimeout to be instant for testing
    vi.useFakeTimers();
    node.assign({
      prompt: "a sunset"
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    const promise = node.process();
    // Advance timers for the polling delays
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;
    vi.useRealTimers();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect((result.output as Record<string, unknown>).data).toBe("finalvideo");
  });
});

// ---------------------------------------------------------------------------
// ImageToVideoGeminiNode
// ---------------------------------------------------------------------------
describe("ImageToVideoGeminiNode", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("has correct metadata", () => {
    expect(ImageToVideoGeminiNode.nodeType).toBe("gemini.video.ImageToVideo");
    expect(ImageToVideoGeminiNode.title).toBe("Image To Video");
  });

  it("returns expected defaults", () => {
    const node = new ImageToVideoGeminiNode();
    const d = node.serialize();
    expect(d.prompt).toBe("");
    expect(d.model).toBe("veo-3.1-generate-preview");
  });

  it("throws when image is not provided", async () => {
    const node = new ImageToVideoGeminiNode();
    node.assign({
      image: {}
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/image is required/i);
  });

  it("calls API with image data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        done: true,
        response: {
          generatedVideos: [{ video: { videoBytes: "vid" } }]
        }
      })
    });

    const node = new ImageToVideoGeminiNode();
    const b64data = Buffer.from("fake-png").toString("base64");
    node.assign({
      image: { data: b64data, uri: "x", asset_id: "1" }
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    const result = await node.process();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.image).toBeDefined();
    expect((result.output as Record<string, unknown>).data).toBe("vid");
  });
});

// ---------------------------------------------------------------------------
// TextToSpeechGeminiNode
// ---------------------------------------------------------------------------
describe("TextToSpeechGeminiNode", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("has correct metadata", () => {
    expect(TextToSpeechGeminiNode.nodeType).toBe("gemini.audio.TextToSpeech");
    expect(TextToSpeechGeminiNode.title).toBe("Text To Speech");
  });

  it("returns expected defaults", () => {
    const node = new TextToSpeechGeminiNode();
    const d = node.serialize();
    expect(d.text).toBe("");
    expect(d.model).toBe("gemini-2.5-pro-preview-tts");
    expect(d.voice_name).toBe("kore");
  });

  it("throws when text is empty", async () => {
    const node = new TextToSpeechGeminiNode();
    node.assign({ text: "" });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/text cannot be empty/i);
  });

  it("returns WAV audio data", async () => {
    const pcmBase64 = Buffer.from([0, 0, 1, 0]).toString("base64");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: pcmBase64 } }]
            }
          }
        ]
      })
    });

    const node = new TextToSpeechGeminiNode();
    node.assign({
      text: "Hello world"
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    const result = await node.process();

    const output = result.output as Record<string, unknown>;
    expect(output.data).toBeDefined();
    // Verify it's a valid base64 string that starts with WAV header
    const wavBytes = Buffer.from(output.data as string, "base64");
    expect(wavBytes[0]).toBe(0x52); // 'R' of RIFF
    expect(wavBytes[1]).toBe(0x49); // 'I'
    expect(wavBytes[2]).toBe(0x46); // 'F'
    expect(wavBytes[3]).toBe(0x46); // 'F'
  });

  it("includes style prompt in content when provided", async () => {
    const pcmBase64 = Buffer.from([0, 0]).toString("base64");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: pcmBase64 } }]
            }
          }
        ]
      })
    });

    const node = new TextToSpeechGeminiNode();
    node.assign({
      text: "Hello",
      style_prompt: "Speak slowly"
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    await node.process();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toBe("Speak slowly: Hello");
  });
});

// ---------------------------------------------------------------------------
// TranscribeGeminiNode
// ---------------------------------------------------------------------------
describe("TranscribeGeminiNode", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("has correct metadata", () => {
    expect(TranscribeGeminiNode.nodeType).toBe("gemini.audio.Transcribe");
    expect(TranscribeGeminiNode.title).toBe("Transcribe");
  });

  it("returns expected defaults", () => {
    const node = new TranscribeGeminiNode();
    const d = node.serialize();
    expect(d.model).toBe("gemini-2.5-flash");
  });

  it("throws when audio is not provided", async () => {
    const node = new TranscribeGeminiNode();
    node.assign({
      audio: {}
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Audio file is required/i);
  });

  it("transcribes audio and returns text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "Hello world" }]
            }
          }
        ]
      })
    });

    // WAV magic bytes for mime detection
    const wavHeader = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]);
    const node = new TranscribeGeminiNode();
    node.assign({
      audio: { data: wavHeader.toString("base64"), uri: "x" }
    });
    node.setDynamic("_secrets", { GEMINI_API_KEY: "test-key" });
    const result = await node.process();

    expect(result.output).toBe("Hello world");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("audio/wav");
  });
});

// ---------------------------------------------------------------------------
// GEMINI_NODES export
// ---------------------------------------------------------------------------
describe("GEMINI_NODES", () => {
  it("exports all 7 nodes", () => {
    expect(GEMINI_NODES).toHaveLength(7);
    const types = GEMINI_NODES.map((n) => n.nodeType);
    expect(types).toContain("gemini.text.GroundedSearch");
    expect(types).toContain("gemini.text.Embedding");
    expect(types).toContain("gemini.image.ImageGeneration");
    expect(types).toContain("gemini.video.TextToVideo");
    expect(types).toContain("gemini.video.ImageToVideo");
    expect(types).toContain("gemini.audio.TextToSpeech");
    expect(types).toContain("gemini.audio.Transcribe");
  });
});
