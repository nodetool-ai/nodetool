import { useState, useCallback, useRef } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import { applyDefaultModels } from "../../utils/applyDefaultModels";
import { applyTestAssets } from "../../utils/testAssets";
import { runInlineGraphJob } from "../../lib/workflow/runInlineGraphJob";

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
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
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

  const runSingleNode = useCallback(
    async (metadata: NodeMetadata) => {
      const nodeType = metadata.node_type;
      const workflowId = `test-${nodeType}-${Date.now()}`;
      const nodeId = "test-node-1";
      const startTime = performance.now();
      const abortController = new AbortController();

      updateResult(nodeType, {
        status: "running",
        output: undefined,
        error: undefined
      });

      const properties: Record<string, unknown> = {};
      for (const property of metadata.properties) {
        if (property.name) {
          properties[property.name] = property.default;
        }
      }

      const withModels = applyDefaultModels(properties, metadata.properties);
      const withAssets = applyTestAssets(withModels, metadata.properties);

      try {
        abortControllersRef.current.set(nodeType, abortController);

        const result = await runInlineGraphJob({
          workflowId,
          graph: {
            nodes: [
              {
                id: nodeId,
                type: metadata.node_type,
                data: withAssets,
                ui_properties: { position: { x: 0, y: 0 }, width: 200 }
              }
            ],
            edges: []
          },
          signal: abortController.signal
        });

        abortControllersRef.current.delete(nodeType);
        const durationMs = Math.round(performance.now() - startTime);

        if (result.success) {
          if (completedRef.current.has(nodeType)) {
            return;
          }

          completedRef.current.add(nodeType);
          updateResult(nodeType, {
            status: "passed",
            output: result.outputs[nodeId] ?? result.outputs,
            durationMs
          });
          return;
        }

        updateResult(nodeType, {
          status: result.error === "Aborted" ? "idle" : "failed",
          error: result.error,
          durationMs
        });
      } catch (error) {
        abortControllersRef.current.delete(nodeType);
        updateResult(nodeType, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          durationMs: Math.round(performance.now() - startTime)
        });
      }
    },
    [updateResult]
  );

  const processQueue = useCallback(async () => {
    while (
      queueRef.current.length > 0 &&
      activeRef.current < concurrency &&
      !cancelledRef.current
    ) {
      const metadata = queueRef.current.shift();
      if (!metadata) {
        break;
      }

      activeRef.current++;
      runSingleNode(metadata).finally(() => {
        activeRef.current--;
        processQueue();
      });
    }
  }, [concurrency, runSingleNode]);

  const runNodes = useCallback(
    (metadataList: NodeMetadata[]) => {
      cancelledRef.current = false;
      for (const metadata of metadataList) {
        completedRef.current.delete(metadata.node_type);
        updateResult(metadata.node_type, { status: "queued" });
      }
      queueRef.current.push(...metadataList);
      processQueue();
    },
    [processQueue, updateResult]
  );

  const stopAll = useCallback(() => {
    cancelledRef.current = true;
    queueRef.current = [];
    for (const [nodeType, abortController] of abortControllersRef.current) {
      abortController.abort();
      updateResult(nodeType, { status: "idle" });
    }
    abortControllersRef.current.clear();
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
