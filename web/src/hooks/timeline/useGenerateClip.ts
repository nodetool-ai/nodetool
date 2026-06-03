import { useCallback, useEffect, useMemo } from "react";
import { trpcClient } from "../../trpc/client";
import { queryClient } from "../../queryClient";
import { fetchWorkflowById, workflowQueryKey } from "../../serverState/useWorkflow";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelineGenerationStore } from "../../stores/timeline/TimelineGenerationStore";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";
import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";
import type { Node as WorkflowGraphNode } from "../../stores/ApiTypes";
import useStatusStore from "../../stores/StatusStore";
import useResultsStore from "../../stores/ResultsStore";
import useErrorStore from "../../stores/ErrorStore";
import { normalizeOutputUpdateValue } from "../../stores/outputUpdateValue";
import type { OutputUpdate } from "../../stores/ApiTypes";
import {
  globalWebSocketManager,
  WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import { useTimelineDirectGenJob } from "./useTimelineDirectGenJob";

interface JobSubscriptionContext {
  clipId: string;
  workflowId: string;
  selectedOutputNodeId?: string;
}

type NonGeneratingClipStatus = "locked" | "draft" | "stale" | "generated";

/**
 * Minimal clip shape needed to derive a non-generating status.
 * This keeps the hook decoupled from timeline package type imports.
 */
interface TimelineClipLike {
  locked: boolean;
  sourceType: "imported" | "generated";
  currentAssetId?: string;
  dependencyHash?: string;
  lastGeneratedHash?: string;
}

const jobSubscriptions = new Map<string, () => void>();
const jobContexts = new Map<string, JobSubscriptionContext>();

const isActiveStatus = (status: string): boolean =>
  status === "queued" || status === "running";

/**
 * Compute the non-generating clip status from current clip fields. Used by
 * generation hooks to settle back to a sensible idle state after a job
 * ends (e.g. cancel, completion, failure).
 */
export const deriveIdleClipStatus = (
  clip: TimelineClipLike
): NonGeneratingClipStatus => {
  if (clip.locked) {
    return "locked";
  }
  if (clip.sourceType === "generated" && !clip.currentAssetId) {
    return "draft";
  }
  if (
    clip.dependencyHash !== undefined &&
    clip.lastGeneratedHash !== undefined &&
    clip.dependencyHash !== clip.lastGeneratedHash
  ) {
    return "stale";
  }
  return "generated";
};

const unsubscribeJob = (jobId: string): void => {
  const unsubscribe = jobSubscriptions.get(jobId);
  if (unsubscribe) {
    unsubscribe();
    jobSubscriptions.delete(jobId);
  }
  jobContexts.delete(jobId);
};

export const __resetGenerateClipSubscriptionsForTests = (): void => {
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
    useResultsStore.getState().setProgress(
      workflowId,
      message.node_id,
      message.progress,
      message.total,
      typeof message.chunk === "string" ? message.chunk : undefined
    );
    const progressPercent =
      message.total > 0 ? (message.progress / message.total) * 100 : 0;
    if (typeof message.job_id === "string") {
      useTimelineGenerationStore
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
    if (nodeError) {
      useErrorStore.getState().setError(workflowId, message.node_id, nodeError);
    } else {
      useErrorStore.getState().setError(workflowId, message.node_id, null);
    }
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

const handleJobMessage = (jobId: string, message: WebSocketMessage): void => {
  const context = jobContexts.get(jobId);
  if (!context) {
    return;
  }

  forwardWorkflowMessage(context.workflowId, message);

  if (message.type !== "job_update") {
    return;
  }

  const status = message.status;
  const generationStore = useTimelineGenerationStore.getState();
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

    generationStore.updateJobStatus(jobId, "completed", { assetId });
    generationStore.clearJob(context.clipId);

    const clip = useTimelineStore
      .getState()
      .clips.find((candidate) => candidate.id === context.clipId);
    if (clip) {
      useTimelineStore
        .getState()
        .patchClip(context.clipId, { status: deriveIdleClipStatus(clip) });
    }
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
    unsubscribeJob(jobId);
    return;
  }

  if (status === "cancelled") {
    generationStore.clearJob(context.clipId);
    const clip = useTimelineStore
      .getState()
      .clips.find((candidate) => candidate.id === context.clipId);
    if (clip) {
      useTimelineStore
        .getState()
        .patchClip(context.clipId, { status: deriveIdleClipStatus(clip) });
    }
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
  const unsubscribe = globalWebSocketManager.subscribe(jobId, (message) =>
    handleJobMessage(jobId, message)
  );
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

export const useTimelineGenerationSubscriptions = (): void => {
  const clipJobs = useTimelineGenerationStore((state) => state.clipJobs);

  const activeJobs = useMemo(() => {
    const clips = useTimelineStore.getState().clips;
    return Object.values(clipJobs)
      .filter((job) => isActiveStatus(job.status))
      .map((job) => ({
        clipId: job.clipId,
        jobId: job.jobId,
        workflowId: job.workflowId,
        selectedOutputNodeId: clips.find((c) => c.id === job.clipId)
          ?.selectedOutputNodeId
      }));
  }, [clipJobs]);

  useEffect(() => {
    const activeJobIdSet = new Set(activeJobs.map((job) => job.jobId));

    for (const [jobId] of jobSubscriptions) {
      if (!activeJobIdSet.has(jobId)) {
        unsubscribeJob(jobId);
      }
    }

    for (const activeJob of activeJobs) {
      void subscribeJob(
        activeJob.jobId,
        {
          clipId: activeJob.clipId,
          workflowId: activeJob.workflowId,
          selectedOutputNodeId: activeJob.selectedOutputNodeId
        },
        true
      );
    }
  }, [activeJobs]);
};

interface UseGenerateClipResult {
  generateClip: () => Promise<void>;
  cancelClipGeneration: () => Promise<void>;
  isActive: boolean;
  isGenerating: boolean;
  isQueued: boolean;
  isFailed: boolean;
  currentJobId?: string;
}

export const useGenerateClip = (clipId: string): UseGenerateClipResult => {
  const clip = useTimelineStore((state) =>
    state.clips.find((candidate) => candidate.id === clipId)
  );
  const patchClip = useTimelineStore((state) => state.patchClip);
  const jobState = useTimelineGenerationStore((state) => state.clipJobs[clipId]);

  const registerJob = useTimelineGenerationStore((state) => state.registerJob);
  const clearJob = useTimelineGenerationStore((state) => state.clearJob);
  const directGen = useTimelineDirectGenJob();

  // Direct-gen clips skip the workflow runner and `TimelineGenerationStore`
  // entirely — status is driven straight from the RPC response and reflected
  // on `clip.status`.
  const isDirectGen =
    clip?.bindingKind === "text-to-image" ||
    clip?.bindingKind === "image-to-image";
  const isDirectGenActive =
    isDirectGen && (clip?.status === "queued" || clip?.status === "generating");
  const isDirectGenFailed = isDirectGen && clip?.status === "failed";

  const generateClip = useCallback(async () => {
    if (!clip) {
      throw new Error("Clip not found");
    }

    if (
      clip.bindingKind === "text-to-image" ||
      clip.bindingKind === "image-to-image"
    ) {
      await directGen.start(clip.id);
      return;
    }

    const workflowId = clip.workflowId;
    if (!workflowId) {
      throw new Error("Clip is not bound to a workflow");
    }

    // Single-flight per clip: if a job is already queued or running for this
    // clip, do nothing. Without this guard a rapid double-click registers a
    // second job that overwrites the first in the store, orphans the local
    // subscription, and leaves the original job running on the server.
    const existing = useTimelineGenerationStore.getState().clipJobs[clip.id];
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      return;
    }

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
    // Use the id run() returns, not runnerStore.job_id: when the runner is
    // already busy the run is queued under a fresh id while the store keeps
    // pointing at the active run, so reading it back would subscribe this
    // clip to the wrong job and strand its updates.
    const jobId = await runnerStore
      .getState()
      .run(clip.paramOverrides ?? {}, workflow, nodes, edges);

    if (!jobId) {
      throw new Error("Workflow runner did not return a job id");
    }

    registerJob(clip.id, jobId, workflowId);
    await subscribeJob(
      jobId,
      {
        clipId: clip.id,
        workflowId,
        selectedOutputNodeId: clip.selectedOutputNodeId
      },
      false
    );
  }, [clip, registerJob, directGen]);

  const cancelClipGeneration = useCallback(async () => {
    if (isDirectGen) {
      directGen.cancel(clipId);
      return;
    }

    if (!jobState?.jobId) {
      return;
    }

    await trpcClient.jobs.cancel.mutate({ id: jobState.jobId });
    unsubscribeJob(jobState.jobId);
    clearJob(clipId);

    const currentClip = useTimelineStore
      .getState()
      .clips.find((candidate) => candidate.id === clipId);
    if (currentClip) {
      patchClip(clipId, { status: deriveIdleClipStatus(currentClip) });
    }
  }, [isDirectGen, directGen, jobState?.jobId, clearJob, clipId, patchClip]);

  if (isDirectGen) {
    return {
      generateClip,
      cancelClipGeneration,
      isActive: isDirectGenActive,
      isGenerating: clip?.status === "generating",
      isQueued: clip?.status === "queued",
      isFailed: isDirectGenFailed,
      currentJobId: undefined
    };
  }

  return {
    generateClip,
    cancelClipGeneration,
    isActive: jobState?.status === "queued" || jobState?.status === "running",
    isGenerating: jobState?.status === "running",
    isQueued: jobState?.status === "queued",
    isFailed: jobState?.status === "failed",
    currentJobId: jobState?.jobId
  };
};

export default useGenerateClip;
