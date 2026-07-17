import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { InputMode, OutputCorrelation } from "@nodetool-ai/protocol";
import { tagAsUniversal } from "@nodetool-ai/nodes-utils";
import { runInnerGraph } from "./run-inner-graph.js";

/**
 * SubgraphNode – executes an inline sub-graph embedded in the same workflow.
 *
 * Differs from WorkflowNode: the inner graph lives in `graph` directly (not
 * referenced by workflow_id), so the entire feature is local to one
 * workflow document. Inputs/outputs are derived from inner
 * `nodetool.input.*` / `nodetool.output.Output` nodes — the same Input/Output
 * node types used at the top level. The node's dynamic props provide values
 * for the inner Input nodes' `name`-keyed params.
 */
export class SubgraphNode extends BaseNode {
  static readonly nodeType = "nodetool.workflows.subgraph.Subgraph";
  static readonly title = "Subgraph";
  static readonly description =
    "Execute an inline sub-graph as an isolated workflow. Inputs/outputs are derived from inner Input/Output nodes.";
  static readonly supportsDynamicInputs = true;
  static readonly supportsDynamicOutputs = true;
  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "single", source: "__execution__" }
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  @prop({ type: "dict", default: { nodes: [], edges: [] } })
  declare graph: { nodes?: unknown[]; edges?: unknown[] };

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const inner = this.graph;
    if (!inner || !Array.isArray(inner.nodes) || !Array.isArray(inner.edges)) {
      yield {};
      return;
    }
    if (inner.nodes.length === 0) {
      yield {};
      return;
    }

    if (!context) {
      throw new Error(
        "SubgraphNode requires a ProcessingContext to run sub-graphs."
      );
    }

    // Dynamic prop values become params keyed by inner Input nodes' `name`.
    const params: Record<string, unknown> = {};
    for (const [key, value] of this.dynamicProps) {
      if (key !== "graph") {
        params[key] = value;
      }
    }

    const output = await runInnerGraph(context, inner, {
      params,
      jobPrefix: "sub",
      failureLabel: "Subgraph"
    });

    yield output;
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    let result: Record<string, unknown> = {};
    for await (const partial of this.genProcess(context)) {
      result = { ...result, ...partial };
    }
    return result;
  }
}

export const SUBGRAPH_NODES = tagAsUniversal([SubgraphNode]);
