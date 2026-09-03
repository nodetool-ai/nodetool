import { describe, it, expect, afterEach, vi } from "vitest";

// Every hosted API survives the cloud profile: settings offers an API-key card
// for each, and a key with no provider behind it is an empty model picker.
const CLOUD = [
  "openai",
  "anthropic",
  "gemini",
  "groq",
  "mistral",
  "xai",
  "openrouter",
  "fal_ai",
  "kie",
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
  "deepseek",
  "moonshot",
  "elevenlabs",
  "meshy",
  "rodin"
];
// Local engines are never registered under the cloud profile in the first
// place; the CLI-backed subscription is registered and then pruned.
const OUT_OF_SCOPE = [
  "ollama",
  "lmstudio",
  "llama_cpp",
  "node_llama_cpp",
  "claude_agent_sdk"
];

// The provider registry registers (and, under the cloud profile, prunes) at
// module-load time, so each case sets env and re-imports a fresh module graph.
describe("cloud profile provider pruning", () => {
  const originalProfile = process.env["NODETOOL_NODE_PROFILE"];
  const originalEnv = process.env["NODETOOL_ENV"];

  afterEach(() => {
    if (originalProfile === undefined) delete process.env["NODETOOL_NODE_PROFILE"];
    else process.env["NODETOOL_NODE_PROFILE"] = originalProfile;
    if (originalEnv === undefined) delete process.env["NODETOOL_ENV"];
    else process.env["NODETOOL_ENV"] = originalEnv;
    vi.resetModules();
  });

  it("registers out-of-scope providers when the profile is off", async () => {
    delete process.env["NODETOOL_NODE_PROFILE"];
    delete process.env["NODETOOL_ENV"];
    vi.resetModules();
    const mod = await import("../../src/providers/index.js");
    const ids = mod.listRegisteredProviderIds();
    expect(ids).toContain("openai");
    expect(ids).toContain("replicate");
    expect(ids).toContain("together");
  });

  it("keeps only the curated allowlist under NODETOOL_NODE_PROFILE=cloud", async () => {
    delete process.env["NODETOOL_ENV"];
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    vi.resetModules();
    const mod = await import("../../src/providers/index.js");
    const ids = mod.listRegisteredProviderIds();
    for (const id of CLOUD) expect(ids).toContain(id);
    for (const id of OUT_OF_SCOPE) expect(ids).not.toContain(id);
  });

  it("keeps only the curated allowlist in production mode", async () => {
    delete process.env["NODETOOL_NODE_PROFILE"];
    process.env["NODETOOL_ENV"] = "production";
    vi.resetModules();
    const mod = await import("../../src/providers/index.js");
    const ids = mod.listRegisteredProviderIds();
    for (const id of CLOUD) expect(ids).toContain(id);
    for (const id of OUT_OF_SCOPE) expect(ids).not.toContain(id);
  });

  it("drops the managed provider when the profile is off", async () => {
    delete process.env["NODETOOL_NODE_PROFILE"];
    delete process.env["NODETOOL_ENV"];
    vi.resetModules();
    const mod = await import("../../src/providers/index.js");
    // A desktop install, a dev checkout: no platform keys, no account to
    // bill. Every BYOK provider is still there.
    expect(mod.listRegisteredProviderIds()).not.toContain("nodetool");
    expect(mod.listRegisteredProviderIds()).toContain("fal_ai");
  });

  it("drops the managed provider for a self-hosted server", async () => {
    // docker-compose sets both: production, but the full catalog. A
    // self-hoster has no claim on NodeTool's platform keys.
    process.env["NODETOOL_ENV"] = "production";
    process.env["NODETOOL_NODE_PROFILE"] = "full";
    vi.resetModules();
    const mod = await import("../../src/providers/index.js");
    expect(mod.listRegisteredProviderIds()).not.toContain("nodetool");
  });

  it("keeps the managed provider under the cloud profile", async () => {
    delete process.env["NODETOOL_ENV"];
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    vi.resetModules();
    const mod = await import("../../src/providers/index.js");
    expect(mod.listRegisteredProviderIds()).toContain("nodetool");
  });
});
