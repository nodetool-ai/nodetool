import { describe, it, expect, vi } from "vitest";
import { JinaProvider } from "../../src/providers/jina-provider.js";
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

describe("JinaProvider", () => {
  it("reports provider id as jina", () => {
    const p = new JinaProvider({ JINA_API_KEY: "k" });
    expect(p.provider).toBe("jina");
  });

  it("declares JINA_API_KEY as required secret", () => {
    expect(JinaProvider.requiredSecrets()).toEqual(["JINA_API_KEY"]);
  });

  it("returns container env mapping", () => {
    const p = new JinaProvider({ JINA_API_KEY: "abc" });
    expect(p.getContainerEnv()).toEqual({ JINA_API_KEY: "abc" });
  });

  it("advertises generate_embedding capability", () => {
    const p = new JinaProvider({ JINA_API_KEY: "k" });
    expect(providerCapabilities(p)).toContain("generate_embedding");
  });

  it("returns the curated embedding model list", async () => {
    const p = new JinaProvider({ JINA_API_KEY: "k" });
    const models = await p.getAvailableEmbeddingModels();
    expect(models.map((m) => m.id)).toEqual(
      expect.arrayContaining([
        "jina-embeddings-v3",
        "jina-clip-v2",
        "jina-embeddings-v2-base-en"
      ])
    );
    expect(models.every((m) => m.provider === "jina")).toBe(true);
  });

  it("rejects chat generation", async () => {
    const p = new JinaProvider({ JINA_API_KEY: "k" });
    await expect(
      p.generateMessage({ messages: [], model: "irrelevant" })
    ).rejects.toThrow(/does not support chat/);
  });

  it("posts to /v1/embeddings and orders results by index", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockOk({
        data: [
          { embedding: [0.3, 0.4], index: 1 },
          { embedding: [0.1, 0.2], index: 0 }
        ]
      })
    );
    const p = new JinaProvider(
      { JINA_API_KEY: "k" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    const out = await p.generateEmbedding({
      text: ["alpha", "beta"],
      model: "jina-embeddings-v3"
    });
    expect(out).toEqual([
      [0.1, 0.2],
      [0.3, 0.4]
    ]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.jina.ai/v1/embeddings");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      model: "jina-embeddings-v3",
      input: ["alpha", "beta"],
      task: "retrieval.passage"
    });
  });

  it("omits the task field for non-v3 models", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockOk({ data: [{ embedding: [0.1], index: 0 }] })
    );
    const p = new JinaProvider(
      { JINA_API_KEY: "k" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await p.generateEmbedding({
      text: "hi",
      model: "jina-embeddings-v2-base-en"
    });
    const body = JSON.parse(
      (fetchFn.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.task).toBeUndefined();
  });

  it("forwards dimensions when provided", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockOk({ data: [{ embedding: [0.1], index: 0 }] })
    );
    const p = new JinaProvider(
      { JINA_API_KEY: "k" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await p.generateEmbedding({
      text: "hi",
      model: "jina-embeddings-v3",
      dimensions: 512
    });
    const body = JSON.parse(
      (fetchFn.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.dimensions).toBe(512);
  });

  it("throws on empty input", async () => {
    const p = new JinaProvider({ JINA_API_KEY: "k" });
    await expect(
      p.generateEmbedding({ text: [], model: "jina-embeddings-v3" })
    ).rejects.toThrow(/text must not be empty/);
  });

  it("surfaces HTTP errors", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockErr(500, "boom"));
    const p = new JinaProvider(
      { JINA_API_KEY: "k" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await expect(
      p.generateEmbedding({ text: "hi", model: "jina-embeddings-v3" })
    ).rejects.toThrow(/Jina embedding error 500/);
  });

  it("throws when the API key is missing at call time", async () => {
    const p = new JinaProvider({});
    await expect(
      p.generateEmbedding({ text: "hi", model: "jina-embeddings-v3" })
    ).rejects.toThrow(/JINA_API_KEY is not configured/);
  });
});
