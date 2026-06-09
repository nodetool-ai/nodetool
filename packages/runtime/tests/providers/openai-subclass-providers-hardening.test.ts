/**
 * Mutation-hardening for the thin OpenAI-compatible provider subclasses.
 *
 * They share a shape: a default clientFactory pointing at the vendor baseURL,
 * and a getAvailableLanguageModels that fetches /models and filters rows to
 * non-empty string ids. These tests pin the default baseURL (by letting the
 * real factory run) and the row-filtering/empty-data branches. See
 * MUTATION_TESTING.md.
 */
import { describe, it, expect, vi } from "vitest";
import { CerebrasProvider } from "../../src/providers/cerebras-provider.js";
import { GroqProvider } from "../../src/providers/groq-provider.js";
import { XAIProvider } from "../../src/providers/xai-provider.js";
import { DeepSeekProvider } from "../../src/providers/deepseek-provider.js";

type AnyProvider = {
  getClient: () => { baseURL: string };
  getAvailableLanguageModels: () => Promise<Array<{ id: string }>>;
};

const fetchReturning = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => body });

const cases = [
  {
    name: "cerebras",
    baseURL: "https://api.cerebras.ai/v1",
    id: "cerebras",
    make: (opts?: object) =>
      new CerebrasProvider({ CEREBRAS_API_KEY: "k" }, opts as never)
  },
  {
    name: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    id: "groq",
    make: (opts?: object) =>
      new GroqProvider({ GROQ_API_KEY: "k" }, opts as never)
  },
  {
    name: "xai",
    baseURL: "https://api.x.ai/v1",
    id: "xai",
    make: (opts?: object) => new XAIProvider({ XAI_API_KEY: "k" }, opts as never)
  },
  {
    name: "deepseek",
    baseURL: "https://api.deepseek.com/v1",
    id: "deepseek",
    make: (opts?: object) =>
      new DeepSeekProvider({ DEEPSEEK_API_KEY: "k" }, opts as never)
  }
];

for (const c of cases) {
  describe(`${c.name}-provider hardening`, () => {
    it("builds a client at the vendor base URL by default", () => {
      const p = c.make() as unknown as AnyProvider;
      expect(p.getClient().baseURL).toBe(c.baseURL);
    });

    it("keeps only rows with a non-empty string id", async () => {
      const fetchFn = fetchReturning({
        data: [
          { id: "good", name: "Good" },
          { id: "" }, // empty id → dropped
          { name: "no-id" }, // missing id → dropped
          { id: 123 } // non-string id → dropped
        ]
      });
      const p = c.make({
        client: {},
        fetchFn
      }) as unknown as AnyProvider;
      const models = await p.getAvailableLanguageModels();
      expect(models.map((m) => m.id)).toEqual(["good"]);
    });

    it("returns [] when the payload has no data array", async () => {
      const fetchFn = fetchReturning({});
      const p = c.make({
        client: {},
        fetchFn
      }) as unknown as AnyProvider;
      expect(await p.getAvailableLanguageModels()).toEqual([]);
    });
  });
}
