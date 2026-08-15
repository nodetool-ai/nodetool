/**
 * Coverage for the reduced MCP mount: what the two tools reach, how the belt is
 * assembled, and the HTTP/session plumbing around them.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach
} from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initTestDb } from "@nodetool-ai/models";
import { getAgentToolbelt, getAllMcpTools } from "@nodetool-ai/agents";
import {
  createMcpServer,
  getLocalMcpServerUrl,
  handleMcpHttpRequest
} from "../src/mcp-server.js";

type ToolResponse = {
  content: Array<{ type?: string; text?: string; data?: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

const scope = { userId: "1", source: "stdio-local" as const };

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

beforeEach(() => {
  initTestDb();
});

describe("the CodeAct surface", () => {
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

  /** Run one code action and return its observation envelope. */
  async function act(
    server: ReturnType<typeof createMcpServer>,
    code: string
  ): Promise<{
    ok: boolean;
    result?: unknown;
    error?: string;
    logs?: string[];
  }> {
    const res = await callTool(server, "execute_code", {
      title: "test action",
      code
    });
    return JSON.parse(res.content[0].text!) as {
      ok: boolean;
      result?: unknown;
      error?: string;
      logs?: string[];
    };
  }

  it("keeps every catalog tool reachable inside an action", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const expected = new Set(
      [...getAgentToolbelt(), ...getAllMcpTools({})]
        .map((t) => t.name)
        .filter((n) => n !== "view_image")
    );
    const observed = await act(
      server,
      "return Object.keys(tools).filter((n) => typeof tools[n] === 'function');"
    );
    expect(observed.ok).toBe(true);
    const names = new Set(observed.result as string[]);
    const missing = [...expected].filter((n) => !names.has(n));
    expect(missing).toEqual([]);

    // The core set is no longer registered as direct MCP tools; it lives on the
    // belt, where a one-line action reaches it.
    for (const core of ["read_file", "write_file", "grep", "web_search"]) {
      expect(names.has(core)).toBe(true);
    }

    // The provider-specific duplicates are gone, not merely filtered: the
    // media tools were deleted for `generate_image` / `generate_speech`, and
    // the search backends became functions the routed tools call host-side.
    for (const retired of [
      "image_generation",
      "openai_image_generation",
      "openai_web_search",
      "dataforseo_search"
    ]) {
      expect(names.has(retired)).toBe(false);
    }
  });

  it("exposes the graph object model alongside the document tools", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const observed = await act(
      server,
      "return typeof tools.ui_add_node === 'function' && typeof openWorkflow === 'function';"
    );
    expect(observed.ok).toBe(true);
    expect(observed.result).toBe(true);
  });

  it("runs a catalog tool through an action", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const observed = await act(
      server,
      "return await tools.validate_timeline({ document: { tracks: [], clips: [], markers: [] } });"
    );
    expect(observed.ok).toBe(true);
    const body = observed.result as { ok: boolean; summary: string };
    expect(body.ok).toBe(true);
    expect(body.summary).toBe("No issues found.");
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
    const written = await act(
      server,
      'return await tools.write_file({ file_path: "mcp-roundtrip.txt", content: "hello" });'
    );
    expect(written.ok).toBe(true);
    const read = await act(
      server,
      'return await tools.read_file({ file_path: "mcp-roundtrip.txt" });'
    );
    expect(read.ok).toBe(true);
    expect(JSON.stringify(read.result)).toContain("hello");
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

  it("validate_workflow reports an actionable error when given no graph", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const observed = await act(
      server,
      "return await tools.validate_workflow({});"
    );
    expect(observed.ok).toBe(false);
    expect(observed.error).toContain("No graph to validate");
  });

  it("validate_sketch validates an inline document", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const document = {
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
    };
    const observed = await act(
      server,
      `return await tools.validate_sketch({ document: ${JSON.stringify(document)} });`
    );
    expect(observed.ok).toBe(true);
    const body = observed.result as { ok: boolean; summary: string };
    expect(body.ok).toBe(true);
    expect(body.summary).toBe("No issues found.");
  });

  it("validate_sketch reads a saved sketch through the bridged loader", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const observed = await act(
      server,
      'return await tools.validate_sketch({ image_document_id: "no-such-sketch" });'
    );
    // A tool result carrying an `error` key becomes a guest throw, so code can
    // try/catch it — the CodeAct bridge convention, not a loader failure.
    expect(observed.ok).toBe(false);
    // The loader is wired (no "no sketch loader" error) and reports the miss.
    expect(observed.error).toContain("was not found");
  });

  it("save_asset reports an actionable error when nothing to save", async () => {
    const server = createMcpServer({ agentToolsScope: scope });
    const observed = await act(
      server,
      'return await tools.save_asset({ name: "x.txt" });'
    );
    expect(observed.ok).toBe(false);
    expect(observed.error).toContain("content");
  });
});

describe("getLocalMcpServerUrl", () => {
  const original = {
    PORT: process.env["PORT"],
    TLS_CERT: process.env["TLS_CERT"],
    TLS_KEY: process.env["TLS_KEY"]
  };
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

  it("returns 404 for a POST naming an unknown session", async () => {
    const res = await handleMcpHttpRequest(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "mcp-session-id": "gone" },
        body: "{}"
      })
    );
    expect(res!.status).toBe(404);
  });
});
