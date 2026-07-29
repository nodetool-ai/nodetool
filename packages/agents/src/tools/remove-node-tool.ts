/**
 * RemoveNodeTool -- planner tool that deletes a node (and its edges) from the
 * graph being built, so a mistaken add_node is correctable instead of
 * permanent.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";
import type { GraphBuilder } from "../graph-builder.js";

const REMOVE_NODE_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    id: {
      type: "string" as const,
      description: "ID of the node to remove"
    }
  },
  required: ["id"] as string[]
};

export class RemoveNodeTool extends Tool {
  readonly name = "remove_node";
  readonly description =
    "Remove a node from the workflow graph. All edges attached to the node are removed too. " +
    "Use this to correct a wrong node choice instead of leaving orphan nodes in the graph.";
  readonly jsonSchema: Record<string, unknown> = REMOVE_NODE_INPUT_SCHEMA;

  constructor(private readonly builder: GraphBuilder) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const id = params["id"] as string | undefined;
    if (!id || typeof id !== "string") {
      return { status: "error", errors: ["id must be a non-empty string."] };
    }
    const errors = this.builder.removeNode(id);
    if (errors.length > 0) {
      return { status: "error", errors };
    }
    return {
      status: "node_removed",
      id,
      total_nodes: this.builder.nodeCount,
      total_edges: this.builder.edgeCount
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Removing node: ${params["id"] ?? "?"}`;
  }
}
