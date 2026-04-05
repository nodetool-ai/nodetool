import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { clearAllSecretCache } from "@nodetool/security";
import {
  OpenAIEmbeddingFunction,
  OllamaEmbeddingFunction,
  GeminiEmbeddingFunction,
  MistralEmbeddingFunction,
  ProviderEmbeddingFunction,
  getProviderEmbeddingFunction
} from "../src/embedding.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(response: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response)
  });
}

// ---------------------------------------------------------------------------
// getProviderEmbeddingFunction factory
// ---------------------------------------------------------------------------

describe("getProviderEmbeddingFunction", () => {
  afterEach(() => {
    delete process.env.OLLAMA_API_URL;
  });

  it("returns OpenAIEmbeddingFunction for text-embedding-* models", () => {
    const ef = getProviderEmbeddingFunction("text-embedding-3-small");
    expect(ef).toBeInstanceOf(OpenAIEmbeddingFunction);
  });

  it("returns OpenAIEmbeddingFunction for text-embedding-ada-002", () => {
    const ef = getProviderEmbeddingFunction("text-embedding-ada-002");
    expect(ef).toBeInstanceOf(OpenAIEmbeddingFunction);
  });

  it("returns MistralEmbeddingFunction for mistral-embed models", () => {
    const ef = getProviderEmbeddingFunction("mistral-embed");
    expect(ef).toBeInstanceOf(MistralEmbeddingFunction);
  });

  it("returns GeminiEmbeddingFunction for text-embedding-004", () => {
    const ef = getProviderEmbeddingFunction("text-embedding-004");
    expect(ef).toBeInstanceOf(GeminiEmbeddingFunction);
  });

  it("returns GeminiEmbeddingFunction for text-embedding-004 variant models", () => {
    const ef = getProviderEmbeddingFunction("text-embedding-004-preview");
    expect(ef).toBeInstanceOf(GeminiEmbeddingFunction);
  });

  it("returns GeminiEmbeddingFunction for gemini-embedding-* models", () => {
    const ef = getProviderEmbeddingFunction("gemini-embedding-exp-03-07");
    expect(ef).toBeInstanceOf(GeminiEmbeddingFunction);
  });

  it("returns OllamaEmbeddingFunction when OLLAMA_API_URL is set", () => {
    process.env.OLLAMA_API_URL = "http://localhost:11434";
    const ef = getProviderEmbeddingFunction("nomic-embed-text");
    expect(ef).toBeInstanceOf(OllamaEmbeddingFunction);
  });

  it("returns null when provider cannot be determined and no Ollama URL", () => {
    const ef = getProviderEmbeddingFunction("unknown-model");
    expect(ef).toBeNull();
  });

  it("uses explicit provider when supplied", () => {
    const ef = getProviderEmbeddingFunction("my-model", "openai");
    expect(ef).toBeInstanceOf(ProviderEmbeddingFunction);
  });

  it("returns empty array for empty text input without API call", async () => {
    const mockFetchFn = vi.fn();
    vi.stubGlobal("fetch", mockFetchFn);

    const ef = getProviderEmbeddingFunction("text-embedding-3-small")!;
    const result = await ef.generate([]);
    expect(result).toEqual([]);
    // Should short-circuit before making any network call
    expect(mockFetchFn).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// OpenAIEmbeddingFunction
// ---------------------------------------------------------------------------

describe("OpenAIEmbeddingFunction", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    clearAllSecretCache();
    delete process.env.OPENAI_API_KEY;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAllSecretCache();
    delete process.env.OPENAI_API_KEY;
  });

  it("calls OpenAI API and returns embeddings", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const ef = new OpenAIEmbeddingFunction();

    const mockData = {
      data: [
        { index: 0, embedding: [0.1, 0.2, 0.3] },
        { index: 1, embedding: [0.4, 0.5, 0.6] }
      ]
    };
    vi.stubGlobal("fetch", mockFetch(mockData));

    const result = await ef.generate(["hello", "world"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([0.1, 0.2, 0.3]);
    expect(result[1]).toEqual([0.4, 0.5, 0.6]);
  });

  it("throws when API key is not configured", async () => {
    // Ensure no key is set and fetch is not callable
    const ef = new OpenAIEmbeddingFunction();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("fetch should not be called"))
    );

    await expect(ef.generate(["test"])).rejects.toThrow(
      "OPENAI_API_KEY not configured"
    );
  });

  it("throws on HTTP error", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const ef = new OpenAIEmbeddingFunction();

    vi.stubGlobal("fetch", mockFetch("Unauthorized", false, 401));

    await expect(ef.generate(["test"])).rejects.toThrow(
      "OpenAI embedding failed (401)"
    );
  });

  it("uses custom model and dimensions", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const ef = new OpenAIEmbeddingFunction("text-embedding-3-large", 256);

    let capturedBody: Record<string, unknown> = {};
    const mockFetchFn = vi
      .fn()
      .mockImplementation(async (_url: string, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        return {
          ok: true,
          json: async () => ({ data: [{ index: 0, embedding: [1, 2] }] }),
          text: async () => ""
        };
      });
    vi.stubGlobal("fetch", mockFetchFn);

    await ef.generate(["test"]);
    expect(capturedBody.model).toBe("text-embedding-3-large");
    expect(capturedBody.dimensions).toBe(256);
  });
});

// ---------------------------------------------------------------------------
// OllamaEmbeddingFunction
// ---------------------------------------------------------------------------

describe("OllamaEmbeddingFunction", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    clearAllSecretCache();
    delete process.env.OLLAMA_API_URL;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAllSecretCache();
    delete process.env.OLLAMA_API_URL;
  });

  it("calls Ollama API and returns embeddings", async () => {
    process.env.OLLAMA_API_URL = "http://localhost:11434";
    const ef = new OllamaEmbeddingFunction();

    vi.stubGlobal(
      "fetch",
      mockFetch({
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4]
        ]
      })
    );

    const result = await ef.generate(["a", "b"]);
    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4]
    ]);
  });

  it("throws on HTTP error", async () => {
    process.env.OLLAMA_API_URL = "http://localhost:11434";
    const ef = new OllamaEmbeddingFunction();

    vi.stubGlobal("fetch", mockFetch("Server Error", false, 500));

    await expect(ef.generate(["test"])).rejects.toThrow(
      "Ollama embedding failed (500)"
    );
  });
});

// ---------------------------------------------------------------------------
// GeminiEmbeddingFunction
// ---------------------------------------------------------------------------

describe("GeminiEmbeddingFunction", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    clearAllSecretCache();
    delete process.env.GEMINI_API_KEY;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAllSecretCache();
    delete process.env.GEMINI_API_KEY;
  });

  it("calls Gemini API once per text and returns embeddings", async () => {
    process.env.GEMINI_API_KEY = "gemini-key";
    const ef = new GeminiEmbeddingFunction();

    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } }),
        text: async () => ""
      };
    });
    vi.stubGlobal("fetch", fetchFn);

    const result = await ef.generate(["text1", "text2"]);
    // Gemini makes one call per text
    expect(callCount).toBe(2);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([0.1, 0.2, 0.3]);
  });

  it("throws when API key is not configured", async () => {
    const ef = new GeminiEmbeddingFunction();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("fetch should not be called"))
    );

    await expect(ef.generate(["test"])).rejects.toThrow(
      "GEMINI_API_KEY not configured"
    );
  });
});

// ---------------------------------------------------------------------------
// MistralEmbeddingFunction
// ---------------------------------------------------------------------------

describe("MistralEmbeddingFunction", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    clearAllSecretCache();
    delete process.env.MISTRAL_API_KEY;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAllSecretCache();
    delete process.env.MISTRAL_API_KEY;
  });

  it("calls Mistral API and returns embeddings", async () => {
    process.env.MISTRAL_API_KEY = "mistral-key";
    const ef = new MistralEmbeddingFunction();

    vi.stubGlobal(
      "fetch",
      mockFetch({
        data: [
          { index: 0, embedding: [0.5, 0.6] },
          { index: 1, embedding: [0.7, 0.8] }
        ]
      })
    );

    const result = await ef.generate(["a", "b"]);
    expect(result).toEqual([
      [0.5, 0.6],
      [0.7, 0.8]
    ]);
  });

  it("throws on HTTP error", async () => {
    process.env.MISTRAL_API_KEY = "mistral-key";
    const ef = new MistralEmbeddingFunction();

    vi.stubGlobal("fetch", mockFetch("Error", false, 429));

    await expect(ef.generate(["test"])).rejects.toThrow(
      "Mistral embedding failed (429)"
    );
  });
});
