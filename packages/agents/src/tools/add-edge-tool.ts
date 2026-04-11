/**
 * AddEdgeTool -- planner tool that connects two nodes in the graph.
 */

import type { ProcessingContext } from "@nodetool/runtime";
import type { NodeRegistry } from "@nodetool/node-sdk";
import { Tool } from "./base-tool.js";
import { AGENT_STEP_NODE_TYPE, type GraphBuilder } from "../graph-builder.js";

const ADD_EDGE_INPUT_SCHEMA = {
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

export class AddEdgeTool extends Tool {
  readonly name = "add_edge";
  readonly description =
    "Connect two nodes by creating an edge from a source output to a target input.";
  readonly inputSchema: Record<string, unknown> = ADD_EDGE_INPUT_SCHEMA;

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

    // Validate handles against registry metadata for deterministic nodes
    const validationErrors: string[] = [];

    const sourceNode = this.builder.getNode(source);
    if (sourceNode && sourceNode.type !== AGENT_STEP_NODE_TYPE) {
      const meta = this.registry.getMetadata(sourceNode.type);
      if (meta) {
        const outputNames = meta.outputs.map((o: { name: string }) => o.name);
        if (outputNames.length > 0 && !outputNames.includes(sourceHandle)) {
          validationErrors.push(
            `Source node '${source}' (${sourceNode.type}) has no output '${sourceHandle}'. Available: ${outputNames.join(", ")}`
          );
        }
      }
    }

    const targetNode = this.builder.getNode(target);
    if (targetNode && targetNode.type !== AGENT_STEP_NODE_TYPE) {
      const meta = this.registry.getMetadata(targetNode.type);
      if (meta) {
        const inputNames = meta.properties.map((p: { name: string }) => p.name);
        if (inputNames.length > 0 && !inputNames.includes(targetHandle)) {
          validationErrors.push(
            `Target node '${target}' (${targetNode.type}) has no input '${targetHandle}'. Available: ${inputNames.join(", ")}`
          );
        }
      }
    }

    if (validationErrors.length > 0) {
      return { status: "error", errors: validationErrors };
    }

    const errors = this.builder.addEdge(
      source,
      sourceHandle,
      target,
      targetHandle
    );
    if (errors.length > 0) {
      return { status: "error", errors };
    }

    return {
      status: "edge_added",
      from: `${source}.${sourceHandle}`,
      to: `${target}.${targetHandle}`,
      total_edges: this.builder.edgeCount
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Connecting ${params["source"]}.${params["source_handle"]} → ${params["target"]}.${params["target_handle"]}`;
  }
}
