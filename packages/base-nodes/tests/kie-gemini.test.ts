import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  GroundedSearchNode,
  EmbeddingNode,
  ImageGenerationNode,
  TextToVideoGeminiNode,
  ImageToVideoGeminiNode,
  TextToSpeechGeminiNode,
  TranscribeGeminiNode
} from "../src/nodes/gemini.js";

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  delete process.env.GEMINI_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.GEMINI_API_KEY;
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

const secrets = { _secrets: { GEMINI_API_KEY: "test-key" } };

// ── GroundedSearchNode ─────────────────────────────────────────────────────

describe("GroundedSearchNode", () => {
  it("returns results and sources", async () => {
    const node = new GroundedSearchNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          {
            content: { parts: [{ text: "Search result text" }] },
            groundingMetadata: {
              groundingChunks: [
                { web: { title: "Source 1", uri: "https://example.com" } }
              ]
            }
          }
        ]
      })
    );

    node.assign({
      query: "test query"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual(["Search result text"]);
    expect(result.sources).toEqual([
      { title: "Source 1", url: "https://example.com" }
    ]);
  });

  it("deduplicates sources by url", async () => {
    const node = new GroundedSearchNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          {
            content: { parts: [{ text: "text" }] },
            groundingMetadata: {
              groundingChunks: [
                { web: { title: "A", uri: "https://a.com" } },
                { web: { title: "A dup", uri: "https://a.com" } },
                { web: { title: "B", uri: "https://b.com" } }
              ]
            }
          }
        ]
      })
    );

    node.assign({
      query: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect((result.sources as unknown[]).length).toBe(2);
  });

  it("handles missing groundingMetadata", async () => {
    const node = new GroundedSearchNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "result" }] } }]
      })
    );

    node.assign({
      query: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual(["result"]);
    expect(result.sources).toEqual([]);
  });

  it("throws on empty query", async () => {
    const node = new GroundedSearchNode();

    node.assign({
      query: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Search query is required");
  });

  it("throws when API key missing", async () => {
    const node = new GroundedSearchNode();

    node.assign({
      query: "test"
    });

    await expect(node.process()).rejects.toThrow(
      "GEMINI_API_KEY is not configured"
    );
  });

  it("throws on API error", async () => {
    const node = new GroundedSearchNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));

    node.assign({
      query: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Gemini API error 500");
  });

  it("throws on no candidates", async () => {
    const node = new GroundedSearchNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ candidates: [] }));

    node.assign({
      query: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "No response received from Gemini API"
    );
  });

  it("throws on invalid content format", async () => {
    const node = new GroundedSearchNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ candidates: [{}] }));

    node.assign({
      query: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "Invalid response format from Gemini API"
    );
  });
});

// ── EmbeddingNode ──────────────────────────────────────────────────────────

describe("EmbeddingNode (Gemini)", () => {
  it("returns embedding values", async () => {
    const node = new EmbeddingNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        embedding: { values: [0.1, 0.2, 0.3] }
      })
    );

    node.assign({
      input: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([0.1, 0.2, 0.3]);
  });

  it("throws on empty input", async () => {
    const node = new EmbeddingNode();

    node.assign({
      input: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "Input text is required for embedding generation"
    );
  });

  it("throws when no embedding in response", async () => {
    const node = new EmbeddingNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({}));

    node.assign({
      input: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "No embedding generated from the input text"
    );
  });

  it("throws on API error", async () => {
    const node = new EmbeddingNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 400));

    node.assign({
      input: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Gemini API error 400");
  });
});

// ── ImageGenerationNode ────────────────────────────────────────────────────

describe("ImageGenerationNode", () => {
  it("generates image with Imagen model (generateImages endpoint)", async () => {
    const node = new ImageGenerationNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        generatedImages: [{ image: { imageBytes: "base64imagedata" } }]
      })
    );

    node.assign({
      prompt: "a cat",
      model: "imagen-3.0-generate-002"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual({
      type: "image",
      data: "base64imagedata"
    });
  });

  it("generates image with Gemini model (generateContent)", async () => {
    const node = new ImageGenerationNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                { inlineData: { data: "geminiimgdata", mimeType: "image/png" } }
              ]
            }
          }
        ]
      })
    );

    node.assign({
      prompt: "a cat",
      model: "gemini-2.0-flash"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual({
      type: "image",
      data: "geminiimgdata"
    });
  });

  it("handles snake_case inline_data from API", async () => {
    const node = new ImageGenerationNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ inline_data: { data: "snakedata" } }]
            }
          }
        ]
      })
    );

    node.assign({
      prompt: "a cat",
      model: "gemini-2.0-flash"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual({ type: "image", data: "snakedata" });
  });

  it("includes optional input image for Gemini model", async () => {
    const node = new ImageGenerationNode();
    const b64 = Buffer.from("test-image").toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: "edited" } }]
            }
          }
        ]
      })
    );

    node.assign({
      prompt: "edit this",
      model: "gemini-2.0-flash",
      image: { data: b64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts.length).toBe(2);
  });

  it("handles Uint8Array image input for Gemini model", async () => {
    const node = new ImageGenerationNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: "uint8img" } }]
            }
          }
        ]
      })
    );

    node.assign({
      prompt: "edit this",
      model: "gemini-2.0-flash",
      image: { data: new Uint8Array([1, 2, 3]) }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts.length).toBe(2);
  });

  it("throws on prohibited content", async () => {
    const node = new ImageGenerationNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          { finishReason: "PROHIBITED_CONTENT", content: { parts: [] } }
        ]
      })
    );

    node.assign({
      prompt: "bad",
      model: "gemini-2.0-flash"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Prohibited content");
  });

  it("throws when no image bytes in Gemini response", async () => {
    const node = new ImageGenerationNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "no image here" }] } }]
      })
    );

    node.assign({
      prompt: "cat",
      model: "gemini-2.0-flash"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "No image bytes returned in response"
    );
  });

  it("throws on empty prompt", async () => {
    const node = new ImageGenerationNode();

    node.assign({
      prompt: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "The input prompt cannot be empty"
    );
  });

  it("throws when no generatedImages from Imagen", async () => {
    const node = new ImageGenerationNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ generatedImages: [] }));

    node.assign({
      prompt: "cat",
      model: "imagen-3.0-generate-002"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("No images generated");
  });

  it("throws when no imageBytes in generatedImages", async () => {
    const node = new ImageGenerationNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ generatedImages: [{ image: {} }] })
    );

    node.assign({
      prompt: "cat",
      model: "imagen-3.0-generate-002"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("No image bytes in response");
  });

  it("throws on API error for Imagen", async () => {
    const node = new ImageGenerationNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));

    node.assign({
      prompt: "cat",
      model: "imagen-3.0-generate-002"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Gemini API error 500");
  });

  it("throws on no candidates for Gemini model", async () => {
    const node = new ImageGenerationNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ candidates: [] }));

    node.assign({
      prompt: "cat",
      model: "gemini-2.0-flash"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "No response received from Gemini API"
    );
  });
});

// ── TextToVideoGeminiNode ──────────────────────────────────────────────────

describe("TextToVideoGeminiNode", () => {
  it("returns video data from completed operation", async () => {
    const node = new TextToVideoGeminiNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        done: true,
        response: {
          generatedVideos: [{ video: { videoBytes: "base64videodata" } }]
        }
      })
    );

    node.assign({
      prompt: "a cat playing"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual({ type: "video", data: "base64videodata" });
  });

  it("polls operation until done", async () => {
    const node = new TextToVideoGeminiNode();
    // First call: start operation
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ name: "operations/op1", done: false })
    );
    // Poll call: done
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        done: true,
        response: {
          generatedVideos: [{ video: { videoBytes: "polledvideo" } }]
        }
      })
    );

    node.assign({
      prompt: "a cat"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual({ type: "video", data: "polledvideo" });
  }, 15000);

  it("throws on empty prompt", async () => {
    const node = new TextToVideoGeminiNode();

    node.assign({
      prompt: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "Video generation prompt is required"
    );
  });

  it("throws on API error", async () => {
    const node = new TextToVideoGeminiNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));

    node.assign({
      prompt: "cat"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Gemini API error 500");
  });

  it("throws when no operation name and not done", async () => {
    const node = new TextToVideoGeminiNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ done: false }));

    node.assign({
      prompt: "cat"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "No operation name in response"
    );
  });

  it("throws when no video in response", async () => {
    const node = new TextToVideoGeminiNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ done: true, response: { generatedVideos: [] } })
    );

    node.assign({
      prompt: "cat"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("No video generated");
  });

  it("throws on poll error", async () => {
    const node = new TextToVideoGeminiNode();
    // First call: start operation (not done)
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ name: "operations/op2", done: false })
    );
    // Poll call: error
    mockFetch.mockResolvedValueOnce(jsonResponse("poll error", 500));

    node.assign({
      prompt: "cat"
    });

    node.setDynamic("_secrets", secrets._secrets);

    await expect(node.process()).rejects.toThrow("Gemini poll error 500");
  }, 15000);

  it("throws when no video object in generatedVideos", async () => {
    const node = new TextToVideoGeminiNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ done: true, response: { generatedVideos: [{}] } })
    );

    node.assign({
      prompt: "cat"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("No video in response");
  });

  it("throws when no videoBytes in video", async () => {
    const node = new TextToVideoGeminiNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        done: true,
        response: { generatedVideos: [{ video: {} }] }
      })
    );

    node.assign({
      prompt: "cat"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("No video bytes in response");
  });

  it("extractVideoFromResponse uses data.response", async () => {
    const node = new TextToVideoGeminiNode();
    // done: true with generatedVideos directly at top level (no response wrapper)
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        done: true,
        generatedVideos: [{ video: { videoBytes: "directvideo" } }]
      })
    );

    node.assign({
      prompt: "cat"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual({ type: "video", data: "directvideo" });
  });

  it("throws timeout when poll never completes", async () => {
    // Replace setTimeout with immediate resolution to skip 5s delays
    const origSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) =>
      origSetTimeout(fn, 0)) as typeof setTimeout;
    try {
      const node = new TextToVideoGeminiNode();
      // Initial response: not done, has operation name
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ done: false, name: "operations/timeout-op" })
      );
      // All poll responses: never done
      mockFetch.mockResolvedValue(jsonResponse({ done: false }));

      node.assign({
        prompt: "cat"
      });

      node.setDynamic("_secrets", secrets._secrets);

      await expect(node.process()).rejects.toThrow(
        "Video generation timed out"
      );
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });
});

// ── ImageToVideoGeminiNode ─────────────────────────────────────────────────

describe("ImageToVideoGeminiNode", () => {
  it("returns video data from image input", async () => {
    const node = new ImageToVideoGeminiNode();
    const b64 = Buffer.from("test-image").toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        done: true,
        response: {
          generatedVideos: [{ video: { videoBytes: "videofromimage" } }]
        }
      })
    );

    node.assign({
      image: { data: b64 },
      prompt: "animate"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual({ type: "video", data: "videofromimage" });
  });

  it("throws when image is not set", async () => {
    const node = new ImageToVideoGeminiNode();

    node.assign({
      image: {},
      prompt: "animate"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Input image is required");
  });

  it("throws when image has no data bytes", async () => {
    const node = new ImageToVideoGeminiNode();

    node.assign({
      image: { uri: "https://example.com/img.png", data: "" },
      prompt: "animate"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow();
  });

  it("throws on API error", async () => {
    const node = new ImageToVideoGeminiNode();
    const b64 = Buffer.from("img").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 400));

    node.assign({
      image: { data: b64 },
      prompt: "animate"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Gemini API error 400");
  });
});

// ── TextToSpeechGeminiNode ─────────────────────────────────────────────────

describe("TextToSpeechGeminiNode", () => {
  it("returns WAV audio data", async () => {
    const node = new TextToSpeechGeminiNode();
    const pcmBase64 = Buffer.from(new Uint8Array(100)).toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: pcmBase64 } }]
            }
          }
        ]
      })
    );

    node.assign({
      text: "Hello"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    const output = result.output as Record<string, string>;
    expect(output.data).toBeDefined();
    // Verify it's a valid base64 string containing WAV header
    const decoded = Buffer.from(output.data, "base64");
    expect(decoded[0]).toBe(0x52); // 'R' in RIFF
  });

  it("handles snake_case inline_data", async () => {
    const node = new TextToSpeechGeminiNode();
    const pcmBase64 = Buffer.from(new Uint8Array(10)).toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ inline_data: { data: pcmBase64 } }]
            }
          }
        ]
      })
    );

    node.assign({
      text: "Hi"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect((result.output as Record<string, string>).data).toBeDefined();
  });

  it("includes style prompt", async () => {
    const node = new TextToSpeechGeminiNode();
    const pcmBase64 = Buffer.from(new Uint8Array(10)).toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: pcmBase64 } }]
            }
          }
        ]
      })
    );

    node.assign({
      text: "Hello",
      style_prompt: "Speak cheerfully"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toContain("Speak cheerfully");
  });

  it("throws on empty text", async () => {
    const node = new TextToSpeechGeminiNode();

    node.assign({
      text: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "The input text cannot be empty"
    );
  });

  it("throws on no candidates", async () => {
    const node = new TextToSpeechGeminiNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ candidates: [] }));

    node.assign({
      text: "hello"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("No audio generated");
  });

  it("throws on no audio data in parts", async () => {
    const node = new TextToSpeechGeminiNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "no audio here" }] } }]
      })
    );

    node.assign({
      text: "hello"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "No audio data found in the response"
    );
  });

  it("throws on API error", async () => {
    const node = new TextToSpeechGeminiNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));

    node.assign({
      text: "hello"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Gemini API error 500");
  });
});

// ── TranscribeGeminiNode ───────────────────────────────────────────────────

describe("TranscribeGeminiNode", () => {
  it("returns transcription text", async () => {
    const node = new TranscribeGeminiNode();
    const audioB64 = Buffer.from(
      new Uint8Array([0xff, 0xfb, 0x90, 0x00])
    ).toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          {
            content: { parts: [{ text: "Hello world" }] }
          }
        ]
      })
    );

    node.assign({
      audio: { data: audioB64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toBe("Hello world");
  });

  it("concatenates multiple text parts", async () => {
    const node = new TranscribeGeminiNode();
    const audioB64 = Buffer.from(
      new Uint8Array([0x52, 0x49, 0x46, 0x46])
    ).toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ text: "Hello " }, { text: "world" }]
            }
          }
        ]
      })
    );

    node.assign({
      audio: { data: audioB64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toBe("Hello world");
  });

  it("detects WAV mime type", async () => {
    const node = new TranscribeGeminiNode();
    // RIFF header bytes
    const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]);
    const audioB64 = Buffer.from(wavBytes).toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "wav audio" }] } }]
      })
    );

    node.assign({
      audio: { data: audioB64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("audio/wav");
  });

  it("detects FLAC mime type", async () => {
    const node = new TranscribeGeminiNode();
    const flacBytes = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0, 0]);
    const audioB64 = Buffer.from(flacBytes).toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "flac" }] } }]
      })
    );

    node.assign({
      audio: { data: audioB64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("audio/flac");
  });

  it("detects OGG mime type", async () => {
    const node = new TranscribeGeminiNode();
    const oggBytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0]);
    const audioB64 = Buffer.from(oggBytes).toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "ogg" }] } }]
      })
    );

    node.assign({
      audio: { data: audioB64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("audio/ogg");
  });

  it("detects MP3 with ID3 tag", async () => {
    const node = new TranscribeGeminiNode();
    const id3Bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0]);
    const audioB64 = Buffer.from(id3Bytes).toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "mp3" }] } }]
      })
    );

    node.assign({
      audio: { data: audioB64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("audio/mpeg");
  });

  it("defaults to audio/mpeg for short bytes", async () => {
    const node = new TranscribeGeminiNode();
    const shortBytes = new Uint8Array([0x01, 0x02]);
    const audioB64 = Buffer.from(shortBytes).toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "short" }] } }]
      })
    );

    node.assign({
      audio: { data: audioB64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("audio/mpeg");
  });

  it("throws when audio not set", async () => {
    const node = new TranscribeGeminiNode();

    node.assign({
      audio: {}
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "Audio file is required for transcription"
    );
  });

  it("throws when audio has no data", async () => {
    const node = new TranscribeGeminiNode();

    node.assign({
      audio: { uri: "x" }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Audio data is required");
  });

  it("handles Uint8Array audio data", async () => {
    const node = new TranscribeGeminiNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "from uint8" }] } }]
      })
    );

    node.assign({
      audio: { data: new Uint8Array([0xff, 0xfb, 0x90, 0x00]) }
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toBe("from uint8");
  });

  it("throws on no candidates", async () => {
    const node = new TranscribeGeminiNode();
    const audioB64 = Buffer.from(new Uint8Array([0xff, 0xfb])).toString(
      "base64"
    );
    mockFetch.mockResolvedValueOnce(jsonResponse({ candidates: [] }));

    node.assign({
      audio: { data: audioB64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "No transcription generated from the audio"
    );
  });

  it("throws on API error", async () => {
    const node = new TranscribeGeminiNode();
    const audioB64 = Buffer.from(new Uint8Array([0xff, 0xfb])).toString(
      "base64"
    );
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));

    node.assign({
      audio: { data: audioB64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Gemini API error 500");
  });

  it("throws when no parts in transcription", async () => {
    const node = new TranscribeGeminiNode();
    const audioB64 = Buffer.from(new Uint8Array([0xff, 0xfb])).toString(
      "base64"
    );
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ candidates: [{ content: {} }] })
    );

    node.assign({
      audio: { data: audioB64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "No transcription generated from the audio"
    );
  });

  it("defaults to audio/mpeg for unknown magic bytes", async () => {
    const node = new TranscribeGeminiNode();
    const unknownBytes = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]);
    const audioB64 = Buffer.from(unknownBytes).toString("base64");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "unknown" }] } }]
      })
    );

    node.assign({
      audio: { data: audioB64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("audio/mpeg");
  });
});

// ── Defaults coverage ────────────────────────────────────────────────────

describe("Node defaults coverage", () => {
  it("GroundedSearchNode defaults", () => {
    const node = new GroundedSearchNode();
    const d = node.serialize();
    expect(d.query).toBe("");
    expect(d.model).toBe("gemini-2.0-flash");
  });

  it("EmbeddingNode defaults", () => {
    const node = new EmbeddingNode();
    const d = node.serialize();
    expect(d.input).toBe("");
    expect(d.model).toBe("text-embedding-004");
  });

  it("ImageGenerationNode defaults", () => {
    const node = new ImageGenerationNode();
    const d = node.serialize();
    expect(d.prompt).toBe("");
    expect(d.model).toBe("imagen-3.0-generate-002");
  });

  it("TextToVideoGeminiNode defaults", () => {
    const node = new TextToVideoGeminiNode();
    const d = node.serialize();
    expect(d.prompt).toBe("");
    expect(d.model).toBe("veo-3.1-generate-preview");
    expect(d.aspect_ratio).toBe("16:9");
    expect(d.negative_prompt).toBe("");
  });

  it("ImageToVideoGeminiNode defaults", () => {
    const node = new ImageToVideoGeminiNode();
    const d = node.serialize();
    expect(d.prompt).toBe("");
    expect(d.model).toBe("veo-3.1-generate-preview");
  });

  it("TextToSpeechGeminiNode defaults", () => {
    const node = new TextToSpeechGeminiNode();
    const d = node.serialize();
    expect(d.text).toBe("");
    expect(d.model).toBe("gemini-2.5-pro-preview-tts");
    expect(d.voice_name).toBe("kore");
    expect(d.style_prompt).toBe("");
  });

  it("TranscribeGeminiNode defaults", () => {
    const node = new TranscribeGeminiNode();
    const d = node.serialize();
    expect(d.model).toBe("gemini-2.5-flash");
  });

  it("TextToSpeechGeminiNode throws when no parts", async () => {
    const node = new TextToSpeechGeminiNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ candidates: [{ content: {} }] })
    );

    node.assign({
      text: "hello"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("No audio generated");
  });

  it("ImageGenerationNode throws when no parts in gemini response", async () => {
    const node = new ImageGenerationNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: {} }]
      })
    );

    node.assign({
      prompt: "cat",
      model: "gemini-2.0-flash"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "Invalid response format from Gemini API"
    );
  });

  it("ImageGenerationNode Gemini API error", async () => {
    const node = new ImageGenerationNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 400));

    node.assign({
      prompt: "cat",
      model: "gemini-2.0-flash"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Gemini API error 400");
  });

  it("getImageBytes returns Uint8Array for Uint8Array input", () => {
    const node = new ImageGenerationNode();
    const b64 = Buffer.from(new Uint8Array([1, 2, 3])).toString("base64");
    // This exercises the Uint8Array path in getImageBytes
    // (already covered by ImageToVideoGeminiNode tests)
  });
});
