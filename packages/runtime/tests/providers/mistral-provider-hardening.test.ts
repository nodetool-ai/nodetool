/**
 * Mutation-hardening for MistralProvider: default client baseURL, model-list
 * row filtering, and the embedding text-validation guard. See MUTATION_TESTING.md.
 */
import { describe, it, expect, vi } from "vitest";
import { MistralProvider } from "../../src/providers/mistral-provider.js";

const make = (opts?: object) =>
  new MistralProvider({ MISTRAL_API_KEY: "k" }, opts as never);

describe("MistralProvider hardening", () => {
  it("builds a client at the Mistral base URL by default", () => {
    expect(make().getClient().baseURL).toBe("https://api.mistral.ai/v1");
  });

  it("keeps only rows with a non-empty string id, name falling back to id", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "m1", name: "M1" },
          { id: "m2" }, // no name → name = id
          { id: "" }, // dropped
          { name: "no-id" } // dropped
        ]
      })
    });
    const models = await (
      make({ client: {}, fetchFn }) as unknown as {
        getAvailableLanguageModels: () => Promise<Array<{ id: string; name: string }>>;
      }
    ).getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "m1", name: "M1", provider: "mistral" },
      { id: "m2", name: "m2", provider: "mistral" }
    ]);
  });

  it("rejects empty embedding input without ever calling the client", async () => {
    const create = vi.fn().mockResolvedValue({ data: [] });
    const p = make({ client: { embeddings: { create } } }) as unknown as {
      generateEmbedding: (a: { text: string | string[]; model: string }) => Promise<unknown>;
    };
    await expect(p.generateEmbedding({ text: [], model: "m" })).rejects.toThrow(
      "text must not be empty"
    );
    await expect(
      p.generateEmbedding({ text: ["", ""], model: "m" })
    ).rejects.toThrow("text must not be empty");
    // the guard short-circuits before the client is touched
    expect(create).not.toHaveBeenCalled();
  });

  it("short-circuits empty input before touching the client", async () => {
    const create = vi.fn().mockResolvedValue({ data: [] });
    const p = make({ client: { embeddings: { create } } }) as unknown as {
      generateEmbedding: (a: { text: string[]; model: string }) => Promise<unknown>;
    };
    // swallow the rejection so this test itself resolves (the assertion is on
    // the side effect: the client is never reached for empty input)
    await p.generateEmbedding({ text: [], model: "m" }).catch(() => undefined);
    await p.generateEmbedding({ text: ["", ""], model: "m" }).catch(() => undefined);
    expect(create).not.toHaveBeenCalled();
  });

  it("accepts a mixed array where at least one entry is non-blank", async () => {
    // pins `every` (not `some`): ["", "x"] has a real entry, so it must NOT throw.
    const create = vi.fn().mockResolvedValue({ data: [{ embedding: [1] }] });
    const p = make({ client: { embeddings: { create } } }) as unknown as {
      generateEmbedding: (a: { text: string[]; model: string }) => Promise<number[][]>;
    };
    await expect(
      p.generateEmbedding({ text: ["", "x"], model: "m" })
    ).resolves.toEqual([[1]]);
  });

  it("embeds non-empty input via the client, defaulting the model", async () => {
    const create = vi.fn().mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }]
    });
    const p = make({
      client: { embeddings: { create } }
    }) as unknown as {
      generateEmbedding: (a: {
        text: string | string[];
        model: string;
      }) => Promise<number[][]>;
    };
    const out = await p.generateEmbedding({ text: "hello", model: "" });
    expect(out).toEqual([[0.1, 0.2]]);
    expect(create).toHaveBeenCalledWith({ model: "mistral-embed", input: ["hello"] });
  });
});
