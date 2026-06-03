/**
 * useGenerateLayer — drives generated-layer execution through WorkflowRunner.
 *
 * Mirrors the Timeline's useGenerateClip:
 *  1. Fetch the bound workflow (TanStack Query cache).
 *  2. Run it via the global WorkflowRunner store keyed by workflow id.
 *  3. Subscribe to the resulting job over GlobalWebSocketManager and forward
 *     status / progress / errors into StatusStore / ResultsStore / ErrorStore
 *     and SketchGenerationStore.
 *  4. On success, resolve the output asset id and append a server-side
 *     LayerVersion via tRPC (`sketch.versions.append`); the consumer is
 *     notified through `onComplete` so it can update the layer raster, set
 *     `lastGeneratedHash`, and refresh `imageReference`.
 *  5. On failure, surface the node-level error and arm the retry path.
 */

import { useCallback } from "react";
import { trpcClient } from "../../trpc/client";
import { queryClient } from "../../queryClient";
import {
  fetchWorkflowById,
  workflowQueryKey
} from "../../serverState/useWorkflow";
import { useSketchGenerationStore } from "../../stores/sketch/SketchGenerationStore";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";
import { useSketchCanvasRefStore } from "../../stores/sketch/SketchCanvasRefStore";
import { useAssetStore } from "../../stores/AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";
import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";
import type { Node as WorkflowGraphNode } from "../../stores/ApiTypes";
import useStatusStore from "../../stores/StatusStore";
import useResultsStore from "../../stores/ResultsStore";
import useErrorStore, {
  nodeErrorToDisplayString
} from "../../stores/ErrorStore";
import { normalizeOutputUpdateValue } from "../../stores/outputUpdateValue";
import type { OutputUpdate } from "../../stores/ApiTypes";
import {
  globalWebSocketManager,
  WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";

/**
 * Snapshot of the binding fields needed to generate a layer. Supplied by
 * the caller (which owns binding storage; see NOD-323 for the persisted
 * binding store).
 */
export interface LayerGenerationBinding {
  documentId: string;
  layerId: string;
  workflowId: string;
  selectedOutputNodeId?: string;
  paramOverrides?: Record<string, unknown>;
  dependencyHash?: string;
  /** workflow.updated_at at submission time; recorded on the LayerVersion. */
  workflowUpdatedAt?: string;
  locked?: boolean;
}

export interface LayerGenerationCompletion {
  jobId: string;
  assetId: string;
  versionId: string;
  dependencyHash: string;
  workflowUpdatedAt: string;
}

interface JobSubscriptionContext {
  layerId: string;
  documentId: string;
  workflowId: string;
  selectedOutputNodeId?: string;
  dependencyHash?: string;
  workflowUpdatedAt?: string;
  paramOverridesSnapshot?: Record<string, unknown>;
  onComplete?: (info: LayerGenerationCompletion) => void;
  onFailed?: (errorMessage: string) => void;
}

const jobSubscriptions = new Map<string, () => void>();
const jobContexts = new Map<string, JobSubscriptionContext>();

const loadImageAsDataUrl = (url: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });

const applyAssetToLayer = async (
  layerId: string,
  assetId: string
): Promise<void> => {
  const setLayerData = useSketchCanvasRefStore.getState().setLayerData;
  if (!setLayerData) return;
  try {
    const asset = await useAssetStore.getState().get(assetId);
    const url = getAssetUrl(asset);
    if (!url) return;
    const dataUrl = await loadImageAsDataUrl(url);
    setLayerData(layerId, dataUrl);
  } catch (error) {
    console.warn("Failed to apply generated asset to layer", error);
  }
};

const isActiveStatus = (status: string): boolean =>
  status === "queued" || status === "running";

const unsubscribeJob = (jobId: string): void => {
  const unsubscribe = jobSubscriptions.get(jobId);
  if (unsubscribe) {
    unsubscribe();
    jobSubscriptions.delete(jobId);
  }
  jobContexts.delete(jobId);
};

export const __resetGenerateLayerSubscriptionsForTests = (): void => {
  for (const unsubscribe of jobSubscriptions.values()) {
    unsubscribe();
  }
  jobSubscriptions.clear();
  jobContexts.clear();
};

const forwardWorkflowMessage = (
  workflowId: string,
  message: WebSocketMessage
): void => {
  if (message.type === "prediction" && typeof message.node_id === "string") {
    if (message.status === "booting") {
      useStatusStore.getState().setStatus(workflowId, message.node_id, "booting");
    }
    return;
  }

  if (
    message.type === "node_progress" &&
    typeof message.node_id === "string" &&
    typeof message.progress === "number" &&
    typeof message.total === "number"
  ) {
    useResultsStore
      .getState()
      .setProgress(
        workflowId,
        message.node_id,
        message.progress,
        message.total,
        typeof message.chunk === "string" ? message.chunk : undefined
      );
    const progressPercent =
      message.total > 0 ? (message.progress / message.total) * 100 : 0;
    if (typeof message.job_id === "string") {
      useSketchGenerationStore
        .getState()
        .updateJobProgress(message.job_id, progressPercent);
    }
    return;
  }

  if (message.type === "node_update" && typeof message.node_id === "string") {
    const nodeStatus =
      typeof message.status === "string"
        ? message.status
        : typeof message.status === "object" && message.status !== null
          ? (message.status as Record<string, unknown>)
          : undefined;
    useStatusStore.getState().setStatus(workflowId, message.node_id, nodeStatus);
    const nodeError =
      typeof message.error === "string" && message.error.trim().length > 0
        ? message.error
        : null;
    useErrorStore
      .getState()
      .setError(workflowId, message.node_id, nodeError);
    return;
  }

  if (message.type === "output_update" && typeof message.node_id === "string") {
    useResultsStore
      .getState()
      .setOutputResult(
        workflowId,
        message.node_id,
        normalizeOutputUpdateValue(message as unknown as OutputUpdate),
        true
      );
  }
};

const handleJobMessage = async (
  jobId: string,
  message: WebSocketMessage
): Promise<void> => {
  const context = jobContexts.get(jobId);
  if (!context) {
    return;
  }

  forwardWorkflowMessage(context.workflowId, message);

  if (message.type !== "job_update") {
    return;
  }

  const status = message.status;
  const generationStore = useSketchGenerationStore.getState();

  // Sync the per-workflow runner state so a stale "running" doesn't block
  // subsequent runs. The runner only auto-subscribes when the workflow is
  // open in the editor; layer-template workflows usually aren't.
  if (
    status === "completed" ||
    status === "cancelled" ||
    status === "failed" ||
    status === "timed_out"
  ) {
    getWorkflowRunnerStore(context.workflowId).setState({
      state: status === "completed" || status === "cancelled" ? "idle" : "error",
      job_id: null
    });
  }

  if (status === "queued") {
    generationStore.updateJobStatus(jobId, "queued");
    return;
  }

  if (status === "running") {
    generationStore.updateJobStatus(jobId, "running");
    return;
  }

  if (status === "completed") {
    const assetId = context.selectedOutputNodeId
      ? generationStore.resolveOutputAssetId(
          context.workflowId,
          context.selectedOutputNodeId
        )
      : undefined;

    // A workflow can finish with status "completed" even if a node errored
    // mid-flight (the runner reports per-node failures via node_update and
    // still emits a terminal job_update). Detect that by the missing output
    // asset and any per-node error, then surface it as a job-level failure
    // instead of silently clearing the job.
    if (!assetId) {
      const errorsState = useErrorStore.getState().errors;
      const prefix = `${context.workflowId}:`;
      let nodeErrorMessage: string | undefined;
      for (const [key, err] of Object.entries(errorsState)) {
        if (!key.startsWith(prefix)) {
          continue;
        }
        const display = nodeErrorToDisplayString(err);
        if (display) {
          nodeErrorMessage = display;
          break;
        }
      }
      const errorMessage =
        nodeErrorMessage ??
        "Workflow finished without producing an output asset.";
      generationStore.updateJobStatus(jobId, "failed", { errorMessage });
      context.onFailed?.(errorMessage);
      unsubscribeJob(jobId);
      return;
    }

    generationStore.updateJobStatus(jobId, "completed", { assetId });

    if (context.dependencyHash && context.workflowUpdatedAt) {
      try {
        const version = await trpcClient.sketch.versions.append.mutate({
          id: context.documentId,
          layerId: context.layerId,
          jobId,
          assetId,
          dependencyHash: context.dependencyHash,
          workflowUpdatedAt: context.workflowUpdatedAt,
          paramOverridesSnapshot: context.paramOverridesSnapshot,
          status: "success"
        });

        useSketchSessionStore.getState().recordGeneratedVersion(
          context.layerId,
          {
            version,
            dependencyHash: context.dependencyHash,
            assetId
          }
        );

        await applyAssetToLayer(context.layerId, assetId);

        context.onComplete?.({
          jobId,
          assetId,
          versionId: version.id,
          dependencyHash: context.dependencyHash,
          workflowUpdatedAt: context.workflowUpdatedAt
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to append version";
        useErrorStore
          .getState()
          .setError(
            context.workflowId,
            context.selectedOutputNodeId ?? "__job__",
            errorMessage
          );
        generationStore.updateJobStatus(jobId, "failed", { errorMessage });
        context.onFailed?.(errorMessage);
        unsubscribeJob(jobId);
        return;
      }
    }

    generationStore.clearJob(context.layerId);
    unsubscribeJob(jobId);
    return;
  }

  if (status === "failed" || status === "timed_out") {
    const errorMessage =
      typeof message.error === "string" && message.error.trim().length > 0
        ? message.error
        : `Job ${status}`;

    const nodeId = context.selectedOutputNodeId ?? "__job__";
    useErrorStore.getState().setError(context.workflowId, nodeId, errorMessage);
    generationStore.updateJobStatus(jobId, "failed", { errorMessage });
    context.onFailed?.(errorMessage);
    unsubscribeJob(jobId);
    return;
  }

  if (status === "cancelled") {
    generationStore.clearJob(context.layerId);
    unsubscribeJob(jobId);
  }
};

const subscribeJob = async (
  jobId: string,
  context: JobSubscriptionContext,
  reconnect: boolean
): Promise<void> => {
  if (jobSubscriptions.has(jobId)) {
    jobContexts.set(jobId, context);
    return;
  }

  await globalWebSocketManager.ensureConnection();
  jobContexts.set(jobId, context);
  const unsubscribe = globalWebSocketManager.subscribe(jobId, (message) => {
    void handleJobMessage(jobId, message);
  });
  jobSubscriptions.set(jobId, unsubscribe);

  if (reconnect) {
    await globalWebSocketManager.send({
      type: "reconnect_job",
      command: "reconnect_job",
      data: {
        job_id: jobId,
        workflow_id: context.workflowId
      }
    });
  }
};


interface UseGenerateLayerResult {
  generateLayer: () => Promise<void>;
  cancelLayerGeneration: () => Promise<void>;
  isActive: boolean;
  isGenerating: boolean;
  isQueued: boolean;
  isFailed: boolean;
  progress: number | undefined;
  errorMessage: string | undefined;
  currentJobId: string | undefined;
}

export interface UseGenerateLayerOptions {
  binding: LayerGenerationBinding;
  onComplete?: (info: LayerGenerationCompletion) => void;
  onFailed?: (errorMessage: string) => void;
}

export const useGenerateLayer = (
  options: UseGenerateLayerOptions
): UseGenerateLayerResult => {
  const { binding, onComplete, onFailed } = options;
  const jobState = useSketchGenerationStore(
    (state) => state.layerJobs[binding.layerId]
  );
  const registerJob = useSketchGenerationStore((state) => state.registerJob);
  const clearJob = useSketchGenerationStore((state) => state.clearJob);

  const generateLayer = useCallback(async () => {
    if (binding.locked) {
      throw new Error("Layer is locked");
    }
    if (!binding.workflowId) {
      throw new Error("Layer is not bound to a workflow");
    }

    // Clear stale node errors from a previous run on this workflow so a
    // retry doesn't immediately show the prior failure in the panel.
    useErrorStore.getState().clearErrors(binding.workflowId);

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
    // Use the id run() returns, not runnerStore.job_id: when the runner is
    // already busy the run is queued under a fresh id while the store keeps
    // pointing at the active run, so reading it back would subscribe this
    // layer to the wrong job and strand its updates.
    const jobId = await runnerStore
      .getState()
      .run(binding.paramOverrides ?? {}, workflow, nodes, edges);

    if (!jobId) {
      throw new Error("Workflow runner did not return a job id");
    }

    registerJob(binding.layerId, jobId, binding.workflowId);
    await subscribeJob(
      jobId,
      {
        layerId: binding.layerId,
        documentId: binding.documentId,
        workflowId: binding.workflowId,
        selectedOutputNodeId: binding.selectedOutputNodeId,
        dependencyHash: binding.dependencyHash,
        workflowUpdatedAt:
          binding.workflowUpdatedAt ?? workflow.updated_at ?? "",
        paramOverridesSnapshot: binding.paramOverrides,
        onComplete,
        onFailed
      },
      false
    );
  }, [binding, onComplete, onFailed, registerJob]);

  const cancelLayerGeneration = useCallback(async () => {
    if (!jobState?.jobId) {
      return;
    }

    await trpcClient.jobs.cancel.mutate({ id: jobState.jobId });
    unsubscribeJob(jobState.jobId);
    clearJob(binding.layerId);
  }, [jobState?.jobId, clearJob, binding.layerId]);

  return {
    generateLayer,
    cancelLayerGeneration,
    isActive: jobState?.status === "queued" || jobState?.status === "running",
    isGenerating: jobState?.status === "running",
    isQueued: jobState?.status === "queued",
    isFailed: jobState?.status === "failed",
    progress: jobState?.progress,
    errorMessage: jobState?.errorMessage,
    currentJobId: jobState?.jobId
  };
};

export default useGenerateLayer;
