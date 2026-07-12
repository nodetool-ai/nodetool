/** Re-generate Stale Layers preflight + sequential drainer. */

import { useCallback, useEffect, useRef, useState } from "react";

import { trpcClient } from "../../trpc/client";
import { queryClient } from "../../queryClient";
import {
  fetchWorkflowById,
  workflowQueryKey
} from "../../serverState/useWorkflow";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";
import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";
import type { Node as WorkflowGraphNode } from "../../stores/ApiTypes";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";
import {
  useSketchGenerationStore,
  type LayerJobState
} from "../../stores/sketch/SketchGenerationStore";

export interface RegenerateStalePreflight {
  staleLayerIds: string[];
  lockedLayerIds: string[];
}

interface UseRegenerateStaleLayersResult {
  preflight: () => RegenerateStalePreflight;
  regenerateStaleLayers: () => Promise<{
    started: number;
    skipped: number;
    failed: number;
  }>;
  isBusy: boolean;
}

function waitForJobToFinish(
  jobId: string,
  signal: AbortSignal
): Promise<LayerJobState["status"] | "aborted"> {
  return new Promise((resolve) => {
    let unsubscribe: (() => void) | null = null;

    const cleanup = (): void => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      signal.removeEventListener("abort", onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      resolve("aborted");
    };

    const check = (): boolean => {
      if (signal.aborted) {
        cleanup();
        resolve("aborted");
        return true;
      }
      const job = Object.values(
        useSketchGenerationStore.getState().layerJobs
      ).find((j) => j.jobId === jobId);
      if (!job) {
        // Job entry cleared — completed/cancelled cleared the entry.
        cleanup();
        resolve("completed");
        return true;
      }
      if (job.status === "completed" || job.status === "failed") {
        cleanup();
        resolve(job.status);
        return true;
      }
      return false;
    };

    if (check()) return;
    signal.addEventListener("abort", onAbort);
    unsubscribe = useSketchGenerationStore.subscribe(() => {
      check();
    });
  });
}

export function useRegenerateStaleLayers(): UseRegenerateStaleLayersResult {
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);
  // Aborted on unmount so any in-flight `waitForJobToFinish` resolves and
  // its Zustand subscription is unsubscribed.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const preflight = useCallback((): RegenerateStalePreflight => {
    const bindings = Object.values(
      useSketchSessionStore.getState().bindings
    );
    const staleLayerIds: string[] = [];
    const lockedLayerIds: string[] = [];
    for (const b of bindings) {
      if (b.status === "stale") {
        staleLayerIds.push(b.layerId);
      } else if (b.status === "locked") {
        lockedLayerIds.push(b.layerId);
      }
    }
    return { staleLayerIds, lockedLayerIds };
  }, []);

  const regenerateStaleLayers = useCallback(async () => {
    if (busyRef.current) {
      return { started: 0, skipped: 0, failed: 0 };
    }
    const documentId = useSketchSessionStore.getState().documentId;
    if (!documentId) {
      return { started: 0, skipped: 0, failed: 0 };
    }
    const controller = new AbortController();
    abortRef.current = controller;
    busyRef.current = true;
    setIsBusy(true);
    let started = 0;
    let skipped = 0;
    let failed = 0;
    try {
      const { staleLayerIds } = preflight();
      const generationStore = useSketchGenerationStore.getState();
      for (const layerId of staleLayerIds) {
        if (controller.signal.aborted) break;
        const binding =
          useSketchSessionStore.getState().bindings[layerId];
        if (!binding || binding.status !== "stale" || !binding.workflowId) {
          skipped++;
          continue;
        }
        const workflowId = binding.workflowId;

        try {
          const workflow = await queryClient.fetchQuery({
            queryKey: workflowQueryKey(workflowId),
            queryFn: () => fetchWorkflowById(workflowId),
            staleTime: 0
          });
          const graphNodes = workflow.graph?.nodes ?? [];
          const graphEdges = workflow.graph?.edges ?? [];
          const nodes = graphNodes.map((node: WorkflowGraphNode) =>
            graphNodeToReactFlowNode(workflow, node)
          );
          const edges = graphEdges.map(graphEdgeToReactFlowEdge);

          const runnerStore = getWorkflowRunnerStore(workflowId);
          // Use the id run() returns, not runnerStore.job_id: a queued run gets
          // a fresh id while the store still points at the active run, so
          // reading it back would track the wrong job.
          const jobId = await runnerStore
            .getState()
            .run(
              binding.paramOverrides ?? {},
              workflow,
              nodes,
              edges,
              undefined,
              undefined,
              true
            );

          if (!jobId) {
            failed++;
            continue;
          }
          generationStore.registerJob(layerId, jobId, workflowId);

          const finalStatus = await waitForJobToFinish(
            jobId,
            controller.signal
          );
          if (finalStatus === "aborted") {
            break;
          }
          if (finalStatus === "failed") {
            failed++;
            // Stop on first failure so the user can address it before the
            // rest of the queue drains.
            break;
          }
          started++;

          if (binding.dependencyHash) {
            const result = generationStore.resolveOutputAssetId(
              workflowId,
              jobId,
              binding.selectedOutputNodeId ?? ""
            );
            if (result) {
              try {
                await trpcClient.sketch.versions.append.mutate({
                  id: documentId,
                  layerId,
                  jobId,
                  assetId: result,
                  dependencyHash: binding.dependencyHash,
                  workflowUpdatedAt: workflow.updated_at ?? "",
                  paramOverridesSnapshot: binding.paramOverrides,
                  status: "success"
                });
              } catch {
                failed++;
              }
            }
          }
        } catch {
          failed++;
          break;
        }
      }
    } finally {
      busyRef.current = false;
      setIsBusy(false);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
    return { started, skipped, failed };
  }, [preflight]);

  return { preflight, regenerateStaleLayers, isBusy };
}
