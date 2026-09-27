/**
 * Context window resolution: the provider's own Models API first, models.dev
 * keyed by provider route second, a logged fallback last.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../../src/providers/anthropic-provider.js";
import { BaseProvider } from "../../src/providers/base-provider.js";
import {
  CONTEXT_WINDOW_FALLBACK,
  MODELS_DEV_URL,
  modelsDevContextWindow,
  resetModelsDevCache,
  resolveContextWindow
} from "../../src/providers/context-window.js";

class StubProvider extends BaseProvider {
  constructor(
    id: string,
    private readonly window: number | null = null
  ) {
    super(id);
  }
  override async getContextWindow(): Promise<number | null> {
    return this.window;
  }
}

/** The same model with a different limit on each route, as models.dev lists it. */
const catalog = {
  anthropic: {
    models: { "claude-sonnet-4-5": { limit: { context: 200_000 } } }
  },
  openrouter: {
    models: {
      "anthropic/claude-sonnet-4.5": { limit: { context: 1_000_000 } }
    }
  },
  openai: {
    models: {
      "gpt-5": { limit: { context: 400_000, input: 272_000, output: 128_000 } }
    }
  }
};

function catalogFetch(body: unknown = catalog, ok = true) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status: ok ? 200 : 503 })
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

afterEach(() => {
  resetModelsDevCache();
});

describe("resolveContextWindow", () => {
  it("prefers the provider's own API over models.dev", async () => {
    const fetchFn = catalogFetch();
    const window = await resolveContextWindow(
      new StubProvider("anthropic", 1_000_000),
      "claude-sonnet-4-5",
      { fetchFn }
    );
    expect(window).toEqual({ tokens: 1_000_000, source: "provider" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("keys models.dev by provider route, not model alone", async () => {
    const fetchFn = catalogFetch();
    expect(
      await resolveContextWindow(
        new StubProvider("anthropic"),
        "claude-sonnet-4-5",
        { fetchFn }
      )
    ).toEqual({ tokens: 200_000, source: "models.dev" });
    expect(
      await resolveContextWindow(
        new StubProvider("openrouter"),
        "anthropic/claude-sonnet-4.5",
        { fetchFn }
      )
    ).toEqual({ tokens: 1_000_000, source: "models.dev" });
    // A model listed only under another route is not borrowed from it.
    expect(
      await resolveContextWindow(new StubProvider("groq"), "gpt-5", {
        fetchFn
      })
    ).toEqual({ tokens: CONTEXT_WINDOW_FALLBACK, source: "fallback" });
    // One catalog fetch serves every lookup.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe(MODELS_DEV_URL);
  });

  it("uses the input limit when a route lists one below the context", async () => {
    expect(
      await modelsDevContextWindow("openai", "gpt-5", catalogFetch())
    ).toBe(272_000);
  });

  it("falls back when models.dev is unreachable, and does not retry every turn", async () => {
    const fetchFn = catalogFetch({}, false);
    const provider = new StubProvider("openai");
    expect(await resolveContextWindow(provider, "gpt-5", { fetchFn })).toEqual({
      tokens: CONTEXT_WINDOW_FALLBACK,
      source: "fallback"
    });
    await resolveContextWindow(provider, "gpt-5", { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does not look up a provider models.dev has no route for", async () => {
    const fetchFn = catalogFetch();
    expect(
      await resolveContextWindow(new StubProvider("ollama"), "llama3", {
        fetchFn
      })
    ).toEqual({ tokens: CONTEXT_WINDOW_FALLBACK, source: "fallback" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("AnthropicProvider.getContextWindow", () => {
  it("reads max_input_tokens and sends the provider's betas", async () => {
    const retrieve = vi.fn(async () => ({ max_input_tokens: 1_000_000 }));
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      {
        client: { models: { retrieve } } as never,
        betas: ["context-1m-2025-08-07"]
      }
    );
    expect(await provider.getContextWindow("claude-sonnet-4-5")).toBe(
      1_000_000
    );
    expect(retrieve).toHaveBeenCalledWith(
      "claude-sonnet-4-5",
      null,
      expect.objectContaining({
        headers: { "anthropic-beta": "context-1m-2025-08-07" }
      })
    );
  });

  it("answers null when the Models API is not there", async () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      {
        client: {
          models: {
            retrieve: async () => {
              throw new Error("404 not found");
            }
          }
        } as never
      }
    );
    expect(await provider.getContextWindow("claude-sonnet-4-5")).toBeNull();
  });
});

describe("BaseProvider.lastCallTokens", () => {
  it("is the last call's input, cache included, plus its output", () => {
    const provider = new StubProvider("openai");
    expect(provider.lastCallTokens).toBeNull();
    provider.trackUsage("gpt-5", { inputTokens: 1_000, outputTokens: 50 });
    provider.trackUsage("gpt-5", {
      inputTokens: 5_000,
      cachedTokens: 4_000,
      outputTokens: 200
    });
    expect(provider.lastCallTokens).toBe(5_200);
    provider.resetCost();
    expect(provider.lastCallTokens).toBeNull();
  });
});
