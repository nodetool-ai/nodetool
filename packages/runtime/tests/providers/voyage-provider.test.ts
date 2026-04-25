import { describe, it, expect, vi } from "vitest";
import { VoyageProvider } from "../../src/providers/voyage-provider.js";
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

describe("VoyageProvider", () => {
  it("reports provider id as voyage", () => {
    const p = new VoyageProvider({ VOYAGE_API_KEY: "k" });
    expect(p.provider).toBe("voyage");
  });

  it("declares VOYAGE_API_KEY as required secret", () => {
    expect(VoyageProvider.requiredSecrets()).toEqual(["VOYAGE_API_KEY"]);
  });

  it("returns container env mapping", () => {
    const p = new VoyageProvider({ VOYAGE_API_KEY: "abc" });
    expect(p.getContainerEnv()).toEqual({ VOYAGE_API_KEY: "abc" });
  });

  it("advertises generate_embedding capability", () => {
    const p = new VoyageProvider({ VOYAGE_API_KEY: "k" });
    expect(providerCapabilities(p)).toContain("generate_embedding");
  });

  it("returns the curated embedding model list", async () => {
    const p = new VoyageProvider({ VOYAGE_API_KEY: "k" });
    const models = await p.getAvailableEmbeddingModels();
    expect(models.map((m) => m.id)).toEqual(
      expect.arrayContaining([
        "voyage-3-large",
        "voyage-3.5",
        "voyage-code-3",
        "voyage-multilingual-2"
      ])
    );
    expect(models.every((m) => m.provider === "voyage")).toBe(true);
  });

  it("rejects chat generation", async () => {
    const p = new VoyageProvider({ VOYAGE_API_KEY: "k" });
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
    const p = new VoyageProvider(
      { VOYAGE_API_KEY: "k" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    const out = await p.generateEmbedding({
      text: ["a", "b"],
      model: "voyage-3.5"
    });
    expect(out).toEqual([
      [0.1, 0.2],
      [0.3, 0.4]
    ]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.voyageai.com/v1/embeddings");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      model: "voyage-3.5",
      input: ["a", "b"],
      input_type: "document"
    });
  });

  it("uses default model voyage-3.5 when model is empty", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockOk({ data: [{ embedding: [0.1], index: 0 }] })
    );
    const p = new VoyageProvider(
      { VOYAGE_API_KEY: "k" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await p.generateEmbedding({ text: "hi", model: "" });
    const body = JSON.parse(
      (fetchFn.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.model).toBe("voyage-3.5");
  });

  it("respects a query input_type override", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockOk({ data: [{ embedding: [0.1], index: 0 }] })
    );
    const p = new VoyageProvider(
      { VOYAGE_API_KEY: "k" },
      {
        fetchFn: fetchFn as unknown as typeof fetch,
        inputType: "query"
      }
    );
    await p.generateEmbedding({ text: "hello", model: "voyage-3.5" });
    const body = JSON.parse(
      (fetchFn.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.input_type).toBe("query");
  });

  it("throws on empty input", async () => {
    const p = new VoyageProvider({ VOYAGE_API_KEY: "k" });
    await expect(
      p.generateEmbedding({ text: [], model: "voyage-3.5" })
    ).rejects.toThrow(/text must not be empty/);
  });

  it("surfaces HTTP errors", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockErr(401, "auth"));
    const p = new VoyageProvider(
      { VOYAGE_API_KEY: "k" },
      { fetchFn: fetchFn as unknown as typeof fetch }
    );
    await expect(
      p.generateEmbedding({ text: "hi", model: "voyage-3.5" })
    ).rejects.toThrow(/Voyage embedding error 401/);
  });

  it("throws when the API key is missing at call time", async () => {
    const p = new VoyageProvider({});
    await expect(
      p.generateEmbedding({ text: "hi", model: "voyage-3.5" })
    ).rejects.toThrow(/VOYAGE_API_KEY is not configured/);
  });
});
