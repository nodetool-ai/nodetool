import { describe, it, expect, afterEach, vi } from "vitest";

const CLOUD = [
  "openai",
  "openai_responses",
  "anthropic",
  "gemini",
  "groq",
  "mistral",
  "xai",
  "fal_ai",
  "kie"
];
const OUT_OF_SCOPE = [
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
});
