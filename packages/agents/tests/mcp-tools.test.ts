import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool/runtime";
import {
  ListWorkflowsTool,
  GetWorkflowTool,
  CreateWorkflowTool,
  RunWorkflowTool,
  ValidateWorkflowTool,
  GetExampleWorkflowTool,
  ExportWorkflowDigraphTool,
  ListNodesTool,
  SearchNodesTool,
  GetNodeInfoTool,
  ListJobsTool,
  GetJobTool,
  GetJobLogsTool,
  StartBackgroundJobTool,
  ListAssetsTool,
  GetAssetTool,
  ListModelsTool,
  getAllMcpTools
} from "../src/tools/mcp-tools.js";

const API_URL = "http://test-api:7777";

function makeMockContext(): ProcessingContext {
  return {
    userId: "user-1",
    environment: { NODETOOL_API_URL: API_URL }
  } as unknown as ProcessingContext;
}

let ctx: ProcessingContext;
let fetchSpy: ReturnType<typeof vi.fn>;
const origFetch = globalThis.fetch;

beforeEach(() => {
  ctx = makeMockContext();
  fetchSpy = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
    text: async () => ""
  });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

function lastFetchUrl(): string {
  return String(fetchSpy.mock.calls[0]?.[0] ?? "");
}

function lastFetchOpts(): RequestInit {
  return (fetchSpy.mock.calls[0]?.[1] ?? {}) as RequestInit;
}

// ---------------------------------------------------------------------------
// Workflow Tools
// ---------------------------------------------------------------------------

describe("ListWorkflowsTool", () => {
  const tool = new ListWorkflowsTool();

  it("has correct name and schema", () => {
    expect(tool.name).toBe("list_workflows");
    expect(tool.toProviderTool().inputSchema).toBeDefined();
  });

  it("calls GET /api/workflows/ for user type", async () => {
    await tool.process(ctx, { workflow_type: "user" });
    expect(lastFetchUrl()).toContain("/api/workflows/");
    expect(lastFetchOpts().method).toBeUndefined(); // GET (default)
  });

  it("calls GET /api/workflows/examples for example type", async () => {
    await tool.process(ctx, { workflow_type: "example" });
    expect(lastFetchUrl()).toContain("/api/workflows/examples");
  });

  it("userMessage reflects query", () => {
    expect(tool.userMessage({ query: "test" })).toContain("test");
    expect(tool.userMessage({})).toContain("user");
  });
});

describe("GetWorkflowTool", () => {
  const tool = new GetWorkflowTool();

  it("calls GET /api/workflows/:id", async () => {
    await tool.process(ctx, { workflow_id: "wf-123" });
    expect(lastFetchUrl()).toContain("/api/workflows/wf-123");
  });

  it("userMessage includes workflow_id", () => {
    expect(tool.userMessage({ workflow_id: "wf-1" })).toContain("wf-1");
  });
});

describe("CreateWorkflowTool", () => {
  const tool = new CreateWorkflowTool();

  it("calls POST /api/workflows/ with body", async () => {
    await tool.process(ctx, {
      name: "Test WF",
      graph: { nodes: [], edges: [] }
    });
    expect(lastFetchUrl()).toContain("/api/workflows/");
    expect(lastFetchOpts().method).toBe("POST");
    const body = JSON.parse(lastFetchOpts().body as string);
    expect(body.name).toBe("Test WF");
    expect(body.graph).toEqual({ nodes: [], edges: [] });
  });

  it("userMessage includes name", () => {
    expect(tool.userMessage({ name: "My WF" })).toContain("My WF");
  });
});

describe("RunWorkflowTool", () => {
  const tool = new RunWorkflowTool();

  it("calls POST /api/workflows/:id/run", async () => {
    await tool.process(ctx, { workflow_id: "wf-456" });
    expect(lastFetchUrl()).toContain("/api/workflows/wf-456/run");
    expect(lastFetchOpts().method).toBe("POST");
  });
});

describe("ValidateWorkflowTool", () => {
  const tool = new ValidateWorkflowTool();

  it("calls GET /api/workflows/:id", async () => {
    await tool.process(ctx, { workflow_id: "wf-789" });
    expect(lastFetchUrl()).toContain("/api/workflows/wf-789");
  });
});

describe("GetExampleWorkflowTool", () => {
  const tool = new GetExampleWorkflowTool();

  it("calls GET /api/workflows/examples/:pkg/:name", async () => {
    await tool.process(ctx, {
      package_name: "base",
      example_name: "hello"
    });
    expect(lastFetchUrl()).toContain("/api/workflows/examples/base/hello");
  });
});

describe("ExportWorkflowDigraphTool", () => {
  const tool = new ExportWorkflowDigraphTool();

  it("calls GET /api/workflows/:id/dsl-export", async () => {
    await tool.process(ctx, { workflow_id: "wf-export" });
    expect(lastFetchUrl()).toContain("/api/workflows/wf-export/dsl-export");
  });
});

// ---------------------------------------------------------------------------
// Node Tools
// ---------------------------------------------------------------------------

describe("ListNodesTool", () => {
  const tool = new ListNodesTool();

  it("calls GET /api/nodes/metadata", async () => {
    await tool.process(ctx, {});
    expect(lastFetchUrl()).toContain("/api/nodes/metadata");
  });

  it("passes namespace filter", async () => {
    await tool.process(ctx, { namespace: "nodetool.text" });
    expect(lastFetchUrl()).toContain("namespace=nodetool.text");
  });
});

describe("SearchNodesTool", () => {
  const tool = new SearchNodesTool();

  it("sends query as comma-separated string", async () => {
    await tool.process(ctx, { query: ["image", "resize"] });
    expect(lastFetchUrl()).toContain("query=image%2Cresize");
  });
});

describe("GetNodeInfoTool", () => {
  const tool = new GetNodeInfoTool();

  it("passes node_type as query param", async () => {
    await tool.process(ctx, { node_type: "nodetool.text.Concat" });
    expect(lastFetchUrl()).toContain("node_type=nodetool.text.Concat");
  });
});

// ---------------------------------------------------------------------------
// Job Tools
// ---------------------------------------------------------------------------

describe("ListJobsTool", () => {
  const tool = new ListJobsTool();

  it("calls GET /api/jobs/", async () => {
    await tool.process(ctx, {});
    expect(lastFetchUrl()).toContain("/api/jobs/");
  });

  it("passes workflow_id filter", async () => {
    await tool.process(ctx, { workflow_id: "wf-abc" });
    expect(lastFetchUrl()).toContain("workflow_id=wf-abc");
  });
});

describe("GetJobTool", () => {
  const tool = new GetJobTool();

  it("calls GET /api/jobs/:id", async () => {
    await tool.process(ctx, { job_id: "job-123" });
    expect(lastFetchUrl()).toContain("/api/jobs/job-123");
  });

  it("userMessage includes job_id", () => {
    expect(tool.userMessage({ job_id: "job-xyz" })).toContain("job-xyz");
  });
});

describe("GetJobLogsTool", () => {
  const tool = new GetJobLogsTool();

  it("calls GET /api/jobs/:id", async () => {
    await tool.process(ctx, { job_id: "job-456" });
    expect(lastFetchUrl()).toContain("/api/jobs/job-456");
  });

  it("userMessage includes job_id", () => {
    expect(tool.userMessage({ job_id: "job-789" })).toContain("job-789");
  });
});

describe("StartBackgroundJobTool", () => {
  const tool = new StartBackgroundJobTool();

  it("calls POST /api/workflows/:id/run with background flag", async () => {
    await tool.process(ctx, { workflow_id: "wf-bg" });
    expect(lastFetchUrl()).toContain("/api/workflows/wf-bg/run");
    expect(lastFetchOpts().method).toBe("POST");
    const body = JSON.parse(lastFetchOpts().body as string);
    expect(body.background).toBe(true);
  });

  it("userMessage includes workflow_id", () => {
    expect(tool.userMessage({ workflow_id: "wf-123" })).toContain("wf-123");
  });
});

// ---------------------------------------------------------------------------
// Asset Tools
// ---------------------------------------------------------------------------

describe("ListAssetsTool", () => {
  const tool = new ListAssetsTool();

  it("calls GET /api/assets/ for user source", async () => {
    await tool.process(ctx, {});
    expect(lastFetchUrl()).toContain("/api/assets/");
  });

  it("calls GET /api/assets/packages for package source", async () => {
    await tool.process(ctx, { source: "package" });
    expect(lastFetchUrl()).toContain("/api/assets/packages");
  });

  it("calls GET /api/assets/search when query provided", async () => {
    await tool.process(ctx, { query: "logo" });
    expect(lastFetchUrl()).toContain("/api/assets/search");
    expect(lastFetchUrl()).toContain("query=logo");
  });

  it("userMessage includes query when given", () => {
    expect(tool.userMessage({ query: "my logo" })).toContain("my logo");
  });

  it("userMessage says listing when no query", () => {
    expect(tool.userMessage({})).toContain("Listing");
  });
});

describe("GetAssetTool", () => {
  const tool = new GetAssetTool();

  it("calls GET /api/assets/:id", async () => {
    await tool.process(ctx, { asset_id: "asset-789" });
    expect(lastFetchUrl()).toContain("/api/assets/asset-789");
  });

  it("userMessage includes asset id", () => {
    expect(tool.userMessage({ asset_id: "abc-123" })).toContain("abc-123");
  });
});

// ---------------------------------------------------------------------------
// Model Tools
// ---------------------------------------------------------------------------

describe("ListModelsTool", () => {
  const tool = new ListModelsTool();

  it("calls GET /api/models/all", async () => {
    await tool.process(ctx, {});
    expect(lastFetchUrl()).toContain("/api/models/all");
  });

  it("passes provider filter", async () => {
    await tool.process(ctx, { provider: "openai" });
    expect(lastFetchUrl()).toContain("provider=openai");
  });

  it("userMessage includes provider", () => {
    expect(tool.userMessage({ provider: "anthropic" })).toContain("anthropic");
  });

  it("userMessage uses 'all' when no provider given", () => {
    expect(tool.userMessage({})).toContain("all");
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("API error handling", () => {
  it("returns error object on non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not Found"
    });

    const tool = new GetWorkflowTool();
    const result = (await tool.process(ctx, {
      workflow_id: "nope"
    })) as Record<string, unknown>;
    expect(result.error).toContain("404");
    expect(result.error).toContain("Not Found");
  });
});

// ---------------------------------------------------------------------------
// getAllMcpTools
// ---------------------------------------------------------------------------

describe("getAllMcpTools", () => {
  it("returns all 17 tool instances by default (REST node tools)", () => {
    const tools = getAllMcpTools();
    expect(tools.length).toBe(17);
    const names = tools.map((t) => t.name);
    expect(names).toContain("list_workflows");
    expect(names).toContain("get_workflow");
    expect(names).toContain("create_workflow");
    expect(names).toContain("run_workflow");
    expect(names).toContain("validate_workflow");
    expect(names).toContain("get_example_workflow");
    expect(names).toContain("export_workflow_digraph");
    expect(names).toContain("list_nodes");
    expect(names).toContain("search_nodes");
    expect(names).toContain("get_node_info");
    expect(names).toContain("list_jobs");
    expect(names).toContain("get_job");
    expect(names).toContain("get_job_logs");
    expect(names).toContain("start_background_job");
    expect(names).toContain("list_assets");
    expect(names).toContain("get_asset");
    expect(names).toContain("list_models");
  });

  it("swaps in local biased node tools when a registry is provided", () => {
    const registry = {
      listMetadata: () => [],
      getMetadata: () => undefined
    } as unknown as Parameters<typeof getAllMcpTools>[0]["registry"];
    const tools = getAllMcpTools({ registry });
    const names = tools.map((t) => t.name);
    // Local versions still expose the same agent-facing names.
    expect(names.filter((n) => n === "list_nodes").length).toBe(1);
    expect(names.filter((n) => n === "search_nodes").length).toBe(1);
    expect(names.filter((n) => n === "get_node_info").length).toBe(1);
    // No find_model unless providers are also passed.
    expect(names).not.toContain("find_model");
  });

  it("adds find_model when providers are supplied alongside the registry", () => {
    const registry = {
      listMetadata: () => [],
      getMetadata: () => undefined
    } as unknown as Parameters<typeof getAllMcpTools>[0]["registry"];
    const tools = getAllMcpTools({ registry, providers: { fake: {} as any } });
    expect(tools.map((t) => t.name)).toContain("find_model");
  });

  it("all tools have valid toProviderTool()", () => {
    for (const tool of getAllMcpTools()) {
      const pt = tool.toProviderTool();
      expect(pt.name).toBeTruthy();
      expect(pt.description).toBeTruthy();
      expect(pt.inputSchema).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

describe("request headers", () => {
  it("includes X-User-Id from context", async () => {
    const tool = new ListWorkflowsTool();
    await tool.process(ctx, {});
    const headers = lastFetchOpts().headers as Record<string, string>;
    expect(headers["X-User-Id"]).toBe("user-1");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
