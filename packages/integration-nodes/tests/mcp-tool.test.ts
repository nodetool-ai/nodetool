import { describe, expect, it } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import {
  CallMcpToolNode,
  mcpToolDynamicSlots
} from "@nodetool-ai/integration-nodes";
import {
  EXTERNAL_MCP_CONTEXT_KEY,
  ProcessingContext,
  headlessGate,
  PERMISSION_GATE_CONTEXT_KEY,
  type ExternalMcpAccess,
  type ExternalMcpCallResult
} from "@nodetool-ai/runtime";

const schema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Light name" },
    brightness: { type: "integer", default: 100 },
    dry_run: { type: "boolean" },
    tags: { type: "array" }
  },
  required: ["name"]
};

function fakeAccess(
  answer: Partial<ExternalMcpCallResult> = {},
  calls: unknown[] = []
): ExternalMcpAccess {
  return {
    servers: async () => [{ id: "home", name: "Home" }],
    tools: async (serverId) => {
      if (serverId === "down") throw new Error("MCP server \"down\" is not answering: connection refused");
      if (serverId !== "home") throw new Error(`MCP server "${serverId}" is not configured`);
      return [{ name: "set_light", inputSchema: schema, readOnly: false }];
    },
    call: async (serverId, tool, args) => {
      calls.push({ serverId, tool, args });
      return {
        text: "switched",
        isError: false,
        images: [],
        links: [{ uri: "file:///tmp/out.txt", name: "out" }],
        structured: { ok: true },
        ...answer
      };
    }
  };
}

function contextWith(access: ExternalMcpAccess | null): ProcessingContext {
  const context = new ProcessingContext({ jobId: "j", userId: "u1" });
  if (access) context.set(EXTERNAL_MCP_CONTEXT_KEY, access);
  // A background run: nobody to approve anything.
  context.set(PERMISSION_GATE_CONTEXT_KEY, headlessGate("workflow run"));
  return context;
}

const node = (props: Record<string, unknown>) =>
  new CallMcpToolNode({ server: "home", tool: "set_light", name: "lamp", ...props });

describe("CallMcpToolNode", () => {
  it("calls the named tool with its inputs and fills every declared output", async () => {
    const calls: unknown[] = [];
    const out = await node({ brightness: 40 }).process(contextWith(fakeAccess({}, calls)));
    expect(calls).toEqual([
      { serverId: "home", tool: "set_light", args: { name: "lamp", brightness: 40 } }
    ]);
    expect(out).toEqual({
      text: "switched",
      result: { ok: true },
      resource_links: [{ uri: "file:///tmp/out.txt", name: "out" }]
    });
    // Every key it returns is a declared output slot, and every slot is filled.
    const declared = getNodeMetadata(CallMcpToolNode).outputs.map((o) => o.name);
    expect(Object.keys(out).sort()).toEqual([...declared].sort());
  });

  it("runs under the author's choice even when the run has no one to ask", async () => {
    // The context above carries the headless gate; the node does not consult it.
    await expect(node({}).process(contextWith(fakeAccess()))).resolves.toBeDefined();
  });

  it("reports an unknown server and an unknown tool by name", async () => {
    await expect(
      node({ server: "nope" }).process(contextWith(fakeAccess()))
    ).rejects.toThrow('MCP server "nope" is not configured');
    await expect(
      node({ tool: "explode" }).process(contextWith(fakeAccess()))
    ).rejects.toThrow('has no tool "explode". It offers: set_light.');
  });

  it("fails clearly when the server is down", async () => {
    await expect(
      node({ server: "down" }).process(contextWith(fakeAccess()))
    ).rejects.toThrow("not answering");
  });

  it("fails the node when the tool answers with an error", async () => {
    await expect(
      node({}).process(contextWith(fakeAccess({ isError: true, text: "no such light" })))
    ).rejects.toThrow('"set_light" on "home" failed: no such light');
  });

  it("names a missing required input before calling the server", async () => {
    const calls: unknown[] = [];
    await expect(
      new CallMcpToolNode({ server: "home", tool: "set_light" }).process(
        contextWith(fakeAccess({}, calls))
      )
    ).rejects.toThrow("needs name");
    expect(calls).toEqual([]);
  });

  it("says so when the host offers no external MCP servers", async () => {
    await expect(node({}).process(contextWith(null))).rejects.toThrow(
      "External MCP servers are not available on this host"
    );
    await expect(
      new CallMcpToolNode({}).process(contextWith(fakeAccess()))
    ).rejects.toThrow("needs a server and a tool");
  });
});

describe("mcpToolDynamicSlots", () => {
  it("derives one typed input per schema property", () => {
    const slots = mcpToolDynamicSlots({ properties: { input_schema: schema } });
    expect(Object.keys(slots?.dynamic_inputs ?? {})).toEqual([
      "name",
      "brightness",
      "dry_run",
      "tags"
    ]);
    expect(slots?.dynamic_inputs.name).toMatchObject({
      type: { type: "str" },
      required: true,
      description: "Light name"
    });
    expect(slots?.dynamic_inputs.brightness).toMatchObject({
      type: { type: "int" },
      default: 100
    });
    expect(slots?.dynamic_inputs.tags.type.type).toBe("list");
  });

  it("derives nothing before a tool is picked", () => {
    expect(mcpToolDynamicSlots({ properties: { input_schema: {} } })).toBeUndefined();
    expect(mcpToolDynamicSlots({})).toBeUndefined();
  });
});
