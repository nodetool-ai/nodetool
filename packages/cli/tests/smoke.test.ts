import { afterEach, describe, expect, it, vi } from "vitest";

describe("cli settings and provider helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("uses the openai default model when openai is the chosen provider", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai");
    vi.stubEnv("GEMINI_API_KEY", "");

    const { DEFAULT_SETTINGS } = await import("../src/settings.js");

    expect(DEFAULT_SETTINGS.provider).toBe("openai");
    expect(DEFAULT_SETTINGS.model).toBe("gpt-4o");
  });

  it("always includes ollama and any configured env-backed providers", async () => {
    vi.resetModules();
    // Clear every hosted-provider key so the host env can't leak one into the
    // assertion, then enable just anthropic + gemini.
    for (const key of [
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
    ]) {
      vi.stubEnv(key, "");
    }
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");

    const { availableProviders } = await import("../src/providers.js");

    // `mlx` is appended only on Apple Silicon (after the env-backed providers,
    // before the keyless ones), so the expectation tracks the host platform.
    const onAppleSilicon =
      process.platform === "darwin" && process.arch === "arm64";

    expect(availableProviders()).toEqual([
      "anthropic",
      "gemini",
      ...(onAppleSilicon ? ["mlx"] : []),
      "claude_agent_sdk",
      "lmstudio",
      "ollama"
    ]);
  });
});
