import { globalWebSocketManager } from "../websocket/GlobalWebSocketManager";
import { isLocalhost } from "../env";
import { supabase } from "../supabaseClient";
import { uuidv4 } from "../../stores/uuidv4";
import { BASE_URL } from "../../stores/BASE_URL";
import useMetadataStore from "../../stores/MetadataStore";
import type { Edge, Node, WorkflowGraph } from "../../stores/ApiTypes";

export type GraphNode = Node;
export type GraphEdge = Edge;
export type InlineGraph = WorkflowGraph;

interface InlineGraphJobOptions {
  graph: InlineGraph;
  params?: Record<string, unknown>;
  signal?: AbortSignal;
  workflowId: string;
  /** Run title shown in the queue. Defaults to a single-node graph's name. */
  jobName?: string;
}

/**
 * Title for a single-node inline run: the node's custom title, else its
 * metadata title (same precedence as NodeHeader), else the type segment.
 */
const deriveInlineJobName = (graph: InlineGraph): string => {
  const nodes = (graph?.nodes ?? []) as Array<{
    type?: string;
    data?: { title?: unknown };
  }>;
  if (nodes.length !== 1) {
    return "";
  }
  const node = nodes[0];
  const custom =
    typeof node.data?.title === "string" ? node.data.title.trim() : "";
  const metadataTitle = node.type
    ? useMetadataStore.getState().getMetadata(node.type)?.title
    : undefined;
  return custom || metadataTitle || node.type?.split(".").pop() || "";
};

/** Result shape consumed by sketch `WebSocketNodeExecutor`. */
interface InlineGraphJobResult {
  success: boolean;
  outputs: Record<string, unknown>;
  error?: string;
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

  const str = (v: unknown): string | undefined =>
    typeof v === "string" ? v : undefined;

  const handler = (message: Record<string, unknown>): void => {
    const msgWorkflow = str(message.workflow_id);
    const msgJob = str(message.job_id);

    if (msgWorkflow != null && msgWorkflow !== workflowId) {
      return;
    }
    if (msgJob != null && msgJob.length > 0 && msgJob !== jobId) {
      return;
    }

    const type = str(message.type);

    if (type === "node_update") {
      const status = str(message.status);
      const nodeId = str(message.node_id);
      const resultPayload = message.result;

      if (status === "completed" && nodeId != null) {
        if (resultPayload != null && typeof resultPayload === "object") {
          outputs[nodeId] = resultPayload as Record<string, unknown>;
        } else if (resultPayload != null) {
          outputs[nodeId] = resultPayload;
        }
      } else if (status === "error") {
        const errMsg = str(message.error);
        finish({
          success: false,
          outputs,
          error: errMsg && errMsg.length > 0 ? errMsg : "Node error"
        });
      }
      return;
    }

    if (type !== "job_update") {
      return;
    }

    const status = str(message.status);
    const resultField = message.result;

    if (
      resultField != null &&
      typeof resultField === "object" &&
      "outputs" in resultField &&
      resultField.outputs != null &&
      typeof resultField.outputs === "object"
    ) {
      mergeOutputsRecord(
        outputs,
        resultField.outputs as Record<string, unknown>
      );
    }

    if (status === "failed") {
      const errMsg = str(message.error);
      finish({
        success: false,
        outputs,
        error: errMsg && errMsg.length > 0 ? errMsg : "Job failed"
      });
      return;
    }

    if (status === "cancelled") {
      const cancelMsg = str(message.message);
      finish({
        success: false,
        outputs,
        error: cancelMsg && cancelMsg.length > 0 ? cancelMsg : "Cancelled"
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
        job_name: options.jobName ?? deriveInlineJobName(graph),
        job_type: "workflow",
        execution_strategy: "threaded",
        workflow_id: workflowId,
        user_id,
        auth_token,
        api_url: BASE_URL,
        params,
        explicit_types: false,
        // Explicit single-node / run-from-here runs are concurrent like the
        // other canvas run paths, so they don't serialize behind one another.
        concurrent: true,
        graph
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
