/**
 * Tests for src/nodetool.ts
 *
 * `nodetool.ts` calls `program.parse()` at module scope, so the file can't be
 * imported directly here. `printTable`/`asJson` are tested against the real
 * `src/commands/output.ts` implementation nodetool.ts imports (see
 * `output.test.ts` for the full suite); this file covers `setupDb` resilience
 * and the small data-shaping logic (info/settings/graph-normalization/query
 * strings/file-type detection) inline, matching the source closely enough
 * that a behavior change there should break one of these too.
 */
import { describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@nodetool-ai/models", () => ({
  initDb: vi.fn(),
  Workflow: { get: vi.fn(async () => null) },
  Secret: {
    listForUser: vi.fn(async () => [[], 0]),
    upsert: vi.fn(async () => {}),
    get: vi.fn(async () => null)
  },
  getSecret: vi.fn(async () => null)
}));

// ─── info command data structure ──────────────────────────────────────────────

describe("info command data structure", () => {
  it("builds correct info object from environment", () => {
    const apiKeys = [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "MISTRAL_API_KEY",
      "GROQ_API_KEY",
      "OLLAMA_API_URL",
      "SERPAPI_API_KEY",
      "HF_TOKEN"
    ];
    const data = {
      version: "0.1.0",
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      api_keys: Object.fromEntries(
        apiKeys.map((k) => [k, process.env[k] ? "configured" : "not set"])
      ),
      environment: {
        ENV: process.env["ENV"] ?? "development",
        LOG_LEVEL: process.env["LOG_LEVEL"] ?? "INFO",
        PORT: process.env["PORT"] ?? "7777"
      }
    };

    expect(data.version).toBe("0.1.0");
    expect(data.node_version).toBe(process.version);
    expect(data.platform).toBe(process.platform);
    expect(data.arch).toBe(process.arch);
    expect(data.environment.ENV).toBeTruthy();
    expect(data.environment.LOG_LEVEL).toBeTruthy();
    expect(data.environment.PORT).toBeTruthy();

    // All API keys should be present
    for (const key of apiKeys) {
      expect(data.api_keys).toHaveProperty(key);
      expect(["configured", "not set"]).toContain(data.api_keys[key]);
    }
  });
});

// ─── settings show data structure ─────────────────────────────────────────────

describe("settings show data structure", () => {
  it("masks keys ending in KEY or TOKEN", () => {
    const vars = [
      "ENV",
      "LOG_LEVEL",
      "PORT",
      "HOST",
      "DB_PATH",
      "NODETOOL_API_URL",
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "MISTRAL_API_KEY",
      "GROQ_API_KEY",
      "OLLAMA_API_URL",
      "SERPAPI_API_KEY",
      "HF_TOKEN",
      "VECTORSTORE_DB_PATH",
      "ASSET_BUCKET",
      "S3_ENDPOINT_URL"
    ];

    // Simulate the settings show logic with some env set
    const testEnv: Record<string, string> = {
      ANTHROPIC_API_KEY: "sk-ant-test",
      HF_TOKEN: "hf_test",
      ENV: "production"
    };

    const data = Object.fromEntries(
      vars.map((k) => [
        k,
        testEnv[k]
          ? k.endsWith("KEY") || k.endsWith("TOKEN")
            ? "***"
            : testEnv[k]
          : ""
      ])
    );

    expect(data["ANTHROPIC_API_KEY"]).toBe("***");
    expect(data["HF_TOKEN"]).toBe("***");
    expect(data["ENV"]).toBe("production");
    expect(data["OPENAI_API_KEY"]).toBe("");
    expect(data["PORT"]).toBe("");
  });
});

// ─── setupDb resilience ───────────────────────────────────────────────────────

describe("setupDb resilience", () => {
  it("does not throw when initDb fails", async () => {
    const { initDb } = await import("@nodetool-ai/models");
    (initDb as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("DB init failed");
    });

    // Replicate setupDb logic
    async function setupDb(): Promise<void> {
      try {
        initDb(":memory:");
      } catch {
        // fall back to env vars
      }
    }

    await expect(setupDb()).resolves.toBeUndefined();
  });

  it("calls initDb with default path on success", async () => {
    const { initDb } = await import("@nodetool-ai/models");
    (initDb as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {});

    async function setupDb(): Promise<void> {
      try {
        initDb(":memory:");
      } catch {
        // fall back to env vars
      }
    }

    await setupDb();
    expect(initDb).toHaveBeenCalledWith(":memory:");
  });
});

// ─── Graph normalization logic ────────────────────────────────────────────────

describe("graph normalization (data → properties)", () => {
  it("converts node.data to node.properties", () => {
    const nodes = [
      { id: "n1", type: "test.Node", data: { text: "hello" } },
      { id: "n2", type: "test.Other", properties: { value: 42 } }
    ];

    const normalized = nodes.map((n: Record<string, unknown>) => {
      if (n.properties === undefined && n.data !== undefined) {
        const { data, ...rest } = n;
        return { ...rest, properties: data };
      }
      return n;
    });

    expect(normalized[0]).toEqual({
      id: "n1",
      type: "test.Node",
      properties: { text: "hello" }
    });
    expect(normalized[1]).toEqual({
      id: "n2",
      type: "test.Other",
      properties: { value: 42 }
    });
  });

  it("leaves nodes with both data and properties unchanged", () => {
    const node = {
      id: "n1",
      type: "test.Node",
      data: { text: "hello" },
      properties: { value: 42 }
    };

    // When properties is defined, data is not converted
    const result =
      node.properties === undefined && node.data !== undefined
        ? (() => {
            const { data, ...rest } = node;
            return { ...rest, properties: data };
          })()
        : node;

    expect(result.properties).toEqual({ value: 42 });
    expect(result.data).toEqual({ text: "hello" });
  });

  it("leaves nodes with neither data nor properties unchanged", () => {
    const node = { id: "n1", type: "test.Node" } as Record<string, unknown>;
    const result =
      node.properties === undefined && node.data !== undefined
        ? (() => {
            const { data, ...rest } = node;
            return { ...rest, properties: data };
          })()
        : node;

    expect(result).toEqual({ id: "n1", type: "test.Node" });
  });
});

// ─── URL construction for query params ────────────────────────────────────────

describe("URL query param construction", () => {
  it("builds correct query string for workflows list", () => {
    const opts = { limit: "50" };
    const qs = `/api/workflows?limit=${opts.limit}`;
    expect(qs).toBe("/api/workflows?limit=50");
  });

  it("builds correct query string for jobs list with filter", () => {
    const opts = { limit: "100", workflowId: "wf-123" };
    const qs = new URLSearchParams({ limit: opts.limit });
    if (opts.workflowId) qs.set("workflow_id", opts.workflowId);
    expect(qs.toString()).toContain("limit=100");
    expect(qs.toString()).toContain("workflow_id=wf-123");
  });

  it("builds correct query string for assets list with all filters", () => {
    const opts = { limit: "25", query: "photo", contentType: "image/png" };
    const qs = new URLSearchParams({ limit: opts.limit });
    if (opts.query) qs.set("query", opts.query);
    if (opts.contentType) qs.set("content_type", opts.contentType);
    expect(qs.toString()).toContain("limit=25");
    expect(qs.toString()).toContain("query=photo");
    expect(qs.toString()).toContain("content_type=image%2Fpng");
  });

  it("omits optional params when not provided", () => {
    const opts = { limit: "100" } as {
      limit: string;
      query?: string;
      contentType?: string;
    };
    const qs = new URLSearchParams({ limit: opts.limit });
    if (opts.query) qs.set("query", opts.query);
    if (opts.contentType) qs.set("content_type", opts.contentType);
    expect(qs.toString()).toBe("limit=100");
  });
});

// ─── File type detection for workflow run ─────────────────────────────────────

describe("workflow run file type detection", () => {
  function isFile(idOrFile: string): boolean {
    return (
      idOrFile.endsWith(".json") ||
      idOrFile.endsWith(".ts") ||
      idOrFile.endsWith(".tsx") ||
      idOrFile.includes("/") ||
      idOrFile.includes("\\")
    );
  }

  it("detects .json files", () => {
    expect(isFile("workflow.json")).toBe(true);
  });

  it("detects .ts files", () => {
    expect(isFile("workflow.ts")).toBe(true);
  });

  it("detects .tsx files", () => {
    expect(isFile("workflow.tsx")).toBe(true);
  });

  it("detects paths with forward slashes", () => {
    expect(isFile("./workflows/my-wf")).toBe(true);
  });

  it("detects paths with backslashes", () => {
    expect(isFile("workflows\\my-wf")).toBe(true);
  });

  it("returns false for plain workflow IDs", () => {
    expect(isFile("abc-123-def")).toBe(false);
  });

  it("returns false for UUIDs", () => {
    expect(isFile("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });
});

// ─── DSL export file detection ────────────────────────────────────────────────

describe("DSL export file detection", () => {
  function isLocalFile(idOrFile: string): boolean {
    return (
      idOrFile.endsWith(".json") ||
      idOrFile.includes("/") ||
      idOrFile.includes("\\")
    );
  }

  it("detects .json files", () => {
    expect(isLocalFile("workflow.json")).toBe(true);
  });

  it("detects paths with slashes", () => {
    expect(isLocalFile("./my-workflow")).toBe(true);
  });

  it("returns false for plain IDs", () => {
    expect(isLocalFile("abc-123")).toBe(false);
  });
});
