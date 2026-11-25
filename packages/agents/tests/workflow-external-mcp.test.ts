/**
 * External MCP tools on a Code node's belt: a real MCP server over an
 * in-memory transport, called through the permission ladder a workflow run
 * carries. A tool the server marks read-only runs. Any other is `external`
 * and `alwaysAsk`, so a headless run denies it before the server sees a call.
 */

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServerConfig } from "@nodetool-ai/protocol";
import {
  EXTERNAL_MCP_CONTEXT_KEY,
  ProcessingContext,
  headlessGate,
  setExternalMcpResolver,
  type ExternalMcpAccess,
  type PermissionGateOptions
} from "@nodetool-ai/runtime";
import { McpClientPool } from "../src/tools/external-mcp-tools.js";
import {
  mcpToolsMentioned,
  workflowExternalMcp
} from "../src/workflow-external-mcp.js";
import { capabilityRunForTools } from "../src/capabilities/legacy-tools.js";

const TOKEN = "tok-9f8e7d6c5b4a";

const config: McpServerConfig = {
  id: "home",
  name: "Home",
  enabled: true,
  transport: { type: "stdio", command: "unused", args: [], env: {} }
};

interface Fake {
  server: McpServer;
  calls: string[];
}

function fakeServer(): Fake {
  const calls: string[] = [];
  const server = new McpServer({ name: "fake", version: "0.0.1" });
  server.registerTool(
    "get_state",
    {
      description: "Read a light",
      inputSchema: { name: z.string() },
      annotations: { readOnlyHint: true }
    },
    async ({ name }) => {
      calls.push(`get_state:${name}`);
      return { content: [{ type: "text", text: `${name} is on` }] };
    }
  );
  server.registerTool(
    "set_light",
    { description: "Switch a light", inputSchema: { name: z.string() } },
    async ({ name }) => {
      calls.push(`set_light:${name}`);
      return { content: [{ type: "text", text: `${name} switched` }] };
    }
  );
  server.registerTool(
    "echo_token",
    { description: "Echoes its credential", annotations: { readOnlyHint: true } },
    async () => ({
      content: [{ type: "text", text: `auth was Bearer ${TOKEN}` }],
      structuredContent: { header: `Bearer ${TOKEN}` }
    })
  );
  server.registerTool(
    "boom",
    { description: "Fails", annotations: { readOnlyHint: true } },
    async () => ({ isError: true, content: [{ type: "text", text: "no such light" }] })
  );
  return { server, calls };
}

let opened: McpServer[] = [];
const pools: McpClientPool[] = [];

function accessOver(fake: Fake): ExternalMcpAccess {
  const pool = new McpClientPool({
    connect: async (_config, secrets) => {
      secrets.add(TOKEN);
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test", version: "0" });
      await Promise.all([client.connect(clientSide), fake.server.connect(serverSide)]);
      opened.push(fake.server);
      return client;
    }
  });
  pools.push(pool);
  return {
    async servers() {
      await pool.sync([config]);
      return pool.serverIds().map((id) => ({ id, name: "Home" }));
    },
    async tools(serverId) {
      const found = await pool.discover(undefined, serverId);
      const tools = found.get(serverId);
      if (!tools) throw new Error(`MCP server "${serverId}" is not answering`);
      return tools.map((t) => ({ ...t, readOnly: t.readOnly === true }));
    },
    call: (serverId, tool, args, signal) => pool.call(serverId, tool, args, signal)
  };
}

function contextWith(access: ExternalMcpAccess | null): ProcessingContext {
  const context = new ProcessingContext({ jobId: "j", userId: "u1" });
  if (access) context.set(EXTERNAL_MCP_CONTEXT_KEY, access);
  return context;
}

afterEach(async () => {
  setExternalMcpResolver(null);
  await Promise.all(pools.splice(0).map((p) => p.close()));
  await Promise.all(opened.map((s) => s.close()));
  opened = [];
});

describe("mcpToolsMentioned", () => {
  it("is true for an import of the mcp module and for a belt name", () => {
    expect(mcpToolsMentioned(`import { x } from "@nodetool-ai/sandbox-nodetool/mcp";`)).toBe(true);
    expect(mcpToolsMentioned("await tools.mcp_home_get_state({})")).toBe(true);
    expect(mcpToolsMentioned("return JSON.parse(inputs.text)")).toBe(false);
  });
});

describe("workflowExternalMcp", () => {
  it("offers nothing when the host installed no access, and never connects", async () => {
    const context = contextWith(null);
    expect(await workflowExternalMcp(context, headlessGate("test"))).toBeNull();
  });

  it("resolves the owner's access through the process resolver", async () => {
    const fake = fakeServer();
    const asked: string[] = [];
    const access = accessOver(fake);
    setExternalMcpResolver((userId) => {
      asked.push(userId);
      return access;
    });
    const mcp = await workflowExternalMcp(contextWith(null), headlessGate("test"));
    expect(asked).toEqual(["u1"]);
    expect(mcp?.tools.map((t) => t.name).sort()).toEqual([
      "mcp_home_boom",
      "mcp_home_echo_token",
      "mcp_home_get_state",
      "mcp_home_set_light"
    ]);
  });

  it("runs a read-only tool and denies the others under the headless gate", async () => {
    const fake = fakeServer();
    const context = contextWith(accessOver(fake));
    const gate = headlessGate("workflow run");
    const mcp = await workflowExternalMcp(context, gate);
    if (!mcp) throw new Error("expected a belt");
    const run = capabilityRunForTools(mcp.tools, context, {
      gate,
      overrides: mcp.capabilities
    });

    const read = await run.invoke("mcp_home_get_state", { name: "lamp" });
    expect(read).toMatchObject({ text: "lamp is on" });

    const write = await run.invoke("mcp_home_set_light", { name: "lamp" });
    expect(write).toMatchObject({ error: "permission_denied" });
    // The denial came from the ladder: the server never saw the call.
    expect(fake.calls).toEqual(["get_state:lamp"]);
  });

  it("asks even in auto mode, and runs the call when the approver allows it", async () => {
    const fake = fakeServer();
    const context = contextWith(accessOver(fake));
    const asked: string[] = [];
    const gate: PermissionGateOptions = {
      mode: "auto",
      sessionAllow: new Set(),
      requestApproval: async (request) => {
        asked.push(request.toolName);
        return "allow_for_chat";
      }
    };
    const mcp = await workflowExternalMcp(context, gate);
    if (!mcp) throw new Error("expected a belt");
    const run = capabilityRunForTools(mcp.tools, context, {
      gate,
      overrides: mcp.capabilities
    });
    await run.invoke("mcp_home_set_light", { name: "lamp" });
    await run.invoke("mcp_home_set_light", { name: "desk" });
    // A standing "allow for this chat" does not skip the next ask: each call
    // needs its own approval.
    expect(asked).toEqual(["mcp_home_set_light", "mcp_home_set_light"]);
    expect(fake.calls).toEqual(["set_light:lamp", "set_light:desk"]);
  });

  it("blocks a write in plan mode without asking", async () => {
    const fake = fakeServer();
    const context = contextWith(accessOver(fake));
    const gate: PermissionGateOptions = {
      mode: "plan",
      sessionAllow: new Set(),
      requestApproval: async () => "allow"
    };
    const mcp = await workflowExternalMcp(context, gate);
    if (!mcp) throw new Error("expected a belt");
    const run = capabilityRunForTools(mcp.tools, context, {
      gate,
      overrides: mcp.capabilities
    });
    expect(await run.invoke("mcp_home_set_light", { name: "x" })).toMatchObject({
      error: "blocked_in_plan_mode"
    });
    expect(fake.calls).toEqual([]);
  });

  it("serves the import door through the same gate and throws on a refusal", async () => {
    const fake = fakeServer();
    const context = contextWith(accessOver(fake));
    const gate = headlessGate("workflow run");
    const session = (await workflowExternalMcp(context, gate))?.session;
    if (!session) throw new Error("expected a session module");
    expect(session.module).toBe("mcp");
    expect(session.exports).toContain("mcp_home_get_state");
    expect(await session.call("mcp_home_get_state", { name: "lamp" })).toMatchObject({
      text: "lamp is on"
    });
    await expect(session.call("mcp_home_set_light", { name: "lamp" })).rejects.toThrow(
      /declined/
    );
    expect(fake.calls).toEqual(["get_state:lamp"]);
  });

  it("throws when the remote tool reports an error", async () => {
    const context = contextWith(accessOver(fakeServer()));
    const session = (await workflowExternalMcp(context, headlessGate("t")))?.session;
    await expect(session?.call("mcp_home_boom", {})).rejects.toThrow("no such light");
  });

  it("blanks the server's secret out of text and structured results", async () => {
    const context = contextWith(accessOver(fakeServer()));
    const session = (await workflowExternalMcp(context, headlessGate("t")))?.session;
    const result = await session?.call("mcp_home_echo_token", {});
    const json = JSON.stringify(result);
    expect(json).not.toContain(TOKEN);
    expect(json).toContain("[redacted]");
  });

  it("skips a server that is down and keeps the others", async () => {
    const down: ExternalMcpAccess = {
      servers: async () => [{ id: "home", name: "Home" }],
      tools: async () => {
        throw new Error("connection refused");
      },
      call: async () => {
        throw new Error("unreachable");
      }
    };
    expect(await workflowExternalMcp(contextWith(down), headlessGate("t"))).toBeNull();
  });
});
