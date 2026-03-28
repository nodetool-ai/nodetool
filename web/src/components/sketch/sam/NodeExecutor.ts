/**
 * NodeExecutor – abstraction for executing nodetool node graphs.
 *
 * Provides a clean interface for running inline mini-workflows and
 * retrieving their output. The execution backend is swappable:
 *
 * - **WebSocketNodeExecutor**: runs via the existing globalWebSocketManager
 *   (embedded mode, when sketch editor is inside the nodetool app)
 *
 * - In the future, an **ApiNodeExecutor** can call the nodetool REST API
 *   (standalone mode, when sketch editor is a separate app)
 *
 * This abstraction keeps the SAM service and other sketch features
 * decoupled from the specific execution transport.
 */

// ─── Graph Types ──────────────────────────────────────────────────────────────

/** A node in a mini-workflow graph, in the backend's native format. */
export interface GraphNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  ui_properties?: Record<string, unknown>;
}

/** An edge in a mini-workflow graph. */
export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  edge_type?: "data" | "control";
}

/** A complete inline graph to execute. */
export interface InlineGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

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
    // Dynamic imports to avoid hard dependency on the main app stores
    // (allows the sketch editor to be extracted into a standalone package later)
    const { globalWebSocketManager } = await import(
      "../../../lib/websocket/GlobalWebSocketManager"
    );

    await globalWebSocketManager.ensureConnection();

    if (signal?.aborted) {
      return { success: false, outputs: {}, error: "Aborted" };
    }

    // Generate a unique job ID for this inline execution
    const jobId = `sketch_seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise<NodeExecutionResult>((resolve) => {
      const outputs: Record<string, unknown> = {};
      let settled = false;

      const settle = (result: NodeExecutionResult) => {
        if (settled) {
          return;
        }
        settled = true;
        unsubscribe();
        resolve(result);
      };

      // Subscribe to messages for this job
      const unsubscribe = globalWebSocketManager.subscribe(
        jobId,
        (message: Record<string, unknown>) => {
          if (signal?.aborted) {
            settle({ success: false, outputs: {}, error: "Aborted" });
            return;
          }

          const msgType = message.type as string;

          if (msgType === "node_update") {
            const nodeId = message.node_id as string;
            const result = message.result as Record<string, unknown> | undefined;
            if (result) {
              outputs[nodeId] = result;
            }
          }

          if (msgType === "output_update") {
            const nodeId = message.node_id as string;
            outputs[nodeId] = message.value;
          }

          if (msgType === "job_update") {
            const status = message.status as string;
            if (status === "completed") {
              settle({ success: true, outputs });
            } else if (status === "failed" || status === "cancelled") {
              settle({
                success: false,
                outputs,
                error: (message.error as string) ?? `Job ${status}`
              });
            }
          }
        }
      );

      // Handle abort
      if (signal) {
        signal.addEventListener("abort", () => {
          settle({ success: false, outputs: {}, error: "Aborted" });
        });
      }

      // Send the run_job command with inline graph
      globalWebSocketManager
        .send({
          type: "run_job",
          command: "run_job",
          data: {
            type: "run_job_request",
            job_id: jobId,
            job_type: "workflow",
            params: params ?? {},
            graph: {
              nodes: graph.nodes.map((n) => ({
                id: n.id,
                type: n.type,
                data: n.data,
                ui_properties: n.ui_properties ?? {
                  position: { x: 0, y: 0 },
                  zIndex: 0
                }
              })),
              edges: graph.edges.map((e) => ({
                id: e.id,
                source: e.source,
                sourceHandle: e.sourceHandle,
                target: e.target,
                targetHandle: e.targetHandle,
                edge_type: e.edge_type ?? "data"
              }))
            }
          }
        })
        .catch((err: Error) => {
          settle({
            success: false,
            outputs: {},
            error: err.message ?? "Failed to send run_job"
          });
        });

      // Timeout safety net
      setTimeout(() => {
        settle({
          success: false,
          outputs,
          error: "Execution timed out"
        });
      }, 120_000);
    });
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
