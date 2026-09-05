/**
 * The permission gate for a tool-loop eval case.
 *
 * A case that declares `permission` runs its belt through the same ladder a
 * chat turn does: `gateTools` over a `PermissionGateOptions` built from the
 * declared mode, with a scripted approver in place of the UI round trip. Every
 * approval request the ladder makes is recorded, so a case can assert that a
 * mutation was asked about, denied, or never reached the prompt at all.
 *
 * `HeadlessTool` is not a `Tool`, and `gateTools` only takes a `Tool`, so each
 * headless tool is wrapped in a minimal `Tool` whose `process()` calls
 * `execute()`, gated, and unwrapped back to the `HeadlessTool` shape the loop
 * drives. The gate is also published on the run's context under
 * `PERMISSION_GATE_CONTEXT_KEY`, the way a host does it.
 */

import { randomUUID } from "node:crypto";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { ZodType } from "zod";
import { gateTools } from "../capabilities/gate-tools.js";
import { Tool } from "../tools/base-tool.js";
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

/** A `Tool` view of a headless tool, so `gateTools` can wrap it. */
class HeadlessSurfaceTool extends Tool {
  readonly name: string;
  readonly description: string;

  constructor(private readonly inner: HeadlessTool) {
    super();
    this.name = inner.name;
    this.description = inner.description;
  }

  override get schema(): ZodType {
    return this.inner.parameters;
  }

  process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return this.inner.execute(params);
  }
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

  const gated = gateTools(
    tools.map((tool) => new HeadlessSurfaceTool(tool)),
    gate
  );
  return {
    tools: tools.map((tool, index) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      execute: (args) => gated[index].process(context, args)
    })),
    requests: () => requests
  };
}
