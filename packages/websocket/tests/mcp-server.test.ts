/**
 * The `/mcp` surface: exactly two tools, one capability resource, and a session
 * that must be bound to a user.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { initTestDb } from "@nodetool-ai/models";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createMcpServer,
  createMcpStdioTransport,
  handleMcpHttpRequest,
  registerMcpFrontendTransport,
  unregisterMcpFrontendTransport,
  MCP_SCOPE_REQUIRED_MESSAGE
} from "../src/mcp-server.js";
import { MCP_CAPABILITIES_RESOURCE_URI } from "../src/mcp-agent-tools.js";
import type { AgentTransport } from "../src/agent/transport.js";

const scope = { userId: "1", source: "stdio-local" as const };

// The bridged file tools are rooted under the NodeTool data dir, and
// constructing the server creates that directory. Point it at a temp dir so the
// suite never touches the developer's real workspace.
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

beforeEach(() => {
  initTestDb();
});

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

/** Initialize a real MCP client against a scoped session. */
async function connectClient(): Promise<Client> {
  const server = createMcpServer({ agentToolsScope: scope });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport)
  ]);
  return client;
}

function toolNames(server: ReturnType<typeof createMcpServer>): string[] {
  const tools = (
    server as unknown as { _registeredTools: Record<string, unknown> }
  )._registeredTools;
  return Object.keys(tools);
}

function callTool(
  server: ReturnType<typeof createMcpServer>,
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ text: string }>; isError?: boolean }> {
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: Record<string, unknown>) => Promise<unknown> }
      >;
    }
  )._registeredTools;
  return tools[name].handler(args) as Promise<{
    content: Array<{ text: string }>;
    isError?: boolean;
  }>;
}

/** Run one code action and return its observation envelope. */
async function act(
  server: ReturnType<typeof createMcpServer>,
  code: string
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const res = await callTool(server, "execute_code", {
    title: "test action",
    code
  });
  return JSON.parse(res.content[0].text) as {
    ok: boolean;
    result?: unknown;
    error?: string;
  };
}

describe("MCP server surface", () => {
  it("creates a stdio transport", () => {
    expect(createMcpStdioTransport()).toBeDefined();
  });

  it("registers exactly execute_code and view_image", () => {
    const server = createMcpServer({ agentToolsScope: scope });
    expect(toolNames(server).sort()).toEqual(["execute_code", "view_image"]);
  });

  it("lists exactly two tools over a real MCP session", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "execute_code",
      "view_image"
    ]);
    await client.close();
  });

  it("carries the action contract and catalog in the execute_code description", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const description =
      tools.find((t) => t.name === "execute_code")?.description ?? "";
    // MCP has no system prompt, so the description is the only place the
    // contract can reach the model. Without it the tool is unusable.
    expect(description).toContain("searchTools");
    expect(description).toContain("nodetool");
    await client.close();
  });

  it("publishes the capabilities catalog as a resource", async () => {
    const client = await connectClient();
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain(
      MCP_CAPABILITIES_RESOURCE_URI
    );

    const read = await client.readResource({
      uri: MCP_CAPABILITIES_RESOURCE_URI
    });
    const entry = read.contents[0];
    expect(entry.mimeType).toBe("application/json");
    const catalog = JSON.parse(entry.text as string) as {
      direct_tools: string[];
      modules: Array<{ namespace: string; exports: string[] }>;
      tools: Array<{
        name: string;
        description: string;
        permission_category: string;
      }>;
    };
    expect(catalog.direct_tools).toEqual(["execute_code", "view_image"]);
    expect(catalog.modules.map((m) => m.namespace)).toContain("workflows");
    const listWorkflows = catalog.tools.find((t) => t.name === "list_workflows");
    expect(listWorkflows?.permission_category).toBe("read");
    expect(listWorkflows?.description.length).toBeGreaterThan(0);
    await client.close();
  });
});

describe("session scope", () => {
  it("refuses to build a session with no bound user", () => {
    expect(() => createMcpServer()).toThrow(MCP_SCOPE_REQUIRED_MESSAGE);
  });

  it("refuses an unscoped HTTP initialize with the fix named", async () => {
    const response = await handleMcpHttpRequest(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {}
        })
      })
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
    const body = (await response!.json()) as { error: { message: string } };
    expect(body.error.message).toBe(MCP_SCOPE_REQUIRED_MESSAGE);
    expect(body.error.message).toContain("nodetool mcp serve");
  });
});

describe("editor steering through the belt", () => {
  it("routes an editor-steering ui_ tool to the connected renderer", async () => {
    let received: { name?: string; args?: unknown } = {};
    const transport = fakeTransport("r-1", async (_s, _c, name, args) => {
      received = { name, args };
      return { ok: true };
    });
    registerMcpFrontendTransport(transport);
    try {
      const server = createMcpServer({ agentToolsScope: scope });
      expect(toolNames(server)).not.toContain("ui_open_workflow");

      const observed = await act(
        server,
        'return await tools.ui_open_workflow({ workflow_id: "wf-1", renderer_id: "r-1" });'
      );
      expect(observed.ok).toBe(true);
      expect(received.name).toBe("ui_open_workflow");
      expect(received.args).toMatchObject({ workflow_id: "wf-1" });
      expect(received.args).not.toHaveProperty("renderer_id");
    } finally {
      unregisterMcpFrontendTransport(transport);
    }
  });

  it("reports a missing renderer instead of silently succeeding", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const observed = await act(
      server,
      'return await tools.ui_switch_tab({ tab_index: 0 });'
    );
    expect(observed.ok).toBe(false);
    expect(observed.error).toContain("connected NodeTool editor");
  });

  it("names an unknown renderer_id", async () => {
    const transport = fakeTransport("r-1");
    registerMcpFrontendTransport(transport);
    try {
      const server = createMcpServer({ agentToolsScope: scope });
      const observed = await act(
        server,
        'return await tools.ui_copy({ text: "x", renderer_id: "missing" });'
      );
      expect(observed.ok).toBe(false);
      expect(observed.error).toContain('renderer with id "missing"');
    } finally {
      unregisterMcpFrontendTransport(transport);
    }
  });

  it("list_renderers is on the belt, not an MCP tool", async () => {
    const a = fakeTransport("r-a");
    const b = fakeTransport("r-b");
    registerMcpFrontendTransport(a);
    registerMcpFrontendTransport(b);
    try {
      const server = createMcpServer({ agentToolsScope: scope });
      expect(toolNames(server)).not.toContain("list_renderers");

      const observed = await act(server, "return await tools.list_renderers({});");
      expect(observed.ok).toBe(true);
      const body = observed.result as {
        renderers: Array<{ renderer_id: string; active: boolean }>;
      };
      const ids = body.renderers.map((r) => r.renderer_id);
      expect(ids).toContain("r-a");
      expect(ids).toContain("r-b");
      // Most-recently-registered renderer is the active default.
      expect(body.renderers.find((r) => r.renderer_id === "r-b")?.active).toBe(
        true
      );
    } finally {
      unregisterMcpFrontendTransport(a);
      unregisterMcpFrontendTransport(b);
    }
  });

  it("prefers live editor state for the workflow document tools", async () => {
    const transport = fakeTransport("r-live", async () => ({
      ok: true,
      workflow_id: "live-workflow"
    }));
    registerMcpFrontendTransport(transport);
    try {
      const server = createMcpServer({ agentToolsScope: scope });
      const observed = await act(server, "return await tools.ui_get_graph({});");
      expect(observed.ok).toBe(true);
      expect(observed.result).toMatchObject({ workflow_id: "live-workflow" });
    } finally {
      unregisterMcpFrontendTransport(transport);
    }
  });
});
