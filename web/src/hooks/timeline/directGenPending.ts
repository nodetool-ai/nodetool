/**
 * Persisted record of the direct-generation requests a sequence has in flight,
 * plus how long finished ones took (PRD § 8.4 criterion 6, D14, R4).
 *
 * A direct `generate_media` reply arrives on one open socket and the
 * subscription dies with the sequence, so a clip generated while the timeline
 * was closed would sit as a placeholder forever. The entries here name the
 * request ids, so opening the sequence recovers them and a render that finished
 * while it was closed still becomes the clip's asset. This mirrors the
 * storyboard's pending-job list rather than inventing a second scheme.
 *
 * A subscription cannot do the recovering. `subscribe` is a client-side map
 * with no replay, and an `rpc_response` carries no `job_id` and no `thread_id`,
 * so the server writes it to the socket that asked and drops it if that socket
 * has gone: a reply that landed while the browser was shut reached nobody, and
 * a handler installed afterwards has nothing to receive. So the ids here are
 * what the generation rows are read by — `lookupGenerations` for the ones
 * already settled, `watchGeneration` to keep asking about the rest. The row
 * outlives the socket; the subscription only gets there faster when the socket
 * is the same one.
 *
 * D14 — remaining time is shown only where it was measured. Finished requests
 * are filed per model and kind and read back as a median; a bucket with no
 * samples answers null and the surface says nothing at all.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { MediaEditRequest, TimelineClip } from "@nodetool-ai/timeline";

/**
 * How long a persisted request is worth recovering.
 *
 * Longer than the slowest video render, short enough that a stale entry does
 * not show a clip as rendering the next morning.
 */
export const PENDING_TTL_MS = 30 * 60 * 1000;

/** One entry per clip, and a sequence keeps at most this many. */
const MAX_PENDING_PER_SEQUENCE = 64;

/**
 * How many finished requests a bucket keeps. Five is enough for the median to
 * survive one cold start and short enough that a provider that got faster
 * shows up within a batch.
 */
const DURATION_SAMPLE_CAP = 5;

export interface PendingClipJob {
  clipId: string;
  /** The `generate_media` request id the reply is correlated on. */
  requestId: string;
  startedAt: number;
  /** `${bindingKind}:${model}` — what the duration is filed under. */
  bucket: string;
  /** Immutable edit request captured before dispatch, when this is an edit. */
  mediaEdit?: MediaEditRequest;
}

export type MediaEditSettlementStatus =
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"
  | "orphaned";

/** Durable terminal state for an edit, including its immutable destination. */
export interface MediaEditSettlement {
  requestId: string;
  sequenceId: string;
  clipId: string;
  status: MediaEditSettlementStatus;
  settledAt: number;
  assetIds: readonly string[];
  mediaEdit: MediaEditRequest;
  /** Set only after an autosave accepted the candidate version. */
  acknowledgedAt?: number;
}

/** One bucket per model and kind: a clip and a voice line are not comparable. */
export const durationBucketKey = (kind: string, model: string): string =>
  `${kind}:${model}`;

const prune = (
  jobs: readonly PendingClipJob[],
  now: number
): PendingClipJob[] =>
  jobs
    .filter((job) => now - job.startedAt < PENDING_TTL_MS)
    .slice(-MAX_PENDING_PER_SEQUENCE);

/**
 * The estimate for a bucket, or null when nothing was measured.
 *
 * Median, not mean: one four-minute cold start would drag a mean over every
 * later estimate, while the median of five needs three slow runs to move.
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

interface DirectGenPendingState {
  /** sequenceId → its in-flight requests. */
  pending: Record<string, PendingClipJob[]>;
  /** bucket → the durations of that bucket's most recent finished requests. */
  durationSamples: Record<string, number[]>;
  /** Terminal edit outcomes kept for inspection and deferred destination landing. */
  editSettlements: Record<string, MediaEditSettlement>;
  remember: (sequenceId: string, job: PendingClipJob) => void;
  /** Drop a clip's entry and, when it finished, file how long it took. */
  settle: (
    sequenceId: string,
    clipId: string,
    finishedAt?: number,
    requestId?: string
  ) => void;
  /** Claim an edit outcome exactly once and retain it after pending removal. */
  settleEdit: (input: {
    sequenceId: string;
    clipId: string;
    requestId: string;
    mediaEdit: MediaEditRequest;
    status: MediaEditSettlementStatus;
    assetIds: readonly string[];
    finishedAt?: number;
  }) => boolean;
  /** Retain a completed edit without ever recreating a deleted destination. */
  markEditOrphaned: (requestId: string) => void;
  /** Mark a completed edit as durably present without removing its tombstone. */
  acknowledgeEdit: (requestId: string, acknowledgedAt?: number) => boolean;
  /** The entries still worth recovering, with the stale ones dropped. */
  restore: (sequenceId: string) => PendingClipJob[];
}

export const useDirectGenPendingStore = create<DirectGenPendingState>()(
  persist(
    (set, get) => ({
      pending: {},
      durationSamples: {},
      editSettlements: {},

      remember: (sequenceId, job) =>
        set((state) => ({
          pending: {
            ...state.pending,
            [sequenceId]: prune(
              [
                ...(state.pending[sequenceId] ?? []).filter(
                  (entry) => entry.clipId !== job.clipId
                ),
                job
              ],
              Date.now()
            )
          }
        })),

      settle: (sequenceId, clipId, finishedAt, requestId) =>
        set((state) => {
          const existing = state.pending[sequenceId] ?? [];
          const job = existing.find(
            (entry) =>
              entry.clipId === clipId &&
              (requestId === undefined || entry.requestId === requestId)
          );
          if (!job) {
            return { pending: state.pending };
          }
          const rest = existing.filter((entry) => entry !== job);
          const pending = { ...state.pending };
          if (rest.length === 0) {
            delete pending[sequenceId];
          } else {
            pending[sequenceId] = rest;
          }
          if (!job || finishedAt === undefined) {
            return { pending };
          }
          const took = finishedAt - job.startedAt;
          if (took <= 0) {
            return { pending };
          }
          return {
            pending,
            durationSamples: {
              ...state.durationSamples,
              [job.bucket]: [
                ...(state.durationSamples[job.bucket] ?? []),
                took
              ].slice(-DURATION_SAMPLE_CAP)
            }
          };
        }),

      settleEdit: ({
        sequenceId,
        clipId,
        requestId,
        mediaEdit,
        status,
        assetIds,
        finishedAt
      }) => {
        let claimed = false;
        set((state) => {
          if (state.editSettlements[requestId]) {
            return state;
          }
          claimed = true;
          const existing = state.pending[sequenceId] ?? [];
          const job = existing.find(
            (entry) =>
              entry.clipId === clipId && entry.requestId === requestId
          );
          const pending = { ...state.pending };
          const rest = existing.filter((entry) => entry !== job);
          if (rest.length === 0) {
            delete pending[sequenceId];
          } else {
            pending[sequenceId] = rest;
          }
          const settledAt = finishedAt ?? Date.now();
          const editSettlements = {
            ...state.editSettlements,
            [requestId]: {
              requestId,
              sequenceId,
              clipId,
              status,
              settledAt,
              assetIds: [...assetIds],
              mediaEdit
            }
          };
          const took = settledAt - (job?.startedAt ?? settledAt);
          const shouldMeasure =
            status === "completed" && assetIds.length > 0 && took > 0;
          return shouldMeasure
            ? {
                pending,
                editSettlements,
                durationSamples: {
                  ...state.durationSamples,
                  [job?.bucket ?? durationBucketKey("video_edit", mediaEdit.model)]: [
                    ...(state.durationSamples[
                      job?.bucket ?? durationBucketKey("video_edit", mediaEdit.model)
                    ] ?? []),
                    took
                  ].slice(-DURATION_SAMPLE_CAP)
                }
              }
            : { pending, editSettlements };
        });
        return claimed;
      },

      markEditOrphaned: (requestId) =>
        set((state) => {
          const settlement = state.editSettlements[requestId];
          if (!settlement || settlement.status === "orphaned") {
            return state;
          }
          return {
            editSettlements: {
              ...state.editSettlements,
              [requestId]: { ...settlement, status: "orphaned" }
            }
          };
        }),

      acknowledgeEdit: (requestId, acknowledgedAt = Date.now()) => {
        let acknowledged = false;
        set((state) => {
          const settlement = state.editSettlements[requestId];
          if (
            !settlement ||
            settlement.status !== "completed" ||
            settlement.acknowledgedAt !== undefined
          ) {
            return state;
          }
          acknowledged = true;
          return {
            editSettlements: {
              ...state.editSettlements,
              [requestId]: { ...settlement, acknowledgedAt }
            }
          };
        });
        return acknowledged;
      },

      restore: (sequenceId) => {
        const kept = prune(get().pending[sequenceId] ?? [], Date.now());
        set((state) => {
          const pending = { ...state.pending };
          if (kept.length === 0) {
            delete pending[sequenceId];
          } else {
            pending[sequenceId] = kept;
          }
          return { pending };
        });
        return kept;
      }
    }),
    {
      name: "nodetool-timeline-directgen-pending",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        pending: state.pending,
        durationSamples: state.durationSamples,
        editSettlements: state.editSettlements
      })
    }
  )
);

/**
 * A completed candidate is replayable until the exact document containing it
 * has been accepted by the timeline endpoint. The settlement remains in the
 * persisted store as a tombstone after acknowledgement, so a later deletion
 * cannot make reconnect recovery recreate the candidate.
 */
export function acknowledgePersistedMediaEdits(
  sequenceId: string,
  clips: readonly TimelineClip[],
  acknowledgedAt = Date.now()
): void {
  const settlements = Object.values(
    useDirectGenPendingStore.getState().editSettlements
  );
  for (const settlement of settlements) {
    if (
      settlement.sequenceId !== sequenceId ||
      settlement.status !== "completed" ||
      settlement.acknowledgedAt !== undefined
    ) {
      continue;
    }
    const assetId = settlement.assetIds[0];
    const clip = clips.find((candidate) => candidate.id === settlement.clipId);
    const candidatePersisted = clip?.versions?.some(
      (version) =>
        version.jobId === settlement.requestId &&
        version.assetId === assetId
    );
    if (candidatePersisted) {
      useDirectGenPendingStore
        .getState()
        .acknowledgeEdit(settlement.requestId, acknowledgedAt);
    }
  }
}
