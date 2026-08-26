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
import type { ImageRef, ShotStatus, VideoRef } from "@nodetool-ai/protocol";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import { normalizeOutputUpdateValue, isOutputUpdate } from "../outputUpdateValue";
import { useNotificationStore } from "../NotificationStore";
import { useStoryboardStore } from "./StoryboardStore";
import { syncShotClipToTimeline } from "./timelineSync";
import { isNumber, isString } from "../../utils/typePredicates";

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

/**
 * Context for a direct-generation request (`generate_media` RPC): no job, no
 * workflow — completion arrives as an `rpc_response` on the request id.
 */
export interface DirectShotJobContext {
  shotId: string;
  boardId: string;
  kind: ShotJobKind;
}

type ShotJobContext = StoryboardJobContext | DirectShotJobContext;

/** The wire shape of a `generate_media` reply. */
interface DirectGenRpcResponse extends WebSocketMessage {
  type: "rpc_response";
  request_id: string;
  result?: { asset_ids?: unknown };
  error?: { code?: string; message?: string };
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
  /**
   * Record a failure that happened before the job existed — the run request
   * itself threw, so there is no job id and no WebSocket stream to report it.
   * Without this the shot silently stays "planned" and the user sees nothing.
   */
  recordStartFailure: (
    shotId: string,
    boardId: string,
    kind: ShotJobKind,
    errorMessage: string
  ) => void;
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
) => {
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

// ── Failure reporting ────────────────────────────────────────────────────────

const KIND_LABEL: Record<ShotJobKind, string> = {
  keyframe: "Still",
  clip: "Clip"
};

/** "3. Wide of the pier" — the name the card shows, for the failure toast. */
const shotLabel = (boardId: string, shotId: string): string => {
  const shot = useStoryboardStore
    .getState()
    .getBoard(boardId)
    ?.shots.find((s) => s.id === shotId);
  if (!shot) {
    return "shot";
  }
  return `${shot.index + 1}. ${shot.slug ?? "Untitled shot"}`;
};

/**
 * Toast a failed render. The card carries the same message, but a board can be
 * long and a still can fail while the user is looking elsewhere — one job, one
 * notification (dedupeKey), replacing the previous one for that job.
 */
const notifyShotFailure = (job: ShotJobState): void => {
  const reason = job.errorMessage?.trim();
  useNotificationStore.getState().addNotification({
    type: "error",
    alert: true,
    content: `${KIND_LABEL[job.kind]} failed for ${shotLabel(
      job.boardId,
      job.shotId
    )}${reason ? `: ${reason}` : "."}`,
    dedupeKey: `storyboard-shot-failed:${job.shotId}`,
    replaceExisting: true
  });
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

      // A completed job may legitimately carry no assetId: inline `data`
      // outputs are usable media refs that were already written to the shot.
      // Success is decided by the message handler (usable ref or not) — do
      // NOT reclassify completed-without-asset as failed here, or the
      // ready/rendered status just written gets overwritten.
      const updated: ShotJobState = {
        ...existing,
        status,
        ...extra
      };

      set((state) => {
        const nextShotJobs = { ...state.shotJobs, [shotId]: updated };
        return {
          shotJobs: nextShotJobs,
          ...deriveMembership(nextShotJobs, state)
        };
      });

      if (status === "failed") {
        useStoryboardStore
          .getState()
          .setShotStatus(existing.boardId, shotId, "failed");
        notifyShotFailure(updated);
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

    recordStartFailure: (shotId, boardId, kind, errorMessage) => {
      const jobState: ShotJobState = {
        shotId,
        boardId,
        // No job was created, so there is nothing to subscribe to or cancel.
        // The id only keys the reverse lookup, which nothing will hit.
        jobId: `unstarted:${shotId}`,
        workflowId: "",
        kind,
        status: "failed",
        errorMessage
      };
      set((state) => {
        const nextShotJobs = { ...state.shotJobs, [shotId]: jobState };
        const nextJobToShot = { ...state.jobToShot };
        const previous = state.shotJobs[shotId];
        if (previous) {
          delete nextJobToShot[previous.jobId];
        }
        nextJobToShot[jobState.jobId] = shotId;
        return {
          shotJobs: nextShotJobs,
          jobToShot: nextJobToShot,
          ...deriveMembership(nextShotJobs, state)
        };
      });
      useStoryboardStore.getState().setShotStatus(boardId, shotId, "failed");
      notifyShotFailure(jobState);
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

// ── WebSocket job machinery ──────────────────────────────────────────────────

const jobSubscriptions = new Map<string, () => void>();
const jobContexts = new Map<string, ShotJobContext>();
const jobOutputs = new Map<string, unknown>();

const isActiveStatus = (status: ShotGenerationStatus): boolean =>
  status === "queued" || status === "running";

function isMediaRefLike(
  value: unknown
): value is Record<string, unknown> & { uri?: string; asset_id?: string; data?: unknown } {
  if (!value || typeof value !== "object") return false;
  // SAFETY: the line above returned for anything that is not a non-null
  // object, so indexing is defined; the three reads are unknown-typed and only
  // tested for truthiness, which is what the predicate reports.
  const v = value as Record<string, unknown>;
  return Boolean(v.uri || v.asset_id || v.data);
}

/** Coerce an output-node value into an ImageRef (best-effort). */
const toImageRef = (value: unknown): ImageRef | null => {
  if (isMediaRefLike(value)) {
    return { ...value, type: "image" } as ImageRef;
  }
  if (isString(value) && value) {
    return { type: "image", uri: value };
  }
  return null;
};

/** Coerce an output-node value into a VideoRef (best-effort). */
const toVideoRef = (value: unknown): VideoRef | null => {
  if (isMediaRefLike(value)) {
    return { ...value, type: "video" } as VideoRef;
  }
  if (isString(value) && value) {
    return { type: "video", uri: value };
  }
  return null;
};

const extractAssetId = (value: unknown): string | undefined => {
  if (!isMediaRefLike(value)) {
    return undefined;
  }
  if (isString(value.asset_id)) return value.asset_id;
  if (isString(value.uri)) return value.uri;
  return undefined;
};

/**
 * Settle a shot whose job was cancelled: restore the shot's status from what
 * it already holds (a kept keyframe/clip beats resetting to planned), drop
 * the job from the store, and tear down the WebSocket subscription. Safe to
 * call for a shot with no tracked job.
 */
export const settleCancelledShotJob = (shotId: string): void => {
  const job = useStoryboardGenerationStore.getState().shotJobs[shotId];
  if (!job) {
    return;
  }
  const storyboard = useStoryboardStore.getState();
  const shot = storyboard
    .getBoard(job.boardId)
    ?.shots.find((s) => s.id === shotId);
  if (shot) {
    const status: ShotStatus =
      job.kind === "keyframe"
        ? shot.keyframe
          ? "keyframe_ready"
          : "planned"
        : shot.clip
          ? "rendered"
          : "keyframe_ready";
    storyboard.setShotStatus(job.boardId, shotId, status);
  }
  useStoryboardGenerationStore.getState().clear(shotId);
  unsubscribeShotJob(job.jobId);
};

/** Drop a job's subscription and cached context/output. */
export const unsubscribeShotJob = (jobId: string): void => {
  const unsubscribe = jobSubscriptions.get(jobId);
  if (unsubscribe) {
    unsubscribe();
    jobSubscriptions.delete(jobId);
  }
  jobContexts.delete(jobId);
  jobOutputs.delete(jobId);
};

/** Test-only: run the job message handler with a pre-seeded context. */
export const __handleShotJobMessageForTests = (
  jobId: string,
  context: StoryboardJobContext | DirectShotJobContext,
  message: WebSocketMessage
): void => {
  jobContexts.set(jobId, context);
  handleShotJobMessage(jobId, message);
};

export const __resetStoryboardSubscriptionsForTests = (): void => {
  for (const unsubscribe of jobSubscriptions.values()) {
    unsubscribe();
  }
  jobSubscriptions.clear();
  jobContexts.clear();
  jobOutputs.clear();
};

/**
 * Write a produced asset back onto its shot and settle the status. Shared by
 * the workflow-job completion branch and the direct-generation response.
 */
const settleShotAsset = (
  context: Pick<ShotJobContext, "boardId" | "shotId" | "kind">,
  ref: ImageRef | VideoRef,
  assetId?: string
): void => {
  const storyboard = useStoryboardStore.getState();
  if (context.kind === "keyframe") {
    storyboard.setShotKeyframe(
      context.boardId,
      context.shotId,
      ref as ImageRef
    );
    storyboard.setShotStatus(context.boardId, context.shotId, "keyframe_ready");
  } else {
    storyboard.setShotClip(context.boardId, context.shotId, ref as VideoRef);
    storyboard.setShotStatus(context.boardId, context.shotId, "rendered");
    // Round-trip the new clip into an assembled timeline, if one is linked.
    if (assetId) {
      void syncShotClipToTimeline(context.boardId, context.shotId, assetId);
    }
  }
};

/** Settle a direct-generation request from its rpc_response. */
const handleDirectResponse = (
  requestId: string,
  context: DirectShotJobContext,
  message: DirectGenRpcResponse
): void => {
  const generationStore = useStoryboardGenerationStore.getState();
  const assetIds = Array.isArray(message.result?.asset_ids)
    ? (message.result!.asset_ids as unknown[]).filter(
        (v): v is string => typeof v === "string"
      )
    : [];
  const assetId = assetIds[0];
  const errorMessage =
    message.error?.message?.trim() ||
    (assetId ? "" : "Direct generation returned no asset.");
  if (!assetId || errorMessage) {
    // Parity with a failed workflow job: keep the row so the card can read
    // the reason; drop only the subscription.
    generationStore.updateJobStatus(requestId, "failed", {
      errorMessage: errorMessage || "Direct generation failed."
    });
    unsubscribeShotJob(requestId);
    return;
  }
  const ref: ImageRef | VideoRef =
    context.kind === "keyframe"
      ? { type: "image", uri: `asset://${assetId}`, asset_id: assetId }
      : { type: "video", uri: `asset://${assetId}`, asset_id: assetId };
  settleShotAsset(context, ref, assetId);
  generationStore.updateJobStatus(requestId, "completed", { assetId });
  generationStore.clear(context.shotId);
  unsubscribeShotJob(requestId);
};

const handleShotJobMessage = (jobId: string, message: WebSocketMessage): void => {
  const context = jobContexts.get(jobId);
  if (!context) {
    return;
  }
  const generationStore = useStoryboardGenerationStore.getState();

  if (
    message.type === "node_progress" &&
    isNumber(message.progress) &&
    isNumber(message.total)
  ) {
    const percent =
      message.total > 0 ? (message.progress / message.total) * 100 : 0;
    generationStore.updateJobProgress(jobId, percent);
    return;
  }

  if (message.type === "rpc_response") {
    // Only a direct-generation request settles on an rpc_response.
    if (!("outputNodeId" in context)) {
      handleDirectResponse(
        jobId,
        context,
        message as DirectGenRpcResponse
      );
    }
    return;
  }

  if (
    isOutputUpdate(message) &&
    "outputNodeId" in context &&
    message.node_id === context.outputNodeId
  ) {
    jobOutputs.set(jobId, normalizeOutputUpdateValue(message));
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
    // A usable output is any coercible ref — inline `data` counts, so don't
    // require an asset_id/uri (in-flight outputs may not be persisted yet).
    const ref =
      context.kind === "keyframe" ? toImageRef(value) : toVideoRef(value);
    if (!ref) {
      generationStore.updateJobStatus(jobId, "failed", {
        errorMessage: "Workflow finished without producing an output."
      });
      unsubscribeShotJob(jobId);
      return;
    }
    settleShotAsset(context, ref, extractAssetId(value));
    generationStore.updateJobStatus(jobId, "completed", {
      assetId: extractAssetId(value)
    });
    generationStore.clear(context.shotId);
    unsubscribeShotJob(jobId);
    return;
  }

  if (status === "failed" || status === "timed_out") {
    const errorMessage =
      isString(message.error) && message.error.trim().length > 0
        ? message.error
        : `Job ${status}`;
    generationStore.updateJobStatus(jobId, "failed", { errorMessage });
    unsubscribeShotJob(jobId);
    return;
  }

  if (status === "cancelled") {
    // Settle restores the shot's status (a cancelled regenerate keeps its
    // existing still/clip) besides clearing the job and subscription.
    settleCancelledShotJob(context.shotId);
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

  // A direct-generation request has no server job to replay; its subscription
  // survives remounts (module-level) and only a full reload loses it.
  if (reconnect && context.workflowId) {
    await globalWebSocketManager.send({
      type: "reconnect_job",
      command: "reconnect_job",
      data: { job_id: jobId, workflow_id: context.workflowId }
    });
  }
};

/**
 * Subscribe to a direct-generation request (`generate_media` RPC) keyed by
 * its request id. No reconnect handshake — the reply is one rpc_response.
 */
export const subscribeDirectShotJob = async (
  requestId: string,
  context: DirectShotJobContext
): Promise<void> => {
  if (jobSubscriptions.has(requestId)) {
    jobContexts.set(requestId, context);
    return;
  }
  await globalWebSocketManager.ensureConnection();
  jobContexts.set(requestId, context);
  const unsubscribe = globalWebSocketManager.subscribe(
    requestId,
    (message) => handleShotJobMessage(requestId, message)
  );
  jobSubscriptions.set(requestId, unsubscribe);
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
      // Direct-generation requests have no server job to replay — their
      // module-level subscription survives remounts as-is.
      const context = jobContexts.get(job.jobId);
      if (context && "outputNodeId" in context) {
        void subscribeShotJob(job.jobId, context, true);
      }
    }
  }, [activeJobIdsKey]);
};
