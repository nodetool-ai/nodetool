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
import { useShallow } from "zustand/react/shallow";
import { useTimelineStore } from "./TimelineStore";
import useResultsStore from "../ResultsStore";

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
          return {
            clipJobs: nextClipJobs,
            jobToClip: { ...state.jobToClip, [jobId]: clipId }
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

        const updated: ClipJobState = { ...existing, status, ...extra };

        set((state) => {
          const nextClipJobs = { ...state.clipJobs, [clipId]: updated };
          persistClipJobs(nextClipJobs);
          return {
            clipJobs: nextClipJobs
          };
        });

        // ── Mirror status into TimelineStore ──────────────────────────────

        if (status === "running") {
          useTimelineStore.getState().patchClip(clipId, { status: "generating" });
          return;
        }

        if (status === "failed") {
          useTimelineStore.getState().patchClip(clipId, { status: "failed" });
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
        set({ clipJobs: newClipJobs, jobToClip: newJobToClip });
      },

      getClipJobState: (clipId) => get().clipJobs[clipId],

      resolveOutputAssetId: (workflowId, selectedOutputNodeId) => {
        const result = useResultsStore
          .getState()
          .getOutputResult(workflowId, selectedOutputNodeId);

        // The result may be an AssetRef ({ uri, asset_id }) or a plain string ID.
        if (!result) {
          return undefined;
        }
        if (typeof result === "string") {
          return result;
        }
        if (typeof result === "object" && result !== null) {
          const r = result as Record<string, unknown>;
          if (typeof r.asset_id === "string") {
            return r.asset_id;
          }
          // Some result types carry the ID under different keys.
          if (typeof r.id === "string") {
            return r.id;
          }
        }
        return undefined;
      }
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
 */
export const useGeneratingClipIds = (): string[] =>
  useTimelineGenerationStore(
    useShallow((state) =>
      Object.keys(state.clipJobs).filter(
        (id) =>
          state.clipJobs[id].status === "queued" ||
          state.clipJobs[id].status === "running"
      )
    )
  );

/**
 * Returns an array of clip IDs with failed jobs.
 */
export const useFailedClipIds = (): string[] =>
  useTimelineGenerationStore(
    useShallow((state) =>
      Object.keys(state.clipJobs).filter(
        (id) => state.clipJobs[id].status === "failed"
      )
    )
  );
