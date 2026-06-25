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
import { extractAssetId } from "../../stores/outputAssetId";
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
const jobOutputs = new Map<string, unknown>();
// Clips whose generateClip() is past the single-flight guard but hasn't
// registered its job yet (the start path awaits a workflow fetch and the
// runner before registerJob). A synchronous marker closes the double-click
// hole where two calls both pass the store-based guard.
const startingClips = new Set<string>();

const isActiveStatus = (status: string): boolean =>
  status === "queued" || status === "running";

const isDirectGenKind = (kind: string | undefined): boolean =>
  kind === "text-to-image" ||
  kind === "image-to-image" ||
  kind === "text-to-video" ||
  kind === "text-to-audio";

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
  jobOutputs.delete(jobId);
};

export const __resetGenerateClipSubscriptionsForTests = (): void => {
  for (const unsubscribe of jobSubscriptions.values()) {
    unsubscribe();
  }
  jobSubscriptions.clear();
  jobContexts.clear();
  jobOutputs.clear();
  startingClips.clear();
};

export const __setJobContextForTests = (
  jobId: string,
  context: JobSubscriptionContext
): void => {
  jobContexts.set(jobId, context);
};

const forwardWorkflowMessage = (
  workflowId: string,
  message: WebSocketMessage
): void => {
  // Per-node status/error are scoped by the producing run's job_id so
  // concurrent same-workflow runs stay isolated. Skip the write if absent.
  const jobId =
    typeof message.job_id === "string" ? message.job_id : undefined;

  if (message.type === "prediction" && typeof message.node_id === "string") {
    if (message.status === "booting" && jobId) {
      useStatusStore
        .getState()
        .setStatus(workflowId, jobId, message.node_id, "booting");
    }
    return;
  }

  if (
    message.type === "node_progress" &&
    typeof message.node_id === "string" &&
    typeof message.progress === "number" &&
    typeof message.total === "number"
  ) {
    if (jobId) {
      useResultsStore.getState().setProgress(
        workflowId,
        jobId,
        message.node_id,
        message.progress,
        message.total,
        typeof message.chunk === "string" ? message.chunk : undefined
      );
    }
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
    if (!jobId) {
      return;
    }
    const nodeStatus =
      typeof message.status === "string"
        ? message.status
        : typeof message.status === "object" && message.status !== null
          ? (message.status as Record<string, unknown>)
        : undefined;
    useStatusStore
      .getState()
      .setStatus(workflowId, jobId, message.node_id, nodeStatus);
    const nodeError =
      typeof message.error === "string" && message.error.trim().length > 0
        ? message.error
        : null;
    useErrorStore
      .getState()
      .setError(workflowId, jobId, message.node_id, nodeError);
    return;
  }

  if (
    message.type === "output_update" &&
    typeof message.node_id === "string" &&
    jobId
  ) {
    useResultsStore
      .getState()
      .setOutputResult(
        workflowId,
        jobId,
        message.node_id,
        normalizeOutputUpdateValue(message as unknown as OutputUpdate),
        true
      );
  }
};

export const handleJobMessage = async (jobId: string, message: WebSocketMessage): Promise<void> => {
  const context = jobContexts.get(jobId);
  if (!context) {
    return;
  }

  forwardWorkflowMessage(context.workflowId, message);

  if (
    message.type === "output_update" &&
    message.node_id === context.selectedOutputNodeId
  ) {
    jobOutputs.set(jobId, normalizeOutputUpdateValue(message as unknown as OutputUpdate));
  }

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
      ? extractAssetId(jobOutputs.get(jobId))
      : undefined;

    // A run can report "completed" without producing the selected output
    // asset (e.g. a node errored mid-flight). Surface that as a failure
    // instead of silently reverting the clip to draft.
    if (!assetId) {
      const errorMessage =
        "Workflow finished without producing an output asset.";
      useErrorStore
        .getState()
        .setError(
          context.workflowId,
          jobId,
          context.selectedOutputNodeId ?? "__job__",
          errorMessage
        );
      generationStore.updateJobStatus(jobId, "failed", { errorMessage });
      unsubscribeJob(jobId);
      return;
    }

    // The store's completed handler applies the asset to the clip: it
    // appends a ClipVersion, sets currentAssetId / lastGeneratedHash
    // (unless locked) and settles clip.status.
    generationStore.updateJobStatus(jobId, "completed", { assetId });
    generationStore.clearJob(context.clipId);
    unsubscribeJob(jobId);
    return;
  }

  if (status === "failed" || status === "timed_out") {
    const errorMessage =
      typeof message.error === "string" && message.error.trim().length > 0
        ? message.error
        : `Job ${status}`;

    const nodeId = context.selectedOutputNodeId ?? "__job__";
    useErrorStore
      .getState()
      .setError(context.workflowId, jobId, nodeId, errorMessage);
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
    void handleJobMessage(jobId, message)
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
  /**
   * Whether the clip has everything it needs to start a generation — a bound
   * workflow for workflow clips, or a valid prompt/model (plus source/voice
   * where required) for direct-gen clips. The single source of truth for both
   * the prompt panel's primary button and the action toolbar's generate icon.
   */
  canGenerate: boolean;
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
  // on `clip.status` (which also covers jobs started elsewhere, e.g. the
  // AddClipMenu, since they patch the same clip status).
  const isDirectGen = isDirectGenKind(clip?.bindingKind);
  const isDirectGenActive =
    isDirectGen && (clip?.status === "queued" || clip?.status === "generating");
  const isDirectGenFailed = isDirectGen && clip?.status === "failed";

  const canGenerate = !clip
    ? false
    : isDirectGen
      ? !!clip.provider &&
        !!clip.model &&
        (clip.prompt ?? "").trim().length > 0 &&
        (clip.bindingKind !== "image-to-image" || !!clip.sourceClipId) &&
        (clip.bindingKind !== "text-to-audio" || !!clip.voice)
      : !!clip.workflowId;

  const generateClip = useCallback(async () => {
    if (!clip) {
      throw new Error("Clip not found");
    }

    if (isDirectGenKind(clip.bindingKind)) {
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
    // `startingClips` covers the async window before registerJob runs.
    if (startingClips.has(clip.id)) {
      return;
    }
    const existing = useTimelineGenerationStore.getState().clipJobs[clip.id];
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      return;
    }

    startingClips.add(clip.id);
    patchClip(clip.id, { status: "queued" });
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
      // Use the id run() returns, not runnerStore.job_id: when the runner is
      // already busy the run is queued under a fresh id while the store keeps
      // pointing at the active run, so reading it back would subscribe this
      // clip to the wrong job and strand its updates.
      const jobId = await runnerStore
        .getState()
        .run(clip.paramOverrides ?? {}, workflow, nodes, edges, undefined, undefined, true);

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
    } catch (error) {
      // Roll back the optimistic "queued" status unless a job actually got
      // registered (then its own lifecycle owns the status).
      if (!useTimelineGenerationStore.getState().clipJobs[clip.id]) {
        patchClip(clip.id, { status: deriveIdleClipStatus(clip) });
      }
      throw error;
    } finally {
      startingClips.delete(clip.id);
    }
  }, [clip, registerJob, directGen, patchClip]);

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
      canGenerate,
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
    canGenerate,
    currentJobId: jobState?.jobId
  };
};

export default useGenerateClip;
