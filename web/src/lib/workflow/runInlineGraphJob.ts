import { globalWebSocketManager } from "../websocket/GlobalWebSocketManager";
import { isLocalhost } from "../env";
import { supabase } from "../supabaseClient";
import { uuidv4 } from "../../stores/uuidv4";
import { BASE_URL } from "../../stores/BASE_URL";
import type { Edge, Node, WorkflowGraph } from "../../stores/ApiTypes";

export type GraphNode = Node;
export type GraphEdge = Edge;
export type InlineGraph = WorkflowGraph;

export interface InlineGraphJobOptions {
  graph: InlineGraph;
  params?: Record<string, unknown>;
  signal?: AbortSignal;
  workflowId: string;
}

/** Result shape consumed by sketch `WebSocketNodeExecutor`. */
export interface InlineGraphJobResult {
  success: boolean;
  outputs: Record<string, unknown>;
  error?: string;
}

function normalizeGraph(graph: InlineGraph): WorkflowGraph {
  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      sync_mode:
        typeof node.sync_mode === "string" ? node.sync_mode : "on_any"
    })),
    edges: graph.edges
  };
}

function mergeOutputsRecord(
  into: Record<string, unknown>,
  from: Record<string, unknown>
): void {
  for (const key of Object.keys(from)) {
    into[key] = from[key];
  }
}

/** Run an ephemeral workflow graph via the unified WebSocket runner (same path as WorkflowRunner). */
export async function runInlineGraphJob(
  options: InlineGraphJobOptions
): Promise<InlineGraphJobResult> {
  const { graph, params = {}, signal, workflowId } = options;

  if (signal?.aborted) {
    return { success: false, outputs: {}, error: "Aborted" };
  }

  await globalWebSocketManager.ensureConnection();

  const jobId = uuidv4();

  let auth_token = "local_token";
  let user_id = "1";
  if (!isLocalhost) {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    auth_token = session?.access_token ?? "";
    user_id = session?.user?.id ?? "";
  }

  const normalized = normalizeGraph(graph);
  const outputs: Record<string, unknown> = {};
  let settled = false;

  let resolvePromise!: (value: InlineGraphJobResult) => void;
  const resultPromise = new Promise<InlineGraphJobResult>((res) => {
    resolvePromise = res;
  });

  const finish = (result: InlineGraphJobResult): void => {
    if (settled) {
      return;
    }
    settled = true;
    signal?.removeEventListener("abort", onAbort);
    unsubWs();
    unsubJob();
    resolvePromise(result);
  };

  const onAbort = (): void => {
    void globalWebSocketManager.send({
      type: "cancel_job",
      command: "cancel_job",
      data: { job_id: jobId, workflow_id: workflowId }
    });
    finish({ success: false, outputs, error: "Aborted" });
  };

  const handler = (message: Record<string, unknown>): void => {
    const msgWorkflow = message.workflow_id as string | null | undefined;
    const msgJob = message.job_id as string | null | undefined;

    if (msgWorkflow != null && msgWorkflow !== workflowId) {
      return;
    }
    if (typeof msgJob === "string" && msgJob.length > 0 && msgJob !== jobId) {
      return;
    }

    const type = message.type as string | undefined;

    if (type === "node_update") {
      const status = message.status as string | undefined;
      const nodeId = message.node_id as string | undefined;
      const resultPayload = message.result;

      if (status === "completed" && nodeId != null) {
        if (resultPayload != null && typeof resultPayload === "object") {
          outputs[nodeId] = resultPayload as Record<string, unknown>;
        } else if (resultPayload != null) {
          outputs[nodeId] = resultPayload;
        }
      } else if (status === "error") {
        const errMsg =
          typeof message.error === "string" && message.error.length > 0
            ? message.error
            : "Node error";
        finish({ success: false, outputs, error: errMsg });
      }
      return;
    }

    if (type !== "job_update") {
      return;
    }

    const status = message.status as string | undefined;
    const resultField = message.result as
      | { outputs?: Record<string, unknown> }
      | null
      | undefined;

    if (resultField != null && resultField.outputs != null) {
      mergeOutputsRecord(outputs, resultField.outputs);
    }

    if (status === "failed") {
      const errMsg =
        typeof message.error === "string" && message.error.length > 0
          ? message.error
          : "Job failed";
      finish({ success: false, outputs, error: errMsg });
      return;
    }

    if (status === "cancelled") {
      finish({
        success: false,
        outputs,
        error:
          typeof message.message === "string" && message.message.length > 0
            ? message.message
            : "Cancelled"
      });
      return;
    }

    if (status === "completed") {
      finish({ success: true, outputs });
    }
  };

  const unsubWs = globalWebSocketManager.subscribe(
    workflowId,
    handler as (m: Record<string, unknown>) => void
  );
  const unsubJob = globalWebSocketManager.subscribe(jobId, handler);

  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    await globalWebSocketManager.send({
      type: "run_job",
      command: "run_job",
      data: {
        type: "run_job_request",
        job_id: jobId,
        job_type: "workflow",
        execution_strategy: "threaded",
        workflow_id: workflowId,
        user_id,
        auth_token,
        api_url: BASE_URL,
        params,
        explicit_types: false,
        graph: normalized
      }
    });
  } catch (err) {
    finish({
      success: false,
      outputs,
      error: err instanceof Error ? err.message : "Failed to start job"
    });
    return await resultPromise;
  }

  return await resultPromise;
}
