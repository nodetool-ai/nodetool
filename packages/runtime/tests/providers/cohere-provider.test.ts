import { describe, it, expect, vi } from "vitest";
import { CohereProvider } from "../../src/providers/cohere-provider.js";
import { providerCapabilities } from "../../src/providers/base-provider.js";

const mockOk = (json: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => json,
    text: async () => JSON.stringify(json)
  } as unknown as Response);

const mockErr = (status: number, body = "boom") =>
  ({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body
  } as unknown as Response);

describe("CohereProvider", () => {
  it("reports provider id as cohere", () => {
    const p = new CohereProvider({ COHERE_API_KEY: "k" });
    expect(p.provider).toBe("cohere");
  });

  it("declares COHERE_API_KEY as required secret", () => {
    expect(CohereProvider.requiredSecrets()).toEqual(["COHERE_API_KEY"]);
  });

  it("returns container env mapping", () => {
    const p = new CohereProvider({ COHERE_API_KEY: "abc" });
    expect(p.getContainerEnv()).toEqual({ COHERE_API_KEY: "abc" });
  });

  it("advertises generate_embedding capability and not chat", () => {
    const p = new CohereProvider({ COHERE_API_KEY: "k" });
    const caps = providerCapabilities(p);
    expect(caps).toContain("generate_embedding");
  });

  it("returns the curated embedding model list", async () => {
    const p = new CohereProvider({ COHERE_API_KEY: "k" });
    const models = await p.getAvailableEmbeddingModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === "cohere")).toBe(true);
    expect(models.map((m) => m.id)).toContain("embed-v4.0");
  });

  it("rejects chat generation", async () => {
    const p = new CohereProvider({ COHERE_API_KEY: "k" });
    await expect(
      p.generateMessage({ messages: [], model: "irrelevant" })
    ).rejects.toThrow(/does not support chat/);
  });

  it("posts to /v2/embed and parses float embeddings", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockOk({
        embeddings: { float: [[0.1, 0.2], [0.3, 0.4]] }
      })
    );
    const p = new CohereProvider(
      { COHERE_API_KEY: "k" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    const out = await p.generateEmbedding({
      text: ["hi", "yo"],
      model: "embed-v4.0"
    });
    expect(out).toEqual([
      [0.1, 0.2],
      [0.3, 0.4]
    ]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.cohere.com/v2/embed");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer k"
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      model: "embed-v4.0",
      texts: ["hi", "yo"],
      input_type: "search_document",
      embedding_types: ["float"]
    });
  });

  it("forwards output_dimension when dimensions is provided", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockOk({ embeddings: { float: [[0.1]] } })
    );
    const p = new CohereProvider(
      { COHERE_API_KEY: "k" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await p.generateEmbedding({
      text: "hi",
      model: "embed-v4.0",
      dimensions: 256
    });
    const body = JSON.parse(
      (fetchFn.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.output_dimension).toBe(256);
  });

  it("throws on empty input", async () => {
    const p = new CohereProvider({ COHERE_API_KEY: "k" });
    await expect(
      p.generateEmbedding({ text: [], model: "embed-v4.0" })
    ).rejects.toThrow(/text must not be empty/);
    await expect(
      p.generateEmbedding({ text: [""], model: "embed-v4.0" })
    ).rejects.toThrow(/text must not be empty/);
  });

  it("surfaces HTTP errors from Cohere", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockErr(429, "rate limit"));
    const p = new CohereProvider(
      { COHERE_API_KEY: "k" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await expect(
      p.generateEmbedding({ text: "hi", model: "embed-v4.0" })
    ).rejects.toThrow(/Cohere embedding error 429/);
  });

  it("throws when the API key is missing at call time", async () => {
    const p = new CohereProvider({});
    await expect(
      p.generateEmbedding({ text: "hi", model: "embed-v4.0" })
    ).rejects.toThrow(/COHERE_API_KEY is not configured/);
  });
});
