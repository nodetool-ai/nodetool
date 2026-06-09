/**
 * Mutation-hardening for CohereProvider: the curated model list, the embed
 * request shape (URL, headers, body fields, model default), text validation,
 * both response shapes, and the chat-unsupported generators. See MUTATION_TESTING.md.
 */
import { describe, it, expect, vi } from "vitest";
import { CohereProvider } from "../../src/providers/cohere-provider.js";

const make = (
  fetchFn?: unknown,
  opts: { inputType?: string } = {},
  key = "k"
) =>
  new CohereProvider(
    { COHERE_API_KEY: key },
    { fetchFn: fetchFn as never, ...(opts as never) }
  );

const okEmbed = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => body });

describe("CohereProvider model list", () => {
  it("returns the exact curated embedding model list", async () => {
    expect(await make().getAvailableEmbeddingModels()).toEqual([
      { id: "embed-v4.0", name: "Embed v4.0", provider: "cohere", dimensions: 1536 },
      { id: "embed-english-v3.0", name: "Embed English v3.0", provider: "cohere", dimensions: 1024 },
      { id: "embed-english-light-v3.0", name: "Embed English Light v3.0", provider: "cohere", dimensions: 384 },
      { id: "embed-multilingual-v3.0", name: "Embed Multilingual v3.0", provider: "cohere", dimensions: 1024 },
      { id: "embed-multilingual-light-v3.0", name: "Embed Multilingual Light v3.0", provider: "cohere", dimensions: 384 }
    ]);
  });
});

describe("CohereProvider chat is unsupported", () => {
  it("generateMessage rejects", async () => {
    await expect(
      make().generateMessage({ messages: [], model: "x" } as never)
    ).rejects.toThrow("does not support chat");
  });

  it("generateMessages yields nothing and then throws", async () => {
    const gen = make().generateMessages({ messages: [], model: "x" } as never);
    await expect(gen.next()).rejects.toThrow("does not support chat");
  });
});

describe("CohereProvider.generateEmbedding request shape", () => {
  it("POSTs to /v2/embed with auth + json headers and the documented body", async () => {
    const fetchFn = okEmbed({ embeddings: { float: [[1, 2]] } });
    await make(fetchFn, { inputType: "search_query" }).generateEmbedding({
      text: ["a", "b"],
      model: "",
      dimensions: 256
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.cohere.com/v2/embed");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer k",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(init.body)).toEqual({
      model: "embed-v4.0", // default when model is falsy
      texts: ["a", "b"],
      input_type: "search_query",
      embedding_types: ["float"],
      output_dimension: 256
    });
  });

  it("omits output_dimension when dimensions is not given and honors an explicit model", async () => {
    const fetchFn = okEmbed({ embeddings: { float: [[1]] } });
    await make(fetchFn).generateEmbedding({ text: "hi", model: "embed-english-v3.0" });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect("output_dimension" in body).toBe(false);
    expect(body.model).toBe("embed-english-v3.0");
    expect(body.input_type).toBe("search_document"); // default
  });
});

describe("CohereProvider.generateEmbedding validation & responses", () => {
  it("rejects empty/blank/non-string input", async () => {
    const p = make(okEmbed({ embeddings: { float: [[1]] } }));
    await expect(p.generateEmbedding({ text: [], model: "m" })).rejects.toThrow(
      "text must not be empty"
    );
    await expect(p.generateEmbedding({ text: ["", "x"], model: "m" })).rejects.toThrow(
      "text must not be empty"
    );
    await expect(
      p.generateEmbedding({ text: [1 as unknown as string], model: "m" })
    ).rejects.toThrow("text must not be empty");
  });

  it("accepts a bare number[][] embeddings payload", async () => {
    const fetchFn = okEmbed({ embeddings: [[3, 4]] });
    expect(
      await make(fetchFn).generateEmbedding({ text: "x", model: "m" })
    ).toEqual([[3, 4]]);
  });

  it("parses the { float } embeddings payload", async () => {
    const fetchFn = okEmbed({ embeddings: { float: [[5, 6]] } });
    expect(
      await make(fetchFn).generateEmbedding({ text: "x", model: "m" })
    ).toEqual([[5, 6]]);
  });

  it("throws when float embeddings are missing", async () => {
    const fetchFn = okEmbed({ embeddings: { notfloat: 1 } });
    await expect(
      make(fetchFn).generateEmbedding({ text: "x", model: "m" })
    ).rejects.toThrow("missing float embeddings");
  });

  it("throws (not a TypeError) when the embeddings field is absent", async () => {
    // pins the optional chaining on data.embeddings?.float
    const fetchFn = okEmbed({});
    await expect(
      make(fetchFn).generateEmbedding({ text: "x", model: "m" })
    ).rejects.toThrow("missing float embeddings");
  });

  it("uses an empty error body when response.text() rejects", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error("stream broke");
      }
    });
    // anchored: the message must END at "500: " (empty body), not "500: undefined"
    await expect(
      make(fetchFn).generateEmbedding({ text: "x", model: "m" })
    ).rejects.toThrow(/Cohere embedding error 500: $/);
  });

  it("surfaces HTTP status and body on error", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited"
    });
    await expect(
      make(fetchFn).generateEmbedding({ text: "x", model: "m" })
    ).rejects.toThrow("Cohere embedding error 429: rate limited");
  });

  it("throws when the API key is missing", async () => {
    await expect(
      make(okEmbed({}), {}, "").generateEmbedding({ text: "x", model: "m" })
    ).rejects.toThrow("COHERE_API_KEY is not configured");
  });
});
