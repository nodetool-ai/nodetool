/**
 * RemoveEdgeTool -- planner tool that deletes one edge from the graph being
 * built, so a mis-wired connection is correctable in place.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";
import type { GraphBuilder } from "../graph-builder.js";

const REMOVE_EDGE_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    source: {
      type: "string" as const,
      description: "ID of the source node"
    },
    source_handle: {
      type: "string" as const,
      description: "Output slot name on the source node"
    },
    target: {
      type: "string" as const,
      description: "ID of the target node"
    },
    target_handle: {
      type: "string" as const,
      description: "Input property name on the target node"
    }
  },
  required: ["source", "source_handle", "target", "target_handle"] as string[]
};

export class RemoveEdgeTool extends Tool {
  readonly name = "remove_edge";
  readonly description =
    "Remove an edge from the workflow graph. Identify it by the exact source, " +
    "source_handle, target, and target_handle used when it was added.";
  readonly jsonSchema: Record<string, unknown> = REMOVE_EDGE_INPUT_SCHEMA;

  constructor(private readonly builder: GraphBuilder) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const source = params["source"] as string | undefined;
    const sourceHandle = params["source_handle"] as string | undefined;
    const target = params["target"] as string | undefined;
    const targetHandle = params["target_handle"] as string | undefined;

    if (!source || !sourceHandle || !target || !targetHandle) {
      return {
        status: "error",
        errors: [
          "All fields required: source, source_handle, target, target_handle"
        ]
      };
    }

    const errors = this.builder.removeEdge(
      source,
      sourceHandle,
      target,
      targetHandle
    );
    if (errors.length > 0) {
      return { status: "error", errors };
    }
    return {
      status: "edge_removed",
      from: `${source}.${sourceHandle}`,
      to: `${target}.${targetHandle}`,
      total_edges: this.builder.edgeCount
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Removing edge ${params["source"]}.${params["source_handle"]} → ${params["target"]}.${params["target_handle"]}`;
  }
}
