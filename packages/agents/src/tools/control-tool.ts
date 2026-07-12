/**
 * Control Node Tool for Agent-based Control Edge System
 *
 * Port of src/nodetool/agents/tools/control_tool.py
 *
 * When an agent has outgoing control edges, ControlNodeTool instances are
 * automatically added to its tool list. When the agent calls a control tool,
 * it creates a RunEvent for dispatch to the controlled node.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { ControlEvent, RunEvent } from "@nodetool-ai/protocol";
import { Tool } from "./base-tool.js";

/**
 * Convert a node title to a valid tool name (snake_case, max 64 chars).
 */
export function sanitizeToolName(name: string): string {
  if (typeof name !== "string" || !name) return "control_node";

  let s = name
    // Replace non-alphanumeric with underscores
    .replace(/[^a-zA-Z0-9]/g, "_")
    // camelCase → snake_case
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    // Collapse consecutive underscores
    .replace(/_+/g, "_");
  // Strip leading/trailing underscores.
  // Stryker disable next-line Regex: after the collapse above, the edges hold at
  // most one underscore, so `_+`→`_` at the edges matches identical text.
  s = s.replace(/^_+|_+$/g, "");

  if (!s) return "control_node";
  // Stryker disable next-line ConditionalExpression,EqualityOperator: at the
  // 64-char boundary slice(0, 64) is a no-op, so `> 64`→`>= 64` and the
  // always-truthy guard produce byte-identical output (equivalent mutants).
  if (s.length > 64) s = s.slice(0, 64);
  return s;
}

export interface ControlNodeInfo {
  node_id: string;
  node_type: string;
  node_title: string;
  node_description?: string;
  control_actions?: Record<
    string,
    {
      properties?: Record<string, Record<string, unknown>>;
    }
  >;
  properties?: Record<string, unknown>;
  upstream_data?: Record<string, unknown>;
}

export class ControlNodeTool extends Tool {
  readonly name: string;
  readonly description: string;
  readonly jsonSchema: Record<string, unknown>;
  readonly targetNodeId: string;
  readonly nodeInfo: ControlNodeInfo;

  constructor(targetNodeId: string, nodeInfo: ControlNodeInfo) {
    super();
    this.targetNodeId = targetNodeId;
    this.nodeInfo = nodeInfo;

    const actions = nodeInfo.control_actions ?? {};
    const runAction = actions["run"] ?? {};
    const rawProperties = runAction.properties ?? {};
    const properties: Record<string, Record<string, unknown>> = {};

    for (const [key, schema] of Object.entries(rawProperties)) {
      if (typeof schema === "object" && schema !== null) {
        properties[key] = { ...schema };
      } else {
        properties[key] = { type: "string", description: String(schema) };
      }
    }

    this.jsonSchema = {
      type: "object",
      properties,
      required: [],
      additionalProperties: false
    };

    const nodeTitle = nodeInfo.node_title || targetNodeId;
    this.name = sanitizeToolName(nodeTitle);

    if (nodeInfo.node_description) {
      this.description = nodeInfo.node_description;
    } else {
      let desc = `Control ${nodeTitle}: trigger execution with optional property overrides`;
      const propNames = Object.keys(properties);
      if (propNames.length > 0) {
        desc += `. Available properties: ${propNames.join(", ")}`;
      }
      this.description = desc;
    }
  }

  createControlEvent(args: Record<string, unknown>): ControlEvent {
    const allowed = this.jsonSchema["properties"] as Record<string, unknown>;
    const properties = Object.fromEntries(
      Object.entries(args).filter(([key]) => Object.hasOwn(allowed, key))
    );
    return { event_type: "run", properties } satisfies RunEvent;
  }

  userMessage(params: Record<string, unknown>): string {
    const nodeTitle = this.nodeInfo.node_title || this.targetNodeId;
    if (params && Object.keys(params).length > 0) {
      return `Triggering ${nodeTitle} with properties: ${Object.keys(params).join(", ")}`;
    }
    return `Triggering ${nodeTitle}`;
  }

  /**
   * Stub process method for tool interface compatibility.
   * In the normal control flow, control tools are intercepted by the
   * execution loop and converted to control events.
   */
  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const event = this.createControlEvent(params);
    const nodeTitle = this.nodeInfo.node_title || this.targetNodeId;
    return `Created ${event.event_type} event for ${nodeTitle} with properties: ${Object.keys(params).join(", ")}`;
  }
}
