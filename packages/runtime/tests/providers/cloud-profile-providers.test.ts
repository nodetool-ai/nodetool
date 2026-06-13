import { describe, it, expect, afterEach, vi } from "vitest";

// The provider registry registers (and, under the cloud profile, prunes)
// at module-load time, so each case sets the env and re-imports a fresh
// module graph via resetModules.
describe("cloud profile provider pruning", () => {
  const original = process.env["NODETOOL_NODE_PROFILE"];

  afterEach(() => {
    if (original === undefined) delete process.env["NODETOOL_NODE_PROFILE"];
    else process.env["NODETOOL_NODE_PROFILE"] = original;
    vi.resetModules();
  });

  it("registers out-of-scope providers when the profile is off", async () => {
    delete process.env["NODETOOL_NODE_PROFILE"];
    vi.resetModules();
    const mod = await import("../../src/providers/index.js");
    const ids = mod.listRegisteredProviderIds();
    expect(ids).toContain("openai");
    expect(ids).toContain("replicate");
    expect(ids).toContain("together");
  });

  it("keeps only the curated allowlist under NODETOOL_NODE_PROFILE=cloud", async () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    vi.resetModules();
    const mod = await import("../../src/providers/index.js");
    const ids = mod.listRegisteredProviderIds();

    for (const id of [
      "openai",
      "anthropic",
      "gemini",
      "groq",
      "mistral",
      "xai",
      "fal_ai",
      "kie"
    ]) {
      expect(ids).toContain(id);
    }
    for (const id of [
      "replicate",
      "together",
      "minimax",
      "topaz",
      "reve",
      "atlascloud",
      "cohere",
      "voyage",
      "jina",
      "huggingface",
      "openrouter",
      "deepseek",
      "moonshot",
      "ollama"
    ]) {
      expect(ids).not.toContain(id);
    }
  });
});
