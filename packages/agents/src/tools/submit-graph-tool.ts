/**
 * SubmitGraphTool -- planner tool that accepts the whole workflow as one
 * graph DSL program.
 *
 * The LLM one-shots the graph as code instead of issuing an add_node /
 * add_edge tool call per element. The program is evaluated in the QuickJS
 * sandbox, loaded into a GraphBuilder, and validated (structural checks plus
 * the node-sdk's static `validateGraph` when the registry supports it).
 * Failures come back as the tool result so the model fixes the program and
 * resubmits — feedback rounds instead of incremental mutation.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { validateGraph } from "@nodetool-ai/node-sdk";
import type { GraphData } from "@nodetool-ai/protocol";
import { Tool } from "./base-tool.js";
import { GraphBuilder } from "../graph-builder.js";
import { evaluateGraphDsl } from "../graph-dsl.js";
import { normalizeModelProperties } from "../normalize-model-properties.js";
import {
  metadataAwareRegistry,
  supportsDeepValidation
} from "./finish-graph-tool.js";

const SUBMIT_GRAPH_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    code: {
      type: "string" as const,
      description:
        "The complete graph program: plain JavaScript using node(type, properties) " +
        "and ref.output(slot?) for wiring, ending with `return graph();`. " +
        "Always submit the FULL program — each submission replaces the previous one."
    }
  },
  required: ["code"] as string[],
  additionalProperties: false as const
};

export interface SubmitGraphToolOptions {
  signal?: AbortSignal;
}

export class SubmitGraphTool extends Tool {
  readonly name = "submit_graph";
  readonly description =
    "Submit the complete workflow graph as one DSL program. Returns validation " +
    "errors to fix (resubmit the full corrected program), or accepts the graph.";
  readonly jsonSchema: Record<string, unknown> = SUBMIT_GRAPH_INPUT_SCHEMA;

  /** The finalized graph, available after a successful submission. */
  private _graph: GraphData | null = null;
  /** Last submitted program — surfaced in the planner's retry prompt. */
  lastCode: string | null = null;
  /** Errors from the last failed submission. */
  lastErrors: string[] = [];

  get graph(): GraphData | null {
    return this._graph;
  }

  constructor(
    private readonly registry: NodeRegistry,
    private readonly options: SubmitGraphToolOptions = {}
  ) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const code = typeof params["code"] === "string" ? params["code"] : "";
    this.lastCode = code;
    this.lastErrors = [];

    const evaluated = await evaluateGraphDsl(code, {
      signal: this.options.signal
    });
    if (!evaluated.graph) {
      const error = evaluated.error ?? "Program produced no graph.";
      this.lastErrors = [error];
      return {
        status: "code_error",
        error,
        ...(evaluated.logs && evaluated.logs.length > 0
          ? { logs: evaluated.logs }
          : {})
      };
    }

    const errors: string[] = [];
    const builder = new GraphBuilder();

    for (const node of evaluated.graph.nodes) {
      if (
        !this.registry.has(node.type) &&
        !this.registry.getMetadata(node.type)
      ) {
        errors.push(
          `Unknown node type: '${node.type}' (node '${node.id}'). Use search_nodes to find available types.`
        );
        continue;
      }
      for (const e of builder.addNode(
        node.id,
        node.type,
        normalizeModelProperties(node.type, node.properties, this.registry),
        node.name
      )) {
        errors.push(e);
      }
    }

    for (const edge of evaluated.graph.edges) {
      for (const e of builder.addEdge(
        edge.source,
        edge.sourceHandle,
        edge.target,
        edge.targetHandle
      )) {
        errors.push(e);
      }
    }

    const warnings: string[] = [];
    if (errors.length === 0) {
      errors.push(...builder.validate());
    }
    if (errors.length === 0 && supportsDeepValidation(this.registry)) {
      const report = validateGraph(
        builder.snapshot(),
        metadataAwareRegistry(this.registry)
      );
      for (const issue of report.issues) {
        if (issue.severity === "error") errors.push(issue.message);
        else warnings.push(issue.message);
      }
    }

    if (errors.length > 0) {
      this.lastErrors = errors;
      return {
        status: "validation_failed",
        errors,
        ...(warnings.length > 0 ? { warnings } : {})
      };
    }

    this._graph = builder.build();
    return {
      status: "graph_accepted",
      nodes: this._graph.nodes.length,
      edges: this._graph.edges.length,
      ...(warnings.length > 0 ? { warnings } : {})
    };
  }

  userMessage(_params: Record<string, unknown>): string {
    return "Submitting workflow graph";
  }
}
