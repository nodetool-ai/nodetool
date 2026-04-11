/**
 * AddNodeTool -- planner tool that adds a node to the graph being built.
 *
 * The LLM calls this to add either:
 * - A deterministic workflow node (type from NodeRegistry)
 * - An agent step node (type: "nodetool.agents.AgentStep")
 */

import type { ProcessingContext } from "@nodetool/runtime";
import type { NodeRegistry } from "@nodetool/node-sdk";
import { Tool } from "./base-tool.js";
import { AGENT_STEP_NODE_TYPE, type GraphBuilder } from "../graph-builder.js";

const ADD_NODE_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    id: {
      type: "string" as const,
      description: "Unique identifier for this node (snake_case recommended)"
    },
    type: {
      type: "string" as const,
      description:
        'Fully-qualified node type from registry, or "nodetool.agents.AgentStep" for LLM-driven steps'
    },
    properties: {
      type: "object" as const,
      description:
        "Input properties for the node. For AgentStep nodes: instructions (required), tools (optional), output_schema (optional)"
    },
    name: {
      type: "string" as const,
      description: "Optional human-readable name for the node"
    }
  },
  required: ["id", "type"] as string[]
};

export class AddNodeTool extends Tool {
  readonly name = "add_node";
  readonly description =
    "Add a node to the workflow graph. Use a registry node type for deterministic work, " +
    'or "nodetool.agents.AgentStep" for tasks requiring LLM reasoning.';
  readonly inputSchema: Record<string, unknown> = ADD_NODE_INPUT_SCHEMA;

  constructor(
    private readonly builder: GraphBuilder,
    private readonly registry: NodeRegistry
  ) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const id = params["id"] as string | undefined;
    const type = params["type"] as string | undefined;
    const properties = (params["properties"] as Record<string, unknown>) ?? {};
    const name = params["name"] as string | undefined;

    if (!id || typeof id !== "string") {
      return { status: "error", errors: ["id must be a non-empty string."] };
    }
    if (!type || typeof type !== "string") {
      return { status: "error", errors: ["type must be a non-empty string."] };
    }

    // Validate node type
    const isAgentStep = type === AGENT_STEP_NODE_TYPE;
    if (!isAgentStep && !this.registry.has(type)) {
      // Check loaded metadata for Python-only nodes
      const meta = this.registry.getMetadata(type);
      if (!meta) {
        return {
          status: "error",
          errors: [
            `Unknown node type: '${type}'. Use search_nodes to find available types.`
          ]
        };
      }
    }

    // Validate agent step properties
    if (isAgentStep) {
      const instructions = properties["instructions"];
      if (!instructions || typeof instructions !== "string") {
        return {
          status: "error",
          errors: [
            'AgentStep nodes require an "instructions" property (non-empty string).'
          ]
        };
      }
    }

    const errors = this.builder.addNode(id, type, properties, name);
    if (errors.length > 0) {
      return { status: "error", errors };
    }

    return {
      status: "node_added",
      id,
      type,
      total_nodes: this.builder.nodeCount
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const id = params["id"] ?? "?";
    const type = params["type"] ?? "?";
    return `Adding node: ${id} (${type})`;
  }
}
