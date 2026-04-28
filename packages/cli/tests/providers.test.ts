/**
 * Tests for src/providers.ts
 * Provider factory: availableProviders, DEFAULT_MODELS, KNOWN_PROVIDERS, createProvider, WebSocketProvider.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@nodetool/models", () => ({
  getSecret: vi.fn(async (key: string) => process.env[key] ?? null)
}));

vi.mock("@nodetool/runtime", () => {
  class FakeProvider {
    constructor(public readonly id: string) {}
    async generateMessage() {
      return { role: "assistant", content: "" };
    }
    async *generateMessages() {
      yield { type: "chunk", content: "hello" };
    }
  }

  return {
    AnthropicProvider: class extends FakeProvider {
      constructor(cfg: Record<string, unknown>) {
        super("anthropic");
        void cfg;
      }
    },
    OpenAIProvider: class extends FakeProvider {
      constructor(cfg: Record<string, unknown>) {
        super("openai");
        void cfg;
      }
    },
    OllamaProvider: class extends FakeProvider {
      constructor(cfg: Record<string, unknown>) {
        super("ollama");
        void cfg;
      }
    },
    GeminiProvider: class extends FakeProvider {
      constructor(cfg: Record<string, unknown>) {
        super("gemini");
        void cfg;
      }
    },
    MistralProvider: class extends FakeProvider {
      constructor(cfg: Record<string, unknown>) {
        super("mistral");
        void cfg;
      }
    },
    GroqProvider: class extends FakeProvider {
      constructor(cfg: Record<string, unknown>) {
        super("groq");
        void cfg;
      }
    },
    MoonshotProvider: class extends FakeProvider {
      constructor(cfg: Record<string, unknown>) {
        super("moonshot");
        void cfg;
      }
    },
    BaseProvider: FakeProvider
  };
});

// ─── availableProviders ───────────────────────────────────────────────────────

describe("availableProviders", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("returns only ollama when no API keys are set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("MISTRAL_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("KIMI_API_KEY", "");
    const { availableProviders } = await import("../src/providers.js");
    expect(availableProviders()).toEqual(["lmstudio", "ollama"]);
  });

  it("includes anthropic when ANTHROPIC_API_KEY is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("MISTRAL_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("KIMI_API_KEY", "");
    const { availableProviders } = await import("../src/providers.js");
    const providers = availableProviders();
    expect(providers).toContain("anthropic");
    expect(providers).toContain("ollama");
  });

  it("includes openai when OPENAI_API_KEY is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("MISTRAL_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("KIMI_API_KEY", "");
    const { availableProviders } = await import("../src/providers.js");
    const providers = availableProviders();
    expect(providers).toContain("openai");
  });

  it("includes all providers when all keys are set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    vi.stubEnv("OPENAI_API_KEY", "b");
    vi.stubEnv("GEMINI_API_KEY", "c");
    vi.stubEnv("MISTRAL_API_KEY", "d");
    vi.stubEnv("GROQ_API_KEY", "e");
    vi.stubEnv("KIMI_API_KEY", "f");
    const { availableProviders } = await import("../src/providers.js");
    const providers = availableProviders();
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
    expect(providers).toContain("gemini");
    expect(providers).toContain("mistral");
    expect(providers).toContain("groq");
    expect(providers).toContain("moonshot");
    expect(providers).toContain("ollama");
  });

  it("ollama is always last in the list", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    vi.stubEnv("OPENAI_API_KEY", "b");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("MISTRAL_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("KIMI_API_KEY", "");
    const { availableProviders } = await import("../src/providers.js");
    const providers = availableProviders();
    expect(providers[providers.length - 1]).toBe("ollama");
  });

  it("always includes ollama and any configured env-backed providers", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    vi.stubEnv("MISTRAL_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("KIMI_API_KEY", "");
    const { availableProviders } = await import("../src/providers.js");
    expect(availableProviders()).toEqual(["anthropic", "gemini", "lmstudio", "ollama"]);
  });
});

// ─── KNOWN_PROVIDERS ──────────────────────────────────────────────────────────

describe("KNOWN_PROVIDERS", () => {
  it("includes all expected provider names", async () => {
    vi.resetModules();
    const { KNOWN_PROVIDERS } = await import("../src/providers.js");
    const expected = [
      "anthropic",
      "openai",
      "ollama",
      "gemini",
      "mistral",
      "groq",
      "moonshot"
    ];
    for (const p of expected) {
      expect(KNOWN_PROVIDERS).toContain(p);
    }
  });
});

// ─── DEFAULT_MODELS ───────────────────────────────────────────────────────────

describe("DEFAULT_MODELS", () => {
  it("maps each known provider to a model string", async () => {
    vi.resetModules();
    const { DEFAULT_MODELS, KNOWN_PROVIDERS } =
      await import("../src/providers.js");
    for (const p of KNOWN_PROVIDERS) {
      expect(typeof DEFAULT_MODELS[p]).toBe("string");
      expect(DEFAULT_MODELS[p]!.length).toBeGreaterThan(0);
    }
  });

  it("uses gpt-4o for openai", async () => {
    vi.resetModules();
    const { DEFAULT_MODELS } = await import("../src/providers.js");
    expect(DEFAULT_MODELS["openai"]).toBe("gpt-5.4");
  });

  it("uses a claude model for anthropic", async () => {
    vi.resetModules();
    const { DEFAULT_MODELS } = await import("../src/providers.js");
    expect(DEFAULT_MODELS["anthropic"]).toMatch(/claude/);
  });
});

// ─── createProvider ───────────────────────────────────────────────────────────

describe("createProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("creates an AnthropicProvider for 'anthropic'", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
    const { createProvider } = await import("../src/providers.js");
    const provider = await createProvider("anthropic");
    // The fake provider sets id in constructor
    expect((provider as unknown as { id: string }).id).toBe("anthropic");
  });

  it("creates an OpenAIProvider for 'openai'", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai");
    const { createProvider } = await import("../src/providers.js");
    const provider = await createProvider("openai");
    expect((provider as unknown as { id: string }).id).toBe("openai");
  });

  it("creates an OllamaProvider for 'ollama'", async () => {
    const { createProvider } = await import("../src/providers.js");
    const provider = await createProvider("ollama");
    expect((provider as unknown as { id: string }).id).toBe("ollama");
  });

  it("creates a GeminiProvider for 'gemini'", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    const { createProvider } = await import("../src/providers.js");
    const provider = await createProvider("gemini");
    expect((provider as unknown as { id: string }).id).toBe("gemini");
  });

  it("creates a MistralProvider for 'mistral'", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "test-mistral");
    const { createProvider } = await import("../src/providers.js");
    const provider = await createProvider("mistral");
    expect((provider as unknown as { id: string }).id).toBe("mistral");
  });

  it("creates a GroqProvider for 'groq'", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq");
    const { createProvider } = await import("../src/providers.js");
    const provider = await createProvider("groq");
    expect((provider as unknown as { id: string }).id).toBe("groq");
  });

  it("creates a MoonshotProvider for 'moonshot'", async () => {
    vi.stubEnv("KIMI_API_KEY", "test-moonshot");
    const { createProvider } = await import("../src/providers.js");
    const provider = await createProvider("moonshot");
    expect((provider as unknown as { id: string }).id).toBe("moonshot");
  });

  it("falls back to OllamaProvider for an unknown provider id", async () => {
    const { createProvider } = await import("../src/providers.js");
    const provider = await createProvider("unknown-provider");
    expect((provider as unknown as { id: string }).id).toBe("ollama");
  });

  it("is case-insensitive for provider id", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai");
    const { createProvider } = await import("../src/providers.js");
    const provider = await createProvider("OPENAI");
    expect((provider as unknown as { id: string }).id).toBe("openai");
  });
});

// ─── WebSocketProvider ─────────────────────────────────────────────────────────

describe("WebSocketProvider", () => {
  it("generateMessage concatenates chunk content from generateMessages", async () => {
    vi.resetModules();
    const { WebSocketProvider } = await import("../src/providers.js");

    const fakeClient = {
      inference: vi.fn(async function* () {
        yield { type: "chunk", content: "Hello" };
        yield { type: "chunk", content: ", world" };
        yield { type: "done" };
      })
    };

    const provider = new WebSocketProvider(
      fakeClient as never,
      "gpt-4o",
      "openai"
    );
    const msg = await provider.generateMessage({
      messages: [],
      model: "gpt-4o"
    });
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("Hello, world");
  });

  it("generateMessage returns empty content when no chunk events are yielded", async () => {
    vi.resetModules();
    const { WebSocketProvider } = await import("../src/providers.js");

    const fakeClient = {
      inference: vi.fn(async function* () {
        yield { type: "done" };
      })
    };

    const provider = new WebSocketProvider(
      fakeClient as never,
      "gpt-4o",
      "openai"
    );
    const msg = await provider.generateMessage({
      messages: [],
      model: "gpt-4o"
    });
    expect(msg.content).toBe("");
  });

  it("generateMessages throws when an error event is received", async () => {
    vi.resetModules();
    const { WebSocketProvider } = await import("../src/providers.js");

    const fakeClient = {
      inference: vi.fn(async function* () {
        yield { type: "error", message: "server error" };
      })
    };

    const provider = new WebSocketProvider(
      fakeClient as never,
      "gpt-4o",
      "openai"
    );
    const gen = provider.generateMessages({ messages: [], model: "gpt-4o" });
    await expect(async () => {
      for await (const _ of gen) {
        /* consume */
      }
    }).rejects.toThrow("server error");
  });

  it("generateMessages forwards tool_call events", async () => {
    vi.resetModules();
    const { WebSocketProvider } = await import("../src/providers.js");

    const toolCall = {
      type: "tool_call",
      id: "tc1",
      name: "read_file",
      args: { path: "a.txt" }
    };
    const fakeClient = {
      inference: vi.fn(async function* () {
        yield toolCall;
        yield { type: "done" };
      })
    };

    const provider = new WebSocketProvider(
      fakeClient as never,
      "gpt-4o",
      "openai"
    );
    const items: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages: [],
      model: "gpt-4o"
    })) {
      items.push(item);
    }
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "tc1", name: "read_file" });
  });

  it("uses defaultModel when model arg is empty", async () => {
    vi.resetModules();
    const { WebSocketProvider } = await import("../src/providers.js");

    let capturedModel = "";
    const fakeClient = {
      inference: vi.fn(async function* (_msgs: unknown, model: string) {
        capturedModel = model;
        yield { type: "done" };
      })
    };

    const provider = new WebSocketProvider(
      fakeClient as never,
      "my-default-model",
      "openai"
    );
    await provider.generateMessage({ messages: [], model: "" });
    expect(capturedModel).toBe("my-default-model");
  });
});
