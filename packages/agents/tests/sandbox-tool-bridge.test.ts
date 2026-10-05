import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CodeNode,
  setCodeNodeAgentsModule,
  setCodeNodeTools
} from "@nodetool-ai/code-nodes";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import * as agents from "../src/index.js";
import {
  createCapabilityRun,
  toolFromLazyCapability,
  UNGATED,
  type CapabilityImpl,
  type CapabilitySpec
} from "../src/capabilities/index.js";
import { PERMISSION_GATE_CONTEXT_KEY } from "../src/types.js";
import { getAllMcpTools } from "../src/tools/mcp-tools.js";
import { sandboxToolBridgeGlobals } from "../src/sandbox-toolbelt.js";
import { TOOL_CALL_ID_FIELD } from "../src/tools/subtask-fields.js";
import type { PermissionGateOptions } from "../src/tools/tool-permissions.js";

// These tests need only the context's variable bag, not a workspace or providers.
function contextWith(values: Record<string, unknown> = {}): ProcessingContext {
  return {
    get: (key: string) => values[key]
  } as unknown as ProcessingContext;
}

const WRITE_SPEC: CapabilitySpec = {
  name: "delete_workflow_version",
  description: "Delete a workflow version.",
  inputSchema: { type: "object", properties: {} },
  category: "write"
};

function nativeTool(
  context: ProcessingContext,
  impl: CapabilityImpl,
  spec: CapabilitySpec = WRITE_SPEC
) {
  return toolFromLazyCapability(
    spec,
    createCapabilityRun({ context, gate: UNGATED }),
    impl
  );
}

async function call(
  globals: Record<string, unknown>,
  name: string,
  args: Record<string, unknown> = {}
): Promise<unknown> {
  const invoke = globals["__callTool"];
  if (typeof invoke !== "function") {
    throw new Error("Missing sandbox tool bridge");
  }
  return invoke(name, JSON.stringify(args));
}

afterEach(() => {
  setCodeNodeTools(null);
  setCodeNodeAgentsModule(null);
});

describe("sandbox tool bridge", () => {
  it("rejects a bridged call whose per-call signal is already aborted", async () => {
    const context = contextWith();
    const impl = vi.fn(async () => ({ deleted: true }));
    const abort = new AbortController();
    abort.abort(new Error("action cancelled"));
    const globals = sandboxToolBridgeGlobals(
      context,
      [nativeTool(context, impl)],
      {
        signal: abort.signal
      }
    );

    expect(await call(globals, WRITE_SPEC.name)).toEqual({
      ok: false,
      error: "action cancelled"
    });
    expect(impl).not.toHaveBeenCalled();
  });

  it("makes exactly one permission decision for a Code node write in ask mode", async () => {
    const requestApproval = vi.fn<PermissionGateOptions["requestApproval"]>(
      async () => "allow"
    );
    const context = contextWith({
      [PERMISSION_GATE_CONTEXT_KEY]: {
        mode: "default",
        sessionAllow: new Set<string>(),
        requestApproval
      }
    });
    const impl = vi.fn(async () => ({ deleted: true }));
    setCodeNodeAgentsModule(agents);
    setCodeNodeTools([nativeTool(context, impl)]);

    const result = await new CodeNode({
      code: `return await nodetool.workflows.deleteVersion("wf_1", 2);`
    }).process(context);

    expect(result).toMatchObject({ deleted: true });
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(requestApproval.mock.calls[0]?.[0]).toMatchObject({
      toolName: WRITE_SPEC.name,
      category: "write"
    });
    expect(impl).toHaveBeenCalledTimes(1);
  }, 60_000);

  it("passes unique codeact IDs to capabilities that need a tool call ID", async () => {
    const context = contextWith();
    const globals = sandboxToolBridgeGlobals(context, [
      nativeTool(
        context,
        async (_run, args) => ({ id: args[TOOL_CALL_ID_FIELD] }),
        { ...WRITE_SPEC, needsToolCallId: true }
      )
    ]);

    expect(await call(globals, WRITE_SPEC.name)).toEqual({
      ok: true,
      result: { id: "codeact_1" }
    });
    expect(await call(globals, WRITE_SPEC.name)).toEqual({
      ok: true,
      result: { id: "codeact_2" }
    });
  });

  it("keeps the MCP capability's injected node registry", async () => {
    // A distinct registry with a known empty catalog detects a lost dependency.
    const registry = { listMetadata: () => [] } as unknown as NodeRegistry;
    const tools = getAllMcpTools({ registry }).filter(
      (tool) => tool.name === "list_nodes"
    );
    expect(tools).toHaveLength(1);
    const globals = sandboxToolBridgeGlobals(contextWith(), tools, {
      signal: new AbortController().signal
    });

    expect(await call(globals, "list_nodes")).toEqual({
      ok: true,
      result: { total: 0, namespaces: {}, nodes: [] }
    });
  });

  it("runs sandbox belt writes without prompting even when the context asks", async () => {
    const requestApproval = vi.fn(async () => "deny" as const);
    const context = contextWith({
      [PERMISSION_GATE_CONTEXT_KEY]: {
        mode: "default",
        sessionAllow: new Set<string>(),
        requestApproval
      }
    });
    const impl = vi.fn(async () => ({ deleted: true }));
    const globals = sandboxToolBridgeGlobals(
      context,
      [nativeTool(context, impl)],
      {
        signal: new AbortController().signal
      }
    );

    expect(await call(globals, WRITE_SPEC.name)).toEqual({
      ok: true,
      result: { deleted: true }
    });
    expect(requestApproval).not.toHaveBeenCalled();
    expect(impl).toHaveBeenCalledTimes(1);
  });
});
