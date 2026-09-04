import { describe, it, expect } from "vitest";
import {
  APIFY_TOOL_NAMES,
  SERPAPI_TOOL_NAMES,
  getApifyTools,
  getSerpApiTools
} from "../src/tools/external-capability-tools.js";
import { searchTools } from "../src/tools/tool-search.js";
import { getBuiltinTools } from "../src/tools/builtin-tools.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";

describe("Apify and SerpAPI belt tools", () => {
  it("expose every capability the two modules declare, uniquely named", () => {
    const apify = getApifyTools().map((t) => t.name);
    expect(apify).toEqual(APIFY_TOOL_NAMES);
    expect(apify).toContain("search_apify_actors");
    expect(apify).toContain("run_apify_actor");
    const serp = getSerpApiTools().map((t) => t.name);
    expect(serp).toEqual(SERPAPI_TOOL_NAMES);
    expect(serp).toContain("serpapi_search");
    const all = [...apify, ...serp];
    expect(new Set(all).size).toBe(all.length);
  });

  it("are found by nodetool.searchTools once on the belt", () => {
    // The regression: a chat asked to "download via apify" searched the belt,
    // found only web_search (its description mentions the Apify backend), and
    // never learned the actor tools existed.
    const belt = [...getBuiltinTools(), ...getApifyTools()].map((t) => ({
      name: t.name,
      description: t.description
    }));
    const hits = searchTools(belt, "apify", 10).map((h) => h.name);
    expect(hits).toContain("search_apify_actors");
    expect(hits).toContain("run_apify_actor");
  });

  it("are gated by the category the spec declares", () => {
    // Only the two Apify calls that act are external; every read and every
    // SerpAPI call runs without a prompt.
    for (const name of APIFY_TOOL_NAMES) {
      const external = name === "run_apify_actor" || name === "abort_apify_run";
      expect(permissionCategoryFor(name)).toBe(external ? "external" : "read");
    }
    for (const name of SERPAPI_TOOL_NAMES) {
      expect(permissionCategoryFor(name)).toBe("read");
    }
    // `toolFromLazyCapability` reads the schema off the spec synchronously.
    const byName = new Map(getApifyTools().map((t) => [t.name, t]));
    expect(byName.get("run_apify_actor")?.inputSchema.type).toBe("object");
  });
});
