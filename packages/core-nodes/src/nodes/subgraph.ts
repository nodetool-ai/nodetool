import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { WorkflowRunner, Graph } from "@nodetool-ai/kernel";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type {
  NodeDescriptor,
  Edge,
  InputMode,
  OutputCorrelation
} from "@nodetool-ai/protocol";
import { randomUUID } from "node:crypto";
import { tagAsUniversal } from "@nodetool-ai/nodes-utils";

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

    if (!context?.resolveExecutor) {
      throw new Error(
        "SubgraphNode requires a resolveExecutor on the ProcessingContext to run sub-graphs."
      );
    }
    const resolveExecutor = context.resolveExecutor;

    // Normalize: web UI stores properties under `data`; kernel expects `properties`.
    const rawNodes = inner.nodes as Array<Record<string, unknown>>;
    const rawEdges = inner.edges as Array<Record<string, unknown>>;
    const normalizedNodes = rawNodes.map((n) => {
      if (n.properties === undefined && n.data !== undefined) {
        const { data, ...rest } = n;
        const dataObj = data as Record<string, unknown>;
        const props =
          dataObj.properties &&
          typeof dataObj.properties === "object" &&
          !Array.isArray(dataObj.properties)
            ? dataObj.properties
            : dataObj;
        return { ...rest, properties: props };
      }
      return { ...n };
    });
    const normalizedEdges = rawEdges.map((edge) => {
      const rawEdgeType = (edge.edge_type as string) ?? (edge.type as string);
      const edge_type = rawEdgeType === "control" ? "control" : "data";
      const { type: _type, ...rest } = edge;
      return { ...rest, edge_type };
    });

    let hydratedGraph: {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
    };
    if (context.resolveNodeType) {
      const loaded = await Graph.loadFromDict(
        { nodes: normalizedNodes, edges: normalizedEdges },
        { resolver: { resolveNodeType: context.resolveNodeType } }
      );
      hydratedGraph = {
        nodes: [...loaded.nodes] as unknown as Array<Record<string, unknown>>,
        edges: [...loaded.edges] as unknown as Array<Record<string, unknown>>
      };
    } else {
      hydratedGraph = { nodes: normalizedNodes, edges: normalizedEdges };
    }

    // Dynamic prop values become params keyed by inner Input nodes' `name`.
    const params: Record<string, unknown> = {};
    for (const [key, value] of this.dynamicProps) {
      if (key !== "graph") {
        params[key] = value;
      }
    }

    // Map runner output keys (node.name ?? node.id) back to the
    // properties.name used as the dynamic output handle name.
    const OUTPUT_TYPE_PREFIXES = ["nodetool.output."];
    const outputKeyMap = new Map<string, string>();
    for (const n of hydratedGraph.nodes) {
      const nodeType = String(n.type ?? "");
      if (!OUTPUT_TYPE_PREFIXES.some((p) => nodeType.startsWith(p))) continue;
      const nodeId = String(n.id ?? "");
      const nodeName = n.name as string | undefined;
      const runnerKey = nodeName ?? nodeId;
      const props = (n.properties ?? n.data ?? {}) as Record<string, unknown>;
      const outputName =
        typeof props.name === "string" && props.name.trim()
          ? props.name.trim()
          : runnerKey;
      outputKeyMap.set(runnerKey, outputName);
    }

    const jobId = `sub-${randomUUID()}`;
    const runner = new WorkflowRunner(jobId, {
      resolveExecutor: (node) =>
        resolveExecutor(
          node as { id: string; type: string; [key: string]: unknown }
        ),
      executionContext: context
    });

    const result = await runner.run(
      { job_id: jobId, params },
      hydratedGraph as unknown as { nodes: NodeDescriptor[]; edges: Edge[] }
    );

    if (result.status === "failed") {
      throw new Error(
        `Subgraph failed: ${result.error ?? "unknown error"}`
      );
    }

    const output: Record<string, unknown> = {};
    for (const [runnerKey, vals] of Object.entries(result.outputs)) {
      const outputName = outputKeyMap.get(runnerKey) ?? runnerKey;
      const arr = vals as unknown[];
      if (arr.length === 1) {
        output[outputName] = arr[0];
      } else if (arr.length > 1) {
        output[outputName] = arr;
      }
    }

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
