/** Headless evals invoke capabilities through the production permission gate. */

import { randomUUID } from "node:crypto";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { zodToJsonSchema } from "@nodetool-ai/runtime";
import { createCapabilityRun } from "../capabilities/invoke.js";
import { capabilityCategoryFor } from "../capabilities/registry.js";
import type {
  PermissionCategory,
  PermissionGateOptions,
  PermissionMode
} from "../tools/tool-permissions.js";
import { PERMISSION_GATE_CONTEXT_KEY } from "../types.js";
import type { HeadlessTool } from "./tool-loop-bridge.js";

/** The scripted user's answer to every approval prompt. */
export type ToolLoopApproval = "allow" | "deny";

export interface ToolLoopPermission {
  mode: PermissionMode;
  /** Answer to every approval request. Defaults to `allow`. */
  approve?: ToolLoopApproval;
}

/** One approval request the gate made, and the scripted answer it got. */
export interface PermissionRequestRecord {
  toolName: string;
  category: PermissionCategory;
  decision: ToolLoopApproval;
}

export interface GatedHeadlessTools {
  tools: HeadlessTool[];
  /** Every approval request so far, in order. */
  requests: () => readonly PermissionRequestRecord[];
}

/**
 * Run `tools` through the permission ladder under `permission`. The returned
 * tools keep the inner tools' names, descriptions and schemas; only `execute`
 * changes, and a blocked or denied call resolves to the ladder's structured
 * error result rather than throwing.
 */
export function gateHeadlessTools(
  tools: HeadlessTool[],
  permission: ToolLoopPermission
): GatedHeadlessTools {
  const requests: PermissionRequestRecord[] = [];
  const decision: ToolLoopApproval = permission.approve ?? "allow";
  const gate: PermissionGateOptions = {
    mode: permission.mode,
    sessionAllow: new Set<string>(),
    requestApproval: async (request) => {
      requests.push({
        toolName: request.toolName,
        category: request.category,
        decision
      });
      return decision;
    }
  };
  const context = new ProcessingContext({
    jobId: `tool-loop-eval-${randomUUID()}`,
    userId: "eval-user"
  });
  context.set(PERMISSION_GATE_CONTEXT_KEY, gate);

  const run = createCapabilityRun({
    context,
    gate,
    capabilities: tools.map((tool) => ({
      spec: {
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.parameters),
        zodSchema: tool.parameters,
        category: tool.category ?? capabilityCategoryFor(tool.name),
        userMessage: tool.userMessage,
        needsToolCallId: tool.needsToolCallId
      },
      impl: (_run, args) => tool.execute(args)
    }))
  });
  return {
    tools: tools.map((tool) => ({
      ...tool,
      execute: (args) => run.invoke(tool.name, args)
    })),
    requests: () => requests
  };
}
