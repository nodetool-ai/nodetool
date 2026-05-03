/**
 * NodeExecutor – abstraction for executing nodetool node graphs.
 */

import {
  runInlineGraphJob,
  type GraphNode,
  type GraphEdge,
  type InlineGraph
} from "../../../lib/workflow/runInlineGraphJob";

export type { GraphNode, GraphEdge, InlineGraph } from "../../../lib/workflow/runInlineGraphJob";

// ─── Execution Result ─────────────────────────────────────────────────────────

export interface NodeExecutionResult {
  /** Whether the execution completed successfully. */
  success: boolean;
  /** Output values keyed by node ID. */
  outputs: Record<string, unknown>;
  /** Error message if success is false. */
  error?: string;
}

// ─── Executor Interface ───────────────────────────────────────────────────────

export interface NodeExecutor {
  /**
   * Execute an inline graph and return the outputs.
   *
   * @param graph - The graph to execute (nodes + edges)
   * @param params - Optional parameters to pass to the job
   * @param signal - Optional abort signal for cancellation
   * @returns The execution result with output values
   */
  execute(
    graph: InlineGraph,
    params?: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<NodeExecutionResult>;
}

// ─── WebSocket Executor ───────────────────────────────────────────────────────

/**
 * Executes an inline graph via the nodetool WebSocket runner.
 *
 * This is the default executor when the sketch editor runs inside the
 * nodetool desktop or web app.
 */
export class WebSocketNodeExecutor implements NodeExecutor {
  async execute(
    graph: InlineGraph,
    params?: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<NodeExecutionResult> {
    const result = await runInlineGraphJob({
      graph,
      params,
      signal,
      workflowId: `sketch-segmentation-${Date.now()}`
    });

    return {
      success: result.success,
      outputs: result.outputs,
      error: result.error
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let executorInstance: NodeExecutor | null = null;

/**
 * Get the current NodeExecutor instance.
 * Defaults to WebSocketNodeExecutor.
 */
export function getNodeExecutor(): NodeExecutor {
  if (!executorInstance) {
    executorInstance = new WebSocketNodeExecutor();
  }
  return executorInstance;
}

/**
 * Override the NodeExecutor instance.
 * Use this to swap in an API-based executor for standalone mode,
 * or a mock for testing.
 */
export function setNodeExecutor(executor: NodeExecutor): void {
  executorInstance = executor;
}
