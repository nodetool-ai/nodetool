/**
 * Persisted record of the direct-generation requests a sequence has in flight,
 * plus how long finished ones took (PRD § 8.4 criterion 6, D14, R4).
 *
 * A direct `generate_media` reply arrives on one open socket and the
 * subscription dies with the sequence, so a clip generated while the timeline
 * was closed would sit as a placeholder forever. The entries here name the
 * request ids, so opening the sequence re-subscribes and a reply that lands
 * afterwards still becomes the clip's asset. This mirrors the storyboard's
 * pending-job list rather than inventing a second scheme.
 *
 * The boundary is the socket, not the tab. An `rpc_response` carries no
 * `job_id` and no `thread_id`, so the server writes it to the socket that
 * asked and drops it if that socket has gone — a reply that landed while the
 * browser was shut is lost, and re-subscribing to its id cannot bring it back.
 * Recovering those needs `generate_media` to become a resumable server job,
 * which is also what the storyboard's list would need; until then a reattached
 * entry that outlives its window fails its clip rather than spinning.
 *
 * D14 — remaining time is shown only where it was measured. Finished requests
 * are filed per model and kind and read back as a median; a bucket with no
 * samples answers null and the surface says nothing at all.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * How long a persisted request is worth re-subscribing to.
 *
 * Also the deadline a reattached subscription waits out before failing its
 * clip: a reply whose socket is gone can never arrive, so an entry that has
 * not answered by the end of its own window never will.
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
}

/** One bucket per model and kind: a clip and a voice line are not comparable. */
export const durationBucketKey = (kind: string, model: string): string =>
  `${kind}:${model}`;

const prune = (jobs: readonly PendingClipJob[], now: number): PendingClipJob[] =>
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
  remember: (sequenceId: string, job: PendingClipJob) => void;
  /** Drop a clip's entry and, when it finished, file how long it took. */
  settle: (sequenceId: string, clipId: string, finishedAt?: number) => void;
  /** The entries still worth re-subscribing to, with the stale ones dropped. */
  restore: (sequenceId: string) => PendingClipJob[];
}

export const useDirectGenPendingStore = create<DirectGenPendingState>()(
  persist(
    (set, get) => ({
      pending: {},
      durationSamples: {},

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

      settle: (sequenceId, clipId, finishedAt) =>
        set((state) => {
          const existing = state.pending[sequenceId] ?? [];
          const job = existing.find((entry) => entry.clipId === clipId);
          const rest = existing.filter((entry) => entry.clipId !== clipId);
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
        durationSamples: state.durationSamples
      })
    }
  )
);
