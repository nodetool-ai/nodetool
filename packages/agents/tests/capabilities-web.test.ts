/**
 * The `web` capability module: the three search capabilities, the two browser
 * ones, and the two HTTP ones.
 *
 * The port must be invisible. So the checks are: the module walk is clean,
 * every spec's category equals what the classification map the gate reads says,
 * each deprecated class still renders exactly the spec it was ported from, and
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
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { Tool } from "../src/tools/base-tool.js";
import {
  WebSearchTool,
  GoogleNewsTool,
  GoogleImagesTool
} from "../src/tools/search-tools.js";
import { BrowserTool, ScreenshotTool } from "../src/tools/browser-tools.js";
import { DownloadFileTool, HttpRequestTool } from "../src/tools/http-tools.js";

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

describe("wire compatibility with the deprecated classes", () => {
  const pairs: Array<[Tool, string]> = [
    [new WebSearchTool(), "web_search"],
    [new GoogleNewsTool(), "google_news"],
    [new GoogleImagesTool(), "google_images"],
    [new BrowserTool(), "browser"],
    [new ScreenshotTool(), "take_screenshot"],
    [new HttpRequestTool(), "http_request"],
    [new DownloadFileTool(), "download_file"]
  ];

  it.each(pairs)("%o keeps its name, description and schema", (tool, name) => {
    const { spec } = byName(name);
    expect(tool.name).toBe(spec.name);
    expect(tool.description).toBe(spec.description);
    expect(tool.inputSchema).toEqual(spec.inputSchema);
  });

  it("keeps the userMessage templates", () => {
    expect(new WebSearchTool().userMessage({ query: "otters" })).toBe(
      "Searching the web for 'otters'"
    );
    expect(new BrowserTool().userMessage({ url: "https://a.example" })).toBe(
      "Fetching https://a.example"
    );
    expect(
      new HttpRequestTool().userMessage({
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

  it("says what take_screenshot needs when no browser service is set", async () => {
    const context = makeContext();
    const tool = asTool(byName("take_screenshot"));
    const result = (await tool.process(context, {
      url: "https://a.example"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("BROWSER_URL");
  });

  it("names every unconfigured backend when google_news has none", async () => {
    const context = makeContext();
    const tool = asTool(byName("google_news"));
    await expect(tool.process(context, { keyword: "otters" })).rejects.toThrow(
      /no search backend is configured/
    );
  });
});
