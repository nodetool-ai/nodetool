/**
 * The `serpapi` capability module — every SerpAPI engine behind one surface.
 *
 * The claim being tested is the design claim: an agent that has never heard of
 * `google_scholar` can find it, read its contract, and call it correctly,
 * without a line of NodeTool code that knows what Scholar is. So the tests walk
 * that path — list, schema, search — over a real playground response, and then
 * check the two things that make the surface safe to hand to a model: the key
 * never crosses into guest code, and a parameter the engine does not have is
 * refused before it is billed.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { sandboxCapabilitySpecifier } from "@nodetool-ai/protocol";

import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import {
  SERPAPI_CAPABILITIES,
  module as serpApiModule
} from "../src/capabilities/serpapi.js";
import {
  capabilityModuleIssues,
  listCapabilityModules,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import { clearSerpApiCatalogCache } from "../src/serpapi/catalog.js";
import type { CapabilityRun } from "../src/capabilities/types.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";

const KEY = "serpapi_KEYTHATMUSTNOTLEAK0000000000";

const PLAYGROUND = readFileSync(
  fileURLToPath(new URL("./fixtures/serpapi-playground.html", import.meta.url)),
  "utf8"
);

const realFetch = globalThis.fetch;
/** Every non-catalog URL the module asked for, in order. */
let requested: string[] = [];
/** What the next `/search.json` answers with. */
let searchBody: unknown = { organic_results: [] };

beforeEach(() => {
  clearSerpApiCatalogCache();
  requested = [];
  searchBody = { organic_results: [] };
  delete process.env.SERPAPI_API_KEY;
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.startsWith("https://serpapi.com/playground")) {
      return new Response(PLAYGROUND, { status: 200 });
    }
    requested.push(url);
    return new Response(JSON.stringify(searchBody), { status: 200 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  clearSerpApiCatalogCache();
});

function runWith(secrets: Record<string, string> = {}): CapabilityRun {
  const context = {
    userId: "serpapi-test",
    getSecret: async (key: string) => secrets[key] ?? null
  } as unknown as ProcessingContext;
  return createCapabilityRun({ context, gate: UNGATED });
}

const keyed = (): CapabilityRun => runWith({ SERPAPI_API_KEY: KEY });

async function invoke(
  run: CapabilityRun,
  name: string,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  return (await run.invoke(name, args)) as Record<string, unknown>;
}

describe("registration", () => {
  it("is registered, and the module walk is clean", async () => {
    expect(listCapabilityModules()).toContain("serpapi");
    const loaded = await loadCapabilityModule("serpapi");
    expect(capabilityModuleIssues("serpapi", loaded)).toEqual([]);
    expect(loaded.exports.map((e) => e.spec.name).sort()).toEqual(
      SERPAPI_CAPABILITIES.map((e) => e.spec.name).sort()
    );
    expect(serpApiModule.module).toBe("serpapi");
  });

  it("classes every capability as a read, and the gate agrees", () => {
    // A search spends a plan credit but changes nothing on the other side —
    // the class `web_search` already sits in, and this is the same call with
    // the engine chosen by the caller instead of by the install.
    for (const entry of SERPAPI_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        "read"
      ]);
      expect(permissionCategoryFor(entry.spec.name)).toBe("read");
    }
  });
});

describe("discovery", () => {
  it("lists the engines SerpAPI ships, with what each one requires", async () => {
    const listed = await invoke(keyed(), "list_serpapi_engines", {});
    expect(listed.ok).toBe(true);
    const engines = listed.engines as { engine: string; required: string[] }[];
    expect(engines.map((e) => e.engine).sort()).toEqual([
      "amazon",
      "google_scholar",
      "youtube"
    ]);
    expect(engines.find((e) => e.engine === "google_scholar")?.required).toEqual(
      ["q"]
    );
    // Listing is a page read; no key is needed and none is spent.
    expect(requested).toEqual([]);
  });

  it("filters by name so a large catalog is navigable", async () => {
    const listed = await invoke(keyed(), "list_serpapi_engines", {
      query: "scholar"
    });
    expect((listed.engines as unknown[]).length).toBe(1);
    expect(listed.total).toBe(1);
  });

  it("hands back one engine's full parameter contract", async () => {
    const schema = await invoke(keyed(), "get_serpapi_engine_schema", {
      engine: "google_scholar"
    });
    expect(schema.ok).toBe(true);
    expect(schema.required).toEqual(["q"]);

    const parameters = schema.parameters as {
      name: string;
      type?: string;
      options?: string[];
      description: string;
    }[];
    const byName = new Map(parameters.map((p) => [p.name, p]));
    expect(byName.get("as_ylo")?.type).toBe("number");
    expect(byName.get("scisbd")?.options).toEqual(["1", "2"]);
    expect(byName.get("q")?.description).toContain("author:");
    // Hidden parameters are opt-in, and opting in shows them.
    expect(byName.has("json_restrictor")).toBe(false);
    const full = await invoke(keyed(), "get_serpapi_engine_schema", {
      engine: "google_scholar",
      include_hidden: true
    });
    expect(
      (full.parameters as { name: string }[]).some(
        (p) => p.name === "json_restrictor"
      )
    ).toBe(true);
  });

  it("points at the near misses when an engine id is wrong", async () => {
    const missed = await invoke(keyed(), "get_serpapi_engine_schema", {
      engine: "scholar"
    });
    expect(missed.ok).toBe(false);
    expect(missed.error_kind).toBe("unknown_engine");
    expect(String(missed.error)).toContain("google_scholar");
  });
});

describe("searching", () => {
  it("runs the engine the caller named and trims what comes back", async () => {
    searchBody = {
      search_metadata: { status: "Success" },
      organic_results: Array.from({ length: 25 }, (_, i) => ({ position: i })),
      related_searches: [{ query: "x" }]
    };
    const result = await invoke(keyed(), "serpapi_search", {
      engine: "google_scholar",
      params: { q: "attention is all you need", as_ylo: 2020 },
      fields: ["organic_results"],
      max_items: 5
    });

    expect(result.ok).toBe(true);
    const url = new URL(requested[0]);
    expect(url.searchParams.get("engine")).toBe("google_scholar");
    expect(url.searchParams.get("as_ylo")).toBe("2020");

    const results = result.results as Record<string, unknown[]>;
    expect(results.organic_results).toHaveLength(5);
    // Nothing is dropped silently: what was cut, and what was not sent, are
    // both named so the caller can ask for them.
    expect(result.truncated).toEqual({ organic_results: 20 });
    expect(result.omitted).toEqual(["related_searches"]);
    expect(result.available_keys).toEqual([
      "organic_results",
      "related_searches"
    ]);
    expect((result.metadata as Record<string, unknown>).search_metadata).toEqual(
      { status: "Success" }
    );
  });

  it("refuses a parameter the engine does not have, before it is billed", async () => {
    const refused = await invoke(keyed(), "serpapi_search", {
      engine: "google_scholar",
      params: { query: "attention" }
    });
    expect(refused.ok).toBe(false);
    expect(refused.error_kind).toBe("invalid_input");
    const issues = (refused.issues as string[]).join(" ");
    expect(issues).toContain('"query" is not a parameter');
    expect(issues).toContain('"q" (Search Query) is required');
    // The whole point: SerpAPI was never called, so nothing was spent.
    expect(requested).toEqual([]);
  });

  it("refuses a value outside an enumerated parameter's options", async () => {
    const refused = await invoke(keyed(), "serpapi_search", {
      engine: "google_scholar",
      params: { q: "x", scisbd: 7 }
    });
    expect((refused.issues as string[]).join(" ")).toContain(
      '"scisbd" must be one of: 1, 2'
    );
    expect(requested).toEqual([]);
  });

  it("reports a missing key as a setting to change, not a stack trace", async () => {
    const result = await invoke(runWith(), "serpapi_search", {
      engine: "youtube",
      params: { search_query: "nodetool" }
    });
    expect(result.ok).toBe(false);
    expect(result.error_kind).toBe("auth");
    expect(String(result.error)).toContain("SERPAPI_API_KEY");
  });
});

describe("locations", () => {
  it("returns the canonical spelling the `location` parameter wants", async () => {
    searchBody = [
      {
        name: "Austin",
        canonical_name: "Austin,Texas,United States",
        country_code: "US",
        target_type: "City"
      }
    ];
    const result = await invoke(keyed(), "get_serpapi_locations", {
      query: "Austin"
    });
    expect((result.locations as { location: string }[])[0].location).toBe(
      "Austin,Texas,United States"
    );
  });
});

describe("the sandbox surface", () => {
  it("serves the module to guest code without handing it the key", async () => {
    const run = keyed();
    const specifier = sandboxCapabilitySpecifier("serpapi");
    const session = createChatCodeActSession({
      tools: [],
      executeTool: async (call) => run.invoke(call.name, call.args),
      capabilityRun: run
    });
    const observed = JSON.parse(
      await session.executeAction({
        code:
          `import serpapi from ${JSON.stringify(specifier)};\n` +
          `const shapes = Object.keys(serpapi).map((k) => typeof serpapi[k]);\n` +
          `const listed = await serpapi.list_serpapi_engines({ query: "amazon" });\n` +
          `return { shapes, listed, secret: typeof globalThis.SERPAPI_API_KEY };`
      })
    ) as { ok: boolean; result?: unknown };

    expect(observed.ok).toBe(true);
    const payload = JSON.stringify(observed.result);
    expect(payload).not.toContain(KEY);
    expect(payload).toContain("amazon");
    const result = observed.result as { shapes: string[]; secret: string };
    expect(new Set(result.shapes)).toEqual(new Set(["function"]));
    expect(result.secret).toBe("undefined");
  });
});
