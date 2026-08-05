import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi
} from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initTestDb, Workflow, Job, Asset } from "@nodetool-ai/models";
import { getBuiltinTools, getAllMcpTools } from "@nodetool-ai/agents";
import type { NodeMetadata, NodeRegistry } from "@nodetool-ai/node-sdk";
import type { AgentTransport } from "../src/agent/transport.js";

// The collection tools dynamically `await import("@nodetool-ai/vectorstore")`.
// Mock it so we can drive both the happy path and the "not available" catch.
vi.mock("@nodetool-ai/vectorstore", () => ({
  getDefaultVectorProvider: vi.fn()
}));

import { getDefaultVectorProvider } from "@nodetool-ai/vectorstore";
import {
  createMcpServer,
  registerMcpFrontendTransport,
  setActiveMcpFrontendRenderer,
  unregisterMcpFrontendTransport,
  getLocalMcpServerUrl,
  handleMcpHttpRequest
} from "../src/mcp-server.js";

const getVectorProviderMock = vi.mocked(getDefaultVectorProvider);

type ToolResponse = {
  content: Array<{ type?: string; text?: string; data?: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

function callTool(
  server: ReturnType<typeof createMcpServer>,
  name: string,
  args: Record<string, unknown>
): Promise<ToolResponse> {
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: Record<string, unknown>) => Promise<unknown> }
      >;
    }
  )._registeredTools;
  return tools[name].handler(args) as Promise<ToolResponse>;
}

function meta(partial: Partial<NodeMetadata>): NodeMetadata {
  return {
    node_type: "test.Node",
    title: "Node",
    description: "",
    namespace: "test",
    layout: "default",
    properties: [],
    outputs: [],
    ...partial
  } as unknown as NodeMetadata;
}

function fakeRegistry(nodes: NodeMetadata[]): NodeRegistry {
  return {
    listMetadata: () => nodes
  } as unknown as NodeRegistry;
}

function fakeTransport(
  id: string,
  executeTool: AgentTransport["executeTool"] = async () => ({ ok: true })
): AgentTransport {
  return {
    id,
    isAlive: true,
    streamMessage: () => {},
    requestToolManifest: async () => [],
    executeTool,
    abortTools: () => {}
  };
}

beforeEach(() => {
  initTestDb();
  getVectorProviderMock.mockReset();
});

describe("run_workflow error paths", () => {
  it("returns an error when the workflow does not exist", async () => {
    const server = createMcpServer();
    const res = await callTool(server, "run_workflow", {
      user_id: "u1",
      workflow_id: "missing",
      params: {}
    });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text!) as { error: string };
    expect(body.error).toBe("Workflow not found");
  });

  it("rejects a workflow whose run_mode is not 'workflow'", async () => {
    const workflow = (await Workflow.create({
      user_id: "u1",
      name: "Chat mode wf",
      access: "private",
      run_mode: "chat",
      graph: { nodes: [], edges: [] }
    })) as Workflow;
    const server = createMcpServer();
    const res = await callTool(server, "run_workflow", {
      user_id: "u1",
      workflow_id: workflow.id,
      params: {}
    });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text!) as { error: string };
    expect(body.error).toContain('run mode "chat" is not supported');
  });
});

describe("get_asset", () => {
  it("returns an error when the asset is missing", async () => {
    const server = createMcpServer();
    const res = await callTool(server, "get_asset", {
      user_id: "u1",
      asset_id: "nope"
    });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text!) as { error: string };
    expect(body.error).toBe("Asset not found");
  });

  it("returns the asset payload when found", async () => {
    const asset = (await Asset.create({
      user_id: "u1",
      name: "doc.txt",
      content_type: "text/plain"
    })) as Asset;
    const server = createMcpServer();
    const res = await callTool(server, "get_asset", {
      user_id: "u1",
      asset_id: asset.id
    });
    expect(res.isError).not.toBe(true);
    const body = JSON.parse(res.content[0].text!) as { id: string; name: string };
    expect(body.id).toBe(asset.id);
    expect(body.name).toBe("doc.txt");
    expect(res.structuredContent).toBeDefined();
  });
});

describe("get_job", () => {
  it("returns an error when the job is missing", async () => {
    const server = createMcpServer();
    const res = await callTool(server, "get_job", {
      user_id: "u1",
      job_id: "missing"
    });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text!) as { error: string };
    expect(body.error).toBe("Job not found");
  });

  it("returns the job payload when found", async () => {
    const job = (await Job.create({
      user_id: "u1",
      workflow_id: "wf-1",
      status: "running"
    })) as Job;
    const server = createMcpServer();
    const res = await callTool(server, "get_job", {
      user_id: "u1",
      job_id: job.id
    });
    expect(res.isError).not.toBe(true);
    const body = JSON.parse(res.content[0].text!) as { id: string };
    expect(body.id).toBe(job.id);
    expect(res.structuredContent).toBeDefined();
  });
});

describe("get_node_info / list_nodes / search_nodes with an injected registry", () => {
  const nodes = [
    meta({
      node_type: "test.Alpha",
      title: "Alpha",
      description: "First test node",
      namespace: "test"
    }),
    meta({
      node_type: "image.Resize",
      title: "Resize",
      description: "Resize an image",
      namespace: "image"
    })
  ];

  it("get_node_info returns metadata for a known node", async () => {
    const server = createMcpServer({ registry: fakeRegistry(nodes) });
    const res = await callTool(server, "get_node_info", {
      node_type: "image.Resize"
    });
    expect(res.isError).not.toBe(true);
    const body = JSON.parse(res.content[0].text!) as { node_type: string };
    expect(body.node_type).toBe("image.Resize");
  });

  it("get_node_info errors for an unknown node type", async () => {
    const server = createMcpServer({ registry: fakeRegistry(nodes) });
    const res = await callTool(server, "get_node_info", {
      node_type: "does.not.Exist"
    });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text!) as { error: string };
    expect(body.error).toBe("Node type not found");
  });

  it("list_nodes filters by namespace and applies the limit", async () => {
    const server = createMcpServer({ registry: fakeRegistry(nodes) });
    const res = await callTool(server, "list_nodes", {
      namespace: "image",
      limit: 200
    });
    expect(res.isError).not.toBe(true);
    const body = JSON.parse(res.content[0].text!) as Array<{ node_type: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].node_type).toBe("image.Resize");
  });

  it("list_nodes with no namespace returns all, respecting limit", async () => {
    const server = createMcpServer({ registry: fakeRegistry(nodes) });
    const res = await callTool(server, "list_nodes", { limit: 1 });
    const body = JSON.parse(res.content[0].text!) as Array<{ node_type: string }>;
    expect(body).toHaveLength(1);
  });

  it("search_nodes ranks matching nodes", async () => {
    const server = createMcpServer({ registry: fakeRegistry(nodes) });
    const res = await callTool(server, "search_nodes", {
      query: ["resize", "image"],
      n_results: 5
    });
    expect(res.isError).not.toBe(true);
    const body = JSON.parse(res.content[0].text!) as Array<{
      node_type: string;
      score: number;
    }>;
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].node_type).toBe("image.Resize");
  });
});

describe("collection tools", () => {
  it("get_collection returns collection details on success", async () => {
    getVectorProviderMock.mockReturnValue({
      getCollection: async () => ({
        name: "docs",
        metadata: { kind: "notes" },
        count: async () => 3
      })
    } as never);
    const server = createMcpServer();
    const res = await callTool(server, "get_collection", { name: "docs" });
    expect(res.isError).not.toBe(true);
    const body = JSON.parse(res.content[0].text!) as {
      name: string;
      count: number;
    };
    expect(body.name).toBe("docs");
    expect(body.count).toBe(3);
  });

  it("get_collection reports when the vector store is unavailable", async () => {
    getVectorProviderMock.mockImplementation(() => {
      throw new Error("no vec");
    });
    const server = createMcpServer();
    const res = await callTool(server, "get_collection", { name: "docs" });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text!) as { error: string };
    expect(body.error).toBe("Vector store not available");
  });

  it("query_collection returns per-query result matrices", async () => {
    getVectorProviderMock.mockReturnValue({
      getCollection: async () => ({
        query: async ({ text }: { text: string }) => [
          {
            id: `${text}-1`,
            document: "doc",
            metadata: { a: 1 },
            distance: 0.5
          }
        ]
      })
    } as never);
    const server = createMcpServer();
    const res = await callTool(server, "query_collection", {
      name: "docs",
      query_texts: ["hello", "world"],
      n_results: 5
    });
    expect(res.isError).not.toBe(true);
    const body = JSON.parse(res.content[0].text!) as {
      ids: string[][];
      distances: number[][];
    };
    expect(body.ids).toHaveLength(2);
    expect(body.ids[0][0]).toBe("hello-1");
    expect(body.distances[1][0]).toBe(0.5);
  });

  it("query_collection reports when the vector store is unavailable", async () => {
    getVectorProviderMock.mockImplementation(() => {
      throw new Error("boom");
    });
    const server = createMcpServer();
    const res = await callTool(server, "query_collection", {
      name: "docs",
      query_texts: ["x"],
      n_results: 5
    });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text!) as { error: string };
    expect(body.error).toBe("Vector store not available");
  });

  it("list_collections returns collections and resolves workflow names", async () => {
    const workflow = (await Workflow.create({
      user_id: "1",
      name: "Linked WF",
      access: "private",
      graph: { nodes: [], edges: [] }
    })) as Workflow;
    getVectorProviderMock.mockReturnValue({
      listCollections: async () => [
        { name: "c1", metadata: { workflow: workflow.id } },
        { name: "c2", metadata: {} }
      ],
      getCollection: async () => ({ count: async () => 2 })
    } as never);
    const server = createMcpServer();
    const res = await callTool(server, "list_collections", { limit: 50 });
    expect(res.isError).not.toBe(true);
    const body = JSON.parse(res.content[0].text!) as {
      collections: Array<{ name: string; workflow_name: string | null }>;
      count: number;
    };
    expect(body.count).toBe(2);
    const c1 = body.collections.find((c) => c.name === "c1");
    expect(c1?.workflow_name).toBe("Linked WF");
    const c2 = body.collections.find((c) => c.name === "c2");
    expect(c2?.workflow_name).toBeNull();
  });

  it("list_collections reports when the vector store is unavailable", async () => {
    getVectorProviderMock.mockImplementation(() => {
      throw new Error("down");
    });
    const server = createMcpServer();
    const res = await callTool(server, "list_collections", { limit: 50 });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text!) as { error: string };
    expect(body.error).toBe("Vector store not available");
  });
});

describe("ui_ tool error handling", () => {
  it("returns isError when the renderer's executeTool throws", async () => {
    const transport = fakeTransport("r-err", async () => {
      throw new Error("kaboom");
    });
    registerMcpFrontendTransport(transport);
    try {
      const server = createMcpServer();
      const res = await callTool(server, "ui_get_graph", { renderer_id: "r-err" });
      expect(res.isError).toBe(true);
      const body = JSON.parse(res.content[0].text!) as { error: string };
      expect(body.error).toContain("kaboom");
    } finally {
      unregisterMcpFrontendTransport(transport);
    }
  });

  it("stringifies a non-string tool result as JSON", async () => {
    const transport = fakeTransport("r-obj", async () => ({ nodes: 2 }));
    registerMcpFrontendTransport(transport);
    try {
      const server = createMcpServer();
      const res = await callTool(server, "ui_get_graph", { renderer_id: "r-obj" });
      expect(res.isError).not.toBe(true);
      const body = JSON.parse(res.content[0].text!) as { nodes: number };
      expect(body.nodes).toBe(2);
    } finally {
      unregisterMcpFrontendTransport(transport);
    }
  });

  it("passes a string tool result through verbatim", async () => {
    const transport = fakeTransport("r-str", async () => "plain-text-result");
    registerMcpFrontendTransport(transport);
    try {
      const server = createMcpServer();
      const res = await callTool(server, "ui_get_graph", { renderer_id: "r-str" });
      expect(res.isError).not.toBe(true);
      expect(res.content[0].text).toBe("plain-text-result");
    } finally {
      unregisterMcpFrontendTransport(transport);
    }
  });
});

describe("frontend renderer registration lifecycle", () => {
  it("unregistering the active renderer promotes another live one", async () => {
    const a = fakeTransport("life-a");
    const b = fakeTransport("life-b");
    registerMcpFrontendTransport(a);
    registerMcpFrontendTransport(b); // b becomes active
    try {
      unregisterMcpFrontendTransport(b);
      const server = createMcpServer();
      // With b gone, a routes as the fallback/active renderer.
      const res = await callTool(server, "ui_get_graph", {});
      expect(res.isError).not.toBe(true);
    } finally {
      unregisterMcpFrontendTransport(a);
    }
  });

  it("setActiveMcpFrontendRenderer only promotes registered renderers", async () => {
    const a = fakeTransport("act-a");
    const b = fakeTransport("act-b");
    registerMcpFrontendTransport(a);
    registerMcpFrontendTransport(b); // active = b
    const unregistered = fakeTransport("ghost");
    try {
      // Promoting an unregistered renderer is a no-op; active stays b.
      setActiveMcpFrontendRenderer(unregistered);
      const server = createMcpServer();
      const res = await callTool(server, "list_renderers", {});
      const body = JSON.parse(res.content[0].text!) as {
        renderers: Array<{ renderer_id: string; active: boolean }>;
      };
      expect(body.renderers.find((r) => r.renderer_id === "act-b")?.active).toBe(
        true
      );
      // Now promote a; it is registered so it becomes active.
      setActiveMcpFrontendRenderer(a);
      const res2 = await callTool(server, "list_renderers", {});
      const body2 = JSON.parse(res2.content[0].text!) as {
        renderers: Array<{ renderer_id: string; active: boolean }>;
      };
      expect(body2.renderers.find((r) => r.renderer_id === "act-a")?.active).toBe(
        true
      );
    } finally {
      unregisterMcpFrontendTransport(a);
      unregisterMcpFrontendTransport(b);
    }
  });

  it("a dead (isAlive:false) renderer is not routed to", async () => {
    const dead = fakeTransport("dead");
    (dead as { isAlive: boolean }).isAlive = false;
    registerMcpFrontendTransport(dead);
    try {
      const server = createMcpServer();
      const res = await callTool(server, "ui_get_graph", { renderer_id: "dead" });
      expect(res.isError).toBe(true);
    } finally {
      unregisterMcpFrontendTransport(dead);
    }
  });
});

describe("getLocalMcpServerUrl", () => {
  const original = { PORT: process.env["PORT"], TLS_CERT: process.env["TLS_CERT"], TLS_KEY: process.env["TLS_KEY"] };
  afterEach(() => {
    if (original.PORT === undefined) delete process.env["PORT"];
    else process.env["PORT"] = original.PORT;
    if (original.TLS_CERT === undefined) delete process.env["TLS_CERT"];
    else process.env["TLS_CERT"] = original.TLS_CERT;
    if (original.TLS_KEY === undefined) delete process.env["TLS_KEY"];
    else process.env["TLS_KEY"] = original.TLS_KEY;
  });

  it("builds an http URL with the default port when no TLS is configured", () => {
    delete process.env["PORT"];
    delete process.env["TLS_CERT"];
    delete process.env["TLS_KEY"];
    expect(getLocalMcpServerUrl()).toBe("http://127.0.0.1:7777/mcp");
  });

  it("uses https and the configured port when TLS is set", () => {
    process.env["PORT"] = "8443";
    process.env["TLS_CERT"] = "/tmp/cert.pem";
    process.env["TLS_KEY"] = "/tmp/key.pem";
    expect(getLocalMcpServerUrl()).toBe("https://127.0.0.1:8443/mcp");
  });
});

describe("bridged agent tools (the full agent toolbelt)", () => {
  function toolNames(server: ReturnType<typeof createMcpServer>): string[] {
    const tools = (
      server as unknown as {
        _registeredTools: Record<string, unknown>;
      }
    )._registeredTools;
    return Object.keys(tools);
  }

  const scope = { userId: "1", source: "stdio-local" as const };

  // The bridged file tools are rooted under the NodeTool data dir, and
  // constructing the server creates that directory. Point it at a temp dir so
  // the suite never touches the developer's real workspace.
  let dataDir: string;
  const dataDirEnv = process.platform === "win32" ? "APPDATA" : "XDG_DATA_HOME";
  let previousDataDir: string | undefined;

  beforeAll(() => {
    previousDataDir = process.env[dataDirEnv];
    dataDir = mkdtempSync(join(tmpdir(), "nodetool-mcp-test-"));
    process.env[dataDirEnv] = dataDir;
  });

  afterAll(() => {
    if (previousDataDir === undefined) delete process.env[dataDirEnv];
    else process.env[dataDirEnv] = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("registers the workflow-building and creative tools alongside native ones", () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const names = new Set(toolNames(server));
    // Workflow-building tools bridged from @nodetool-ai/agents.
    for (const t of [
      "create_workflow",
      "debug_workflow",
      "resolve_workflow_escalation",
      "build_app",
      "debug_app",
      "validate_workflow",
      "validate_timeline",
      "validate_sketch",
      "list_models",
      "get_example_workflow",
      "export_workflow_digraph",
      "get_job_logs",
      "start_background_job",
      "save_asset",
      "read_asset",
      "find_model"
    ]) {
      expect(names.has(t)).toBe(true);
    }
    // Creative media tools.
    for (const t of [
      "generate_image",
      "edit_image",
      "generate_video",
      "animate_image",
      "generate_speech",
      "transcribe_audio",
      "embed_text"
    ]) {
      expect(names.has(t)).toBe(true);
    }
    // Native tools remain registered (not shadowed by the bridge).
    for (const t of ["run_workflow", "list_workflows", "list_nodes", "get_job"]) {
      expect(names.has(t)).toBe(true);
    }
  });

  it("exposes every built-in agent tool, except names a native tool owns", () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const names = new Set(toolNames(server));
    const native = new Set(toolNames(createMcpServer()));
    for (const tool of getBuiltinTools()) {
      if (native.has(tool.name)) continue;
      expect(names.has(tool.name)).toBe(true);
    }
  });

  it("exposes the agent MCP catalog, except names a native tool owns", () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const names = new Set(toolNames(server));
    const native = new Set(toolNames(createMcpServer()));
    for (const tool of getAllMcpTools({})) {
      if (native.has(tool.name)) continue;
      expect(names.has(tool.name)).toBe(true);
    }
  });

  it("lets the native tool win every name the bridge also offers", () => {
    // The native list_workflows / get_asset / list_nodes render thumbnails and
    // MCP Apps; the agent catalog offers plain-JSON tools under the same names.
    // The bridge must skip those rather than shadow them or throw.
    const bridgedNames = new Set(
      [...getBuiltinTools(), ...getAllMcpTools({})].map((t) => t.name)
    );
    const native = new Set(toolNames(createMcpServer()));
    const overlap = [...bridgedNames].filter((n) => native.has(n));
    expect(overlap.length).toBeGreaterThan(0);

    const server = createMcpServer({ agentToolsScope: scope });
    const tools = (
      server as unknown as {
        _registeredTools: Record<string, { description?: string }>;
      }
    )._registeredTools;
    const nativeServer = (
      createMcpServer() as unknown as {
        _registeredTools: Record<string, { description?: string }>;
      }
    )._registeredTools;
    for (const name of overlap) {
      expect(tools[name].description).toBe(nativeServer[name].description);
    }
  });

  it("roots file tools in a per-user workspace directory", async () => {
    const { __mcpWorkspaceDirForTests } = await import(
      "../src/mcp-agent-tools.js"
    );
    expect(__mcpWorkspaceDirForTests("user-a")).not.toBe(
      __mcpWorkspaceDirForTests("user-b")
    );
    // A user id reaches the filesystem as a path segment — it must not escape.
    expect(__mcpWorkspaceDirForTests("../../etc")).not.toContain("..");
  });

  it("write_file and read_file round-trip through the workspace", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const written = await callTool(server, "write_file", {
      file_path: "mcp-roundtrip.txt",
      content: "hello"
    });
    expect(written.isError).toBeUndefined();
    const read = await callTool(server, "read_file", {
      file_path: "mcp-roundtrip.txt"
    });
    expect(read.content[0].text).toContain("hello");
  });

  it("does NOT register bridged tools on a session without a user scope", () => {
    const server = createMcpServer();
    const names = new Set(toolNames(server));
    for (const t of ["generate_image", "save_asset", "create_workflow"]) {
      expect(names.has(t)).toBe(false);
    }
    // Native tools are unaffected — they take user_id per call.
    for (const t of ["run_workflow", "list_workflows", "list_nodes"]) {
      expect(names.has(t)).toBe(true);
    }
  });

  it("binds bridged tools to the scoped user, not a global default", async () => {
    const { __buildAgentToolContextForTests } = await import(
      "../src/mcp-agent-tools.js"
    );
    const ctxA = __buildAgentToolContextForTests("user-a");
    const ctxB = __buildAgentToolContextForTests("user-b");
    expect(ctxA.userId).toBe("user-a");
    expect(ctxB.userId).toBe("user-b");
  });

  it("validate_workflow returns an actionable error when given no graph", async () => {
    const server = createMcpServer({ registry: fakeRegistry([]), agentToolsScope: scope });
    const res = await callTool(server, "validate_workflow", {});
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text!) as { error: string };
    expect(body.error).toContain("No graph to validate");
  });

  it("validate_timeline validates an inline document", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const res = await callTool(server, "validate_timeline", {
      document: { tracks: [], clips: [], markers: [] }
    });
    const body = JSON.parse(res.content[0].text!) as {
      ok: boolean;
      summary: string;
    };
    expect(body.ok).toBe(true);
    expect(body.summary).toBe("No issues found.");
  });

  it("validate_sketch validates an inline document", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const res = await callTool(server, "validate_sketch", {
      document: {
        sketch: {
          version: 3,
          canvas: { width: 1024, height: 768, backgroundColor: "#ffffff" },
          layers: [
            {
              id: "layer-1",
              name: "Background",
              type: "raster",
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: "normal",
              data: null
            }
          ],
          activeLayerId: "layer-1",
          maskLayerId: null
        },
        layerBindings: []
      }
    });
    const body = JSON.parse(res.content[0].text!) as {
      ok: boolean;
      summary: string;
    };
    expect(body.ok).toBe(true);
    expect(body.summary).toBe("No issues found.");
  });

  it("validate_sketch reads a saved sketch through the bridged loader", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const res = await callTool(server, "validate_sketch", {
      image_document_id: "no-such-sketch"
    });
    const body = JSON.parse(res.content[0].text!) as {
      error: string;
      validated: boolean;
    };
    // The loader is wired (no "no sketch loader" error) and reports the miss.
    expect(body.error).toContain("was not found");
    expect(body.validated).toBe(false);
  });

  it("save_asset reports an actionable error when nothing to save", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const res = await callTool(server, "save_asset", { name: "x.txt" });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text!) as { error: string };
    expect(body.error).toContain("content");
  });
});

describe("handleMcpHttpRequest routing", () => {
  it("returns null for non-/mcp paths", async () => {
    const res = await handleMcpHttpRequest(
      new Request("http://localhost/other")
    );
    expect(res).toBeNull();
  });

  it("returns 404 for a GET with no matching session", async () => {
    const res = await handleMcpHttpRequest(
      new Request("http://localhost/mcp", { method: "GET" })
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it("returns 404 for a DELETE with no matching session", async () => {
    const res = await handleMcpHttpRequest(
      new Request("http://localhost/mcp", { method: "DELETE" })
    );
    expect(res!.status).toBe(404);
  });

  it("returns 405 for an unsupported method", async () => {
    const res = await handleMcpHttpRequest(
      new Request("http://localhost/mcp", { method: "PUT" })
    );
    expect(res!.status).toBe(405);
  });
});
