/**
 * The `web` capability module: the three search capabilities, the two browser
 * ones, and the two HTTP ones.
 *
 * The port must be invisible. So the checks are: the module walk is clean,
 * every spec's category equals what the classification map the gate reads says,
 * a Tool built from a spec renders exactly that spec, and
 * a call through `toolFromCapability` produces what the class produced.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { createCapabilityRun } from "../src/capabilities/invoke.js";
import {
  capabilityModuleIssues,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import {
  WEB_CAPABILITIES,
  module as webModule
} from "../src/capabilities/web.js";
import type {
  CapabilityExport,
  CapabilityGate
} from "../src/capabilities/types.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { Tool } from "../src/tools/base-tool.js";

const gate: CapabilityGate = {
  mode: "auto",
  sessionAllow: new Set<string>(),
  requestApproval: async () => "allow"
};

/** Build a mock ProcessingContext whose getSecret returns the given map. */
function makeContext(secrets: Record<string, string | null> = {}) {
  return {
    getSecret: async (key: string) => secrets[key] ?? null
  } as unknown as ProcessingContext;
}

function asTool(entry: CapabilityExport): Tool {
  return toolFromCapability(entry.spec, entry.impl, (context) =>
    createCapabilityRun({ context, gate })
  );
}

function byName(name: string): CapabilityExport {
  const found = WEB_CAPABILITIES.find((entry) => entry.spec.name === name);
  if (!found) throw new Error(`no web capability named ${name}`);
  return found;
}

/**
 * Routing reads real configuration (secrets/env), so ambient keys in the test
 * process would change which backend is picked. Pin them all to absent.
 */
const BACKEND_ENV_KEYS = [
  "SERPAPI_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "DATA_FOR_SEO_LOGIN",
  "DATA_FOR_SEO_PASSWORD",
  "BRAVE_API_KEY",
  "APIFY_API_TOKEN",
  "APIFY_API_KEY",
  "BROWSER_URL"
] as const;
const envStash: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of BACKEND_ENV_KEYS) {
    envStash[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of BACKEND_ENV_KEYS) {
    if (envStash[key] === undefined) delete process.env[key];
    else process.env[key] = envStash[key];
  }
  vi.restoreAllMocks();
});

describe("web capability module", () => {
  it("loads from the registry with no issues", async () => {
    const loaded = await loadCapabilityModule("web");
    expect(loaded).toBe(webModule);
    expect(capabilityModuleIssues("web", loaded)).toEqual([]);
  });

  it("classifies every export exactly as the gate's map does", () => {
    for (const entry of WEB_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
      ]);
    }
  });
});

describe("wire compatibility: a Tool built from the spec", () => {
  const pairs: Array<[Tool, string]> = [
    [toolForCapabilityName("web_search"), "web_search"],
    [toolForCapabilityName("browser"), "browser"],
    [toolForCapabilityName("take_screenshot"), "take_screenshot"],
    [toolForCapabilityName("http_request"), "http_request"],
    [toolForCapabilityName("download_file"), "download_file"]
  ];

  it.each(pairs)("%o keeps its name, description and schema", (tool, name) => {
    const { spec } = byName(name);
    expect(tool.name).toBe(spec.name);
    expect(tool.description).toBe(spec.description);
    expect(tool.inputSchema).toEqual(spec.inputSchema);
  });

  it("keeps the userMessage templates", () => {
    expect(
      toolForCapabilityName("web_search").userMessage({ query: "otters" })
    ).toBe("Searching the web for 'otters'");
    expect(
      toolForCapabilityName("browser").userMessage({ url: "https://a.example" })
    ).toBe("Fetching https://a.example");
    expect(
      toolForCapabilityName("http_request").userMessage({
        method: "post",
        url: "https://a.example"
      })
    ).toBe("POST https://a.example");
  });
});

describe("behaviour through toolFromCapability", () => {
  it("runs web_search against the SerpAPI backend", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        organic_results: [
          {
            title: "Otters",
            link: "https://good.example/otters",
            snippet: "About otters"
          },
          {
            title: "Spam",
            link: "https://bad.example/otters",
            snippet: "Not otters"
          }
        ]
      })
    } as unknown as Response);

    const context = makeContext({ SERPAPI_API_KEY: "key" });
    const tool = asTool(byName("web_search"));
    const result = await tool.process(context, {
      query: "otters",
      blocked_domains: ["bad.example"]
    });

    expect(result).toContain("Otters");
    expect(result).not.toContain("Spam");
    const requested = String(fetchSpy.mock.calls[0]?.[0]);
    expect(requested).toContain("engine=google");
  });

  it("blocks a search-engine page and rejects an unparsable URL", async () => {
    const context = makeContext();
    const tool = asTool(byName("browser"));
    expect(
      await tool.process(context, { url: "https://www.google.com/search?q=x" })
    ).toMatch(/search engine/i);
    expect(await tool.process(context, { url: "not-a-url" })).toBe(
      "Error: Invalid URL: not-a-url"
    );
  });

  it("refuses a take_screenshot URL no browser should be pointed at", async () => {
    const context = makeContext();
    const tool = asTool(byName("take_screenshot"));
    // Both refusals happen before a browser is launched, so this stays
    // hermetic — the local path is exercised in browser-tools.test.ts.
    const scheme = (await tool.process(context, {
      url: "file:///etc/passwd"
    })) as Record<string, unknown>;
    expect(String(scheme.error)).toContain("Only http and https");
    const bad = (await tool.process(context, {
      url: "not-a-url"
    })) as Record<string, unknown>;
    expect(String(bad.error)).toContain("Invalid URL");
  });

  it("appends the pages the gemini backend grounded on, filtered", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: { parts: [{ text: "Otters are mustelids." }] },
            groundingMetadata: {
              groundingChunks: [
                { web: { uri: "https://good.example/otters", title: "Otters" } },
                { web: { uri: "https://bad.example/otters", title: "Spam" } }
              ]
            }
          }
        ]
      })
    } as unknown as Response);

    const context = makeContext({ GEMINI_API_KEY: "key" });
    const tool = asTool(byName("web_search"));
    const result = String(
      await tool.process(context, {
        query: "otters",
        backend: "gemini",
        blocked_domains: ["bad.example"]
      })
    );

    expect(result).toContain("Otters are mustelids.");
    expect(result).toContain("1. Otters\n   https://good.example/otters");
    expect(result).not.toContain("bad.example");
  });

  it("appends the pages the openai backend cited", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "Otters are mustelids.",
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  url: "https://good.example/otters",
                  title: "Otters",
                  start_index: 0,
                  end_index: 21
                }
              }
            ]
          }
        }
      ]
    });
    vi.doMock("openai", () => ({
      OpenAI: function () {
        return { chat: { completions: { create } } };
      }
    }));

    const context = makeContext({ OPENAI_API_KEY: "key" });
    const tool = asTool(byName("web_search"));
    const result = String(
      await tool.process(context, { query: "otters", backend: "openai" })
    );

    expect(result).toContain("Otters are mustelids.");
    expect(result).toContain("1. Otters\n   https://good.example/otters");
    vi.doUnmock("openai");
  });

  it("names every unconfigured backend when a news search has none", async () => {
    const context = makeContext();
    const tool = asTool(byName("web_search"));
    await expect(
      tool.process(context, { query: "otters", search_type: "news" })
    ).rejects.toThrow(/no search backend is configured for search_type "news"/);
  });

  it("refuses a backend that cannot serve the requested search type", async () => {
    const context = makeContext();
    const tool = asTool(byName("web_search"));
    // Apify's actor scrapes web results only, so pinning it for images must
    // say so rather than quietly returning pages.
    await expect(
      tool.process(context, {
        query: "otters",
        search_type: "images",
        backend: "apify"
      })
    ).rejects.toThrow(/does not support search_type "images"/);
  });

  it("rejects an unknown search type by name", async () => {
    const context = makeContext();
    const tool = asTool(byName("web_search"));
    const result = await tool.process(context, {
      query: "otters",
      search_type: "videos"
    });
    expect(String(result)).toContain('unknown search_type "videos"');
  });
});
