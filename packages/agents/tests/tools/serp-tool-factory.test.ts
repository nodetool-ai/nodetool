/**
 * Tests for SERP tool factory.
 *
 * Verifies:
 *  - createSearchTool creates GoogleSearchTool with resolved provider
 *  - getConfiguredSerpProvider reads SERP_PROVIDER setting
 *  - resolveSerpProvider instantiates correct provider based on setting
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  createSearchTool,
  getConfiguredSerpProvider,
  resolveSerpProvider
} from "../../src/tools/serp-tool-factory.js";

function makeContext(secrets: Record<string, string> = {}): ProcessingContext {
  return {
    getSecret: vi.fn(async (key: string) => secrets[key] ?? null)
  } as unknown as ProcessingContext;
}

describe("SERP tool factory", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Clear env vars
    delete process.env.SERP_PROVIDER;
    delete process.env.SERPAPI_API_KEY;
    delete process.env.DATA_FOR_SEO_LOGIN;
    delete process.env.DATA_FOR_SEO_PASSWORD;
    delete process.env.BRAVE_API_KEY;
    delete process.env.APIFY_API_KEY;
  });

  describe("getConfiguredSerpProvider", () => {
    it("returns provider from context secret", async () => {
      const ctx = makeContext({ SERP_PROVIDER: "brave" });
      const result = await getConfiguredSerpProvider(ctx);
      expect(result).toBe("brave");
    });

    it("falls back to env var", async () => {
      process.env.SERP_PROVIDER = "dataforseo";
      const ctx = makeContext();
      const result = await getConfiguredSerpProvider(ctx);
      expect(result).toBe("dataforseo");
    });

    it("defaults to serpapi when not set", async () => {
      const ctx = makeContext();
      const result = await getConfiguredSerpProvider(ctx);
      expect(result).toBe("serpapi");
    });

    it("prefers context secret over env var", async () => {
      process.env.SERP_PROVIDER = "apify";
      const ctx = makeContext({ SERP_PROVIDER: "brave" });
      const result = await getConfiguredSerpProvider(ctx);
      expect(result).toBe("brave");
    });
  });

  describe("resolveSerpProvider", () => {
    it("resolves SerpApiProvider when SERP_PROVIDER is serpapi", async () => {
      const ctx = makeContext({
        SERP_PROVIDER: "serpapi",
        SERPAPI_API_KEY: "key123"
      });
      const provider = await resolveSerpProvider(ctx);
      expect(provider.constructor.name).toBe("SerpApiProvider");
    });

    it("resolves DataForSeoProvider when SERP_PROVIDER is dataforseo", async () => {
      const ctx = makeContext({
        SERP_PROVIDER: "dataforseo",
        DATA_FOR_SEO_LOGIN: "login",
        DATA_FOR_SEO_PASSWORD: "pass"
      });
      const provider = await resolveSerpProvider(ctx);
      expect(provider.constructor.name).toBe("DataForSeoProvider");
    });

    it("resolves BraveProvider when SERP_PROVIDER is brave", async () => {
      const ctx = makeContext({
        SERP_PROVIDER: "brave",
        BRAVE_API_KEY: "key123"
      });
      const provider = await resolveSerpProvider(ctx);
      expect(provider.constructor.name).toBe("BraveProvider");
    });

    it("resolves ApifyProvider when SERP_PROVIDER is apify", async () => {
      const ctx = makeContext({
        SERP_PROVIDER: "apify",
        APIFY_API_KEY: "key123"
      });
      const provider = await resolveSerpProvider(ctx);
      expect(provider.constructor.name).toBe("ApifyProvider");
    });

    it("throws when credentials are missing for selected provider", async () => {
      const ctx = makeContext({ SERP_PROVIDER: "brave" }); // No BRAVE_API_KEY
      await expect(resolveSerpProvider(ctx)).rejects.toThrow(
        "BRAVE_API_KEY is required"
      );
    });

    it("defaults to SerpAPI when SERP_PROVIDER not set", async () => {
      const ctx = makeContext({ SERPAPI_API_KEY: "key123" });
      const provider = await resolveSerpProvider(ctx);
      expect(provider.constructor.name).toBe("SerpApiProvider");
    });
  });

  describe("createSearchTool", () => {
    it("creates GoogleSearchTool with resolved provider", async () => {
      const ctx = makeContext({
        SERP_PROVIDER: "brave",
        BRAVE_API_KEY: "key123"
      });
      const tool = await createSearchTool(ctx);
      expect(tool.name).toBe("google_search");
      expect(tool.constructor.name).toBe("GoogleSearchTool");
    });

    it("uses default SerpAPI when provider not set", async () => {
      const ctx = makeContext({ SERPAPI_API_KEY: "key123" });
      const tool = await createSearchTool(ctx);
      expect(tool.name).toBe("google_search");
    });

    it("throws when required credentials missing", async () => {
      const ctx = makeContext({ SERP_PROVIDER: "apify" }); // No APIFY_API_KEY
      await expect(createSearchTool(ctx)).rejects.toThrow(
        "APIFY_API_KEY is required"
      );
    });
  });
});
