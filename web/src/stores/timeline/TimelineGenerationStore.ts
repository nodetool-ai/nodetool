/**
 * TimelineGenerationStore
 *
 * Tracks per-clip generation jobs and their lifecycle, providing the
 * `generationState` consumed by `clipStatusReducer`.
 *
 * Responsibilities:
 *  - Map clipId → active job state (queued / running / failed / completed).
 *  - Mirror status transitions into TimelineStore so `clip.status` stays
 *    consistent for persistence and version history.
 *  - On successful completion: append a ClipVersion, set currentAssetId and
 *    lastGeneratedHash (unless the clip is locked).
 *
 * Usage:
 *   const genState = useTimelineGenerationStore(
 *     (s) => s.clipJobs[clipId] ?? null
 *   );
 */

import { create } from "zustand";
import { makeClipVersion } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { useTimelineStore } from "./TimelineStore";
import useResultsStore from "../ResultsStore";
import { extractAssetId } from "../outputAssetId";

// ── Types ──────────────────────────────────────────────────────────────────

export type ClipGenerationStatus = "queued" | "running" | "failed" | "completed";

export interface ClipJobState {
  clipId: string;
  jobId: string;
  /** The workflowId associated with the clip at job submission time. */
  workflowId: string;
  status: ClipGenerationStatus;
  /** Best-effort clip-level progress percentage (0..100). */
  progress?: number;
  /** Asset ID resolved from job output on completion (undefined until complete). */
  assetId?: string;
  /** Human-readable error message on failure. */
  errorMessage?: string;
}

interface TimelineGenerationStoreState {
  /** clipId → active job state */
  clipJobs: Record<string, ClipJobState>;
  /** jobId → clipId (reverse lookup for incoming job-update events) */
  jobToClip: Record<string, string>;

  /**
   * Derived membership lists, maintained in state so they keep a STABLE
   * reference across progress-only ticks. They are recomputed only by actions
   * that can change a job's *status* (register / status-update / clear), never
   * by {@link updateJobProgress}, so frequent progress updates don't churn the
   * identity of these arrays (and the selectors that read them). When a
   * recompute yields the same membership, the previous array reference is kept.
   */
  /** clipIds of jobs that are queued or running, in insertion order. */
  generatingClipIds: string[];
  /** clipIds of jobs that have failed, in insertion order. */
  failedClipIds: string[];

  /**
   * Register a new generation job for a clip.
   * Immediately transitions the clip to "queued" in TimelineStore.
   */
  registerJob: (clipId: string, jobId: string, workflowId: string) => void;

  /**
   * Update the status of a running job (called by WebSocket event handlers).
   *
   * When `status` is "completed", pass `assetId` to trigger the
   * TimelineStore update (currentAssetId, version, etc.).
   * When `status` is "failed", pass `errorMessage` for inspector display.
   */
  updateJobStatus: (
    jobId: string,
    status: ClipGenerationStatus,
    extra?: { assetId?: string; errorMessage?: string }
  ) => void;
  updateJobProgress: (jobId: string, progress: number) => void;

  /** Remove the job entry for a clip (e.g. after user dismisses a failed job). */
  clearJob: (clipId: string) => void;

  /** Look up the current job state for a clip, or undefined if none. */
  getClipJobState: (clipId: string) => ClipJobState | undefined;

  /**
   * Resolve the output asset ID for a completed job.
   *
   * Reads from ResultsStore keyed by (workflowId, selectedOutputNodeId).
   * Returns the assetId string or undefined when unavailable.
   */
  resolveOutputAssetId: (
    workflowId: string,
    jobId: string,
    selectedOutputNodeId: string
  ) => string | undefined;
}

const STORAGE_KEY = "timeline-generation-jobs:v1";

const canUseSessionStorage = (): boolean =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

function isClipJobEntry(value: unknown): value is ClipJobState {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "clipId" in value &&
    "jobId" in value
  );
}

const loadPersistedClipJobs = (): Record<string, ClipJobState> => {
  if (!canUseSessionStorage()) {
    return {};
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const result: Record<string, ClipJobState> = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (
        isClipJobEntry(value) &&
        (value.status === "queued" || value.status === "running")
      ) {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
};

const persistClipJobs = (clipJobs: Record<string, ClipJobState>): void => {
  if (!canUseSessionStorage()) {
    return;
  }
  try {
    const activeClipJobs = Object.fromEntries(
      Object.entries(clipJobs).filter(([, value]) =>
        value.status === "queued" || value.status === "running"
      )
    );
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(activeClipJobs));
  } catch {
    // Ignore sessionStorage errors (quota/private mode).
  }
};

// ── Derived membership (status-only) ─────────────────────────────────────────

const isGenerating = (job: ClipJobState): boolean =>
  job.status === "queued" || job.status === "running";

const isFailed = (job: ClipJobState): boolean => job.status === "failed";

/** clipIds matching `predicate`, in the map's iteration order. */
function deriveIds(
  clipJobs: Record<string, ClipJobState>,
  predicate: (job: ClipJobState) => boolean
): string[] {
  const ids: string[] = [];
  for (const id of Object.keys(clipJobs)) {
    if (predicate(clipJobs[id])) {
      ids.push(id);
    }
  }
  return ids;
}

/** Same-membership check (order-insensitive) so a stable reference is reused. */
function sameMembership(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * Recompute `generatingClipIds` / `failedClipIds` from `clipJobs`, but reuse the
 * previous array reference when the membership set is unchanged. This is what
 * keeps the selectors stable across progress-only updates (which never call
 * this) and across status updates that don't move a clip in/out of a list.
 */
function deriveMembership(
  clipJobs: Record<string, ClipJobState>,
  prev: Pick<
    TimelineGenerationStoreState,
    "generatingClipIds" | "failedClipIds"
  >
): { generatingClipIds: string[]; failedClipIds: string[] } {
  const nextGenerating = deriveIds(clipJobs, isGenerating);
  const nextFailed = deriveIds(clipJobs, isFailed);
  return {
    generatingClipIds: sameMembership(prev.generatingClipIds, nextGenerating)
      ? prev.generatingClipIds
      : nextGenerating,
    failedClipIds: sameMembership(prev.failedClipIds, nextFailed)
      ? prev.failedClipIds
      : nextFailed
  };
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useTimelineGenerationStore =
  create<TimelineGenerationStoreState>((set, get) => {
    const persistedClipJobs = loadPersistedClipJobs();
    const persistedJobToClip = Object.fromEntries(
      Object.values(persistedClipJobs).map((job) => [job.jobId, job.clipId])
    );

    return {
      clipJobs: persistedClipJobs,
      jobToClip: persistedJobToClip,
      generatingClipIds: deriveIds(persistedClipJobs, isGenerating),
      failedClipIds: deriveIds(persistedClipJobs, isFailed),

      registerJob: (clipId, jobId, workflowId) => {
        const jobState: ClipJobState = {
          clipId,
          jobId,
          workflowId,
          status: "queued",
          progress: 0
        };

        set((state) => {
          const nextClipJobs = { ...state.clipJobs, [clipId]: jobState };
          persistClipJobs(nextClipJobs);
          const nextJobToClip = { ...state.jobToClip, [jobId]: clipId };
          // Drop the previous job's reverse mapping: a replayed event for the
          // superseded job must not mutate the new job's state.
          const previous = state.clipJobs[clipId];
          if (previous && previous.jobId !== jobId) {
            delete nextJobToClip[previous.jobId];
          }
          return {
            clipJobs: nextClipJobs,
            jobToClip: nextJobToClip,
            ...deriveMembership(nextClipJobs, state)
          };
        });

        // Mirror into TimelineStore so clip.status reflects the queue.
        useTimelineStore.getState().patchClip(clipId, { status: "queued" });
      },

      updateJobStatus: (jobId, status, extra) => {
        const { jobToClip, clipJobs } = get();
        const clipId = jobToClip[jobId];
        if (!clipId) {
          return;
        }

        const existing = clipJobs[clipId];
        if (!existing) {
          return;
        }

        // The documented "completed" contract requires an output asset;
        // a job that completes without one is surfaced as a failure
        // (mirrors the sketch editor's useGenerateLayer).
        const completedWithoutAsset = status === "completed" && !extra?.assetId;
        const effectiveStatus: ClipGenerationStatus = completedWithoutAsset
          ? "failed"
          : status;
        const updated: ClipJobState = {
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
          const nextClipJobs = { ...state.clipJobs, [clipId]: updated };
          persistClipJobs(nextClipJobs);
          return {
            clipJobs: nextClipJobs,
            ...deriveMembership(nextClipJobs, state)
          };
        });

        // ── Mirror status into TimelineStore ──────────────────────────────

        if (effectiveStatus === "running") {
          useTimelineStore.getState().patchClip(clipId, { status: "generating" });
          return;
        }

        if (effectiveStatus === "failed") {
          useTimelineStore.getState().patchClip(clipId, { status: "failed" });
          return;
        }

        if (effectiveStatus === "completed" && extra?.assetId) {
          const assetId = extra.assetId;
          const timeline = useTimelineStore.getState();
          const clip = timeline.clips.find(
            (candidate) => candidate.id === clipId
          );
          if (!clip) {
            return;
          }
          // Apply the completed contract: append a ClipVersion, set
          // currentAssetId and lastGeneratedHash (unless the clip is locked),
          // and settle the clip's status.
          const patch: Partial<TimelineClip> = {
            status: "generated",
            versions: [
              ...(clip.versions ?? []),
              makeClipVersion({
                jobId,
                assetId,
                workflowUpdatedAt: new Date().toISOString(),
                dependencyHash: clip.dependencyHash ?? "",
                paramOverridesSnapshot: clip.paramOverrides ?? {}
              })
            ]
          };
          if (!clip.locked) {
            patch.currentAssetId = assetId;
            patch.lastGeneratedHash = clip.dependencyHash;
          }
          timeline.patchClip(clipId, patch);
        }
      },

      updateJobProgress: (jobId, progress) => {
        const { jobToClip, clipJobs } = get();
        const clipId = jobToClip[jobId];
        if (!clipId) {
          return;
        }

        const existing = clipJobs[clipId];
        if (!existing) {
          return;
        }

        const safeProgress = Math.max(0, Math.min(100, progress));
        const updated: ClipJobState = { ...existing, progress: safeProgress };

        set((state) => ({
          clipJobs: { ...state.clipJobs, [clipId]: updated }
        }));
      },

      clearJob: (clipId) => {
        const { clipJobs, jobToClip } = get();
        const jobState = clipJobs[clipId];
        if (!jobState) {
          return;
        }

        const newJobToClip = { ...jobToClip };
        delete newJobToClip[jobState.jobId];

        const newClipJobs = { ...clipJobs };
        delete newClipJobs[clipId];

        persistClipJobs(newClipJobs);
        set((state) => ({
          clipJobs: newClipJobs,
          jobToClip: newJobToClip,
          ...deriveMembership(newClipJobs, state)
        }));
      },

      getClipJobState: (clipId) => get().clipJobs[clipId],

      resolveOutputAssetId: (workflowId, jobId, selectedOutputNodeId) =>
        extractAssetId(
          useResultsStore
            .getState()
            .getOutputResult(workflowId, jobId, selectedOutputNodeId)
        )
    };
  });

// ── Convenience selectors ──────────────────────────────────────────────────

/**
 * Returns a stable count of clips currently generating or queued.
 * Subscribes only to the clipJobs map so re-renders are minimal.
 */
export const useGeneratingCount = (): number =>
  useTimelineGenerationStore((state) => {
    let count = 0;
    for (const job of Object.values(state.clipJobs)) {
      if (job.status === "queued" || job.status === "running") {
        count++;
      }
    }
    return count;
  });

/**
 * Returns a stable count of clips that have failed generation.
 */
export const useFailedCount = (): number =>
  useTimelineGenerationStore((state) => {
    let count = 0;
    for (const job of Object.values(state.clipJobs)) {
      if (job.status === "failed") {
        count++;
      }
    }
    return count;
  });

/**
 * Returns an array of clip IDs with active (queued/running) jobs.
 *
 * Reads the membership list maintained in state, which only changes identity
 * when a job's *status* moves in/out of "queued"/"running" — progress ticks
 * keep the same reference, so consumers (e.g. ActivityIndicator) don't
 * re-render on every progress update.
 */
export const useGeneratingClipIds = (): string[] =>
  useTimelineGenerationStore((state) => state.generatingClipIds);

/**
 * Returns an array of clip IDs with failed jobs. Stable across progress ticks
 * (see {@link useGeneratingClipIds}).
 */
export const useFailedClipIds = (): string[] =>
  useTimelineGenerationStore((state) => state.failedClipIds);
