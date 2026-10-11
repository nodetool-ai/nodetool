import { describe, it, expect } from "vitest";
import { settingCatalog, settingDefinition } from "../src/setting-catalog.js";

/**
 * Every credential the backend reads must have a catalog entry, or the agent
 * `settings` capability cannot see it and `settings.list` cannot describe it.
 * The keys below were offered by the web settings UI while missing here.
 */
const PROVIDER_CREDENTIALS: Array<[envVar: string, readBy: string]> = [
  ["COHERE_API_KEY", "packages/runtime/src/providers/cohere-provider.ts"],
  ["JINA_API_KEY", "packages/runtime/src/providers/jina-provider.ts"],
  ["VOYAGE_API_KEY", "packages/runtime/src/providers/voyage-provider.ts"],
  ["EVOLINK_API_KEY", "packages/runtime/src/providers/evolink-provider.ts"],
  ["VAST_API_KEY", "packages/compute/src/manager.ts"],
  ["VERDA_CLIENT_ID", "packages/compute/src/manager.ts"],
  ["VERDA_CLIENT_SECRET", "packages/compute/src/manager.ts"],
  ["LMSTUDIO_API_KEY", "packages/runtime/src/providers/lmstudio-provider.ts"]
];

/** Non-secret local-inference settings the backend or the Python worker reads. */
const LOCAL_INFERENCE_SETTINGS = [
  "OLLAMA_API_URL",
  "OLLAMA_KEEP_ALIVE",
  "OLLAMA_CONTEXT_LENGTH",
  "LLAMA_CPP_CONTEXT_LENGTH",
  "TRANSFORMERS_JS_CACHE_DIR",
  "WAN2GP_MCP_URL",
  "NODETOOL_TORCH_DEVICE"
];

describe("setting catalog", () => {
  it("registers a definition for every provider credential the backend reads", () => {
    const missing = PROVIDER_CREDENTIALS.filter(
      ([envVar]) => settingDefinition(envVar) === undefined
    );
    expect(missing.map(([envVar, readBy]) => `${envVar} (${readBy})`)).toEqual(
      []
    );
  });

  it("marks those credentials as secret", () => {
    const notSecret = PROVIDER_CREDENTIALS.filter(
      ([envVar]) => settingDefinition(envVar)?.isSecret !== true
    );
    expect(notSecret.map(([envVar]) => envVar)).toEqual([]);
  });

  it("registers the local inference settings as non-secret settings", () => {
    for (const envVar of LOCAL_INFERENCE_SETTINGS) {
      const entry = settingDefinition(envVar);
      expect(entry, envVar).toBeDefined();
      expect(entry?.isSecret, envVar).toBeFalsy();
    }
  });

  it("does not give NodeTool's own port as the vLLM example", () => {
    expect(settingDefinition("VLLM_BASE_URL")?.description).not.toContain(":7777");
  });

  it("registers each env var exactly once", () => {
    const seen = new Set<string>();
    const duplicates = settingCatalog()
      .map((entry) => entry.envVar)
      .filter((envVar) => !seen.add(envVar));
    expect(duplicates).toEqual([]);
  });
});
