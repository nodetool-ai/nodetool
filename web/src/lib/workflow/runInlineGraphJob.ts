import { globalWebSocketManager } from "../websocket/GlobalWebSocketManager";
import { BASE_URL } from "../../stores/BASE_URL";
import { isLocalhost } from "../../stores/ApiClient";
import { uuidv4 } from "../../stores/uuidv4";

export interface GraphNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  ui_properties?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  edge_type?: "data" | "control";
}

export interface InlineGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface InlineJobExecutionResult {
  success: boolean;
  outputs: Record<string, unknown>;
  error?: string;
  jobId: string;
  workflowId: string;
}

export interface RunInlineGraphJobOptions {
  graph: InlineGraph;
  params?: Record<string, unknown>;
  signal?: AbortSignal;
  jobId?: string;
  workflowId?: string;
  executionStrategy?: "threaded" | "subprocess";
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

async function resolveAuthContext(): Promise<{
  authToken: string;
  userId: string;
}> {
  if (isLocalhost) {
    return {
      authToken: "local_token",
      userId: "1"
    };
  }

  const {
    supabase
  } = await import("../supabaseClient");
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token || !session.user?.id) {
    throw new Error("Authentication is required to run inline jobs");
  }

  return {
    authToken: session.access_token,
    userId: session.user.id
  };
}

function createGraphPayload(graph: InlineGraph): InlineGraph {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      data: node.data,
      ui_properties: node.ui_properties ?? {
        position: { x: 0, y: 0 },
        zIndex: 0
      }
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
      edge_type: edge.edge_type ?? "data"
    }))
  };
}

async function cancelInlineGraphJob(
  jobId: string,
  workflowId: string
): Promise<void> {
  await globalWebSocketManager.send({
    type: "cancel_job",
    command: "cancel_job",
    data: {
      job_id: jobId,
      workflow_id: workflowId
    }
  });
}

export async function runInlineGraphJob({
  graph,
  params,
  signal,
  jobId = uuidv4(),
  workflowId = `inline-${uuidv4()}`,
  executionStrategy = "threaded",
  timeoutMs = DEFAULT_TIMEOUT_MS
}: RunInlineGraphJobOptions): Promise<InlineJobExecutionResult> {
  await globalWebSocketManager.ensureConnection();

  if (signal?.aborted) {
    return {
      success: false,
      outputs: {},
      error: "Aborted",
      jobId,
      workflowId
    };
  }

  const { authToken, userId } = await resolveAuthContext();

  if (signal?.aborted) {
    return {
      success: false,
      outputs: {},
      error: "Aborted",
      jobId,
      workflowId
    };
  }

  return new Promise<InlineJobExecutionResult>((resolve) => {
    const outputs: Record<string, unknown> = {};
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: () => void = () => {};
    let abortHandler: (() => void) | null = null;
    let settled = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      unsubscribe();
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    };

    const settle = (
      result: Omit<InlineJobExecutionResult, "jobId" | "workflowId">
    ) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve({
        ...result,
        jobId,
        workflowId
      });
    };

    unsubscribe = globalWebSocketManager.subscribe(
      jobId,
      (message: Record<string, unknown>) => {
        if (message.type === "node_update") {
          const nodeId = message.node_id as string;
          const result = message.result as Record<string, unknown> | undefined;
          if (result) {
            outputs[nodeId] = result;
          }
          return;
        }

        if (message.type === "output_update") {
          const nodeId = message.node_id as string;
          outputs[nodeId] = message.value;
          return;
        }

        if (message.type !== "job_update") {
          return;
        }

        const status = message.status as string;
        if (status === "completed") {
          settle({ success: true, outputs });
          return;
        }

        if (status === "failed" || status === "cancelled") {
          settle({
            success: false,
            outputs,
            error: (message.error as string) ?? `Job ${status}`
          });
        }
      }
    );

    abortHandler = () => {
      void cancelInlineGraphJob(jobId, workflowId).catch(() => undefined);
      settle({
        success: false,
        outputs,
        error: "Aborted"
      });
    };

    signal?.addEventListener("abort", abortHandler);
    if (signal?.aborted) {
      abortHandler();
      return;
    }

    void globalWebSocketManager.send({
      type: "run_job",
      command: "run_job",
      data: {
        type: "run_job_request",
        job_id: jobId,
        job_type: "workflow",
        workflow_id: workflowId,
        user_id: userId,
        auth_token: authToken,
        api_url: BASE_URL,
        execution_strategy: executionStrategy,
        params: params ?? {},
        explicit_types: false,
        graph: createGraphPayload(graph)
      }
    }).catch((error: Error) => {
      settle({
        success: false,
        outputs: {},
        error: error.message ?? "Failed to send run_job"
      });
    });

    timeoutId = setTimeout(() => {
      void cancelInlineGraphJob(jobId, workflowId).catch(() => undefined);
      settle({
        success: false,
        outputs,
        error: "Execution timed out"
      });
    }, timeoutMs);
  });
}
