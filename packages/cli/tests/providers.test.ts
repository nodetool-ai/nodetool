/**
 * Tests for src/providers.ts
 * Provider factory: availableProviders, DEFAULT_MODELS, KNOWN_PROVIDERS, createProvider, WebSocketProvider.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@nodetool-ai/models", () => ({
  getSecret: vi.fn(async (key: string) => process.env[key] ?? null)
}));

// The CLI provider factory delegates construction and credential wiring to the
// runtime provider registry. The mock below stands in for that registry: a
// fixed set of registered ids, their secret-key names, and a FakeProvider that
// records the id it was built for.
vi.mock("@nodetool-ai/runtime", () => {
  class FakeProvider {
    constructor(public readonly id: string) {}
    async generateMessage() {
      return { role: "assistant", content: "" };
    }
    async *generateMessages() {
      yield { type: "chunk", content: "hello" };
    }
  }

  const SECRET_KEYS: Record<string, string | null> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    gemini: "GEMINI_API_KEY",
    xai: "XAI_API_KEY",
    groq: "GROQ_API_KEY",
    mistral: "MISTRAL_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    moonshot: "KIMI_API_KEY",
    minimax: "MINIMAX_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    gmi: "GMI_API_KEY",
    together: "TOGETHER_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    huggingface: "HF_TOKEN",
    replicate: "REPLICATE_API_TOKEN",
    kie: "KIE_API_KEY",
    aki: "AKI_API_KEY",
    ollama: null,
    lmstudio: null
  };
  // Mutable so registerProvider() (used by the lazy Python-bridge path for mlx)
  // can add ids at runtime, mirroring the real registry.
  const REGISTERED = new Set(Object.keys(SECRET_KEYS));

  class FakePythonBridge {
    async connect() {}
    async listProviders() {
      return [{ id: "mlx" }];
    }
  }

  return {
    BaseProvider: FakeProvider,
    PythonProvider: class FakePythonProvider extends FakeProvider {
      constructor(opts: { _id: string }) {
        super(opts._id);
      }
    },
    createPythonBridge: vi.fn(() => new FakePythonBridge()),
    registerProvider: vi.fn((id: string) => {
      REGISTERED.add(id);
      if (!(id in SECRET_KEYS)) SECRET_KEYS[id] = null;
    }),
    listRegisteredProviderIds: vi.fn(() => Array.from(REGISTERED)),
    getProviderSecretKey: vi.fn((id: string) => SECRET_KEYS[id] ?? null),
    isProviderConfigured: vi.fn(async (id: string) => {
      const key = SECRET_KEYS[id];
      return key == null ? true : Boolean(process.env[key]);
    }),
    getProvider: vi.fn(async (id: string) => {
      if (!REGISTERED.has(id)) {
        throw new Error(`No provider registered for "${id}"`);
      }
      // Mirror the real providers that enforce their key in the constructor
      // (e.g. OpenRouter throws "OPENROUTER_API_KEY is required").
      const key = SECRET_KEYS[id];
      if (key != null && !process.env[key]) {
        throw new Error(`${key} is required`);
      }
      return new FakeProvider(id);
    })
  };
});

// MLX is gated on Apple Silicon. Pin the platform per test so assertions about
// the local-provider list are deterministic regardless of the host machine.
function stubPlatform(platform: NodeJS.Platform, arch: string) {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  Object.defineProperty(process, "arch", { value: arch, configurable: true });
}
const REAL_PLATFORM = process.platform;
const REAL_ARCH = process.arch;
function restorePlatform() {
  Object.defineProperty(process, "platform", { value: REAL_PLATFORM, configurable: true });
  Object.defineProperty(process, "arch", { value: REAL_ARCH, configurable: true });
}

// ─── availableProviders ───────────────────────────────────────────────────────

// Every hosted-provider secret key the CLI knows about. Cleared before each
// test so the host environment can't leak a key (e.g. XAI_API_KEY) into the
// deterministic assertions.
const ALL_HOSTED_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "XAI_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "DEEPSEEK_API_KEY",
  "KIMI_API_KEY",
  "MINIMAX_API_KEY",
  "CEREBRAS_API_KEY",
  "TOGETHER_API_KEY",
  "OPENROUTER_API_KEY",
  "HF_TOKEN",
  "REPLICATE_API_TOKEN",
  "KIE_API_KEY",
  "AKI_API_KEY"
];

describe("availableProviders", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    for (const key of ALL_HOSTED_KEYS) vi.stubEnv(key, "");
    // Default to a non-Apple-Silicon host so mlx is excluded; the mlx-specific
    // assertions below opt into Apple Silicon explicitly.
    stubPlatform("linux", "x64");
  });
  afterEach(restorePlatform);

  it("returns only local providers when no API keys are set", async () => {
    const { availableProviders } = await import("../src/providers.js");
    expect(availableProviders()).toEqual(["lmstudio", "ollama"]);
  });

  it("includes anthropic when ANTHROPIC_API_KEY is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const { availableProviders } = await import("../src/providers.js");
    const providers = availableProviders();
    expect(providers).toContain("anthropic");
    expect(providers).toContain("ollama");
  });

  it("includes openai when OPENAI_API_KEY is set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const { availableProviders } = await import("../src/providers.js");
    const providers = availableProviders();
    expect(providers).toContain("openai");
  });

  it("includes newly-added providers when their keys are set", async () => {
    vi.stubEnv("XAI_API_KEY", "x");
    vi.stubEnv("DEEPSEEK_API_KEY", "d");
    vi.stubEnv("CEREBRAS_API_KEY", "c");
    vi.stubEnv("TOGETHER_API_KEY", "t");
    vi.stubEnv("OPENROUTER_API_KEY", "o");
    const { availableProviders } = await import("../src/providers.js");
    const providers = availableProviders();
    expect(providers).toContain("xai");
    expect(providers).toContain("deepseek");
    expect(providers).toContain("cerebras");
    expect(providers).toContain("together");
    expect(providers).toContain("openrouter");
  });

  it("ollama is always last in the list", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    vi.stubEnv("OPENAI_API_KEY", "b");
    const { availableProviders } = await import("../src/providers.js");
    const providers = availableProviders();
    expect(providers[providers.length - 1]).toBe("ollama");
  });

  it("always includes local providers and any configured env-backed providers", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    const { availableProviders } = await import("../src/providers.js");
    expect(availableProviders()).toEqual([
      "anthropic",
      "gemini",
      "lmstudio",
      "ollama"
    ]);
  });

  it("includes mlx on Apple Silicon", async () => {
    stubPlatform("darwin", "arm64");
    const { availableProviders } = await import("../src/providers.js");
    expect(availableProviders()).toContain("mlx");
  });

  it("excludes mlx on non-Apple-Silicon hosts", async () => {
    stubPlatform("darwin", "x64");
    const { availableProviders } = await import("../src/providers.js");
    expect(availableProviders()).not.toContain("mlx");
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
      "moonshot",
      "xai",
      "deepseek",
      "minimax",
      "cerebras",
      "gmi",
      "together",
      "openrouter",
      "huggingface",
      "replicate",
      "kie",
      "aki",
      "lmstudio"
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

  it("surfaces construction errors for a registered provider instead of silently using ollama", async () => {
    // No OPENROUTER_API_KEY → the (registered) provider's constructor throws.
    // The CLI must propagate that, NOT fall back to ollama and list ollama's
    // models under the openrouter label.
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const { createProvider } = await import("../src/providers.js");
    await expect(createProvider("openrouter")).rejects.toThrow(
      /OPENROUTER_API_KEY/
    );
  });

  it("builds a registered provider once its key is configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const { createProvider } = await import("../src/providers.js");
    const provider = await createProvider("openrouter");
    expect((provider as unknown as { id: string }).id).toBe("openrouter");
  });

  it("registers mlx via the Python bridge on demand", async () => {
    const { createProvider } = await import("../src/providers.js");
    const provider = await createProvider("mlx");
    expect((provider as unknown as { id: string }).id).toBe("mlx");
  });
});

// ─── providerSecretKey ─────────────────────────────────────────────────────────

describe("configuredProviderIds", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    for (const key of ALL_HOSTED_KEYS) vi.stubEnv(key, "");
    stubPlatform("linux", "x64");
  });
  afterEach(restorePlatform);

  it("includes only local providers when no keys are set", async () => {
    const { configuredProviderIds } = await import("../src/providers.js");
    const ids = await configuredProviderIds();
    expect(ids.has("ollama")).toBe(true);
    expect(ids.has("lmstudio")).toBe(true);
    expect(ids.has("openrouter")).toBe(false);
    expect(ids.has("anthropic")).toBe(false);
    expect(ids.has("mlx")).toBe(false);
  });

  it("includes mlx on Apple Silicon without connecting the bridge", async () => {
    stubPlatform("darwin", "arm64");
    const { configuredProviderIds } = await import("../src/providers.js");
    const ids = await configuredProviderIds();
    expect(ids.has("mlx")).toBe(true);
  });

  it("includes a hosted provider once its key is set", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const { configuredProviderIds } = await import("../src/providers.js");
    const ids = await configuredProviderIds();
    expect(ids.has("openrouter")).toBe(true);
    expect(ids.has("ollama")).toBe(true);
    expect(ids.has("anthropic")).toBe(false);
  });
});

describe("providerSecretKey", () => {
  it("returns the secret key for a hosted provider", async () => {
    vi.resetModules();
    const { providerSecretKey } = await import("../src/providers.js");
    expect(providerSecretKey("openrouter")).toBe("OPENROUTER_API_KEY");
    expect(providerSecretKey("XAI")).toBe("XAI_API_KEY");
  });

  it("returns null for local/keyless providers", async () => {
    vi.resetModules();
    const { providerSecretKey } = await import("../src/providers.js");
    expect(providerSecretKey("ollama")).toBeNull();
    expect(providerSecretKey("lmstudio")).toBeNull();
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
