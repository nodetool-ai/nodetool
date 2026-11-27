/**
 * Codex and Claude Code web search as SERP providers. Codex runs the
 * Responses `web_search` tool on a ChatGPT sign-in; Claude Code runs the
 * `claude` CLI's `WebSearch`. These tests pin the mapping from each runtime
 * call to results, with the runtime replaced by doubles.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SERP_PROVIDER_SECRETS,
  SERP_PROVIDER_SEARCH_TYPES,
  createSerpProvider,
  serpProviderConfigured
} from "../src/tools/serp-providers/index.js";
import {
  CodexSearchProvider,
  type CodexSearchClient
} from "../src/tools/serp-providers/codex-provider.js";
import {
  CLAUDE_SEARCH_MODEL,
  ClaudeSearchProvider,
  claudeSearchAvailable,
  resetClaudeSearchAvailability,
  type ClaudeSearchRunner
} from "../src/tools/serp-providers/claude-provider.js";
import { linksInAnswer } from "../src/tools/serp-providers/model-search.js";

afterEach(() => {
  resetClaudeSearchAvailability();
  vi.restoreAllMocks();
});

describe("CodexSearchProvider", () => {
  const client = (): CodexSearchClient & { webSearch: ReturnType<typeof vi.fn> } => ({
    webSearch: vi.fn(async () => ({
      text: "Rates held steady.",
      sources: [
        { title: "Statement", url: "https://fed.example/s" },
        { title: "Minutes", url: "https://fed.example/m" }
      ]
    }))
  });

  it("reads the ChatGPT sign-in and answers web searches only", async () => {
    expect(SERP_PROVIDER_SECRETS.codex).toEqual(["CODEX_ACCESS_TOKEN"]);
    expect(SERP_PROVIDER_SEARCH_TYPES.codex).toEqual(["web"]);
    expect(
      await serpProviderConfigured("codex", { getSecret: async () => null })
    ).toBe(false);
    expect(
      await serpProviderConfigured("codex", {
        getSecret: async (k) => (k === "CODEX_ACCESS_TOKEN" ? "t" : null)
      })
    ).toBe(true);
  });

  it("refuses to build without a sign-in and names where to sign in", async () => {
    await expect(
      createSerpProvider("codex", { getSecret: async () => null })
    ).rejects.toThrow(/ChatGPT sign-in.*Sign in to Codex/);
  });

  it("ranks the cited pages and passes the abort signal", async () => {
    const c = client();
    const provider = new CodexSearchProvider(c);
    const signal = new AbortController().signal;
    const answer = await provider.answer("rates", { signal });
    expect(c.webSearch).toHaveBeenCalledWith({ query: "rates", signal });
    expect(answer.text).toBe("Rates held steady.");
    expect(answer.citations).toEqual([
      { title: "Statement", url: "https://fed.example/s", snippet: "", position: 1 },
      { title: "Minutes", url: "https://fed.example/m", snippet: "", position: 2 }
    ]);
    expect(await provider.search("rates", { numResults: 1 })).toHaveLength(1);
  });
});

describe("ClaudeSearchProvider", () => {
  it("needs no secret and answers web searches only", () => {
    expect(SERP_PROVIDER_SECRETS.claude).toEqual([]);
    expect(SERP_PROVIDER_SEARCH_TYPES.claude).toEqual(["web"]);
  });

  it("runs the native search on the default model with a sources prompt", async () => {
    const runner = vi.fn<ClaudeSearchRunner>(async () => ({
      text: "Held.\n\n[Statement](https://fed.example/s)",
      sources: []
    }));
    const provider = new ClaudeSearchProvider({ runner });
    const answer = await provider.answer("rates");
    const call = runner.mock.calls[0][0];
    expect(call.model).toBe(CLAUDE_SEARCH_MODEL);
    expect(call.query).toBe("rates");
    expect(call.systemPrompt).toMatch(/WebSearch/);
    expect(call.systemPrompt).toMatch(/\[title\]\(url\)/);
    expect(answer.citations).toEqual([
      { title: "Statement", url: "https://fed.example/s", snippet: "", position: 1 }
    ]);
  });

  it("prefers structured citations over links in the prose", async () => {
    const provider = new ClaudeSearchProvider({
      runner: async () => ({
        text: "See https://other.example/x",
        sources: [{ title: "Cited", url: "https://fed.example/c" }]
      })
    });
    expect(await provider.search("rates")).toEqual([
      { title: "Cited", url: "https://fed.example/c", snippet: "", position: 1 }
    ]);
  });

  it("surfaces the CLI's failure instead of an empty result", async () => {
    const provider = new ClaudeSearchProvider({
      runner: async () => {
        throw new Error("The Claude Code CLI (claude) was not found");
      }
    });
    await expect(provider.search("rates")).rejects.toThrow(/not found/);
  });

  it("is unavailable when CLAUDE_CLI_PATH points at no executable", async () => {
    expect(await claudeSearchAvailable("/nonexistent/claude")).toBe(false);
  });

  it("builds without any secret", async () => {
    const provider = await createSerpProvider("claude", {
      getSecret: async () => null
    });
    expect(provider).toBeInstanceOf(ClaudeSearchProvider);
  });
});

describe("linksInAnswer", () => {
  it("reads Markdown links and bare URLs in order, once each", () => {
    expect(
      linksInAnswer(
        "First https://a.example/1. Then [B page](https://b.example/2) and " +
          "[B again](https://b.example/2)."
      )
    ).toEqual([
      { title: "https://a.example/1", url: "https://a.example/1", snippet: "", position: 1 },
      { title: "B page", url: "https://b.example/2", snippet: "", position: 2 }
    ]);
  });

  it("returns nothing for prose without links", () => {
    expect(linksInAnswer("No sources here.")).toEqual([]);
  });
});
