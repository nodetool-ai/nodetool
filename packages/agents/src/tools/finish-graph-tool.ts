/**
 * FinishGraphTool -- planner tool that validates and finalizes the graph.
 *
 * Called by the LLM when it's done building the graph. Runs structural
 * validation (cycle detection, connectivity) plus — when a registry is
 * supplied — the node-sdk's static `validateGraph` (missing required
 * properties, unknown handles, type mismatches), so property-level breakage
 * surfaces while the model can still fix it instead of at runtime.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { GraphData } from "@nodetool-ai/protocol";
import {
  validateGraph,
  type GraphValidationRegistry,
  type NodeMetadata
} from "@nodetool-ai/node-sdk";
import { Tool } from "./base-tool.js";
import { type GraphBuilder } from "../graph-builder.js";

const FINISH_GRAPH_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {},
  required: [] as string[]
};

/**
 * Wrap the planner's registry so `validateGraph` treats metadata-only (Python)
 * node types as known rather than unknown, mirroring the check `add_node`
 * applies at add time. Everything else passes through.
 */
export function metadataAwareRegistry(
  registry: GraphValidationRegistry
): GraphValidationRegistry {
  return {
    has: (nodeType: string) =>
      registry.has(nodeType) || registry.getMetadata(nodeType) != null,
    getMetadata: (nodeType: string): NodeMetadata | undefined =>
      registry.getMetadata(nodeType),
    validateNode: (descriptor, connectedHandles) =>
      registry.validateNode(descriptor, connectedHandles)
  };
}

/** True when the registry implements the full validation surface (stubs and mocks often don't). */
export function supportsDeepValidation(
  registry: unknown
): registry is GraphValidationRegistry {
  const r = registry as Partial<GraphValidationRegistry> | null | undefined;
  return (
    !!r &&
    typeof r.has === "function" &&
    typeof r.getMetadata === "function" &&
    typeof r.validateNode === "function"
  );
}

export class FinishGraphTool extends Tool {
  readonly name = "finish_graph";
  readonly description =
    "Validate and finalize the workflow graph. Call this when you are done adding nodes and edges.";
  readonly jsonSchema: Record<string, unknown> = FINISH_GRAPH_INPUT_SCHEMA;

  /** The finalized graph, available after a successful call. */
  private _graph: GraphData | null = null;

  get graph(): GraphData | null {
    return this._graph;
  }

  constructor(
    private readonly builder: GraphBuilder,
    private readonly registry?: unknown
  ) {
    super();
  }

  async process(
    _context: ProcessingContext,
    _params: Record<string, unknown>
  ): Promise<unknown> {
    const errors = this.builder.validate();
    const warnings: string[] = [];

    if (errors.length === 0 && supportsDeepValidation(this.registry)) {
      const report = validateGraph(
        this.builder.snapshot(),
        metadataAwareRegistry(this.registry)
      );
      for (const issue of report.issues) {
        if (issue.severity === "error") errors.push(issue.message);
        else warnings.push(issue.message);
      }
    }

    if (errors.length > 0) {
      return {
        status: "validation_failed",
        errors,
        ...(warnings.length > 0 ? { warnings } : {})
      };
    }

    this._graph = this.builder.build();

    return {
      status: "graph_finalized",
      nodes: this._graph.nodes.length,
      edges: this._graph.edges.length,
      ...(warnings.length > 0 ? { warnings } : {})
    };
  }

  userMessage(_params: Record<string, unknown>): string {
    return "Finalizing workflow graph";
  }
}
