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
import { readFileSync as readSourceSync } from "node:fs";
import { fileURLToPath as toSourcePath } from "node:url";
import { capabilitySpec } from "../src/capabilities/index.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { createCapabilityRun } from "../src/capabilities/invoke.js";
import {
  capabilityCategoryFor,
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
import { Tool } from "../src/tools/base-tool.js";

/**
 * The Antigravity backend is configured when the `agy` CLI starts, which no
 * secret controls. Replace it so routing never spawns a real CLI here: it is
 * unavailable unless a test says otherwise.
 */
const antigravity = vi.hoisted(() => ({
  available: false,
  answer: vi.fn()
}));
vi.mock("../src/tools/serp-providers/antigravity-provider.js", () => ({
  antigravitySearchAvailable: async () => antigravity.available,
  AntigravitySearchProvider: class {
    answer = antigravity.answer;
  }
}));

const claude = vi.hoisted(() => ({
  available: false,
  answer: vi.fn(),
  cliPath: undefined as string | null | undefined
}));
vi.mock("../src/tools/serp-providers/claude-provider.js", async (load) => ({
  ...(await load<object>()),
  claudeSearchAvailable: async () => claude.available,
  ClaudeSearchProvider: class {
    answer = claude.answer;
    constructor(options: { cliPath?: string | null }) {
      claude.cliPath = options.cliPath;
    }
  }
}));
const codex = vi.hoisted(() => ({ answer: vi.fn(), token: "" }));
vi.mock("../src/tools/serp-providers/codex-provider.js", () => ({
  CodexSearchProvider: {
    fromToken: async (token: string) => {
      codex.token = token;
      return { answer: codex.answer };
    }
  }
}));

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
  "CLAUDE_CLI_PATH",
  "CODEX_ACCESS_TOKEN",
  "BROWSER_URL"
] as const;
const envStash: Record<string, string | undefined> = {};

beforeEach(() => {
  antigravity.available = false;
  antigravity.answer.mockReset();
  claude.available = false;
  claude.answer.mockReset();
  claude.cliPath = undefined;
  codex.answer.mockReset();
  codex.token = "";
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
        capabilityCategoryFor(entry.spec.name)
      ]);
    }
  });
});

describe("wire compatibility: a Tool built from the spec", () => {
  const pairs: Array<[Tool, string]> = [
    [toolForCapabilityName("web_search"), "web_search"],
    [toolForCapabilityName("image_search"), "image_search"],
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

  it("appends the pages the antigravity backend searched, filtered", async () => {
    antigravity.available = true;
    antigravity.answer.mockResolvedValue({
      text: "Otters are mustelids.",
      citations: [
        { title: "Otters", url: "https://good.example/otters", snippet: "", position: 1 },
        { title: "Spam", url: "https://bad.example/otters", snippet: "", position: 2 }
      ],
      raw: {}
    });

    const tool = asTool(byName("web_search"));
    const result = String(
      await tool.process(makeContext(), {
        query: "otters",
        blocked_domains: ["bad.example"]
      })
    );

    expect(antigravity.answer).toHaveBeenCalledWith("otters", {
      signal: undefined
    });
    expect(result).toContain("Otters are mustelids.");
    expect(result).toContain("1. Otters\n   https://good.example/otters");
    expect(result).not.toContain("bad.example");
  });

  it("routes to the codex backend on a ChatGPT sign-in", async () => {
    codex.answer.mockResolvedValue({
      text: "Otters are mustelids.",
      citations: [
        { title: "Otters", url: "https://good.example/otters", snippet: "", position: 1 }
      ],
      raw: {}
    });

    const tool = asTool(byName("web_search"));
    const result = String(
      await tool.process(makeContext({ CODEX_ACCESS_TOKEN: "oauth-token" }), {
        query: "otters"
      })
    );

    expect(codex.token).toBe("oauth-token");
    expect(codex.answer).toHaveBeenCalledWith("otters", { signal: undefined });
    expect(result).toContain("Otters are mustelids.");
    expect(result).toContain("1. Otters\n   https://good.example/otters");
  });

  it("routes to the claude backend with the configured CLI path", async () => {
    claude.available = true;
    claude.answer.mockResolvedValue({
      text: "Otters are mustelids.",
      citations: [
        { title: "Otters", url: "https://good.example/otters", snippet: "", position: 1 },
        { title: "Spam", url: "https://bad.example/otters", snippet: "", position: 2 }
      ],
      raw: {}
    });

    const tool = asTool(byName("web_search"));
    const result = String(
      await tool.process(makeContext({ CLAUDE_CLI_PATH: "/opt/claude" }), {
        query: "otters",
        backend: "claude",
        blocked_domains: ["bad.example"]
      })
    );

    expect(claude.cliPath).toBe("/opt/claude");
    expect(result).toContain("1. Otters\n   https://good.example/otters");
    expect(result).not.toContain("bad.example");
  });

  it("names the ChatGPT sign-in when the pinned codex backend is missing", async () => {
    const tool = asTool(byName("web_search"));
    await expect(
      tool.process(makeContext(), { query: "otters", backend: "codex" })
    ).rejects.toThrow(/"codex" is not configured .*ChatGPT sign-in/);
  });

  it("names the Antigravity CLI when the pinned antigravity backend is missing", async () => {
    const tool = asTool(byName("web_search"));
    await expect(
      tool.process(makeContext(), { query: "otters", backend: "antigravity" })
    ).rejects.toThrow(/"antigravity" is not configured .*Antigravity CLI/);
  });

  it("appends the pages the openai backend cited", async () => {
    const create = vi.fn().mockResolvedValue({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Otters are mustelids.",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://good.example/otters",
                  title: "Otters",
                  start_index: 0,
                  end_index: 21
                }
              ]
            }
          ]
        }
      ]
    });
    vi.doMock("openai", () => ({
      OpenAI: function () {
        return { responses: { create } };
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

  it.each(["antigravity", "codex", "claude"])(
    "image_search refuses the web-only %s backend",
    async (backend) => {
      antigravity.available = true;
      claude.available = true;
      const tool = asTool(byName("image_search"));
      await expect(
        tool.process(makeContext({ CODEX_ACCESS_TOKEN: "t" }), {
          query: "otters",
          backend
        })
      ).rejects.toThrow(/does not support search_type "images"/);
      expect(antigravity.answer).not.toHaveBeenCalled();
      expect(claude.answer).not.toHaveBeenCalled();
      expect(codex.answer).not.toHaveBeenCalled();
    }
  );

  it("image_search always searches images regardless of caller input", async () => {
    const context = makeContext();
    const tool = asTool(byName("image_search"));
    // No search_type argument exists on this capability's schema at all —
    // even a caller that smuggles one in cannot override it, because the
    // impl overwrites it before delegating to the same routing as web_search.
    await expect(
      tool.process(context, { query: "otters", search_type: "web" })
    ).rejects.toThrow(/no search backend is configured for search_type "images"/);
  });
});

describe("web_search on a shared server", () => {
  const DEPLOYMENT_KEYS = [
    "NODETOOL_NODE_PROFILE",
    "NODETOOL_ENV",
    "OIDC_ISSUER",
    "OIDC_CLIENT_ID",
    "SUPABASE_URL",
    "SUPABASE_KEY"
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of DEPLOYMENT_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env.NODETOOL_NODE_PROFILE = "full";
  });

  afterEach(() => {
    for (const key of DEPLOYMENT_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("offers no host CLI backend on the cloud profile", async () => {
    process.env.NODETOOL_NODE_PROFILE = "cloud";
    claude.available = true;
    antigravity.available = true;
    const tool = asTool(byName("web_search"));
    for (const backend of ["claude", "antigravity"]) {
      await expect(
        tool.process(makeContext({ CLAUDE_CLI_PATH: "/opt/claude" }), {
          query: "otters",
          backend
        })
      ).rejects.toThrow(new RegExp(`unknown backend "${backend}"`));
    }
    expect(claude.answer).not.toHaveBeenCalled();
    expect(antigravity.answer).not.toHaveBeenCalled();
  });

  it("reads the Claude CLI path from the environment when auth is enforced", async () => {
    process.env.OIDC_ISSUER = "https://sso.example";
    process.env.OIDC_CLIENT_ID = "nodetool";
    process.env.CLAUDE_CLI_PATH = "/usr/local/bin/claude";
    claude.available = true;
    claude.answer.mockResolvedValue({ text: "Otters.", citations: [], raw: {} });
    const tool = asTool(byName("web_search"));
    await tool.process(makeContext({ CLAUDE_CLI_PATH: "/home/user/claude" }), {
      query: "otters",
      backend: "claude"
    });
    expect(claude.cliPath).toBe("/usr/local/bin/claude");
  });

  it("does not use the server's SerpAPI key on the cloud profile", async () => {
    process.env.NODETOOL_NODE_PROFILE = "cloud";
    process.env.SERPAPI_API_KEY = "operator-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const tool = asTool(byName("web_search"));
    await expect(
      tool.process(makeContext(), { query: "otters", backend: "serpapi" })
    ).rejects.toThrow(/"serpapi" is not configured/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the server's SerpAPI key on a full profile", async () => {
    process.env.SERPAPI_API_KEY = "local-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ organic_results: [] })
    } as unknown as Response);
    const tool = asTool(byName("web_search"));
    await tool.process(makeContext(), { query: "otters", backend: "serpapi" });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("api_key=local-key");
  });
});

describe("spec text the shipped skills rely on", () => {
  it("the browser tool sends search pages to web_search", async () => {
    const spec = capabilitySpec("browser");
    expect(spec?.description).toContain("`web_search`");
    expect(spec?.description).not.toContain("google_search");
    expect(capabilitySpec("google_search")).toBeUndefined();
    const web = readSourceSync(
      toSourcePath(new URL("../src/capabilities/web.ts", import.meta.url)),
      "utf8"
    );
    expect(web).not.toContain("google_search");
  });
});
