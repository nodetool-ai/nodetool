import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { WorkflowRunner, Graph } from "@nodetool-ai/kernel";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import { randomUUID } from "node:crypto";

/**
 * WorkflowNode – executes a sub-workflow selected by the user.
 *
 * The frontend stores the selected workflow's graph in `workflow_json`
 * and maps its input/output nodes to dynamic inputs/outputs.
 * This node creates a child WorkflowRunner, dispatches dynamic input
 * values as params, runs the sub-workflow, and returns collected outputs.
 */
export class WorkflowNode extends BaseNode {
  static readonly nodeType = "nodetool.workflows.workflow_node.Workflow";
  static readonly title = "Workflow";
  static readonly description =
    "Execute a sub-workflow. Select a workflow to populate its inputs and outputs dynamically.";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly isStreamingOutput = true;

  @prop({ type: "str", default: "" })
  declare workflow_id: string;

  @prop({ type: "dict", default: {} })
  declare workflow_json: Record<string, unknown>;

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const workflowJson = this.workflow_json;
    if (!workflowJson || !workflowJson.graph) {
      yield {};
      return;
    }

    const graph = workflowJson.graph as {
      nodes?: Array<Record<string, unknown>>;
      edges?: Array<Record<string, unknown>>;
    };
    if (!graph.nodes || !graph.edges) {
      yield {};
      return;
    }

    if (!context?.resolveExecutor) {
      throw new Error(
        "WorkflowNode requires a resolveExecutor on the ProcessingContext to run sub-workflows."
      );
    }

    const resolveExecutor = context.resolveExecutor;

    // Normalize graph: web UI stores properties under `data`, kernel expects `properties`.
    // The web UI nests actual node properties inside `data.properties`, so when we
    // move `data` → `properties` we must unwrap that extra level so the runner
    // sees e.g. `node.properties.name` instead of `node.properties.properties.name`.
    const normalizedNodes = graph.nodes.map((n) => {
      if (n.properties === undefined && n.data !== undefined) {
        const { data, ...rest } = n;
        const dataObj = data as Record<string, unknown>;
        // If data has a nested `properties` object, use that as the node properties
        // (this is the web UI's format: data.properties holds the actual node props).
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
    const normalizedEdges = graph.edges.map((edge) => {
      const rawEdgeType = (edge.edge_type as string) ?? (edge.type as string);
      const edge_type = rawEdgeType === "control" ? "control" : "data";
      const { type: _type, ...rest } = edge;
      return { ...rest, edge_type };
    });

    // Hydrate graph via resolver if available
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

    // Collect dynamic input values as params for the sub-workflow's input nodes
    const params: Record<string, unknown> = {};
    for (const [key, value] of this.dynamicProps) {
      if (key !== "workflow_id" && key !== "workflow_json") {
        params[key] = value;
      }
    }

    // Build a mapping from runner output key (node.name ?? node.id) to the
    // output node's properties.name. The frontend uses properties.name as
    // the dynamic output handle name, but the runner keys by node.name ?? node.id.
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
      {
        job_id: jobId,
        workflow_id: this.workflow_id || undefined,
        params
      },
      hydratedGraph as unknown as { nodes: NodeDescriptor[]; edges: Edge[] }
    );

    if (result.status === "failed") {
      throw new Error(
        `Sub-workflow failed: ${result.error ?? "unknown error"}`
      );
    }

    // Map outputs: the runner collects outputs keyed by output node name/id.
    // Remap to the properties.name used by the frontend as dynamic output handles.
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
    // genProcess is the primary path; this fallback collects its output.
    let result: Record<string, unknown> = {};
    for await (const partial of this.genProcess(context)) {
      result = { ...result, ...partial };
    }
    return result;
  }
}

export const WORKFLOW_NODES = [WorkflowNode] as const;
