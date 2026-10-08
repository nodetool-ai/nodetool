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
  Edge,
  HydratedGraphData,
  NodeDescriptor
} from "@nodetool-ai/protocol";

/** Browser-safe UUID: works in Node and browser bundles alike. */
export const randomUUID = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `uuid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const OUTPUT_TYPE_PREFIXES = ["nodetool.output."];

interface InnerGraphInput {
  nodes?: unknown[];
  edges?: unknown[];
}

interface RunInnerGraphOptions {
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

/** Context variable holding the workflow ids of the inner graphs on the call path. */
const INNER_GRAPH_STACK_KEY = "__nodetool_inner_graph_stack";
/** Deepest nesting of inner graphs (apps, workflows, subgraphs) one run allows. */
export const MAX_INNER_GRAPH_DEPTH = 8;

/**
 * Hydrate an inner graph and map each output node's id to the properties.name
 * the frontend uses as the dynamic output handle name.
 */
async function prepareInnerGraph(
  context: ProcessingContext,
  graph: InnerGraphInput
): Promise<{
  hydratedGraph: HydratedGraphData;
  outputNodeNames: Map<string, string>;
}> {
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
      nodes: normalizedNodes.map((node) => {
        const { id, type } = node;
        // SAFETY: an inner graph is a saved workflow graph, whose nodes carry
        // a string `id` and `type` — the same fields `loadFromDict` proves on
        // the branch above. Restated here so the descriptor shape is explicit.
        return { ...node, id, type } as NodeDescriptor;
      }),
      // SAFETY: `Edge`'s required handles are strings in a saved graph, and
      // `normalizeEdges` preserves them.
      edges: normalizedEdges as Edge[]
    });
  }

  // Key each output node by the properties.name used as the dynamic output
  // handle name. Hydration fills `name` with the node title ("Output"), and
  // the runner collects outputs under `name` first, so without this two Output
  // nodes collapse into one array under one handle.
  const outputNodeNames = new Map<string, string>();
  const nodes = hydratedGraph.nodes.map((n) => {
    const nodeType = String(n.type ?? "");
    if (!OUTPUT_TYPE_PREFIXES.some((p) => nodeType.startsWith(p))) return n;
    const nodeId = String(n.id ?? "");
    const props = n.properties ?? {};
    const outputName =
      typeof props.name === "string" && props.name.trim()
        ? props.name.trim()
        : (n.name ?? nodeId);
    outputNodeNames.set(nodeId, outputName);
    return { ...n, name: outputName };
  });
  return {
    hydratedGraph: { ...hydratedGraph, nodes },
    outputNodeNames
  };
}

/**
 * Derive the context an inner graph runs on.
 *
 * The child runner publishes its own cancellation signal, trigger event,
 * control-event dispatcher and channel teardown on the context it is given.
 * On the parent's context that would replace the parent run's signal (so a
 * Stop no longer reached the parent's nodes) and close the parent's variable
 * channels when the inner graph finished. A copy keeps all of that local.
 */
function childContextFor(
  context: ProcessingContext,
  jobId: string,
  workflowId: string | undefined
): ProcessingContext {
  const stack = context.get<unknown>(INNER_GRAPH_STACK_KEY, []);
  const callPath = Array.isArray(stack)
    ? stack.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (callPath.length >= MAX_INNER_GRAPH_DEPTH) {
    throw new Error(
      `Inner graphs are nested more than ${MAX_INNER_GRAPH_DEPTH} levels deep.`
    );
  }
  if (workflowId && callPath.includes(workflowId)) {
    throw new Error(
      `Workflow ${workflowId} runs itself through an App or Workflow node.`
    );
  }

  // Parent listeners are not inherited: messages are forwarded to the parent
  // one by one below, so each listener sees each message once. The context
  // keeps the parent's job id: assets and generations an inner node creates
  // belong to the run the user started, not to the inner runner's id.
  const child = context.copy({ inheritMessageListeners: false });
  child.set(INNER_GRAPH_STACK_KEY, [...callPath, workflowId ?? jobId]);
  const resolveExecutor = context.resolveExecutor;
  if (resolveExecutor) child.setResolveExecutor(resolveExecutor);
  if (context.resolveNodeType) child.setResolveNodeType(context.resolveNodeType);
  return child;
}

/**
 * Run an inner graph on a child WorkflowRunner.
 *
 * Yields `{ [outputName]: value }` each time an inner Output node emits, so a
 * streaming inner graph streams through the node that wraps it. Returns the
 * collected outputs keyed by output name, as {@link runInnerGraph} does.
 *
 * Inner messages are forwarded to the parent context, except the child's own
 * `job_update`s: the parent run's clients must not read the inner run's
 * completion as their own. A cancelled parent cancels the inner run, and the
 * inner run's cost is added to the parent's total.
 */
export async function* streamInnerGraph(
  context: ProcessingContext,
  graph: InnerGraphInput,
  options: RunInnerGraphOptions
): AsyncGenerator<Record<string, unknown>, Record<string, unknown>> {
  const resolveExecutor = context.resolveExecutor;
  if (!resolveExecutor) {
    throw new Error(
      `${options.failureLabel} requires a resolveExecutor on the ProcessingContext to run inner graphs.`
    );
  }
  context.signal.throwIfAborted();

  const { hydratedGraph, outputNodeNames } =
    await prepareInnerGraph(context, graph);

  const jobId = `${options.jobPrefix}-${randomUUID()}`;
  const child = childContextFor(context, jobId, options.workflowId);
  const startCost = child.getTotalCost();

  const pending: Array<Record<string, unknown>> = [];
  let wake: (() => void) | null = null;
  const notify = (): void => {
    const resolve = wake;
    wake = null;
    resolve?.();
  };
  child.addMessageListener((msg) => {
    // The child keeps no queue of its own: nothing drains it, and a long
    // streaming inner run would otherwise hold every message it ever sent.
    child.clearMessages();
    if (msg.type === "job_update") return;
    context.emit(msg);
    if (msg.type !== "output_update" || msg.value === undefined) return;
    const outputName = outputNodeNames.get(msg.node_id);
    if (outputName === undefined) return;
    pending.push({ [outputName]: msg.value });
    notify();
  });

  const runner = new WorkflowRunner(jobId, {
    resolveExecutor: (node) =>
      resolveExecutor(
        node as { id: string; type: string; [key: string]: unknown }
      ),
    executionContext: child
  });
  const onParentAbort = (): void => runner.cancel();
  context.signal.addEventListener("abort", onParentAbort, { once: true });

  let settled = false;
  const run = runner
    .run(
      {
        job_id: jobId,
        workflow_id: options.workflowId || undefined,
        params: options.params
      },
      hydratedGraph
    )
    .finally(() => {
      settled = true;
      notify();
    });

  try {
    for (;;) {
      while (pending.length > 0) {
        const next = pending.shift();
        if (next) yield next;
      }
      if (settled) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
    const result = await run;
    if (result.status === "failed") {
      throw new Error(
        `${options.failureLabel} failed: ${result.error ?? "unknown error"}`
      );
    }

    const output: Record<string, unknown> = {};
    for (const [outputName, vals] of Object.entries(result.outputs)) {
      if (vals.length === 1) {
        output[outputName] = vals[0];
      } else if (vals.length > 1) {
        output[outputName] = vals;
      }
    }
    return output;
  } finally {
    context.signal.removeEventListener("abort", onParentAbort);
    if (!settled) {
      // The consumer stopped reading (the wrapping node was torn down), so
      // nothing will use what the inner run produces next.
      runner.cancel();
      await run.catch(() => undefined);
    }
    context.addToTotalCost(child.getTotalCost() - startCost);
  }
}

/**
 * Run an inner graph to completion and return its outputs keyed by the
 * properties.name that the frontend uses for dynamic output handles.
 */
export async function runInnerGraph(
  context: ProcessingContext,
  graph: InnerGraphInput,
  options: RunInnerGraphOptions
): Promise<Record<string, unknown>> {
  const stream = streamInnerGraph(context, graph, options);
  for (;;) {
    const step = await stream.next();
    if (step.done) return step.value;
  }
}
