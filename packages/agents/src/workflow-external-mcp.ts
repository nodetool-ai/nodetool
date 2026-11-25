/**
 * The user's external MCP tools inside a workflow run's Code node.
 *
 * A Code node picks its tools in code, so a call here is dynamic access: the
 * workflow author never named it. It therefore meets the run's permission
 * gate like any agent-chosen call, with one rule on top. A remote tool the
 * server annotates `readOnlyHint` is read-class and runs. Every other remote
 * tool is `external` and `alwaysAsk`, which asks even in `auto` mode. A
 * headless run has nobody to ask, so the gate denies it. An author who wants
 * a background run to call a specific tool uses the `CallMcpTool` node, which
 * names the server and the tool and runs under that choice.
 *
 * Nothing connects until a body mentions an MCP tool (`mcpToolsMentioned`),
 * so a Code node that parses JSON does not spawn the user's stdio servers.
 */

import { createLogger } from "@nodetool-ai/config";
import {
  MCP_CAPABILITY_MODULE,
  MCP_TOOL_PREFIX
} from "@nodetool-ai/protocol";
import {
  externalMcpAccessFor,
  type ExternalMcpAccess,
  type PermissionGateOptions,
  type ProcessingContext
} from "@nodetool-ai/runtime";
import { capabilityFromTool } from "./capabilities/adapters.js";
import { createCapabilityRun } from "./capabilities/invoke.js";
import type { CapabilityExport } from "./capabilities/types.js";
import type { SessionCapabilityModule } from "./codeact/capability-modules.js";
import {
  ExternalMcpTool,
  externalMcpBeltTools,
  type McpRemoteTool
} from "./tools/external-mcp-tools.js";
import type { Tool } from "./tools/base-tool.js";
import { isRecord } from "./utils/type-guards.js";

const log = createLogger("nodetool.agents.workflow-external-mcp");

/** Answers a remote tool gives that mean the call failed, not that it returned. */
const REMOTE_FAILURES = new Set(["mcp_server_error", "mcp_tool_error"]);
/** Answers the permission ladder gives instead of running the call. */
const GATE_REFUSALS = new Set([
  "permission_denied",
  "blocked_in_plan_mode",
  "blocked_by_security_monitor"
]);

export interface WorkflowExternalMcp {
  /** One belt tool per reachable remote tool, named `mcp_<server>_<tool>`. */
  tools: Tool[];
  /** The same tools with the permission class a Code node call gets. */
  capabilities: CapabilityExport[];
  /** `@nodetool-ai/sandbox-nodetool/mcp`, for a body that imports them. */
  session: SessionCapabilityModule | undefined;
}

/** Whether a body can reach an external MCP tool, by import or by name. */
export function mcpToolsMentioned(code: string): boolean {
  return (
    code.includes(`sandbox-nodetool/${MCP_CAPABILITY_MODULE}`) ||
    code.includes(MCP_TOOL_PREFIX)
  );
}

/** The capability a Code node sees for one remote tool. */
function gatedCapability(tool: ExternalMcpTool): CapabilityExport {
  const entry = capabilityFromTool(tool);
  const readOnly = tool.remote.readOnly === true;
  return {
    spec: {
      ...entry.spec,
      category: readOnly ? "read" : "external",
      alwaysAsk: !readOnly
    },
    impl: async (run, args) => {
      const result = await entry.impl(run, args);
      // A failure is an exception in code, not a value to forget to check.
      if (isRecord(result) && REMOTE_FAILURES.has(String(result["error"]))) {
        throw new Error(String(result["message"] ?? "MCP call failed"));
      }
      return result;
    }
  };
}

async function discoverAll(
  access: ExternalMcpAccess
): Promise<Map<string, McpRemoteTool[]>> {
  const byServer = new Map<string, McpRemoteTool[]>();
  for (const server of await access.servers()) {
    try {
      byServer.set(server.id, await access.tools(server.id));
    } catch (err) {
      // A server that is down costs its own tools, not the run.
      log.warn("External MCP server skipped for this run", {
        server: server.id,
        error: (err instanceof Error ? err.message : String(err))
          .split("\n")[0]
          .slice(0, 200)
      });
    }
  }
  return byServer;
}

const built = new WeakMap<ProcessingContext, Promise<WorkflowExternalMcp | null>>();

/**
 * The external MCP belt for a run, or null when the host offers none or the
 * user has no reachable server. Cached per context: a Code node runs once per
 * item and must not reread the settings each time.
 */
export function workflowExternalMcp(
  context: ProcessingContext,
  gate: PermissionGateOptions
): Promise<WorkflowExternalMcp | null> {
  let pending = built.get(context);
  if (pending === undefined) {
    pending = build(context, gate);
    built.set(context, pending);
  }
  return pending;
}

async function build(
  context: ProcessingContext,
  gate: PermissionGateOptions
): Promise<WorkflowExternalMcp | null> {
  const access = externalMcpAccessFor(context);
  if (access === null) return null;
  const tools = externalMcpBeltTools(access, await discoverAll(access));
  if (tools.length === 0) return null;
  const capabilities = tools.map(gatedCapability);
  // The import door has its own run over the same gate object, so an approval
  // or a standing allow reaches both doors.
  const run = createCapabilityRun({ context, gate, capabilities });
  const session: SessionCapabilityModule = {
    module: MCP_CAPABILITY_MODULE,
    exports: tools.map((tool) => tool.name),
    call: async (name, args) => {
      const result = await run.invoke(
        name,
        isRecord(args) ? args : {}
      );
      if (isRecord(result) && GATE_REFUSALS.has(String(result["error"]))) {
        throw new Error(String(result["message"] ?? "The call was refused"));
      }
      return result;
    }
  };
  return { tools, capabilities, session };
}
