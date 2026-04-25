import { describe, expect, it, vi } from "vitest";

describe("cli settings and provider helpers", () => {
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
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    vi.stubEnv("MISTRAL_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");

    const { availableProviders } = await import("../src/providers.js");

    expect(availableProviders()).toEqual(["anthropic", "gemini", "lmstudio", "ollama"]);
  });
});
