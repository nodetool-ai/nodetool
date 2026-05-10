/**
 * useRegenerateStaleLayers
 *
 * Preflight + execution helper for the "Re-generate Stale Layers" button.
 *
 * `regenerateStaleLayers()` walks the bindings, picks the layers whose
 * `status === "stale"`, and runs them in dependency order:
 *   - Layers without input dependencies on other generated layers go first.
 *   - Subsequent waves wait for layers they depend on.
 *
 * For NOD-323 we keep the dependency model simple: layers are scheduled
 * one at a time (sequentially) so any inputs that come from a previously
 * regenerated layer's output asset are already up to date by the time the
 * next layer starts. The user can cancel partway via the cancel control on
 * the panel; `regenerateStaleLayers()` resolves once the queue is drained
 * or the first failure is surfaced.
 */

import { useCallback, useState } from "react";

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
import { useSketchLayerBindingsStore } from "../../stores/sketch/SketchLayerBindingsStore";
import { useSketchDocumentStore } from "../../stores/sketch/SketchDocumentStore";
import {
  useSketchGenerationStore,
  type LayerJobState
} from "../../stores/sketch/SketchGenerationStore";

export interface RegenerateStalePreflight {
  /** Total stale layer ids that would run. */
  staleLayerIds: string[];
  /** Layer ids skipped because they're locked. */
  lockedLayerIds: string[];
}

export interface UseRegenerateStaleLayersResult {
  preflight: () => RegenerateStalePreflight;
  regenerateStaleLayers: () => Promise<{
    started: number;
    skipped: number;
    failed: number;
  }>;
  isBusy: boolean;
}

function waitForJobToFinish(jobId: string): Promise<LayerJobState["status"]> {
  return new Promise((resolve) => {
    const check = (): boolean => {
      const job = Object.values(
        useSketchGenerationStore.getState().layerJobs
      ).find((j) => j.jobId === jobId);
      if (!job) {
        // Job was cleared (completed or cancelled paths clear the entry).
        resolve("completed");
        return true;
      }
      if (job.status === "completed" || job.status === "failed") {
        resolve(job.status);
        return true;
      }
      return false;
    };

    if (check()) return;
    const unsubscribe = useSketchGenerationStore.subscribe(() => {
      if (check()) {
        unsubscribe();
      }
    });
  });
}

export function useRegenerateStaleLayers(): UseRegenerateStaleLayersResult {
  const [isBusy, setIsBusy] = useState(false);

  const preflight = useCallback((): RegenerateStalePreflight => {
    const bindings = Object.values(
      useSketchLayerBindingsStore.getState().bindings
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
    if (isBusy) {
      return { started: 0, skipped: 0, failed: 0 };
    }
    const documentId = useSketchDocumentStore.getState().documentId;
    if (!documentId) {
      return { started: 0, skipped: 0, failed: 0 };
    }
    setIsBusy(true);
    let started = 0;
    let skipped = 0;
    let failed = 0;
    try {
      const { staleLayerIds } = preflight();
      const generationStore = useSketchGenerationStore.getState();
      for (const layerId of staleLayerIds) {
        const binding =
          useSketchLayerBindingsStore.getState().bindings[layerId];
        if (!binding || binding.status !== "stale") {
          skipped++;
          continue;
        }
        if (!binding.workflowId) {
          skipped++;
          continue;
        }

        try {
          const workflow = await queryClient.fetchQuery({
            queryKey: workflowQueryKey(binding.workflowId),
            queryFn: () => fetchWorkflowById(binding.workflowId),
            staleTime: 0
          });
          const graphNodes = workflow.graph?.nodes ?? [];
          const graphEdges = workflow.graph?.edges ?? [];
          const nodes = graphNodes.map((node: WorkflowGraphNode) =>
            graphNodeToReactFlowNode(workflow, node)
          );
          const edges = graphEdges.map(graphEdgeToReactFlowEdge);

          const runnerStore = getWorkflowRunnerStore(binding.workflowId);
          await runnerStore
            .getState()
            .run(binding.paramOverrides ?? {}, workflow, nodes, edges);

          const jobId = runnerStore.getState().job_id;
          if (!jobId) {
            failed++;
            continue;
          }
          generationStore.registerJob(layerId, jobId, binding.workflowId);

          const finalStatus = await waitForJobToFinish(jobId);
          if (finalStatus === "failed") {
            failed++;
            // Stop on first failure so the user can address it before the
            // rest of the queue drains.
            break;
          }
          started++;

          // Persist the version on the server so the next preflight will
          // see the updated `lastGeneratedHash`.
          if (binding.dependencyHash) {
            const result = generationStore.resolveOutputAssetId(
              binding.workflowId,
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
                // Surface but do not abort the queue.
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
      setIsBusy(false);
    }
    return { started, skipped, failed };
  }, [isBusy, preflight]);

  return { preflight, regenerateStaleLayers, isBusy };
}
