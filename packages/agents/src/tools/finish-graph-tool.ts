/**
 * FinishGraphTool -- planner tool that validates and finalizes the graph.
 *
 * Called by the LLM when it's done building the graph. Runs full validation
 * (cycle detection, connectivity) and produces the GraphData.
 */

import type { ProcessingContext } from "@nodetool/runtime";
import type { GraphData } from "@nodetool/protocol";
import { Tool } from "./base-tool.js";
import type { GraphBuilder } from "../graph-builder.js";

const FINISH_GRAPH_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {},
  required: [] as string[]
};

export class FinishGraphTool extends Tool {
  readonly name = "finish_graph";
  readonly description =
    "Validate and finalize the workflow graph. Call this when you are done adding nodes and edges.";
  readonly inputSchema: Record<string, unknown> = FINISH_GRAPH_INPUT_SCHEMA;

  /** The finalized graph, available after a successful call. */
  private _graph: GraphData | null = null;

  get graph(): GraphData | null {
    return this._graph;
  }

  constructor(private readonly builder: GraphBuilder) {
    super();
  }

  async process(
    _context: ProcessingContext,
    _params: Record<string, unknown>
  ): Promise<unknown> {
    const errors = this.builder.validate();
    if (errors.length > 0) {
      return {
        status: "validation_failed",
        errors
      };
    }

    this._graph = this.builder.build();

    return {
      status: "graph_finalized",
      nodes: this._graph.nodes.length,
      edges: this._graph.edges.length
    };
  }

  userMessage(_params: Record<string, unknown>): string {
    return "Finalizing workflow graph";
  }
}
