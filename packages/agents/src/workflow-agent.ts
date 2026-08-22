/**
 * Workflows as agents — the run half of `Agent`'s graph branch.
 *
 * A saved workflow is already a plan, so this path has no planning phase: the
 * graph runs on the kernel through `ExecutionSession`, and the agent supplies
 * judgment only where a node breaks, as the run's `SupervisorHandle`. That is
 * the whole difference from `executeAgentGraph`, which executes a graph the
 * planner just wrote and cannot supervise it.
 *
 * See docs/workflow-supervisor-design.md §7 entry point 3.
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import {
  ExecutionSession,
  toRawGraphInput,
  type ExecutionSessionOptions
} from "@nodetool-ai/execution";
import type { RunResult, SupervisorHandle } from "@nodetool-ai/kernel";
import {
  createGraphNodeTypeResolver,
  type NodeRegistry
} from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { GraphData, ProcessingMessage } from "@nodetool-ai/protocol";

const log = createLogger("nodetool.agents.workflow-agent");

/** Either an inline graph or a saved workflow to hydrate one from. */
export type AgentGraphSource = GraphData | { workflowId: string };

export interface WorkflowAgentRunOptions {
  graph: GraphData;
  /** Resolves every node's executor. Hydration reads flags off it too. */
  registry: NodeRegistry;
  /** The run's context. A child copy is made so listeners stay separated. */
  context: ProcessingContext;
  /** Start params, keyed by input-node name. */
  params?: Record<string, unknown>;
  /**
   * The run's supervisor, already wrapped in the kernel's `BoundedHandle`.
   * Omitted, the run behaves exactly as an unsupervised one.
   */
  supervisor?: SupervisorHandle;
  /** External cancellation; aborting it cancels the run. */
  signal?: AbortSignal;
}

/**
 * Hydrate a graph source into a graph. A `{ workflowId }` source is read from
 * the workflow table under the context's user, so a workflow the caller may
 * not read stays unreadable here too.
 */
export async function resolveAgentGraph(
  source: AgentGraphSource,
  context: ProcessingContext
): Promise<GraphData> {
  if (!("workflowId" in source)) return source;
  const { Workflow } = await import("@nodetool-ai/models");
  const workflow = await Workflow.find(context.userId, source.workflowId);
  if (!workflow) {
    throw new Error(`Workflow not found: ${source.workflowId}`);
  }
  // A saved graph is stored as plain records. What a `NodeDescriptor` and an
  // `Edge` add over that is the declared string type of their identity
  // fields, so read those out rather than assert them.
  const saved = workflow.getGraph();
  return {
    nodes: saved.nodes.map((n) => ({
      ...n,
      id: String(n.id ?? ""),
      type: String(n.type ?? "")
    })),
    edges: saved.edges.map((e) => ({
      ...e,
      source: String(e.source ?? ""),
      sourceHandle: String(e.sourceHandle ?? ""),
      target: String(e.target ?? ""),
      targetHandle: String(e.targetHandle ?? "")
    }))
  };
}

/**
 * Run a graph and yield the kernel's messages live; the terminal `RunResult`
 * is the generator's return value.
 *
 * Messages are forwarded to the caller's context as well as yielded, matching
 * `executeAgentGraph`: a host that only reads the shared context's queue (the
 * websocket runner, when an Agent node runs inside a workflow) must still see
 * the inner run.
 */
export async function* runWorkflowAsAgent(
  options: WorkflowAgentRunOptions
): AsyncGenerator<ProcessingMessage, RunResult> {
  const { graph, registry, context, supervisor, signal } = options;
  const jobId = randomUUID();

  // A child context keeps the inner run's listeners off the caller's, the same
  // separation `executeAgentGraph` makes; memory is shared so sub-agents
  // inside the graph — and the supervisor's `supervisor:` keys — land in the
  // run's one memory.
  const runContext = context.copy({
    shareMemory: true,
    inheritMessageListeners: false
  });
  const removeListener = runContext.addMessageListener((message) => {
    context.emit(message);
  });

  const sessionOptions: ExecutionSessionOptions = {
    graph: toRawGraphInput(graph),
    registry,
    // Registry alone hydrates node flags but not `propertyTypes`, and
    // correlation analysis reads list-ness only from that map — without it
    // every `list[...]` handle reads as non-list, so a stream arriving on one
    // collapses to empty scope and the node runs once on the last value. The
    // agent would then report a result the same graph does not produce under
    // `workflows run`.
    resolveNodeType: createGraphNodeTypeResolver(registry).resolveNodeType,
    jobId,
    context: runContext,
    params: options.params ?? {},
    captureMessages: true
  };
  if (supervisor) sessionOptions.supervisor = supervisor;
  // `create()` refuses a graph this runtime cannot honour (unknown model,
  // unregistered provider, missing credential) before the kernel starts. The
  // refusal is the caller's to report, but the forwarding listener is this
  // function's to remove — otherwise a refused run leaves one attached.
  let session: ExecutionSession;
  try {
    session = await ExecutionSession.create(sessionOptions);
  } catch (err) {
    removeListener();
    throw err;
  }

  const onAbort = (): void => session.cancel("cancelled");
  if (signal?.aborted) session.cancel("cancelled");
  else signal?.addEventListener("abort", onAbort, { once: true });

  log.info("Running workflow as agent", {
    jobId,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    supervised: Boolean(supervisor)
  });

  let drained = false;
  try {
    for await (const message of session.messages) {
      yield message;
    }
    drained = true;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    removeListener();
    // A consumer that stops early (a `break`, or a throw upstream) leaves the
    // run executing and billing. The stream only closes when the run settles,
    // so anything short of a full drain means the caller walked away.
    if (!drained) session.cancel("cancelled");
  }

  const result = await session.result;
  log.info("Workflow-as-agent run finished", {
    jobId,
    status: result.status,
    interventions: result.interventions?.length ?? 0
  });
  return result;
}
