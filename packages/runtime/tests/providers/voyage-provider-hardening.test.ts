/**
 * Mutation-hardening for VoyageProvider: model list, embed request shape (URL,
 * headers, model default, input_type, output_dimension), text validation, the
 * index-sorted response mapping, error body, and chat-unsupported generators.
 * See MUTATION_TESTING.md.
 */
import { describe, it, expect, vi } from "vitest";
import {
  VoyageProvider,
  sortEmbeddingsByIndex
} from "../../src/providers/voyage-provider.js";

const make = (fetchFn?: unknown, opts: object = {}, key = "k") =>
  new VoyageProvider({ VOYAGE_API_KEY: key }, { fetchFn: fetchFn as never, ...(opts as never) });
const ok = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => body });
const bodyOf = (fetchFn: ReturnType<typeof vi.fn>) =>
  JSON.parse(fetchFn.mock.calls[0][1].body);

describe("VoyageProvider model list", () => {
  it("returns the exact curated list", async () => {
    const models = await make().getAvailableEmbeddingModels();
    expect(models.map((m) => m.id)).toEqual([
      "voyage-3-large",
      "voyage-3.5",
      "voyage-3.5-lite",
      "voyage-code-3",
      "voyage-finance-2",
      "voyage-law-2",
      "voyage-multilingual-2"
    ]);
    for (const m of models) {
      expect(m.provider).toBe("voyage");
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.dimensions).toBeGreaterThan(0);
    }
  });
});

describe("VoyageProvider chat unsupported", () => {
  it("generateMessage rejects", async () => {
    await expect(make().generateMessage({ messages: [], model: "x" } as never)).rejects.toThrow(
      "does not support chat"
    );
  });
  it("generateMessages yields nothing then throws", async () => {
    await expect(
      make().generateMessages({ messages: [], model: "x" } as never).next()
    ).rejects.toThrow("does not support chat");
  });
});

describe("VoyageProvider.generateEmbedding", () => {
  it("POSTs the documented request with default model + input_type", async () => {
    const fetchFn = ok({ data: [{ embedding: [1], index: 0 }] });
    await make(fetchFn).generateEmbedding({ text: ["a"], model: "", dimensions: 512 });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.voyageai.com/v1/embeddings");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer k", "Content-Type": "application/json" });
    expect(bodyOf(fetchFn)).toEqual({
      model: "voyage-3.5",
      input: ["a"],
      input_type: "document", // default
      output_dimension: 512
    });
  });

  it("honors an explicit model and input_type option", async () => {
    const fetchFn = ok({ data: [{ embedding: [1] }] });
    await make(fetchFn, { inputType: "query" }).generateEmbedding({
      text: "x",
      model: "voyage-code-3"
    });
    const body = bodyOf(fetchFn);
    expect(body.model).toBe("voyage-code-3");
    expect(body.input_type).toBe("query");
  });

  it("omits input_type when null and output_dimension when absent", async () => {
    const fetchFn = ok({ data: [{ embedding: [1] }] });
    await make(fetchFn, { inputType: "" }).generateEmbedding({ text: "x", model: "m" });
    const body = bodyOf(fetchFn);
    expect("input_type" in body).toBe(false);
    expect("output_dimension" in body).toBe(false);
  });

  it("rejects empty/blank/non-string input", async () => {
    const p = make(ok({ data: [] }));
    await expect(p.generateEmbedding({ text: [], model: "m" })).rejects.toThrow("text must not be empty");
    await expect(p.generateEmbedding({ text: ["", "x"], model: "m" })).rejects.toThrow("text must not be empty");
    await expect(
      p.generateEmbedding({ text: [3 as unknown as string], model: "m" })
    ).rejects.toThrow("text must not be empty");
  });

  it("returns embeddings ordered by index", async () => {
    const fetchFn = ok({
      data: [
        { embedding: [9], index: 1 },
        { embedding: [1], index: 0 }
      ]
    });
    expect(await make(fetchFn).generateEmbedding({ text: ["a", "b"], model: "m" })).toEqual([
      [1],
      [9]
    ]);
  });

  it("returns [] when the response has no data", async () => {
    expect(await make(ok({})).generateEmbedding({ text: "x", model: "m" })).toEqual([]);
  });

  it("sortEmbeddingsByIndex orders by index (default 0) and projects", () => {
    expect(
      sortEmbeddingsByIndex([
        { embedding: [9], index: 2 },
        { embedding: [5] }, // no index → 0, sorts first
        { embedding: [7], index: 1 }
      ])
    ).toEqual([[5], [7], [9]]);
  });

  it("surfaces HTTP errors, with an empty body when text() rejects", async () => {
    const errFetch = vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => "down" });
    await expect(make(errFetch).generateEmbedding({ text: "x", model: "m" })).rejects.toThrow(
      "Voyage embedding error 502: down"
    );
    const throwFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => {
        throw new Error("boom");
      }
    });
    await expect(make(throwFetch).generateEmbedding({ text: "x", model: "m" })).rejects.toThrow(
      /Voyage embedding error 502: $/
    );
  });

  it("throws when the API key is missing", async () => {
    await expect(
      make(ok({}), {}, "").generateEmbedding({ text: "x", model: "m" })
    ).rejects.toThrow("VOYAGE_API_KEY is not configured");
  });
});
