import { describe, it, expect, vi } from "vitest";
import { MoonshotProvider } from "../../src/providers/moonshot-provider.js";
import type { Message } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  chatSSEResponse,
  mockChatFetch
} from "./helpers/compat-fetch.js";

describe("MoonshotProvider", () => {
  it("reports required secrets and container env", () => {
    const provider = new MoonshotProvider({ KIMI_API_KEY: "k" });

    expect(MoonshotProvider.requiredSecrets()).toEqual(["KIMI_API_KEY"]);
    expect(provider.getContainerEnv()).toEqual({ KIMI_API_KEY: "k" });
    expect(provider.provider).toBe("moonshot");
  });

  it("does not claim native web search (#21)", () => {
    // Moonshot's $web_search builtin exists only as an OpenAI builtin_function
    // (and is flagged unstable upstream); it is not wired here, so web search
    // must fall back to the SerpAPI WebSearchTool.
    const provider = new MoonshotProvider({ KIMI_API_KEY: "k" });
    expect(provider.supportsNativeWebSearch).toBe(false);
  });

  it("throws when KIMI_API_KEY is missing", () => {
    expect(() => new MoonshotProvider({})).toThrow(
      "KIMI_API_KEY is not configured"
    );
  });

  it("reports tool support for kimi models", async () => {
    const provider = new MoonshotProvider({ KIMI_API_KEY: "k" });
    expect(await provider.hasToolSupport("kimi-k2.5")).toBe(true);
  });

  it("fetches available language models from the Moonshot endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "kimi-k2.5" }, { id: "kimi-k2-turbo-preview" }]
      })
    });

    const provider = new MoonshotProvider(
      { KIMI_API_KEY: "k" },
      { fetchFn: mockFetch as unknown as typeof fetch }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "kimi-k2.5", name: "kimi-k2.5", provider: "moonshot" },
      {
        id: "kimi-k2-turbo-preview",
        name: "kimi-k2-turbo-preview",
        provider: "moonshot"
      }
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.moonshot.ai/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" }
      })
    );
  });

  it("returns empty list when model fetch fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const provider = new MoonshotProvider(
      { KIMI_API_KEY: "k" },
      { fetchFn: mockFetch as unknown as typeof fetch }
    );

    expect(await provider.getAvailableLanguageModels()).toEqual([]);
  });

  it("generates non-streaming message via the compat chat client", async () => {
    const fetchMock = mockChatFetch(
      chatJsonResponse({
        choices: [
          {
            message: {
              content: "hello from kimi",
              tool_calls: null
            }
          }
        ]
      })
    );

    const provider = new MoonshotProvider(
      { KIMI_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    const result = await provider.generateMessage({
      messages,
      model: "kimi-k2.5"
    });

    expect(result.role).toBe("assistant");
    expect(result.content).toBe("hello from kimi");
  });

  it("streams messages via the compat chat client", async () => {
    const chunks = [
      { choices: [{ delta: { content: "hello" }, finish_reason: null }] },
      { choices: [{ delta: { content: "" }, finish_reason: "stop" }] }
    ];

    const fetchMock = mockChatFetch(() => chatSSEResponse(chunks));

    const provider = new MoonshotProvider(
      { KIMI_API_KEY: "k" },
      { fetchFn: fetchMock as unknown as typeof fetch }
    );

    const messages: Message[] = [{ role: "user", content: "hi" }];
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages,
      model: "kimi-k2.5"
    })) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
