/**
 * StoryboardGenerationStore
 *
 * Per-shot generation jobs and their lifecycle for the Storyboard surface,
 * mirroring TimelineGenerationStore. Each shot can have at most one active job
 * (a keyframe still or a clip render); the store tracks its status and mirrors
 * the terminal result back into {@link useStoryboardStore} (keyframe/clip refs +
 * ShotStatus).
 *
 * The module also owns the WebSocket job subscription machinery so
 * {@link useGenerateShot} can hand off a freshly-started job and
 * {@link useStoryboardGenerationSubscriptions} can reconnect active jobs when the
 * surface mounts.
 */

import { useEffect } from "react";
import { create } from "zustand";
import type { ImageRef, VideoRef } from "@nodetool-ai/protocol";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import type { OutputUpdate } from "../ApiTypes";
import { normalizeOutputUpdateValue } from "../outputUpdateValue";
import { useStoryboardStore } from "./StoryboardStore";

// ── Types ────────────────────────────────────────────────────────────────────

export type ShotGenerationStatus =
  | "queued"
  | "running"
  | "failed"
  | "completed";

/** Which asset a job produces, so completion writes the right shot field. */
export type ShotJobKind = "keyframe" | "clip";

export interface ShotJobState {
  shotId: string;
  boardId: string;
  jobId: string;
  workflowId: string;
  kind: ShotJobKind;
  status: ShotGenerationStatus;
  /** 0..100 best-effort progress. */
  progress?: number;
  /** Asset id resolved from the completed job's output, when present. */
  assetId?: string;
  errorMessage?: string;
}

/** Context needed to route a job's WebSocket messages back to its shot. */
export interface StoryboardJobContext {
  shotId: string;
  boardId: string;
  workflowId: string;
  kind: ShotJobKind;
  /** Node id of the Output node whose value is the produced asset. */
  outputNodeId: string;
}

interface StoryboardGenerationStoreState {
  /** shotId → active job state */
  shotJobs: Record<string, ShotJobState>;
  /** jobId → shotId (reverse lookup for incoming job events) */
  jobToShot: Record<string, string>;

  /**
   * Stable-membership lists kept in state so their reference only changes when a
   * job's *status* moves in/out of the set — never on progress-only ticks.
   */
  generatingShotIds: string[];
  failedShotIds: string[];

  registerJob: (
    shotId: string,
    boardId: string,
    jobId: string,
    workflowId: string,
    kind: ShotJobKind
  ) => void;
  updateJobStatus: (
    jobId: string,
    status: ShotGenerationStatus,
    extra?: { assetId?: string; errorMessage?: string }
  ) => void;
  updateJobProgress: (jobId: string, progress: number) => void;
  clear: (shotId: string) => void;
  getShotJobState: (shotId: string) => ShotJobState | undefined;
}

// ── Derived membership (status-only) ─────────────────────────────────────────

const isGenerating = (job: ShotJobState): boolean =>
  job.status === "queued" || job.status === "running";

const isFailed = (job: ShotJobState): boolean => job.status === "failed";

const deriveIds = (
  shotJobs: Record<string, ShotJobState>,
  predicate: (job: ShotJobState) => boolean
): string[] => {
  const ids: string[] = [];
  for (const id of Object.keys(shotJobs)) {
    if (predicate(shotJobs[id])) {
      ids.push(id);
    }
  }
  return ids;
};

const sameMembership = (a: string[], b: string[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
};

const deriveMembership = (
  shotJobs: Record<string, ShotJobState>,
  prev: Pick<
    StoryboardGenerationStoreState,
    "generatingShotIds" | "failedShotIds"
  >
): { generatingShotIds: string[]; failedShotIds: string[] } => {
  const nextGenerating = deriveIds(shotJobs, isGenerating);
  const nextFailed = deriveIds(shotJobs, isFailed);
  return {
    generatingShotIds: sameMembership(prev.generatingShotIds, nextGenerating)
      ? prev.generatingShotIds
      : nextGenerating,
    failedShotIds: sameMembership(prev.failedShotIds, nextFailed)
      ? prev.failedShotIds
      : nextFailed
  };
};

// ── Store ────────────────────────────────────────────────────────────────────

export const useStoryboardGenerationStore =
  create<StoryboardGenerationStoreState>((set, get) => ({
    shotJobs: {},
    jobToShot: {},
    generatingShotIds: [],
    failedShotIds: [],

    registerJob: (shotId, boardId, jobId, workflowId, kind) => {
      const jobState: ShotJobState = {
        shotId,
        boardId,
        jobId,
        workflowId,
        kind,
        status: "queued",
        progress: 0
      };
      set((state) => {
        const nextShotJobs = { ...state.shotJobs, [shotId]: jobState };
        const nextJobToShot = { ...state.jobToShot, [jobId]: shotId };
        const previous = state.shotJobs[shotId];
        if (previous && previous.jobId !== jobId) {
          delete nextJobToShot[previous.jobId];
        }
        return {
          shotJobs: nextShotJobs,
          jobToShot: nextJobToShot,
          ...deriveMembership(nextShotJobs, state)
        };
      });
      useStoryboardStore
        .getState()
        .setShotStatus(
          boardId,
          shotId,
          kind === "keyframe" ? "keyframe_generating" : "clip_generating"
        );
    },

    updateJobStatus: (jobId, status, extra) => {
      const { jobToShot, shotJobs } = get();
      const shotId = jobToShot[jobId];
      if (!shotId) {
        return;
      }
      const existing = shotJobs[shotId];
      if (!existing) {
        return;
      }

      const completedWithoutAsset = status === "completed" && !extra?.assetId;
      const effectiveStatus: ShotGenerationStatus = completedWithoutAsset
        ? "failed"
        : status;
      const updated: ShotJobState = {
        ...existing,
        status: effectiveStatus,
        ...extra,
        ...(completedWithoutAsset
          ? {
              errorMessage:
                extra?.errorMessage ??
                "Job completed without producing an output asset."
            }
          : {})
      };

      set((state) => {
        const nextShotJobs = { ...state.shotJobs, [shotId]: updated };
        return {
          shotJobs: nextShotJobs,
          ...deriveMembership(nextShotJobs, state)
        };
      });

      if (effectiveStatus === "failed") {
        useStoryboardStore
          .getState()
          .setShotStatus(existing.boardId, shotId, "failed");
      }
    },

    updateJobProgress: (jobId, progress) => {
      const { jobToShot, shotJobs } = get();
      const shotId = jobToShot[jobId];
      if (!shotId) {
        return;
      }
      const existing = shotJobs[shotId];
      if (!existing) {
        return;
      }
      const safeProgress = Math.max(0, Math.min(100, progress));
      set((state) => ({
        shotJobs: {
          ...state.shotJobs,
          [shotId]: { ...existing, progress: safeProgress }
        }
      }));
    },

    clear: (shotId) => {
      const { shotJobs, jobToShot } = get();
      const jobState = shotJobs[shotId];
      if (!jobState) {
        return;
      }
      const nextJobToShot = { ...jobToShot };
      delete nextJobToShot[jobState.jobId];
      const nextShotJobs = { ...shotJobs };
      delete nextShotJobs[shotId];
      set((state) => ({
        shotJobs: nextShotJobs,
        jobToShot: nextJobToShot,
        ...deriveMembership(nextShotJobs, state)
      }));
    },

    getShotJobState: (shotId) => get().shotJobs[shotId]
  }));

// ── Convenience selectors ────────────────────────────────────────────────────

export const useGeneratingShotIds = (): string[] =>
  useStoryboardGenerationStore((state) => state.generatingShotIds);

export const useFailedShotIds = (): string[] =>
  useStoryboardGenerationStore((state) => state.failedShotIds);

// ── WebSocket job machinery ──────────────────────────────────────────────────

const jobSubscriptions = new Map<string, () => void>();
const jobContexts = new Map<string, StoryboardJobContext>();
const jobOutputs = new Map<string, unknown>();

const isActiveStatus = (status: ShotGenerationStatus): boolean =>
  status === "queued" || status === "running";

/** Coerce an output-node value into an ImageRef (best-effort). */
const toImageRef = (value: unknown): ImageRef | null => {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (v.uri || v.asset_id || v.data) {
      return { type: "image", ...v } as ImageRef;
    }
  }
  if (typeof value === "string" && value) {
    return { type: "image", uri: value };
  }
  return null;
};

/** Coerce an output-node value into a VideoRef (best-effort). */
const toVideoRef = (value: unknown): VideoRef | null => {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (v.uri || v.asset_id || v.data) {
      return { type: "video", ...v } as VideoRef;
    }
  }
  if (typeof value === "string" && value) {
    return { type: "video", uri: value };
  }
  return null;
};

const extractAssetId = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.asset_id === "string") return v.asset_id;
  if (typeof v.uri === "string") return v.uri;
  return undefined;
};

export const unsubscribeShotJob = (jobId: string): void => {
  const unsubscribe = jobSubscriptions.get(jobId);
  if (unsubscribe) {
    unsubscribe();
    jobSubscriptions.delete(jobId);
  }
  jobContexts.delete(jobId);
  jobOutputs.delete(jobId);
};

export const __resetStoryboardSubscriptionsForTests = (): void => {
  for (const unsubscribe of jobSubscriptions.values()) {
    unsubscribe();
  }
  jobSubscriptions.clear();
  jobContexts.clear();
  jobOutputs.clear();
};

const handleShotJobMessage = (jobId: string, message: WebSocketMessage): void => {
  const context = jobContexts.get(jobId);
  if (!context) {
    return;
  }
  const generationStore = useStoryboardGenerationStore.getState();

  if (
    message.type === "node_progress" &&
    typeof message.progress === "number" &&
    typeof message.total === "number"
  ) {
    const percent =
      message.total > 0 ? (message.progress / message.total) * 100 : 0;
    generationStore.updateJobProgress(jobId, percent);
    return;
  }

  if (
    message.type === "output_update" &&
    message.node_id === context.outputNodeId
  ) {
    jobOutputs.set(
      jobId,
      normalizeOutputUpdateValue(message as unknown as OutputUpdate)
    );
    return;
  }

  if (message.type !== "job_update") {
    return;
  }

  const status = message.status;
  if (status === "queued") {
    generationStore.updateJobStatus(jobId, "queued");
    return;
  }
  if (status === "running") {
    generationStore.updateJobStatus(jobId, "running");
    useStoryboardStore
      .getState()
      .setShotStatus(
        context.boardId,
        context.shotId,
        context.kind === "keyframe"
          ? "keyframe_generating"
          : "clip_generating"
      );
    return;
  }

  if (status === "completed") {
    const value = jobOutputs.get(jobId);
    const assetId = extractAssetId(value);
    if (!assetId) {
      generationStore.updateJobStatus(jobId, "failed", {
        errorMessage: "Workflow finished without producing an output asset."
      });
      unsubscribeShotJob(jobId);
      return;
    }
    const storyboard = useStoryboardStore.getState();
    if (context.kind === "keyframe") {
      const ref = toImageRef(value);
      if (ref) {
        storyboard.setShotKeyframe(context.boardId, context.shotId, ref);
      }
      storyboard.setShotStatus(context.boardId, context.shotId, "keyframe_ready");
    } else {
      const ref = toVideoRef(value);
      if (ref) {
        storyboard.setShotClip(context.boardId, context.shotId, ref);
      }
      storyboard.setShotStatus(context.boardId, context.shotId, "rendered");
    }
    generationStore.updateJobStatus(jobId, "completed", { assetId });
    generationStore.clear(context.shotId);
    unsubscribeShotJob(jobId);
    return;
  }

  if (status === "failed" || status === "timed_out") {
    const errorMessage =
      typeof message.error === "string" && message.error.trim().length > 0
        ? message.error
        : `Job ${status}`;
    generationStore.updateJobStatus(jobId, "failed", { errorMessage });
    unsubscribeShotJob(jobId);
    return;
  }

  if (status === "cancelled") {
    generationStore.clear(context.shotId);
    unsubscribeShotJob(jobId);
  }
};

/** Subscribe to a shot's job stream (optionally replaying via reconnect). */
export const subscribeShotJob = async (
  jobId: string,
  context: StoryboardJobContext,
  reconnect: boolean
): Promise<void> => {
  if (jobSubscriptions.has(jobId)) {
    jobContexts.set(jobId, context);
    return;
  }
  await globalWebSocketManager.ensureConnection();
  jobContexts.set(jobId, context);
  const unsubscribe = globalWebSocketManager.subscribe(jobId, (message) =>
    handleShotJobMessage(jobId, message)
  );
  jobSubscriptions.set(jobId, unsubscribe);

  if (reconnect) {
    await globalWebSocketManager.send({
      type: "reconnect_job",
      command: "reconnect_job",
      data: { job_id: jobId, workflow_id: context.workflowId }
    });
  }
};

/**
 * Reconnect subscriptions for every active job while the surface is mounted.
 * Keyed by a sorted, comma-joined active-job-id string so it only re-runs when
 * a job enters or leaves the active set — not on progress ticks.
 */
export const useStoryboardGenerationSubscriptions = (): void => {
  const activeJobIdsKey = useStoryboardGenerationStore((state) =>
    Object.values(state.shotJobs)
      .filter((job) => isActiveStatus(job.status))
      .map((job) => job.jobId)
      .sort()
      .join(",")
  );

  useEffect(() => {
    const shotJobs = useStoryboardGenerationStore.getState().shotJobs;
    const activeJobs = Object.values(shotJobs).filter((job) =>
      isActiveStatus(job.status)
    );
    const activeJobIdSet = new Set(activeJobs.map((job) => job.jobId));

    for (const [jobId] of jobSubscriptions) {
      if (!activeJobIdSet.has(jobId)) {
        unsubscribeShotJob(jobId);
      }
    }

    for (const job of activeJobs) {
      // A reconnected job may have lost its output-node context; skip until the
      // originating run re-registers it. Its context is set on subscribe.
      const context = jobContexts.get(job.jobId);
      if (context) {
        void subscribeShotJob(job.jobId, context, true);
      }
    }
  }, [activeJobIdsKey]);
};
