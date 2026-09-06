/**
 * StoryboardGenerationStore
 *
 * Per-shot generation jobs and their lifecycle for the Storyboard surface,
 * mirroring TimelineGenerationStore. Each shot can have at most one active job
 * (a keyframe still or a clip render); the store tracks its status and mirrors
 * the terminal result back into {@link useStoryboardStore} (keyframe/clip refs +
 * ShotStatus).
 *
 * Every render is a direct `generate_media` RPC — no workflow, no job row. The
 * module owns the WebSocket subscription machinery so {@link useGenerateShot}
 * can hand off a freshly-sent request and completion (one `rpc_response`)
 * writes the asset back onto the shot.
 */

import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  BoardRenderContext,
  ClipVersion,
  ImageRef,
  KeyframeVersion,
  RenderInputs,
  Shot,
  ShotStatus,
  VideoRef
} from "@nodetool-ai/protocol";
import { currentRenderInputs, stampRenderInputs } from "@nodetool-ai/protocol";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import { useNotificationStore } from "../NotificationStore";
import { useStoryboardStore } from "./StoryboardStore";
import { syncShotClipToTimeline } from "./timelineSync";
import { isNumber } from "../../utils/typePredicates";

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
  /** The `generate_media` request id the reply arrives on. */
  jobId: string;
  kind: ShotJobKind;
  status: ShotGenerationStatus;
  /**
   * Epoch ms the request was sent — the base for the measured estimate.
   * Absent on a row built by a test fixture rather than `registerJob`.
   */
  startedAt?: number;
  /** 0..100 best-effort progress. */
  progress?: number;
  /** Asset id resolved from the completed job's output, when present. */
  assetId?: string;
  errorMessage?: string;
  /**
   * The inputs this render was enqueued with, stamped at registration and
   * written onto the version when the asset lands (PRD § 7.7.4). Absent when
   * the caller had no board context to record — that version is never stale.
   */
  renderInputs?: RenderInputs;
}

/**
 * What a render record is taken from at enqueue time: the shot as it reads
 * now, and the board settings it would render with.
 *
 * The store is handed both rather than reading them back from
 * {@link useStoryboardStore}, so the record is a snapshot of the moment the
 * job was sent and cannot drift with a later edit.
 */
export interface ShotRenderContext {
  shot: Shot;
  board: BoardRenderContext;
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

/**
 * A request that was in flight when the surface last wrote state.
 *
 * Persisted per board so a board closed mid-batch can re-subscribe by request
 * id on open and land the assets that arrive afterwards (PRD § 7.4, R4). Only
 * what re-subscription and settlement need: the row itself is rebuilt from it.
 */
export interface PendingShotJob {
  shotId: string;
  jobId: string;
  kind: ShotJobKind;
  /** Epoch ms the request was sent. Bounds how long the entry is kept. */
  startedAt: number;
  renderInputs?: RenderInputs;
}

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

  /**
   * boardId → the requests that were in flight when state was last written.
   * Persisted; everything above it is rebuilt from this on open.
   */
  pendingJobs: Record<string, PendingShotJob[]>;
  /**
   * `${kind}:${model}` → the durations of that bucket's most recent finished
   * renders, in ms, oldest first. Persisted: an estimate the creator already
   * paid to measure survives a reload (PRD D14).
   */
  durationSamples: Record<string, number[]>;

  /**
   * Rebuild in-memory rows for a board's persisted pending requests and return
   * the ones that still need a subscription. Expired entries, and entries for
   * shots the board no longer has, are dropped.
   */
  restorePendingJobs: (boardId: string) => PendingShotJob[];

  registerJob: (
    shotId: string,
    boardId: string,
    requestId: string,
    kind: ShotJobKind,
    render?: ShotRenderContext
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

// ── Pending-job persistence ──────────────────────────────────────────────────

/**
 * How long a persisted request is worth re-subscribing to.
 *
 * A direct `generate_media` reply arrives on one open socket. A reply that
 * landed while the tab was shut is gone, so its entry can never resolve — the
 * age bound is what stops those accumulating in localStorage forever. Longer
 * than the slowest video render, short enough that a stale entry does not show
 * a card as rendering the next morning.
 */
const PENDING_JOB_TTL_MS = 30 * 60 * 1000;

/** Second bound: one entry per shot, and a board keeps at most this many. */
const MAX_PENDING_JOBS_PER_BOARD = 64;

const prunePending = (
  jobs: readonly PendingShotJob[],
  now: number
): PendingShotJob[] =>
  jobs
    .filter((job) => now - job.startedAt < PENDING_JOB_TTL_MS)
    .slice(-MAX_PENDING_JOBS_PER_BOARD);

/** Replace a board's entry for one shot — a shot has one request at a time. */
const withPendingJob = (
  pendingJobs: Record<string, PendingShotJob[]>,
  boardId: string,
  entry: PendingShotJob
): Record<string, PendingShotJob[]> => {
  const others = (pendingJobs[boardId] ?? []).filter(
    (job) => job.shotId !== entry.shotId
  );
  return {
    ...pendingJobs,
    [boardId]: prunePending([...others, entry], Date.now())
  };
};

/** Drop a shot's entry once its request settled, was cleared or was cancelled. */
const withoutPendingJob = (
  pendingJobs: Record<string, PendingShotJob[]>,
  boardId: string,
  shotId: string
): Record<string, PendingShotJob[]> => {
  const existing = pendingJobs[boardId];
  if (!existing) {
    return pendingJobs;
  }
  const next = existing.filter((job) => job.shotId !== shotId);
  if (next.length === existing.length) {
    return pendingJobs;
  }
  const updated = { ...pendingJobs };
  if (next.length === 0) {
    delete updated[boardId];
  } else {
    updated[boardId] = next;
  }
  return updated;
};

// ── Measured durations (PRD D14) ─────────────────────────────────────────────

/** One bucket per model and kind: a still and a clip are not comparable. */
export const durationBucketKey = (kind: ShotJobKind, model: string): string =>
  `${kind}:${model}`;

/**
 * How many finished renders a bucket keeps.
 *
 * Five is enough for the median to survive one outlier and short enough that a
 * provider that got faster is reflected within a batch.
 */
const DURATION_SAMPLE_CAP = 5;

/**
 * The estimate for a bucket, or null when nothing was measured.
 *
 * Median, not mean: one cold start that took four minutes would drag a mean
 * over every later estimate, while the median of five needs three slow runs to
 * move. One sample is already an estimate — the PRD asks for a measured
 * duration, not a converged one — it is simply that sample.
 */
export const measuredDurationMs = (
  samples: readonly number[] | undefined
): number | null => {
  if (!samples || samples.length === 0) {
    return null;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const withDurationSample = (
  samples: Record<string, number[]>,
  key: string,
  durationMs: number
): Record<string, number[]> => ({
  ...samples,
  [key]: [...(samples[key] ?? []), durationMs].slice(-DURATION_SAMPLE_CAP)
});

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

export const useStoryboardGenerationStore = create<StoryboardGenerationStoreState>()(
  persist(
    (set, get) => ({
      shotJobs: {},
      jobToShot: {},
      generatingShotIds: [],
      failedShotIds: [],
      pendingJobs: {},
      durationSamples: {},

      restorePendingJobs: (boardId) => {
        const now = Date.now();
        const board = useStoryboardStore.getState().getBoard(boardId);
        const shotIds = new Set((board?.shots ?? []).map((shot) => shot.id));
        const kept = prunePending(get().pendingJobs[boardId] ?? [], now).filter(
          (job) => shotIds.has(job.shotId)
        );
        // A shot whose row is already live kept its subscription through the
        // remount; only the ones this session has no row for are restored.
        const restored = kept.filter((job) => !get().shotJobs[job.shotId]);
        set((state) => {
          const nextShotJobs = { ...state.shotJobs };
          const nextJobToShot = { ...state.jobToShot };
          for (const job of restored) {
            const row: ShotJobState = {
              shotId: job.shotId,
              boardId,
              jobId: job.jobId,
              kind: job.kind,
              status: "running",
              startedAt: job.startedAt,
              progress: 0
            };
            if (job.renderInputs) {
              row.renderInputs = job.renderInputs;
            }
            nextShotJobs[job.shotId] = row;
            nextJobToShot[job.jobId] = job.shotId;
          }
          const nextPending = { ...state.pendingJobs };
          if (kept.length === 0) {
            delete nextPending[boardId];
          } else {
            nextPending[boardId] = kept;
          }
          return {
            shotJobs: nextShotJobs,
            jobToShot: nextJobToShot,
            pendingJobs: nextPending,
            ...deriveMembership(nextShotJobs, state)
          };
        });
        const storyboard = useStoryboardStore.getState();
        for (const job of restored) {
          storyboard.setShotStatus(
            boardId,
            job.shotId,
            job.kind === "keyframe" ? "keyframe_generating" : "clip_generating"
          );
        }
        return restored;
      },

      registerJob: (shotId, boardId, jobId, kind, render) => {
        const startedAt = Date.now();
        // A direct request has no server queue: it is in flight the moment it
        // is sent, so it registers as running rather than queued.
        const jobState: ShotJobState = {
          shotId,
          boardId,
          jobId,
          kind,
          status: "running",
          startedAt,
          progress: 0
        };
        // Taken here, not when the asset lands: a render that finishes after a
        // style change has to carry the inputs it was started with, or it would
        // read current against a board it never saw (PRD § 7.7.4).
        if (render) {
          jobState.renderInputs = stampRenderInputs(
            currentRenderInputs(render.shot, render.board, kind)
          );
        }
        const pending: PendingShotJob = {
          shotId,
          jobId,
          kind,
          startedAt
        };
        if (jobState.renderInputs) {
          pending.renderInputs = jobState.renderInputs;
        }
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
            pendingJobs: withPendingJob(state.pendingJobs, boardId, pending),
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

        // The bucket a finished render measures: the model it actually ran
        // with, taken from the record stamped at enqueue. A render started
        // without board context (a clip revision) measures nothing rather
        // than filing its duration under an unknown model.
        const measuredKey =
          status === "completed" && existing.renderInputs && existing.startedAt
            ? durationBucketKey(existing.kind, existing.renderInputs.model)
            : null;
        const elapsedMs = Date.now() - (existing.startedAt ?? 0);

        set((state) => {
          const nextShotJobs = { ...state.shotJobs, [shotId]: updated };
          return {
            shotJobs: nextShotJobs,
            // The request settled either way: it is no longer something a
            // reopened board should re-subscribe to.
            pendingJobs: withoutPendingJob(
              state.pendingJobs,
              existing.boardId,
              shotId
            ),
            durationSamples: measuredKey
              ? withDurationSample(
                  state.durationSamples,
                  measuredKey,
                  elapsedMs
                )
              : state.durationSamples,
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
          kind,
          status: "failed",
          startedAt: Date.now(),
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
            // Nothing was sent, so there is nothing to reattach to on reopen.
            pendingJobs: withoutPendingJob(state.pendingJobs, boardId, shotId),
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
          pendingJobs: withoutPendingJob(
            state.pendingJobs,
            jobState.boardId,
            shotId
          ),
          ...deriveMembership(nextShotJobs, state)
        }));
      }
    }),
    {
      name: "nodetool-storyboard-generation",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only the two facts that must survive a reload: what was in flight, and
      // what past renders took. Live rows are rebuilt from `pendingJobs`.
      partialize: (state) => ({
        pendingJobs: state.pendingJobs,
        durationSamples: state.durationSamples
      })
    }
  )
);

// ── WebSocket request machinery ──────────────────────────────────────────────

const jobSubscriptions = new Map<string, () => void>();
const jobContexts = new Map<string, DirectShotJobContext>();

const isActiveStatus = (status: ShotGenerationStatus): boolean =>
  status === "queued" || status === "running";

/**
 * Settle a shot whose render was cancelled: restore the shot's status from what
 * it already holds (a kept keyframe/clip beats resetting to planned), drop
 * the request from the store, and tear down the WebSocket subscription. Safe to
 * call for a shot with no tracked request.
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

/** Drop a request's subscription and cached context. */
export const unsubscribeShotJob = (requestId: string): void => {
  const unsubscribe = jobSubscriptions.get(requestId);
  if (unsubscribe) {
    unsubscribe();
    jobSubscriptions.delete(requestId);
  }
  jobContexts.delete(requestId);
};

/** Test-only: run the message handler with a pre-seeded context. */
export const __handleShotJobMessageForTests = (
  requestId: string,
  context: DirectShotJobContext,
  message: WebSocketMessage
): void => {
  jobContexts.set(requestId, context);
  handleShotJobMessage(requestId, message);
};

export const __resetStoryboardSubscriptionsForTests = (): void => {
  for (const unsubscribe of jobSubscriptions.values()) {
    unsubscribe();
  }
  jobSubscriptions.clear();
  jobContexts.clear();
};

/** Write a produced asset back onto its shot and settle the status. */
const settleShotAsset = (
  context: DirectShotJobContext,
  ref: ImageRef | VideoRef,
  assetId: string,
  renderInputs?: RenderInputs
): void => {
  const storyboard = useStoryboardStore.getState();
  if (context.kind === "keyframe") {
    const keyframe: KeyframeVersion = { ...(ref as ImageRef) };
    if (renderInputs) {
      keyframe.render_inputs = renderInputs;
    }
    storyboard.setShotKeyframe(context.boardId, context.shotId, keyframe);
    storyboard.setShotStatus(context.boardId, context.shotId, "keyframe_ready");
    return;
  }
  const clip: ClipVersion = { ...(ref as VideoRef) };
  if (renderInputs) {
    clip.render_inputs = renderInputs;
  }
  storyboard.setShotClip(context.boardId, context.shotId, clip);
  storyboard.setShotStatus(context.boardId, context.shotId, "rendered");
  // Round-trip the new clip into an assembled timeline, if one is linked.
  void syncShotClipToTimeline(context.boardId, context.shotId, assetId);
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
    // Keep the row so the card can read the reason; drop only the subscription.
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
  // The record was stamped at enqueue; the job row still holds it here,
  // before `clear` drops the row. Match on the request id so a row that a
  // newer render already replaced does not lend its record to this one.
  const job = generationStore.shotJobs[context.shotId];
  settleShotAsset(
    context,
    ref,
    assetId,
    job?.jobId === requestId ? job.renderInputs : undefined
  );
  generationStore.updateJobStatus(requestId, "completed", { assetId });
  generationStore.clear(context.shotId);
  unsubscribeShotJob(requestId);
};

const handleShotJobMessage = (
  requestId: string,
  message: WebSocketMessage
): void => {
  const context = jobContexts.get(requestId);
  if (!context) {
    return;
  }

  if (
    message.type === "node_progress" &&
    isNumber(message.progress) &&
    isNumber(message.total)
  ) {
    const percent =
      message.total > 0 ? (message.progress / message.total) * 100 : 0;
    useStoryboardGenerationStore.getState().updateJobProgress(requestId, percent);
    return;
  }

  if (message.type === "rpc_response") {
    handleDirectResponse(requestId, context, message as DirectGenRpcResponse);
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
  const unsubscribe = globalWebSocketManager.subscribe(requestId, (message) =>
    handleShotJobMessage(requestId, message)
  );
  jobSubscriptions.set(requestId, unsubscribe);
};

/**
 * Reattach a board's in-flight renders on open (PRD § 7.4, R4).
 *
 * A batch is a set of direct requests, and closing the board tore their
 * subscriptions down. The persisted entries name the request ids, so opening
 * the board rebuilds the rows and re-subscribes; a reply that arrives
 * afterwards lands as a version through the normal path. Entries older than
 * {@link PENDING_JOB_TTL_MS}, and entries for shots the board no longer has,
 * are dropped rather than re-subscribed.
 */
export const reattachBoardJobs = async (boardId: string): Promise<void> => {
  const restored = useStoryboardGenerationStore
    .getState()
    .restorePendingJobs(boardId);
  await Promise.all(
    restored.map((job) =>
      subscribeDirectShotJob(job.jobId, {
        shotId: job.shotId,
        boardId,
        kind: job.kind
      })
    )
  );
};

/**
 * Drop subscriptions for requests that are no longer active while the surface
 * is mounted. A direct request has no server job to replay, so its
 * module-level subscription survives a remount as-is; only a full reload
 * loses it. Keyed by a sorted, comma-joined active-id string so it only
 * re-runs when a request enters or leaves the active set.
 *
 * Pass the open board's id to also reattach its persisted pending requests
 * after a reload, which is what makes a board closed mid-batch show the
 * versions that landed while it was shut.
 */
export const useStoryboardGenerationSubscriptions = (boardId?: string): void => {
  const activeJobIdsKey = useStoryboardGenerationStore((state) =>
    Object.values(state.shotJobs)
      .filter((job) => isActiveStatus(job.status))
      .map((job) => job.jobId)
      .sort()
      .join(",")
  );

  useEffect(() => {
    const activeIds = new Set(activeJobIdsKey.split(",").filter(Boolean));
    for (const [requestId] of jobSubscriptions) {
      if (!activeIds.has(requestId)) {
        unsubscribeShotJob(requestId);
      }
    }
  }, [activeJobIdsKey]);

  // Opening a board is what reconciles its persisted in-flight requests —
  // once its shots are there. Reattachment drops entries for shots the board
  // no longer has, and a board that has not finished loading has none of them.
  const boardLoaded = useStoryboardStore(
    (state) => (state.boards[boardId ?? ""]?.shots.length ?? 0) > 0
  );
  useEffect(() => {
    if (boardId && boardLoaded) {
      void reattachBoardJobs(boardId);
    }
  }, [boardId, boardLoaded]);
};
