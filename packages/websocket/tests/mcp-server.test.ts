/**
 * The `/mcp` surface: exactly two tools, capability + sandbox resources,
 * guest-contract instructions, and a session that must be bound to a user.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  MCP_GUEST_CONTRACT,
  MCP_SANDBOX_ASSET_SNIPPET,
  MCP_SANDBOX_PROBE_SNIPPET
} from "@nodetool-ai/agents";
import { initTestDb } from "@nodetool-ai/models";
import {
  DIRECT_TOOL_NAMES,
  SDK_NATIVE_TOOL_REPLACEMENTS
} from "@nodetool-ai/runtime";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createMcpServer,
  createMcpStdioTransport,
  handleMcpHttpRequest,
  MCP_SCOPE_REQUIRED_MESSAGE
} from "../src/mcp-server.js";
import {
  MCP_CAPABILITIES_RESOURCE_URI,
  MCP_SANDBOX_RESOURCE_URI
} from "../src/mcp-agent-tools.js";

const scope = { userId: "1", source: "stdio-local" as const };

function fakeRendererRegistry() {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    list: (userId: string) =>
      userId === "1"
        ? [
            {
              renderer_id: "renderer-1",
              user_id: "1",
              ready: true,
              connected: true,
              active: true,
              last_active_at: 1,
              tools: {}
            }
          ]
        : [],
    execute: async (request: {
      userId: string;
      rendererId?: string;
      toolName: string;
      args: Record<string, unknown>;
    }) => {
      const { userId, rendererId, toolName, args } = request;
      calls.push({ userId, rendererId, toolName, args });
      if (userId !== "1" || rendererId === "missing") {
        return { handled: false };
      }
      return {
        handled: true,
        result: { renderer_id: rendererId ?? "renderer-1", ok: true }
      };
    }
  };
}

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

  it("registers the action, view_image, and the direct tools no client serves", () => {
    // Derived, not hand-listed: DIRECT_TOOL_NAMES minus the tools an MCP host
    // (Claude Code, ChatGPT) already covers with its own. Pinned as a set so a
    // tool added to either table shows up here as a one-line diff.
    const names = toolNames(createMcpServer({ agentToolsScope: scope }));

    // Nothing beyond the action, the pixel channel, and the direct set.
    for (const name of names) {
      if (name === "execute_code" || name === "view_image") continue;
      expect(DIRECT_TOOL_NAMES.has(name)).toBe(true);
    }
    // The ones this session can actually build are all there. Node discovery
    // needs an injected registry, which this harness has none of, so the
    // promotion correctly leaves those out rather than advertising a tool
    // whose dependency is missing.
    expect(names).toEqual(
      expect.arrayContaining([
        "execute_code",
        "view_image",
        "find_model",
        "list_models",
        "list_directory",
        "browser",
        "http_request",
        "download_file"
      ])
    );
  });

  it("exposes renderer tools on the CodeAct belt and scopes calls", async () => {
    const renderer = fakeRendererRegistry();
    const server = createMcpServer({
      agentToolsScope: scope,
      frontendRendererRegistry: renderer
    });
    expect(toolNames(server)).not.toContain("list_renderers");
    const observation = await act(
      server,
      'import { list_renderers } from "@nodetool-ai/sandbox-nodetool/session";\n' +
        'import { ui_switch_tab } from "@nodetool-ai/sandbox-nodetool/ui";\n' +
        "return [await list_renderers(), await ui_switch_tab({ tab_index: 2 })];"
    );
    expect(observation.ok).toBe(true);
    expect(observation.result).toEqual([
      { renderers: [{ renderer_id: "renderer-1", active: true }] },
      { renderer_id: "renderer-1", ok: true }
    ]);
    expect(renderer.calls).toHaveLength(1);
    expect(renderer.calls[0]).toMatchObject({
      userId: "1",
      toolName: "ui_switch_tab",
      args: { tab_index: 2 }
    });
  });

  it("reports an explicitly unavailable renderer", async () => {
    const server = createMcpServer({
      agentToolsScope: scope,
      frontendRendererRegistry: fakeRendererRegistry()
    });
    const observation = await act(
      server,
      'import { ui_switch_tab } from "@nodetool-ai/sandbox-nodetool/ui";\n' +
        'return await ui_switch_tab({ tab_index: 2, renderer_id: "missing" });'
    );
    expect(observation.ok).toBe(false);
    expect(observation.error).toContain(
      'No connected NodeTool renderer with id "missing"'
    );
  });

  it("never offers a tool the client already serves natively", () => {
    // Two `read_file`s with two different roots in front of one model is worse
    // than one, which is why the file/search half stays inside the sandbox.
    const names = new Set(toolNames(createMcpServer({ agentToolsScope: scope })));
    for (const substituted of SDK_NATIVE_TOOL_REPLACEMENTS.keys()) {
      expect(names.has(substituted)).toBe(false);
    }
  });

  it("keeps every promoted tool callable from inside an action too", async () => {
    // Promotion moves where the prompt documents a tool; it must not remove it
    // from the belt, or `nodetool.*` code paths that call it would break.
    const client = await connectClient();
    const res = (await client.callTool({
      name: "execute_code",
      arguments: {
        code:
          'import { find_model } from "@nodetool-ai/sandbox-nodetool/models";\n' +
          'import { browser } from "@nodetool-ai/sandbox-nodetool/web";\n' +
          'return typeof find_model + "," + typeof browser;'
      }
    })) as { content: Array<{ text: string }>; isError?: boolean };
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain("function,function");
    await client.close();
  });

  it("carries the action contract and catalog in the execute_code description", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const description =
      tools.find((t) => t.name === "execute_code")?.description ?? "";
    // MCP has no system prompt, so the description is the only place the
    // contract can reach the model. Without it the tool is unusable.
    expect(description.startsWith(MCP_GUEST_CONTRACT)).toBe(true);
    expect(description).toContain("searchTools");
    expect(description).toContain("nodetool");
    await client.close();
  });

  it("runs an action from a client that sends no title", async () => {
    // The label is for NodeTool's own UI and the action path discards it, so
    // requiring it on MCP only rejected callers over a field nobody reads.
    const client = await connectClient();
    const { tools } = await client.listTools();
    const schema = tools.find((t) => t.name === "execute_code")
      ?.inputSchema as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(schema.required).toEqual(["code"]);
    // Still advertised, so a client that has a label sends it.
    expect(Object.keys(schema.properties ?? {})).toContain("title");

    const res = (await client.callTool({
      name: "execute_code",
      arguments: { code: "return 6 * 7;" }
    })) as { content: Array<{ text: string }>; isError?: boolean };
    expect(JSON.parse(res.content[0].text)).toMatchObject({
      ok: true,
      result: 42
    });
    await client.close();
  });

  it("publishes the guest contract as server instructions", async () => {
    const client = await connectClient();
    expect(client.getInstructions()).toBe(MCP_GUEST_CONTRACT);
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
    // The catalog names every tool offered at the top level, so a client
    // reading it sees the same surface listTools reports.
    expect(catalog.direct_tools).toEqual(
      expect.arrayContaining(["execute_code", "view_image", "find_model"])
    );
    for (const name of catalog.direct_tools) {
      if (name === "execute_code" || name === "view_image") continue;
      expect(DIRECT_TOOL_NAMES.has(name)).toBe(true);
    }
    expect(catalog.modules.map((m) => m.namespace)).toContain("workflows");
    const listWorkflows = catalog.tools.find((t) => t.name === "list_workflows");
    expect(listWorkflows?.permission_category).toBe("read");
    expect(listWorkflows?.description.length).toBeGreaterThan(0);
    await client.close();
  });

  it("publishes the sandbox catalog as a resource", async () => {
    const client = await connectClient();
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain(MCP_SANDBOX_RESOURCE_URI);

    const read = await client.readResource({
      uri: MCP_SANDBOX_RESOURCE_URI
    });
    const entry = read.contents[0];
    expect(entry.mimeType).toBe("application/json");
    const catalog = JSON.parse(entry.text as string) as {
      runtime: string;
      contract: string;
      unavailable_bridges: string[];
      examples: { probe: string; asset: string };
    };
    expect(catalog.runtime).toBe("quickjs");
    expect(catalog.contract).toBe(MCP_GUEST_CONTRACT);
    expect(catalog.unavailable_bridges).toEqual(
      expect.arrayContaining(["fetch", "workspace", "media"])
    );
    expect(catalog.examples.probe).toBe(MCP_SANDBOX_PROBE_SNIPPET);
    expect(catalog.examples.asset).toBe(MCP_SANDBOX_ASSET_SNIPPET);
    await client.close();
  });

  it("lists the two sandbox prompts", async () => {
    const client = await connectClient();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([
      "sandbox-action",
      "sandbox-asset"
    ]);
    const action = await client.getPrompt({ name: "sandbox-action" });
    expect(action.messages[0]?.content).toEqual({
      type: "text",
      text: expect.stringContaining("nodetool.media.generateImage")
    });
    await client.close();
  });
});

describe("sandbox snippets run", () => {
  it("runs the probe snippet", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const observation = await act(server, MCP_SANDBOX_PROBE_SNIPPET);
    expect(observation.ok).toBe(true);
    const result = observation.result as { count: number; tools: string[] };
    expect(result.count).toBe(0);
    expect(result.tools).toContain("validate_workflow");
  });

  it("runs the asset snippet against an empty library", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const observation = await act(server, MCP_SANDBOX_ASSET_SNIPPET);
    expect(observation.ok).toBe(true);
    expect(observation.result).toEqual({ found: 0 });
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
