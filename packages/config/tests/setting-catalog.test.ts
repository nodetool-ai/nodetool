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
  ["VAST_API_KEY", "packages/compute/src/manager.ts"]
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

  it("registers each env var exactly once", () => {
    const seen = new Set<string>();
    const duplicates = settingCatalog()
      .map((entry) => entry.envVar)
      .filter((envVar) => !seen.add(envVar));
    expect(duplicates).toEqual([]);
  });
});
