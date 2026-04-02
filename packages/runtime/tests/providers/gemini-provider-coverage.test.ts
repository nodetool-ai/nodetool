/**
 * Additional coverage tests for GeminiProvider – image conversion,
 * response format, error handling, edge cases, and modality methods.
 */

import { describe, it, expect, vi } from "vitest";
import { GeminiProvider } from "../../src/providers/gemini-provider.js";
import type {
  Message,
  TextToImageParams,
  ImageToImageParams,
  TextToVideoParams,
  ImageToVideoParams
} from "../../src/providers/types.js";

function makeFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
    body: null
  } as unknown as Response;
}

function makeSSEStream(events: unknown[]): Response {
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  const encoder = new TextEncoder();
  const bytes = encoder.encode(lines);

  let released = false;
  const reader = {
    async read() {
      if (released) return { done: true, value: undefined };
      released = true;
      return { done: false, value: bytes };
    },
    releaseLock() {}
  };

  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    body: { getReader: () => reader }
  } as unknown as Response;
}

describe("GeminiProvider – convertMessages with images", () => {
  it("converts image with Uint8Array data", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const result = await provider.convertMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "describe" },
          { type: "image", image: { data: new Uint8Array([1, 2, 3]) } }
        ]
      }
    ]);

    expect(result.contents).toHaveLength(1);
    const parts = result.contents[0].parts;
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ text: "describe" });
    expect(parts[1].inlineData).toBeDefined();
    expect(parts[1].inlineData!.mimeType).toBe("image/jpeg");
  });

  it("converts image with string data", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const result = await provider.convertMessages([
      {
        role: "user",
        content: [{ type: "image", image: { data: "base64string" } }]
      }
    ]);

    expect(result.contents[0].parts[0].inlineData!.data).toBe("base64string");
  });

  it("converts image with data URI", async () => {
    const base64 = Buffer.from("test").toString("base64");
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const result = await provider.convertMessages([
      {
        role: "user",
        content: [
          {
            type: "image",
            image: { uri: `data:image/png;base64,${base64}` }
          }
        ]
      }
    ]);

    expect(result.contents[0].parts[0].inlineData!.mimeType).toBe("image/png");
    expect(result.contents[0].parts[0].inlineData!.data).toBe(base64);
  });

  it("fetches image from remote URI", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("example.com")) {
        return {
          ok: true,
          headers: new Headers({ "content-type": "image/jpeg" }),
          arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
        };
      }
      return makeFetchResponse({});
    });

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const result = await provider.convertMessages([
      {
        role: "user",
        content: [
          { type: "image", image: { uri: "https://example.com/img.jpg" } }
        ]
      }
    ]);

    expect(result.contents[0].parts[0].inlineData!.mimeType).toBe("image/jpeg");
  });

  it("handles image with no data and no URI", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const result = await provider.convertMessages([
      {
        role: "user",
        content: [{ type: "image", image: {} }]
      }
    ]);

    expect(result.contents[0].parts[0].inlineData!.data).toBe("");
  });

  it("converts audio content with Uint8Array data to inlineData", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const result = await provider.convertMessages([
      {
        role: "user",
        content: [
          {
            type: "audio",
            audio: { data: new Uint8Array([1, 2, 3]), mimeType: "audio/mp3" }
          }
        ]
      }
    ]);

    expect(result.contents[0].parts[0].inlineData).toBeDefined();
    expect(result.contents[0].parts[0].inlineData!.mimeType).toBe("audio/mp3");
    expect(result.contents[0].parts[0].inlineData!.data).toBeTruthy();
  });

  it("converts audio content with string data to inlineData", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const result = await provider.convertMessages([
      {
        role: "user",
        content: [{ type: "audio", audio: { data: "base64audiodata" } }]
      }
    ]);

    expect(result.contents[0].parts[0].inlineData).toBeDefined();
    expect(result.contents[0].parts[0].inlineData!.data).toBe(
      "base64audiodata"
    );
    expect(result.contents[0].parts[0].inlineData!.mimeType).toBe("audio/mp3");
  });

  it("converts audio content with data URI", async () => {
    const base64 = Buffer.from("audiodata").toString("base64");
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const result = await provider.convertMessages([
      {
        role: "user",
        content: [
          { type: "audio", audio: { uri: `data:audio/wav;base64,${base64}` } }
        ]
      }
    ]);

    expect(result.contents[0].parts[0].inlineData).toBeDefined();
    expect(result.contents[0].parts[0].inlineData!.mimeType).toBe("audio/wav");
    expect(result.contents[0].parts[0].inlineData!.data).toBe(base64);
  });

  it("converts audio content with remote URI", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("example.com")) {
        return {
          ok: true,
          headers: new Headers({ "content-type": "audio/mpeg" }),
          arrayBuffer: async () => Uint8Array.from([4, 5, 6]).buffer
        };
      }
      return makeFetchResponse({});
    });

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const result = await provider.convertMessages([
      {
        role: "user",
        content: [
          { type: "audio", audio: { uri: "https://example.com/audio.mp3" } }
        ]
      }
    ]);

    expect(result.contents[0].parts[0].inlineData).toBeDefined();
    expect(result.contents[0].parts[0].inlineData!.mimeType).toBe("audio/mpeg");
    expect(fetchFn).toHaveBeenCalledWith("https://example.com/audio.mp3");
  });

  it("converts audio content with no data and no URI to empty inlineData", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const result = await provider.convertMessages([
      {
        role: "user",
        content: [{ type: "audio", audio: {} }]
      }
    ]);

    expect(result.contents[0].parts[0].inlineData).toBeDefined();
    expect(result.contents[0].parts[0].inlineData!.data).toBe("");
    expect(result.contents[0].parts[0].inlineData!.mimeType).toBe("audio/mp3");
  });
});

describe("GeminiProvider – convertMessages system with array content", () => {
  it("extracts text from array-typed system content", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const result = await provider.convertMessages([
      {
        role: "system",
        content: [
          { type: "text", text: "part1" },
          { type: "text", text: "part2" }
        ]
      },
      { role: "user", content: "hello" }
    ]);

    expect(result.systemInstruction).toBe("part1 part2");
  });
});

describe("GeminiProvider – convertMessages assistant with content array", () => {
  it("converts assistant array content", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const result = await provider.convertMessages([
      {
        role: "assistant",
        content: [{ type: "text", text: "thinking..." }]
      }
    ]);

    expect(result.contents[0].role).toBe("model");
    expect(result.contents[0].parts[0].text).toBe("thinking...");
  });

  it("skips assistant with no content and no tool calls", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const result = await provider.convertMessages([
      { role: "assistant", content: null }
    ]);

    expect(result.contents).toHaveLength(0);
  });
});

describe("GeminiProvider – formatTools deduplication", () => {
  it("deduplicates tool names with suffix", () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const { geminiTools, nameMap } = provider.formatTools([
      { name: "search", description: "First" },
      { name: "search", description: "Second" }
    ]);

    expect(geminiTools[0].functionDeclarations).toHaveLength(2);
    const names = geminiTools[0].functionDeclarations.map((d: any) => d.name);
    expect(new Set(names).size).toBe(2); // unique names
  });

  it("returns empty geminiTools for no tools", () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    const { geminiTools } = provider.formatTools([]);
    expect(geminiTools).toEqual([]);
  });
});

describe("GeminiProvider – generateMessage with responseFormat", () => {
  it("sets responseMimeType for responseFormat", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }]
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    await provider.generateMessage({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "json" }],
      responseFormat: { type: "json_object" }
    });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("sets responseSchema for jsonSchema", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }]
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    await provider.generateMessage({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "json" }],
      jsonSchema: { type: "object", properties: { ok: { type: "boolean" } } }
    });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema).toBeDefined();
  });
});

describe("GeminiProvider – generateMessage error handling", () => {
  it("throws on API error in response body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        error: { message: "quota exceeded" },
        candidates: [{ content: { parts: [{ text: "ok" }] } }]
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    await expect(
      provider.generateMessage({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "hi" }]
      })
    ).rejects.toThrow("quota exceeded");
  });

  it("throws when no candidates returned", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(makeFetchResponse({ candidates: [] }));

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    await expect(
      provider.generateMessage({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "hi" }]
      })
    ).rejects.toThrow("no candidates");
  });
});

describe("GeminiProvider – streaming error handling", () => {
  it("throws on non-OK streaming response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      text: async () => "Internal Server Error",
      body: null
    });

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const gen = provider.generateMessages({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "hi" }]
    });

    await expect(gen.next()).rejects.toThrow("Gemini API error 500");
  });

  it("throws when streaming response has no body", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: null
    });

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const gen = provider.generateMessages({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "hi" }]
    });

    await expect(gen.next()).rejects.toThrow("no body");
  });

  it("handles malformed JSON in SSE stream gracefully", async () => {
    // Create a stream with invalid JSON
    const encoder = new TextEncoder();
    const bytes = encoder.encode(
      'data: {invalid json}\n\ndata: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n'
    );

    let released = false;
    const reader = {
      async read() {
        if (released) return { done: true, value: undefined };
        released = true;
        return { done: false, value: bytes };
      },
      releaseLock() {}
    };

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: { getReader: () => reader }
    });

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "hi" }]
    })) {
      out.push(item);
    }

    // Should skip bad JSON and still parse the good one + done
    const textChunks = out.filter((o: any) => o.type === "chunk" && o.content);
    expect(textChunks.length).toBeGreaterThan(0);
  });

  it("handles [DONE] signal in SSE stream", async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode("data: [DONE]\n\n");

    let released = false;
    const reader = {
      async read() {
        if (released) return { done: true, value: undefined };
        released = true;
        return { done: false, value: bytes };
      },
      releaseLock() {}
    };

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: { getReader: () => reader }
    });

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "hi" }]
    })) {
      out.push(item);
    }

    // Should only have the synthetic done chunk
    expect(out).toEqual([{ type: "chunk", content: "", done: true }]);
  });
});

describe("GeminiProvider – getAvailableLanguageModels with network error", () => {
  it("returns empty on fetch throw", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("network error"));
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([]);
  });
});

describe("GeminiProvider – streaming with systemInstruction", () => {
  it("includes systemInstruction in streaming request body", async () => {
    const events = [
      {
        candidates: [{ content: { parts: [{ text: "ok" }] } }]
      }
    ];

    const fetchFn = vi.fn().mockResolvedValue(makeSSEStream(events));

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "gemini-2.0-flash",
      messages: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "hi" }
      ]
    })) {
      out.push(item);
    }

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.systemInstruction).toEqual({
      parts: [{ text: "You are helpful" }]
    });
  });
});

describe("GeminiProvider – streaming with tools", () => {
  it("includes tools in streaming request body", async () => {
    const events = [
      {
        candidates: [{ content: { parts: [{ text: "ok" }] } }]
      }
    ];

    const fetchFn = vi.fn().mockResolvedValue(makeSSEStream(events));

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "search", description: "Search" }]
    })) {
      out.push(item);
    }

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.tools).toBeDefined();
  });
});

describe("GeminiProvider – streaming with tool name reverse mapping", () => {
  it("maps sanitized tool names back to original", async () => {
    const events = [
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: { name: "my_tool_", args: { x: 1 } }
                }
              ]
            }
          }
        ]
      }
    ];

    const fetchFn = vi.fn().mockResolvedValue(makeSSEStream(events));

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "use tool" }],
      tools: [{ name: "my tool!", description: "test" }]
    })) {
      out.push(item);
    }

    // The tool call name should be mapped back to original
    const tc = out.find((o: any) => o.name) as any;
    expect(tc.name).toBe("my tool!");
  });
});

// ---------------------------------------------------------------------------
// Model listing methods
// ---------------------------------------------------------------------------

describe("GeminiProvider – model listing", () => {
  const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

  it("returns image models", async () => {
    const models = await provider.getAvailableImageModels();
    expect(models.length).toBeGreaterThanOrEqual(2);
    expect(models[0].provider).toBe("gemini");
  });

  it("returns TTS models with voices", async () => {
    const models = await provider.getAvailableTTSModels();
    expect(models.length).toBeGreaterThanOrEqual(1);
    expect(models[0].voices!.length).toBe(30);
    expect(models[0].voices).toContain("Puck");
  });

  it("returns ASR models", async () => {
    const models = await provider.getAvailableASRModels();
    expect(models.length).toBeGreaterThanOrEqual(2);
  });

  it("returns video models", async () => {
    const models = await provider.getAvailableVideoModels();
    expect(models.length).toBeGreaterThanOrEqual(2);
    expect(models[0].id).toContain("veo");
  });

  it("returns embedding models with dimensions", async () => {
    const models = await provider.getAvailableEmbeddingModels();
    expect(models.length).toBeGreaterThanOrEqual(2);
    expect(models[0].dimensions).toBe(768);
    expect(models[1].dimensions).toBe(3072);
  });
});

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

describe("GeminiProvider – generateEmbedding", () => {
  it("generates embedding for a single text", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        embedding: { values: [0.1, 0.2, 0.3] }
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const result = await provider.generateEmbedding({
      text: "hello world",
      model: "text-embedding-004"
    });

    expect(result).toEqual([[0.1, 0.2, 0.3]]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("text-embedding-004:embedContent");
  });

  it("generates embeddings for multiple texts", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        makeFetchResponse({ embedding: { values: [0.1] } })
      )
      .mockResolvedValueOnce(
        makeFetchResponse({ embedding: { values: [0.2] } })
      );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const result = await provider.generateEmbedding({
      text: ["a", "b"],
      model: "text-embedding-004"
    });

    expect(result).toEqual([[0.1], [0.2]]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("passes dimensions in request body", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(makeFetchResponse({ embedding: { values: [0.1] } }));

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await provider.generateEmbedding({
      text: "hello",
      model: "text-embedding-004",
      dimensions: 256
    });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.outputDimensionality).toBe(256);
  });

  it("throws on empty text", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    await expect(
      provider.generateEmbedding({ text: "", model: "m" })
    ).rejects.toThrow("empty");
  });

  it("throws on API error", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(makeFetchResponse("error", false, 400));
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await expect(
      provider.generateEmbedding({ text: "hi", model: "m" })
    ).rejects.toThrow("400");
  });

  it("throws when no embedding returned", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeFetchResponse({}));
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await expect(
      provider.generateEmbedding({ text: "hi", model: "m" })
    ).rejects.toThrow("No embedding");
  });
});

// ---------------------------------------------------------------------------
// Text-to-image
// ---------------------------------------------------------------------------

describe("GeminiProvider – textToImage", () => {
  it("generates image with gemini model (generateContent path)", async () => {
    const imageB64 = Buffer.from("fake-png-data").toString("base64");
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: imageB64 } }]
            }
          }
        ]
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const result = await provider.textToImage({
      model: {
        id: "gemini-2.0-flash-preview-image-generation",
        name: "test",
        provider: "gemini"
      },
      prompt: "a cat"
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("generateContent");
  });

  it("generates image with imagen model (generateImages path)", async () => {
    const imageB64 = Buffer.from("fake-png").toString("base64");
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        predictions: [{ bytesBase64Encoded: imageB64 }]
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const result = await provider.textToImage({
      model: {
        id: "imagen-3.0-generate-002",
        name: "test",
        provider: "gemini"
      },
      prompt: "a dog"
    });

    expect(result).toBeInstanceOf(Uint8Array);
    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("generateImages");
  });

  it("throws on empty prompt", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    await expect(
      provider.textToImage({
        model: { id: "gemini-2.0-flash", name: "test", provider: "gemini" },
        prompt: ""
      })
    ).rejects.toThrow("empty");
  });

  it("throws when no image in gemini response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: "no image" }] } }]
      })
    );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await expect(
      provider.textToImage({
        model: { id: "gemini-2.0-flash", name: "test", provider: "gemini" },
        prompt: "cat"
      })
    ).rejects.toThrow("No image");
  });

  it("throws when no image in imagen response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeFetchResponse({}));
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await expect(
      provider.textToImage({
        model: { id: "imagen-3.0", name: "test", provider: "gemini" },
        prompt: "cat"
      })
    ).rejects.toThrow("No image");
  });
});

// ---------------------------------------------------------------------------
// Image-to-image
// ---------------------------------------------------------------------------

describe("GeminiProvider – imageToImage", () => {
  it("transforms image with gemini model", async () => {
    const imageB64 = Buffer.from("result-png").toString("base64");
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: imageB64 } }]
            }
          }
        ]
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const input = new Uint8Array([1, 2, 3]);
    const result = await provider.imageToImage(input, {
      model: {
        id: "gemini-2.0-flash-preview-image-generation",
        name: "test",
        provider: "gemini"
      },
      prompt: "make it blue"
    });

    expect(result).toBeInstanceOf(Uint8Array);
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.generationConfig.responseModalities).toContain("IMAGE");
  });

  it("throws for non-gemini model", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    await expect(
      provider.imageToImage(new Uint8Array([1]), {
        model: { id: "imagen-3.0", name: "test", provider: "gemini" },
        prompt: "edit"
      })
    ).rejects.toThrow("does not support");
  });

  it("throws on empty prompt", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    await expect(
      provider.imageToImage(new Uint8Array([1]), {
        model: { id: "gemini-2.0-flash", name: "test", provider: "gemini" },
        prompt: ""
      })
    ).rejects.toThrow("empty");
  });
});

// ---------------------------------------------------------------------------
// Text-to-speech
// ---------------------------------------------------------------------------

describe("GeminiProvider – textToSpeech", () => {
  it("yields audio chunks from TTS response", async () => {
    // Create fake PCM int16 data (4 samples = 8 bytes)
    const pcmBuffer = Buffer.alloc(8);
    pcmBuffer.writeInt16LE(100, 0);
    pcmBuffer.writeInt16LE(200, 2);
    pcmBuffer.writeInt16LE(300, 4);
    pcmBuffer.writeInt16LE(400, 6);
    const audioB64 = pcmBuffer.toString("base64");

    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "audio/pcm", data: audioB64 } }]
            }
          }
        ]
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const chunks: any[] = [];
    for await (const chunk of provider.textToSpeech({
      text: "Hello",
      model: "gemini-2.5-pro-preview-tts",
      voice: "Puck"
    })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(1);
    expect(chunks[0].samples).toBeInstanceOf(Int16Array);
    expect(chunks[0].samples.length).toBe(4);

    // Verify voice config in request
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(
      body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig
        .voiceName
    ).toBe("Puck");
  });

  it("uses default voice when none specified", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [] } }]
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const chunks: any[] = [];
    for await (const chunk of provider.textToSpeech({
      text: "Hello",
      model: "gemini-2.5-pro-preview-tts"
    })) {
      chunks.push(chunk);
    }

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(
      body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig
        .voiceName
    ).toBe("Puck");
  });

  it("throws on API error", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(makeFetchResponse("error", false, 500));
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const gen = provider.textToSpeech({ text: "hi", model: "m" });
    await expect(gen.next()).rejects.toThrow("500");
  });
});

// ---------------------------------------------------------------------------
// Automatic speech recognition
// ---------------------------------------------------------------------------

describe("GeminiProvider – automaticSpeechRecognition", () => {
  it("transcribes audio with default prompt", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [
          {
            content: {
              parts: [{ text: "Hello world" }]
            }
          }
        ]
      })
    );

    // WAV header (RIFF)
    const wavAudio = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]);
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const result = await provider.automaticSpeechRecognition({
      audio: wavAudio,
      model: "gemini-2.0-flash"
    });

    expect(result).toBe("Hello world");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    // Should have audio inline data + text prompt
    expect(body.contents[0].parts).toHaveLength(2);
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe("audio/wav");
  });

  it("detects MP3 format from header", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: "transcribed" }] } }]
      })
    );

    // ID3 header
    const mp3Audio = new Uint8Array([0x49, 0x44, 0x33, 0, 0]);
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await provider.automaticSpeechRecognition({ audio: mp3Audio, model: "m" });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe("audio/mp3");
  });

  it("detects FLAC format from header", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }]
      })
    );

    // fLaC header
    const flacAudio = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0]);
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await provider.automaticSpeechRecognition({ audio: flacAudio, model: "m" });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe("audio/flac");
  });

  it("detects OGG format from header", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }]
      })
    );

    // OggS header
    const oggAudio = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0]);
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await provider.automaticSpeechRecognition({ audio: oggAudio, model: "m" });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe("audio/ogg");
  });

  it("adds language hint to prompt", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        candidates: [{ content: { parts: [{ text: "Bonjour" }] } }]
      })
    );

    const audio = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0]);
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await provider.automaticSpeechRecognition({
      audio,
      model: "gemini-2.0-flash",
      language: "French"
    });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    const textPart = body.contents[0].parts.find((p: any) => p.text);
    expect(textPart.text).toContain("French");
  });

  it("throws on empty audio", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    await expect(
      provider.automaticSpeechRecognition({
        audio: new Uint8Array(0),
        model: "m"
      })
    ).rejects.toThrow("empty");
  });

  it("returns empty string when no text in response", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        makeFetchResponse({ candidates: [{ content: { parts: [] } }] })
      );
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const result = await provider.automaticSpeechRecognition({
      audio: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
      model: "m"
    });
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Text-to-video
// ---------------------------------------------------------------------------

describe("GeminiProvider – textToVideo", () => {
  it("throws on empty prompt", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    await expect(
      provider.textToVideo({
        model: { id: "veo-2.0-generate-001", name: "test", provider: "gemini" },
        prompt: ""
      })
    ).rejects.toThrow("empty");
  });

  it("throws for non-veo model", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    await expect(
      provider.textToVideo({
        model: { id: "gemini-2.0-flash", name: "test", provider: "gemini" },
        prompt: "a cat"
      })
    ).rejects.toThrow("not a Veo model");
  });

  it("handles immediate completion", async () => {
    const videoBytes = Buffer.from("fake-mp4-data");
    const fetchFn = vi
      .fn()
      // First call: initiate generation (already done)
      .mockResolvedValueOnce(
        makeFetchResponse({
          name: "operations/123",
          done: true,
          response: {
            generatedVideos: [
              { video: { uri: "https://example.com/video.mp4" } }
            ]
          }
        })
      )
      // Second call: download video
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: async () =>
          videoBytes.buffer.slice(
            videoBytes.byteOffset,
            videoBytes.byteOffset + videoBytes.byteLength
          )
      } as unknown as Response);

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const result = await provider.textToVideo({
      model: { id: "veo-2.0-generate-001", name: "test", provider: "gemini" },
      prompt: "a cat walking"
    });

    expect(result).toBeInstanceOf(Uint8Array);
  });

  it("throws when no video URI in response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeFetchResponse({
        name: "operations/123",
        done: true,
        response: { generatedVideos: [] }
      })
    );

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    await expect(
      provider.textToVideo({
        model: { id: "veo-2.0-generate-001", name: "test", provider: "gemini" },
        prompt: "a cat"
      })
    ).rejects.toThrow("No video");
  });
});

// ---------------------------------------------------------------------------
// Image-to-video
// ---------------------------------------------------------------------------

describe("GeminiProvider – imageToVideo", () => {
  it("throws on empty image", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    await expect(
      provider.imageToVideo(new Uint8Array(0), {
        model: { id: "veo-2.0-generate-001", name: "test", provider: "gemini" }
      })
    ).rejects.toThrow("empty");
  });

  it("throws for non-veo model", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    await expect(
      provider.imageToVideo(new Uint8Array([1, 2, 3]), {
        model: { id: "gemini-2.0-flash", name: "test", provider: "gemini" }
      })
    ).rejects.toThrow("not a Veo model");
  });

  it("handles immediate completion with image", async () => {
    const videoBytes = Buffer.from("fake-mp4");
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        makeFetchResponse({
          name: "operations/456",
          done: true,
          response: {
            generatedVideos: [
              { video: { uri: "https://example.com/video.mp4" } }
            ]
          }
        })
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: async () =>
          videoBytes.buffer.slice(
            videoBytes.byteOffset,
            videoBytes.byteOffset + videoBytes.byteLength
          )
      } as unknown as Response);

    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" }, { fetchFn });
    const result = await provider.imageToVideo(new Uint8Array([1, 2, 3]), {
      model: { id: "veo-2.0-generate-001", name: "test", provider: "gemini" },
      prompt: "animate this"
    });

    expect(result).toBeInstanceOf(Uint8Array);
    // Verify image was included in request
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.instances[0].image).toBeDefined();
    expect(body.instances[0].image.mimeType).toBe("image/png");
  });
});
