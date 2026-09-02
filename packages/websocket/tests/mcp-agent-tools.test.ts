/**
 * The permission gate on the MCP mount.
 *
 * The mount is headless: an MCP session has no approval UI of its own, so it
 * runs `auto` (D4) with the approver `headlessGate` gives a host with nobody
 * to ask — one that denies — plus a standing approval for `execute_code`,
 * which the client asked its own user about before sending it. Three things
 * are pinned: the approver denies, that standing approval is the only one, and
 * the tools the mount registers directly reach the ladder at all — they used
 * to call `tool.process` on an ungated tool, skipping `decidePermission`
 * entirely (invariant I-1).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initTestDb } from "@nodetool-ai/models";
import type {
  ApprovalRequest,
  PermissionGateOptions
} from "@nodetool-ai/agents";
import { registerAgentMcpTools } from "../src/mcp-agent-tools.js";

const scope = { userId: "1", source: "stdio-local" as const };

type ToolResponse = {
  content: Array<{ type?: string; text?: string }>;
  isError?: boolean;
};

/** The handler the mount registered under `name`, as the SDK stores it. */
function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown>
): Promise<ToolResponse> {
  // Safety: the SDK keeps registered tools on a private field; the shape is
  // the same one `mcp-server-coverage.test.ts` reads.
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

function newServer(): McpServer {
  return new McpServer({ name: "test", version: "0.0.0" });
}

/**
 * An escalation raised from inside a run — the Apify actor policy asking about
 * an actor this install has not allowlisted. Nothing on this surface can put
 * that question in front of the client's user.
 */
const escalation: ApprovalRequest = {
  toolName: "apify_run_actor",
  category: "external",
  args: {},
  message: "run an actor nobody allowlisted"
};

// The bridged file tools are rooted under the NodeTool data dir, and building
// the mount creates it. Point it at a temp dir so the suite never touches the
// developer's real workspace.
let dataDir: string;
const dataDirEnv = process.platform === "win32" ? "APPDATA" : "XDG_DATA_HOME";
let previousDataDir: string | undefined;

beforeAll(() => {
  previousDataDir = process.env[dataDirEnv];
  dataDir = mkdtempSync(join(tmpdir(), "nodetool-mcp-gate-"));
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

describe("the MCP mount's permission gate", () => {
  it("denies an escalation, naming the host that had nobody to ask", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = registerAgentMcpTools(newServer(), { agentToolsScope: scope });

    expect(run.gate.mode).toBe("auto");
    await expect(run.gate.requestApproval(escalation)).resolves.toBe("deny");

    const said = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(said).toContain("MCP");
    expect(said).toContain("apify_run_actor");
    warn.mockRestore();
  });

  it("still admits a code action, on the approval the client already took", async () => {
    const server = newServer();
    const run = registerAgentMcpTools(server, { agentToolsScope: scope });

    // The standing approval is `execute_code` and nothing else: an action
    // arrives as a tool call the client showed its user, code included.
    expect([...run.gate.sessionAllow]).toEqual(["execute_code"]);

    // No `risk` on the call — `declaredActionRisk` reads that as `high`, which
    // without the standing approval the headless approver would refuse.
    const response = await callTool(server, "execute_code", {
      title: "add two numbers",
      code: "return 1 + 1;"
    });
    const observation = JSON.parse(response.content[0].text ?? "{}") as {
      ok?: boolean;
      result?: unknown;
    };
    expect(observation.ok).toBe(true);
    expect(observation.result).toBe(2);
  });

  it("runs a directly registered tool through the ladder", async () => {
    const prompts: ApprovalRequest[] = [];
    const planGate: PermissionGateOptions = {
      mode: "plan",
      sessionAllow: new Set<string>(),
      requestApproval: async (request) => {
        prompts.push(request);
        return "allow";
      }
    };
    const server = newServer();
    registerAgentMcpTools(server, { agentToolsScope: scope }, planGate);

    // `http_request` is `external`, and plan mode blocks that before the
    // implementation runs — so a blocked answer here, rather than a fetch
    // failure against an unroutable address, is the proof the call met the
    // gate. Ungated, this reached the network.
    const response = await callTool(server, "http_request", {
      url: "http://127.0.0.1:9/never",
      method: "GET"
    });
    const result = JSON.parse(response.content[0].text ?? "{}") as {
      error?: string;
    };
    expect(result.error).toBe("blocked_in_plan_mode");
    // Blocked, not asked: plan mode decides without consulting an approver.
    expect(prompts).toEqual([]);
  });
});
