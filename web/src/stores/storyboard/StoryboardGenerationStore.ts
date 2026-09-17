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
import type {
  CompiledProductionCandidate,
  MediaEditRequest
} from "@nodetool-ai/timeline";
import { mediaEditTakeMetadata, withResolvedMediaEditReferences } from "@nodetool-ai/timeline";
import { currentRenderInputs, stampRenderInputs } from "@nodetool-ai/protocol";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import {
  isSettled,
  lookupGenerations
} from "../../lib/websocket/lookupGenerations";
import { watchGeneration } from "../../lib/websocket/generationWatch";
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
  /** Shared P0 edit snapshot, when this clip job is a Revise take. */
  mediaEdit?: MediaEditRequest;
  /** Status of the accepted shot before a media edit started. */
  acceptedShotStatus?: ShotStatus;
  /** Immutable production candidate captured before provider dispatch. */
  production?: CompiledProductionCandidate;
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
  mediaEdit?: MediaEditRequest;
  acceptedShotStatus?: ShotStatus;
  production?: CompiledProductionCandidate;
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
  /** Epoch ms the request was sent. Used to measure render duration. */
  startedAt: number;
  renderInputs?: RenderInputs;
  mediaEdit?: MediaEditRequest;
  acceptedShotStatus?: ShotStatus;
  production?: CompiledProductionCandidate;
}

/** The wire shape of a `generate_media` reply. */
interface DirectGenRpcResponse extends WebSocketMessage {
  type: "rpc_response";
  request_id: string;
  result?: { asset_ids?: unknown; media_edit_references?: unknown };
  error?: { code?: string; message?: string };
}

interface StoryboardGenerationStoreState {
  /** shotId → active job state */
  shotJobs: Record<string, ShotJobState>;
  /** requestId → production candidate job; ordinary jobs remain shot-keyed. */
  productionJobs: Record<string, ShotJobState>;
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
   * the ones that still need a subscription. Entries for deleted shots are dropped.
   */
  restorePendingJobs: (boardId: string) => PendingShotJob[];

  registerJob: (
    shotId: string,
    boardId: string,
    requestId: string,
    kind: ShotJobKind,
    render?: ShotRenderContext,
    mediaEdit?: MediaEditRequest,
    acceptedShotStatus?: ShotStatus,
    production?: CompiledProductionCandidate
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
    errorMessage: string,
    mediaEdit?: MediaEditRequest,
    acceptedShotStatus?: ShotStatus
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

/** Add a production request, or replace the ordinary request for one shot. */
const withPendingJob = (
  pendingJobs: Record<string, PendingShotJob[]>,
  boardId: string,
  entry: PendingShotJob
): Record<string, PendingShotJob[]> => {
  const others = (pendingJobs[boardId] ?? []).filter((job) =>
    entry.production ? job.jobId !== entry.jobId : job.shotId !== entry.shotId
  );
  return {
    ...pendingJobs,
    [boardId]: [...others, entry]
  };
};

/** Drop a shot's entry once its request settled, was cleared or was cancelled. */
const withoutPendingJob = (
  pendingJobs: Record<string, PendingShotJob[]>,
  boardId: string,
  shotId: string,
  requestId?: string
): Record<string, PendingShotJob[]> => {
  const existing = pendingJobs[boardId];
  if (!existing) {
    return pendingJobs;
  }
  const next = existing.filter((job) =>
    requestId ? job.jobId !== requestId : job.shotId !== shotId
  );
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

export const useStoryboardGenerationStore =
  create<StoryboardGenerationStoreState>()(
    persist(
      (set, get) => ({
        shotJobs: {},
        productionJobs: {},
        jobToShot: {},
        generatingShotIds: [],
        failedShotIds: [],
        pendingJobs: {},
        durationSamples: {},

        restorePendingJobs: (boardId) => {
          const board = useStoryboardStore.getState().getBoard(boardId);
          const shotIds = new Set((board?.shots ?? []).map((shot) => shot.id));
          const kept = (get().pendingJobs[boardId] ?? []).filter((job) =>
            shotIds.has(job.shotId)
          );
          // A shot whose row is already live kept its subscription through the
          // remount; only the ones this session has no row for are restored.
          const restored = kept.filter((job) =>
            job.production
              ? !get().productionJobs[job.jobId]
              : !get().shotJobs[job.shotId]
          );
          set((state) => {
            const nextShotJobs = { ...state.shotJobs };
            const nextProductionJobs = { ...state.productionJobs };
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
              if (job.mediaEdit) {
                row.mediaEdit = job.mediaEdit;
              }
              if (job.acceptedShotStatus) {
                row.acceptedShotStatus = job.acceptedShotStatus;
              }
              if (job.production) {
                row.production = job.production;
                nextProductionJobs[job.jobId] = row;
                if (!nextShotJobs[job.shotId]) {
                  nextShotJobs[job.shotId] = row;
                }
              } else {
                nextShotJobs[job.shotId] = row;
              }
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
              productionJobs: nextProductionJobs,
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
              job.kind === "keyframe"
                ? "keyframe_generating"
                : "clip_generating"
            );
          }
          return restored;
        },

        registerJob: (
          shotId,
          boardId,
          jobId,
          kind,
          render,
          mediaEdit,
          acceptedShotStatus,
          production
        ) => {
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
          if (mediaEdit) {
            jobState.mediaEdit = mediaEdit;
          }
          if (acceptedShotStatus) {
            jobState.acceptedShotStatus = acceptedShotStatus;
          }
          if (production) {
            jobState.production = production;
          }
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
          if (mediaEdit) {
            pending.mediaEdit = mediaEdit;
          }
          if (acceptedShotStatus) {
            pending.acceptedShotStatus = acceptedShotStatus;
          }
          if (production) {
            pending.production = production;
          }
          set((state) => {
            const nextShotJobs = {
              ...state.shotJobs,
              [shotId]: state.shotJobs[shotId]?.production
                ? state.shotJobs[shotId]
                : jobState
            };
            const nextProductionJobs = production
              ? { ...state.productionJobs, [jobId]: jobState }
              : state.productionJobs;
            const nextJobToShot = { ...state.jobToShot, [jobId]: shotId };
            const previous = state.shotJobs[shotId];
            if (previous && previous.jobId !== jobId && !production) {
              delete nextJobToShot[previous.jobId];
            }
            return {
              shotJobs: nextShotJobs,
              productionJobs: nextProductionJobs,
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
          const { jobToShot, shotJobs, productionJobs } = get();
          const shotId = jobToShot[jobId];
          if (!shotId) {
            return;
          }
          const existing = productionJobs[jobId] ?? shotJobs[shotId];
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
            status === "completed" &&
            existing.renderInputs &&
            existing.startedAt
              ? durationBucketKey(existing.kind, existing.renderInputs.model)
              : null;
          const elapsedMs = Date.now() - (existing.startedAt ?? 0);

          set((state) => {
            const nextProductionJobs = existing.production
              ? { ...state.productionJobs, [jobId]: updated }
              : state.productionJobs;
            const activeSibling = Object.values(nextProductionJobs).find(
              (candidate) =>
                candidate.shotId === shotId &&
                candidate.jobId !== jobId &&
                isActiveStatus(candidate.status)
            );
            const nextShotJobs = {
              ...state.shotJobs,
              [shotId]: activeSibling ?? updated
            };
            return {
              shotJobs: nextShotJobs,
              productionJobs: nextProductionJobs,
              // The request settled either way: it is no longer something a
              // reopened board should re-subscribe to.
              pendingJobs: withoutPendingJob(
                state.pendingJobs,
                existing.boardId,
                shotId,
                existing.production ? jobId : undefined
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

          if (status === "failed" && existing.production) {
            const shot = useStoryboardStore
              .getState()
              .getBoard(existing.boardId)
              ?.shots.find((candidate) => candidate.id === shotId);
            if (shot) {
              useStoryboardStore
                .getState()
                .setShotStatus(
                  existing.boardId,
                  shotId,
                  existing.acceptedShotStatus ??
                    (shot.clip
                      ? "rendered"
                      : shot.keyframe
                        ? "keyframe_ready"
                        : "planned")
                );
            }
            notifyShotFailure(updated);
          } else if (status === "failed" && !existing.mediaEdit) {
            useStoryboardStore
              .getState()
              .setShotStatus(existing.boardId, shotId, "failed");
            notifyShotFailure(updated);
          } else if (status === "failed" && existing.mediaEdit) {
            const shot = useStoryboardStore
              .getState()
              .getBoard(existing.boardId)
              ?.shots.find((candidate) => candidate.id === shotId);
            if (shot) {
              useStoryboardStore
                .getState()
                .setShotStatus(
                  existing.boardId,
                  shotId,
                  existing.acceptedShotStatus ??
                    (shot.clip ? "rendered" : "keyframe_ready")
                );
            }
            notifyShotFailure(updated);
          }
        },

        updateJobProgress: (jobId, progress) => {
          const { jobToShot, shotJobs, productionJobs } = get();
          const shotId = jobToShot[jobId];
          if (!shotId) {
            return;
          }
          const existing = productionJobs[jobId] ?? shotJobs[shotId];
          if (!existing) {
            return;
          }
          const safeProgress = Math.max(0, Math.min(100, progress));
          set((state) => {
            const updated = { ...existing, progress: safeProgress };
            if (existing.production) {
              return {
                productionJobs: {
                  ...state.productionJobs,
                  [jobId]: updated
                },
                ...(state.shotJobs[shotId]?.jobId === jobId && {
                  shotJobs: { ...state.shotJobs, [shotId]: updated }
                })
              };
            }
            return {
              shotJobs: { ...state.shotJobs, [shotId]: updated }
            };
          });
        },

        recordStartFailure: (
          shotId,
          boardId,
          kind,
          errorMessage,
          mediaEdit,
          acceptedShotStatus
        ) => {
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
          if (mediaEdit) {
            jobState.mediaEdit = mediaEdit;
          }
          if (acceptedShotStatus) {
            jobState.acceptedShotStatus = acceptedShotStatus;
          }
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
              pendingJobs: withoutPendingJob(
                state.pendingJobs,
                boardId,
                shotId
              ),
              ...deriveMembership(nextShotJobs, state)
            };
          });
          if (mediaEdit) {
            const shot = useStoryboardStore
              .getState()
              .getBoard(boardId)
              ?.shots.find((candidate) => candidate.id === shotId);
            if (shot) {
              useStoryboardStore
                .getState()
                .setShotStatus(
                  boardId,
                  shotId,
                  acceptedShotStatus ??
                    (shot.clip ? "rendered" : "keyframe_ready")
                );
            }
          } else {
            useStoryboardStore
              .getState()
              .setShotStatus(boardId, shotId, "failed");
          }
          notifyShotFailure(jobState);
        },

        clear: (shotId) => {
          const { shotJobs, jobToShot, productionJobs } = get();
          const jobState = shotJobs[shotId];
          const productionForShot = Object.values(productionJobs).filter(
            (job) => job.shotId === shotId
          );
          if (!jobState && productionForShot.length === 0) {
            return;
          }
          const nextJobToShot = { ...jobToShot };
          if (jobState) {
            delete nextJobToShot[jobState.jobId];
          }
          const nextProductionJobs = { ...productionJobs };
          for (const job of productionForShot) {
            delete nextJobToShot[job.jobId];
            delete nextProductionJobs[job.jobId];
          }
          const nextShotJobs = { ...shotJobs };
          delete nextShotJobs[shotId];
          set((state) => ({
            shotJobs: nextShotJobs,
            productionJobs: nextProductionJobs,
            jobToShot: nextJobToShot,
            pendingJobs: withoutPendingJob(
              state.pendingJobs,
              jobState?.boardId ?? productionForShot[0]?.boardId ?? "",
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
  if (job.mediaEdit) {
    // Media edits are candidates. Keep the terminal row and its captured
    // inputs so the card can inspect and retry the cancelled revision, while
    // removing only the active subscription.
    useStoryboardGenerationStore
      .getState()
      .updateJobStatus(job.jobId, "failed", {
        errorMessage: "Revision cancelled."
      });
    unsubscribeShotJob(job.jobId);
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
  renderInputs?: RenderInputs,
  requestId?: string
): void => {
  const storyboard = useStoryboardStore.getState();
  if (context.production) {
    const production = context.production;
    const candidate: ClipVersion & {
      candidateId: string;
      batchId: string;
      requestId: string;
      variationId: string;
      variationIndex: number;
      productionSnapshot: CompiledProductionCandidate["snapshot"];
    } = {
      ...(ref as VideoRef),
      candidateId: production.identity.candidateId,
      batchId: production.identity.batchId,
      requestId: production.identity.requestId,
      variationId: production.identity.variationId,
      variationIndex: production.identity.variationIndex,
      productionSnapshot: production.snapshot
    };
    if (renderInputs) {
      candidate.render_inputs = renderInputs;
    }
    storyboard.appendShotClipVersion(
      context.boardId,
      context.shotId,
      candidate
    );
    const shot = storyboard
      .getBoard(context.boardId)
      ?.shots.find((item) => item.id === context.shotId);
    if (!shot) return;
    const versions = [...(shot.clip_versions ?? [])].sort((left, right) => {
      const leftIndex =
        "variationIndex" in left && typeof left.variationIndex === "number"
          ? left.variationIndex
          : Number.MAX_SAFE_INTEGER;
      const rightIndex =
        "variationIndex" in right && typeof right.variationIndex === "number"
          ? right.variationIndex
          : Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
    storyboard.updateShot(context.boardId, context.shotId, {
      clip_versions: versions,
      status:
        context.acceptedShotStatus ??
        (shot.clip ? "rendered" : shot.keyframe ? "keyframe_ready" : "planned")
    });
    return;
  }
  if (context.mediaEdit) {
    const candidate: ClipVersion = {
      type: "video",
      uri: `asset://${assetId}`,
      asset_id: assetId,
      duration: context.mediaEdit.sourceContext.timelineDurationMs / 1000,
      mediaEdit: mediaEditTakeMetadata(
        context.mediaEdit,
        requestId ?? context.mediaEdit.sourceContext.clipId
      )
    };
    const shot = storyboard
      .getBoard(context.boardId)
      ?.shots.find((item) => item.id === context.shotId);
    if (!shot) {
      return;
    }
    storyboard.appendShotClipVersion(
      context.boardId,
      context.shotId,
      candidate
    );
    // A revision is a candidate. Restore the status that describes the
    // accepted shot and do not sync or replace the assembled timeline clip.
    storyboard.setShotStatus(
      context.boardId,
      context.shotId,
      context.acceptedShotStatus ?? (shot.clip ? "rendered" : "keyframe_ready")
    );
    return;
  }
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

/**
 * Settle a direct-generation request from its outcome.
 *
 * Two roads reach here and must land identically: the `rpc_response` on the
 * open socket, and the generation row read back after a reload that lost that
 * socket. A version recorded one way and not the other is a render the creator
 * paid for and cannot see.
 */
const settleDirectShotJob = (
  requestId: string,
  context: DirectShotJobContext,
  outcome: { assetIds: readonly string[]; errorMessage: string; mediaEditReferences?: unknown }
): void => {
  const generationStore = useStoryboardGenerationStore.getState();
  const trackedJob = context.production
    ? generationStore.productionJobs[requestId]
    : generationStore.shotJobs[context.shotId];
  if (trackedJob?.jobId !== requestId) {
    unsubscribeShotJob(requestId);
    return;
  }
  const assetId = outcome.assetIds[0];
  const errorMessage =
    outcome.errorMessage.trim() ||
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
  const job = trackedJob;
  settleShotAsset(
    context.mediaEdit ? {
      ...context,
      mediaEdit: withResolvedMediaEditReferences(context.mediaEdit, outcome.mediaEditReferences)
    } : context,
    ref,
    assetId,
    job?.jobId === requestId ? job.renderInputs : undefined,
    requestId
  );
  generationStore.updateJobStatus(requestId, "completed", { assetId });
  if (!context.production) {
    generationStore.clear(context.shotId);
  }
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
    useStoryboardGenerationStore
      .getState()
      .updateJobProgress(requestId, percent);
    return;
  }

  if (message.type === "rpc_response") {
    const response = message as DirectGenRpcResponse;
    const assetIds = Array.isArray(response.result?.asset_ids)
      ? (response.result!.asset_ids as unknown[]).filter(
          (v): v is string => typeof v === "string"
        )
      : [];
    settleDirectShotJob(requestId, context, {
      assetIds,
      mediaEditReferences: response.result?.media_edit_references,
      errorMessage: response.error?.message ?? ""
    });
  }
};

/**
 * Subscribe to a direct-generation request (`generate_media` RPC) keyed by
 * its request id. No reconnect handshake — the reply is one rpc_response.
 *
 * Poll the saved generation until it settles. Both live sends and reattachment
 * use this path. Waiting does not expire or discard a pending request.
 * The subscription alone cannot recover a reconnect: `subscribe` is a
 * client-side map with no replay, and the server writes the reply to the
 * socket that asked, so one that landed while that socket was gone reaches
 * nobody — whether the browser reloaded or the connection just dropped and
 * came back. Reading the row is what recovers those; the subscription only
 * gets there faster, when the socket is the same one.
 */
export const subscribeDirectShotJob = async (
  requestId: string,
  context: DirectShotJobContext
): Promise<void> => {
  if (jobSubscriptions.has(requestId)) {
    jobContexts.set(requestId, context);
    return;
  }
  jobContexts.set(requestId, context);
  const unsubscribe = globalWebSocketManager.subscribe(requestId, (message) =>
    handleShotJobMessage(requestId, message)
  );
  const stopWatch = watchGeneration(requestId, null, (outcome) => {
    if (!outcome) {
      return;
    }
    settleDirectShotJob(requestId, jobContexts.get(requestId) ?? context, {
      assetIds: outcome.assetIds,
      mediaEditReferences: outcome.mediaEditReferences,
      errorMessage: outcome.status === "completed" ? "" : (outcome.error ?? "")
    });
  });
  // Torn down together: whichever settles first, the other must stop.
  jobSubscriptions.set(requestId, () => {
    stopWatch();
    unsubscribe();
  });
};

/**
 * Reattach a board's in-flight renders on open (PRD § 7.4, R4).
 *
 * A batch is a set of direct requests, and closing the board tore their
 * subscriptions down. The generation row is authoritative here, not the
 * socket: a reply that landed while the browser was shut was written to a
 * socket that no longer exists, and `subscribe` has no replay. So every entry
 * is looked up against its row, and one that already settled lands from the
 * row. An entry the row still calls `running` is both subscribed and polled —
 * the subscription wins when the socket outlived the board, and the poll is
 * what gets there at all after a reload, or when the reply arrives in the
 * window between the lookup and the subscription.
 *
 * Pending requests survive until settlement or explicit removal. Elapsed
 * browser time is not evidence that a provider failed.
 */
export const reattachBoardJobs = async (boardId: string): Promise<void> => {
  const restored = useStoryboardGenerationStore
    .getState()
    .restorePendingJobs(boardId);
  if (restored.length === 0) {
    return;
  }
  const outcomes = await lookupGenerations(restored.map((job) => job.jobId));

  await Promise.all(
    restored.map((job) => {
      const outcome = outcomes.get(job.jobId);
      const context: DirectShotJobContext = {
        shotId: job.shotId,
        boardId,
        kind: job.kind,
        mediaEdit: job.mediaEdit,
        acceptedShotStatus: job.acceptedShotStatus,
        production: job.production
      };
      if (outcome && isSettled(outcome.status)) {
        // The row settled while this client was away. Land it from the row:
        // the frame that would have carried it went to a socket that is gone.
        settleDirectShotJob(job.jobId, context, {
          assetIds: outcome.assetIds,
          mediaEditReferences: outcome.mediaEditReferences,
          errorMessage:
            outcome.status === "completed" ? "" : (outcome.error ?? "")
        });
        return Promise.resolve();
      }
      // Watched as well as subscribed: after a reload the reply went to a
      // socket that no longer exists, so the row is what settles this.
      return subscribeDirectShotJob(job.jobId, context);
    })
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
export const useStoryboardGenerationSubscriptions = (
  boardId?: string
): void => {
  const activeJobIdsKey = useStoryboardGenerationStore((state) =>
    [...Object.values(state.shotJobs), ...Object.values(state.productionJobs)]
      .filter((job) => isActiveStatus(job.status))
      .map((job) => job.jobId)
      .filter((jobId, index, all) => all.indexOf(jobId) === index)
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
