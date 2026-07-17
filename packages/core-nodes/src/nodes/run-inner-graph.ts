/**
 * Shared machinery for nodes that execute an inner graph via a child
 * WorkflowRunner: WorkflowNode (references a saved workflow by id) and
 * SubgraphNode (embeds the graph inline). Both take a web-UI graph shape,
 * normalize it to the kernel's node/edge shape, hydrate it through the
 * context's node-type resolver, run it, and fold the runner's outputs back
 * into the properties.name-keyed handles the frontend expects.
 */

import { WorkflowRunner, Graph, withExplicitNodeFlags } from "@nodetool-ai/kernel";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type {
  GraphData,
  HydratedGraphData
} from "@nodetool-ai/protocol";

/** Browser-safe UUID: works in Node and browser bundles alike. */
export const randomUUID = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `uuid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const OUTPUT_TYPE_PREFIXES = ["nodetool.output."];

export interface InnerGraphInput {
  nodes?: unknown[];
  edges?: unknown[];
}

export interface RunInnerGraphOptions {
  /** Dynamic-prop values that become params for the inner Input nodes. */
  params: Record<string, unknown>;
  /** Prefix for the generated child job id (e.g. "sub"). */
  jobPrefix: string;
  /** Optional workflow id passed through to the runner. */
  workflowId?: string;
  /** Label used in the failure message: "<label> failed: ...". */
  failureLabel: string;
}

/**
 * Normalize a web-UI node to the kernel shape: the web UI stores properties
 * under `data` (kernel expects `properties`), and nests actual node properties
 * inside `data.properties`, so unwrap that extra level when present.
 */
export function normalizeNodes(
  nodes: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return nodes.map((n) => {
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
}

/** Normalize a web-UI edge: map its `type`/`edge_type` to the kernel's edge_type. */
export function normalizeEdges(
  edges: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return edges.map((edge) => {
    const rawEdgeType = (edge.edge_type as string) ?? (edge.type as string);
    const edge_type = rawEdgeType === "control" ? "control" : "data";
    const { type: _type, ...rest } = edge;
    return { ...rest, edge_type };
  });
}

/**
 * Run an inner graph on a child WorkflowRunner and return its outputs keyed by
 * the properties.name that the frontend uses for dynamic output handles.
 */
export async function runInnerGraph(
  context: ProcessingContext,
  graph: InnerGraphInput,
  options: RunInnerGraphOptions
): Promise<Record<string, unknown>> {
  if (!context.resolveExecutor) {
    throw new Error(
      `${options.failureLabel} requires a resolveExecutor on the ProcessingContext to run inner graphs.`
    );
  }
  const resolveExecutor = context.resolveExecutor;

  const rawNodes = (graph.nodes ?? []) as Array<Record<string, unknown>>;
  const rawEdges = (graph.edges ?? []) as Array<Record<string, unknown>>;
  const normalizedNodes = normalizeNodes(rawNodes);
  const normalizedEdges = normalizeEdges(rawEdges);

  // Hydrate graph via resolver if available; otherwise behavior flags can only
  // come from the saved graph itself and absent ones default off.
  let hydratedGraph: HydratedGraphData;
  if (context.resolveNodeType) {
    const loaded = await Graph.loadFromDict(
      { nodes: normalizedNodes, edges: normalizedEdges },
      { resolver: { resolveNodeType: context.resolveNodeType } }
    );
    hydratedGraph = { nodes: [...loaded.nodes], edges: [...loaded.edges] };
  } else {
    hydratedGraph = withExplicitNodeFlags({
      nodes: normalizedNodes,
      edges: normalizedEdges
    } as unknown as GraphData);
  }

  // Map runner output keys (node.name ?? node.id) back to the properties.name
  // used as the dynamic output handle name.
  const outputKeyMap = new Map<string, string>();
  for (const n of hydratedGraph.nodes) {
    const nodeType = String(n.type ?? "");
    if (!OUTPUT_TYPE_PREFIXES.some((p) => nodeType.startsWith(p))) continue;
    const nodeId = String(n.id ?? "");
    const nodeName = n.name as string | undefined;
    const runnerKey = nodeName ?? nodeId;
    const props = (n.properties ?? {}) as Record<string, unknown>;
    const outputName =
      typeof props.name === "string" && props.name.trim()
        ? props.name.trim()
        : runnerKey;
    outputKeyMap.set(runnerKey, outputName);
  }

  const jobId = `${options.jobPrefix}-${randomUUID()}`;
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
      workflow_id: options.workflowId || undefined,
      params: options.params
    },
    hydratedGraph
  );

  if (result.status === "failed") {
    throw new Error(
      `${options.failureLabel} failed: ${result.error ?? "unknown error"}`
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

  return output;
}
