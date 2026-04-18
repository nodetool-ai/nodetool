import { useState, useCallback, useRef } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import { globalWebSocketManager } from "../../lib/websocket/GlobalWebSocketManager";
import { applyDefaultModels } from "../../utils/applyDefaultModels";
import { applyTestAssets } from "../../utils/testAssets";
import { uuidv4 } from "../../stores/uuidv4";
import { BASE_URL } from "../../stores/BASE_URL";
import { isLocalhost } from "../../lib/env";
import { supabase } from "../../lib/supabaseClient";

export type NodeTestStatus =
  | "idle"
  | "queued"
  | "running"
  | "passed"
  | "failed";

export interface NodeTestResult {
  status: NodeTestStatus;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

export function useNodeTestRunner() {
  const [results, setResults] = useState<Map<string, NodeTestResult>>(
    new Map()
  );
  const [concurrency, setConcurrency] = useState(4);
  const queueRef = useRef<NodeMetadata[]>([]);
  const activeRef = useRef(0);
  const cancelledRef = useRef(false);
  const unsubscribesRef = useRef<Map<string, () => void>>(new Map());
  const completedRef = useRef<Set<string>>(new Set());

  const updateResult = useCallback(
    (nodeType: string, update: Partial<NodeTestResult>) => {
      setResults((prev) => {
        const next = new Map(prev);
        const existing = next.get(nodeType) || { status: "idle" as const };
        next.set(nodeType, { ...existing, ...update });
        return next;
      });
    },
    []
  );

  const processQueue = useCallback(async () => {
    while (
      queueRef.current.length > 0 &&
      activeRef.current < concurrency &&
      !cancelledRef.current
    ) {
      const metadata = queueRef.current.shift();
      if (!metadata) break;

      activeRef.current++;
      runSingleNode(metadata).finally(() => {
        activeRef.current--;
        processQueue();
      });
    }
  }, [concurrency]);

  const runSingleNode = useCallback(
    async (metadata: NodeMetadata) => {
      const nodeType = metadata.node_type;
      const jobId = uuidv4();
      const workflowId = `test-${nodeType}-${Date.now()}`;
      const nodeId = "test-node-1";
      const startTime = performance.now();

      updateResult(nodeType, {
        status: "running",
        output: undefined,
        error: undefined
      });

      // Build properties with defaults
      const properties: Record<string, unknown> = {};
      for (const prop of metadata.properties) {
        if (prop.name) {
          properties[prop.name] = prop.default;
        }
      }
      const withModels = applyDefaultModels(properties, metadata.properties);
      const withAssets = applyTestAssets(withModels, metadata.properties);

      // Build graph node
      const graphNode = {
        id: nodeId,
        type: metadata.node_type,
        data: withAssets,
        ui_properties: { position: { x: 0, y: 0 }, width: 200 }
      };

      // Auth
      let authToken = "local_token";
      let userId = "1";
      if (!isLocalhost) {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        authToken = session?.access_token || "";
        userId = session?.user?.id || "";
      }

      // Subscribe to messages
      const unsub = globalWebSocketManager.subscribe(
        workflowId,
        (message: Record<string, unknown>) => {
          const type = message.type as string;

          if (type === "node_update") {
            const status = message.status as string;
            if (status === "completed") {
              // Only take the first completed update — ignore duplicates
              if (completedRef.current.has(nodeType)) return;
              completedRef.current.add(nodeType);
              const durationMs = Math.round(performance.now() - startTime);
              const result = message.result as
                | Record<string, unknown>
                | undefined;
              updateResult(nodeType, {
                status: "passed",
                output: result,
                durationMs
              });
            } else if (status === "error") {
              const durationMs = Math.round(performance.now() - startTime);
              updateResult(nodeType, {
                status: "failed",
                error: (message.error as string) || "Unknown error",
                durationMs
              });
            }
          }

          if (type === "job_update") {
            const status = message.status as string;
            if (status === "failed") {
              const durationMs = Math.round(performance.now() - startTime);
              updateResult(nodeType, {
                status: "failed",
                error: (message.error as string) || "Job failed",
                durationMs
              });
              unsub();
              unsubscribesRef.current.delete(nodeType);
            }
            if (status === "completed" || status === "cancelled") {
              unsub();
              unsubscribesRef.current.delete(nodeType);
            }
          }
        }
      );

      unsubscribesRef.current.set(nodeType, unsub);

      // Send run_job command
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
            user_id: userId,
            auth_token: authToken,
            api_url: BASE_URL,
            params: {},
            explicit_types: false,
            graph: {
              nodes: [graphNode],
              edges: []
            }
          }
        });
      } catch (err) {
        const durationMs = Math.round(performance.now() - startTime);
        updateResult(nodeType, {
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          durationMs
        });
        unsub();
        unsubscribesRef.current.delete(nodeType);
      }
    },
    [updateResult]
  );

  const runNodes = useCallback(
    (metadataList: NodeMetadata[]) => {
      cancelledRef.current = false;
      for (const m of metadataList) {
        completedRef.current.delete(m.node_type);
        updateResult(m.node_type, { status: "queued" });
      }
      queueRef.current.push(...metadataList);
      processQueue();
    },
    [updateResult, processQueue]
  );

  const stopAll = useCallback(() => {
    cancelledRef.current = true;
    queueRef.current = [];
    for (const [nodeType, unsub] of unsubscribesRef.current) {
      unsub();
      updateResult(nodeType, { status: "idle" });
    }
    unsubscribesRef.current.clear();
  }, [updateResult]);

  const clearResults = useCallback(() => {
    setResults(new Map());
  }, []);

  return {
    results,
    concurrency,
    setConcurrency,
    runNodes,
    stopAll,
    clearResults
  };
}
