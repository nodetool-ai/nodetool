/**
 * Tests for src/index.ts entry point logic.
 *
 * Since index.ts has side effects (program.parse(), render()), we test the
 * extractable logic: settings merging, tool auto-enable, and argument parsing.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@nodetool-ai/models", () => ({
  initDb: vi.fn(),
  getSecret: vi.fn(async (key: string) => {
    // Simulates looking up secrets from the DB
    const secrets: Record<string, string> = {};
    return secrets[key] ?? null;
  })
}));

vi.mock("@nodetool-ai/config", () => ({
  getDefaultDbPath: vi.fn(() => ":memory:")
}));

// ─── Settings merge logic ─────────────────────────────────────────────────────

describe("settings merge logic (CLI flags override saved settings)", () => {
  it("CLI provider overrides saved setting", () => {
    const saved = { provider: "openai", model: "gpt-4o" };
    const cliOpts = { provider: "anthropic" } as {
      provider?: string;
      model?: string;
    };

    const provider = cliOpts.provider ?? saved.provider;
    expect(provider).toBe("anthropic");
  });

  it("falls back to saved setting when CLI flag is absent", () => {
    const saved = { provider: "openai", model: "gpt-4o" };
    const cliOpts = {} as { provider?: string; model?: string };

    const provider = cliOpts.provider ?? saved.provider;
    const model = cliOpts.model ?? saved.model;
    expect(provider).toBe("openai");
    expect(model).toBe("gpt-4o");
  });

  it("CLI model overrides saved setting", () => {
    const saved = { model: "gpt-4o" };
    const cliOpts = { model: "claude-opus-4-6" } as { model?: string };

    const model = cliOpts.model ?? saved.model;
    expect(model).toBe("claude-opus-4-6");
  });
});

// ─── Agent mode logic ─────────────────────────────────────────────────────────

describe("agent mode resolution", () => {
  it("explicit --agent flag wins", () => {
    const opts = { agent: true, url: undefined } as {
      agent?: boolean;
      url?: string;
    };
    const saved = { agentMode: false };
    const agentMode = opts.agent ?? (opts.url ? false : saved.agentMode);
    expect(agentMode).toBe(true);
  });

  it("defaults to false when --url is provided and no --agent", () => {
    const opts = { agent: undefined, url: "ws://localhost:7777/ws" } as {
      agent?: boolean;
      url?: string;
    };
    const saved = { agentMode: true };
    const agentMode = opts.agent ?? (opts.url ? false : saved.agentMode);
    expect(agentMode).toBe(false);
  });

  it("falls back to saved agentMode when no --url and no --agent", () => {
    const opts = { agent: undefined, url: undefined } as {
      agent?: boolean;
      url?: string;
    };
    const saved = { agentMode: true };
    const agentMode = opts.agent ?? (opts.url ? false : saved.agentMode);
    expect(agentMode).toBe(true);
  });

  it("--agent=false overrides saved settings", () => {
    const opts = { agent: false, url: undefined } as {
      agent?: boolean;
      url?: string;
    };
    const saved = { agentMode: true };
    const agentMode = opts.agent ?? (opts.url ? false : saved.agentMode);
    expect(agentMode).toBe(false);
  });
});

// ─── Enabled tools merging ────────────────────────────────────────────────────

describe("enabled tools merging", () => {
  it("parses comma-separated --tools flag", () => {
    const toolsFlag = "google_search,openai_web_search";
    const enabledTools = toolsFlag.split(",").map((t) => t.trim());
    expect(enabledTools).toEqual(["google_search", "openai_web_search"]);
  });

  it("trims whitespace around tool names", () => {
    const toolsFlag = " google_search , openai_web_search ";
    const enabledTools = toolsFlag.split(",").map((t) => t.trim());
    expect(enabledTools).toEqual(["google_search", "openai_web_search"]);
  });

  it("uses saved enabledTools when no --tools flag", () => {
    const toolsFlag = undefined as string | undefined;
    const savedTools = ["google_search"];
    const enabledTools = toolsFlag
      ? toolsFlag.split(",").map((t) => t.trim())
      : savedTools;
    expect(enabledTools).toEqual(["google_search"]);
  });
});

// ─── Always-on tools injection ────────────────────────────────────────────────

describe("always-on tools injection", () => {
  const alwaysOn = [
    "statistics",
    "geometry",
    "conversion",
    "extract_pdf_text",
    "convert_pdf_to_markdown",
    "convert_document"
  ];

  it("adds all always-on tools to empty list", () => {
    const enabledTools: string[] = [];
    for (const tool of alwaysOn) {
      if (!enabledTools.includes(tool)) enabledTools.push(tool);
    }
    expect(enabledTools).toEqual(alwaysOn);
  });

  it("does not duplicate already-present tools", () => {
    const enabledTools = ["statistics", "geometry"];
    for (const tool of alwaysOn) {
      if (!enabledTools.includes(tool)) enabledTools.push(tool);
    }
    // statistics and geometry should not be duplicated
    expect(enabledTools.filter((t) => t === "statistics").length).toBe(1);
    expect(enabledTools.length).toBe(alwaysOn.length);
  });

  it("preserves existing tools alongside always-on tools", () => {
    const enabledTools = ["google_search"];
    for (const tool of alwaysOn) {
      if (!enabledTools.includes(tool)) enabledTools.push(tool);
    }
    expect(enabledTools).toContain("google_search");
    expect(enabledTools.length).toBe(alwaysOn.length + 1);
  });
});

// ─── Auto-enable logic ───────────────────────────────────────────────────────

describe("autoEnable logic", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables tools when env var is set", async () => {
    const enabledTools: string[] = [];

    async function autoEnable(key: string, tools: string[]): Promise<void> {
      const val = process.env[key] ?? null;
      if (val) {
        for (const tool of tools) {
          if (!enabledTools.includes(tool)) enabledTools.push(tool);
        }
      }
    }

    vi.stubEnv("SERPAPI_API_KEY", "test-key");
    await autoEnable("SERPAPI_API_KEY", [
      "google_search",
      "google_news",
      "google_images"
    ]);

    expect(enabledTools).toContain("google_search");
    expect(enabledTools).toContain("google_news");
    expect(enabledTools).toContain("google_images");
  });

  it("does not enable tools when env var is empty", async () => {
    const enabledTools: string[] = [];

    async function autoEnable(key: string, tools: string[]): Promise<void> {
      const val = process.env[key] ?? null;
      if (val) {
        for (const tool of tools) {
          if (!enabledTools.includes(tool)) enabledTools.push(tool);
        }
      }
    }

    vi.stubEnv("SERPAPI_API_KEY", "");
    await autoEnable("SERPAPI_API_KEY", ["google_search", "google_news"]);

    // Empty string is falsy, so tools should not be enabled
    expect(enabledTools).toEqual([]);
  });

  it("does not enable tools when env var is unset", async () => {
    const enabledTools: string[] = [];

    async function autoEnable(key: string, tools: string[]): Promise<void> {
      const val = process.env[key] ?? null;
      if (val) {
        for (const tool of tools) {
          if (!enabledTools.includes(tool)) enabledTools.push(tool);
        }
      }
    }

    delete process.env["NONEXISTENT_KEY"];
    await autoEnable("NONEXISTENT_KEY", ["tool1"]);

    expect(enabledTools).toEqual([]);
  });

  it("does not add duplicate tools", async () => {
    const enabledTools = ["google_search"];

    async function autoEnable(key: string, tools: string[]): Promise<void> {
      const val = process.env[key] ?? null;
      if (val) {
        for (const tool of tools) {
          if (!enabledTools.includes(tool)) enabledTools.push(tool);
        }
      }
    }

    vi.stubEnv("SERPAPI_API_KEY", "key");
    await autoEnable("SERPAPI_API_KEY", ["google_search", "google_news"]);

    expect(enabledTools.filter((t) => t === "google_search").length).toBe(1);
    expect(enabledTools).toContain("google_news");
  });

  it("multiple autoEnable calls accumulate tools", async () => {
    const enabledTools: string[] = [];

    async function autoEnable(key: string, tools: string[]): Promise<void> {
      const val = process.env[key] ?? null;
      if (val) {
        for (const tool of tools) {
          if (!enabledTools.includes(tool)) enabledTools.push(tool);
        }
      }
    }

    vi.stubEnv("SERPAPI_API_KEY", "key1");
    vi.stubEnv("OPENAI_API_KEY", "key2");

    await Promise.all([
      autoEnable("SERPAPI_API_KEY", ["google_search"]),
      autoEnable("OPENAI_API_KEY", [
        "openai_web_search",
        "openai_image_generation"
      ])
    ]);

    expect(enabledTools).toContain("google_search");
    expect(enabledTools).toContain("openai_web_search");
    expect(enabledTools).toContain("openai_image_generation");
  });
});

// ─── Workspace resolution ─────────────────────────────────────────────────────

describe("workspace resolution", () => {
  it("CLI workspace overrides saved setting", () => {
    const cliOpts = { workspace: "/custom/path" } as {
      workspace?: string;
    };
    const saved = { workspace: "/default/path" };
    const workspace = cliOpts.workspace ?? saved.workspace;
    expect(workspace).toBe("/custom/path");
  });

  it("falls back to saved workspace when CLI flag is absent", () => {
    const cliOpts = {} as { workspace?: string };
    const saved = { workspace: "/saved/path" };
    const workspace = cliOpts.workspace ?? saved.workspace;
    expect(workspace).toBe("/saved/path");
  });
});
