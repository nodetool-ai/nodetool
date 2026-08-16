/**
 * executeAgentGraph -- executes a graph plan via the kernel's WorkflowRunner.
 *
 * Takes a GraphData (produced by `authorGraph`) and runs it through the
 * kernel. Every node resolves through the provided NodeRegistry. Authored
 * Agent nodes carry no execution policy of their own; the run's model, system
 * prompt, and turn budget are stamped onto them and its live tool set is
 * injected into the context, so they run like any hand-placed Agent node.
 */

import { WorkflowRunner } from "@nodetool-ai/kernel";
import {
  hydrateGraphNodeFlags,
  type NodeRegistry
} from "@nodetool-ai/node-sdk";
import type { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import type {
  GraphData,
  ProcessingMessage,
  NodeUpdate,
  StepResult
} from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";
import { AGENT_NODE_TYPE } from "./graph-builder.js";
import type { Tool } from "./tools/base-tool.js";
import { randomUUID } from "node:crypto";
import { isString } from "./utils/type-guards.js";

const log = createLogger("nodetool.agents.workflow-runner");

/** The run-level execution policy stamped onto planner-authored Agent nodes. */
export interface RunPolicy {
  providerId: string;
  modelId: string;
  systemPrompt?: string;
  maxStepIterations?: number;
  maxTokens?: number;
}

/**
 * Stamp the run's execution policy onto planner-authored Agent nodes.
 *
 * The planner emits bare Agent nodes: no model (it cannot know which are
 * configured), no system prompt, no turn budget. The run owns all three, so
 * they are written in here. A property the node already carries wins — a
 * hand-authored graph, or a model the planner pinned via `find_model`, is
 * never overwritten.
 *
 * Exported because a planned graph is only runnable once this has been applied:
 * anything that executes planner output outside `executeAgentGraph` (the
 * `graph-e2e` eval suite) has to stamp the same policy, or every Agent node
 * dies on "Select a model".
 */
export function applyRunPolicy(
  graphData: GraphData,
  policy: RunPolicy
): GraphData {
  const { providerId, modelId, systemPrompt, maxStepIterations, maxTokens } =
    policy;
  return {
    ...graphData,
    nodes: graphData.nodes.map((node) => {
      if (node.type !== AGENT_NODE_TYPE) return node;
      const properties = { ...(node.properties ?? {}) };

      const model = properties["model"] as
        | { provider?: string; id?: string }
        | undefined;
      if (!model?.provider || model.provider === "empty" || !model.id) {
        properties["model"] = {
          type: "language_model",
          provider: providerId,
          id: modelId,
          name: modelId,
          path: null,
          supported_tasks: []
        };
      }

      // The run's system prompt carries the merged skill/memory instructions.
      const system = properties["system"];
      if (systemPrompt && (!isString(system) || system.length === 0)) {
        properties["system"] = systemPrompt;
      }

      // `maxStepIterations` is the run's per-step turn budget; on the node it
      // is `max_turns`, which otherwise defaults to 100.
      if (maxStepIterations !== undefined && properties["max_turns"] == null) {
        properties["max_turns"] = maxStepIterations;
      }

      // Same for the run's output-token cap, which the node calls `max_tokens`.
      if (maxTokens !== undefined && properties["max_tokens"] == null) {
        properties["max_tokens"] = maxTokens;
      }

      return { ...node, properties };
    })
  };
}

export interface ExecuteAgentGraphOptions {
  provider: BaseProvider;
  model: string;
  registry: NodeRegistry;
  tools: Tool[];
  context: ProcessingContext;
  /** Merged system/skill/memory prompt; stamped onto Agent nodes. */
  systemPrompt?: string;
  /** Per-step turn budget; stamped onto Agent nodes as `max_turns`. */
  maxStepIterations?: number;
  /** Output-token cap per turn; stamped onto Agent nodes as `max_tokens`. */
  maxTokens?: number;
  inputs?: Record<string, unknown>;
  /** External cancellation; aborting it cancels the kernel run. */
  signal?: AbortSignal;
}

/**
 * Execute a graph plan and yield ProcessingMessages live as the kernel emits them.
 */
export async function* executeAgentGraph(
  graphData: GraphData,
  opts: ExecuteAgentGraphOptions
): AsyncGenerator<ProcessingMessage> {
  const jobId = randomUUID();
  const { provider, model, registry, tools, context } = opts;

  // Agent nodes select tools by name; only the caller holds the wired
  // instances (MCP, workspace, skills, security-gated), so hand them to the
  // context for the nodes to pick up. The injection is scoped to a child
  // context: setting it on the shared one permanently replaced whatever the
  // caller had wired, and two runs on the same context clobbered each other.
  // The child shares agent memory (sub-agents inside the graph must see the
  // run's step/task results) and carries the cancellation signal.
  const runContext = context.copy({
    shareMemory: true,
    inheritMessageListeners: false
  });
  runContext.setInjectedTools(tools);

  const resolvedGraph = applyRunPolicy(graphData, {
    providerId: provider.provider,
    modelId: model,
    systemPrompt: opts.systemPrompt,
    maxStepIterations: opts.maxStepIterations,
    maxTokens: opts.maxTokens
  });

  const runner = new WorkflowRunner(jobId, {
    resolveExecutor: (node: { id: string; type: string }) =>
      registry.resolve(node),
    executionContext: runContext
  });

  log.info("Executing agent graph", {
    jobId,
    nodes: resolvedGraph.nodes.length,
    edges: resolvedGraph.edges.length
  });

  // Stream kernel messages live to our generator through the documented
  // listener API. Monkeypatching `emit` on the shared context raced any other
  // execution holding the same context — whichever run restored last won.
  const queue: ProcessingMessage[] = [];
  let waiter: (() => void) | null = null;
  const wake = (): void => {
    const w = waiter;
    waiter = null;
    w?.();
  };
  const removeListener = runContext.addMessageListener(
    (msg: ProcessingMessage) => {
      // Forward to the parent so callers reading the shared context's queue
      // and listeners see the graph run, then feed this generator.
      context.emit(msg);
      queue.push(msg);
      wake();
    }
  );

  // An outer abort must stop the kernel run itself — without this the graph
  // keeps executing (and burning provider calls) until it finishes on its
  // own, since nothing else observes the signal.
  const signal = opts.signal;
  const onAbort = (): void => runner.cancel();
  if (signal?.aborted) runner.cancel();
  else signal?.addEventListener("abort", onAbort, { once: true });

  let runError: unknown = null;
  let done = false;
  const runPromise = runner
    .run(
      { job_id: jobId, params: opts.inputs },
      // Planned graphs carry no behavior flags; stamp them from the
      // registry so streaming nodes run streaming.
      hydrateGraphNodeFlags(resolvedGraph, registry)
    )
    .catch((err) => {
      runError = err;
      return undefined;
    })
    .finally(() => {
      done = true;
      wake();
    });

  try {
    while (true) {
      while (queue.length > 0) {
        yield queue.shift()!;
      }
      if (done) break;
      await new Promise<void>((resolve) => {
        waiter = resolve;
      });
    }
  } finally {
    removeListener();
    signal?.removeEventListener("abort", onAbort);
    if (!done) {
      runner.cancel();
      await runPromise;
    }
  }

  if (runError) {
    throw runError instanceof Error ? runError : new Error(String(runError));
  }

  const result = await runPromise;
  if (!result) {
    throw new Error("Workflow execution produced no result");
  }

  if (result.status === "failed") {
    throw new Error(result.error ?? "Workflow execution failed");
  }

  const nodeErrors = (result.messages ?? []).filter(
    (m: ProcessingMessage): m is NodeUpdate =>
      m.type === "node_update" && m.status === "error"
  );
  if (nodeErrors.length > 0) {
    log.error("Node execution errors", {
      count: nodeErrors.length,
      first: nodeErrors[0].error
    });
  }

  log.info("Agent graph execution complete", {
    jobId,
    status: result.status,
    outputKeys: Object.keys(result.outputs)
  });

  // Yield a final step_result with the graph outputs so callers can
  // capture the result (Agent checks is_task_result).
  if (result.status === "completed" && Object.keys(result.outputs).length > 0) {
    yield {
      type: "step_result",
      step: { name: "graph_execution", status: "completed" },
      result: result.outputs,
      is_task_result: true
    } satisfies StepResult;
  }
}
