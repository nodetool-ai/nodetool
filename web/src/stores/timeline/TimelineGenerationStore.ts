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
import { createTimeOrderedUuid } from "@nodetool-ai/timeline";
import type { ClipVersion } from "@nodetool-ai/timeline";
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

// ── Store ──────────────────────────────────────────────────────────────────

export const useTimelineGenerationStore =
  create<TimelineGenerationStoreState>((set, get) => ({
    clipJobs: {},
    jobToClip: {},

    registerJob: (clipId, jobId, workflowId) => {
      const jobState: ClipJobState = {
        clipId,
        jobId,
        workflowId,
        status: "queued"
      };

      set((state) => ({
        clipJobs: { ...state.clipJobs, [clipId]: jobState },
        jobToClip: { ...state.jobToClip, [jobId]: clipId }
      }));

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

      set((state) => ({
        clipJobs: { ...state.clipJobs, [clipId]: updated }
      }));

      // ── Mirror status into TimelineStore ──────────────────────────────

      if (status === "running") {
        useTimelineStore.getState().patchClip(clipId, { status: "generating" });
        return;
      }

      if (status === "failed") {
        useTimelineStore.getState().patchClip(clipId, { status: "failed" });
        return;
      }

      if (status === "completed") {
        const { assetId } = extra ?? {};
        const clip = useTimelineStore
          .getState()
          .clips.find((c) => c.id === clipId);

        if (!clip) {
          return;
        }

        const version: ClipVersion = {
          id: createTimeOrderedUuid(),
          createdAt: new Date().toISOString(),
          jobId,
          assetId: assetId ?? "",
          workflowUpdatedAt: new Date().toISOString(),
          dependencyHash: clip.dependencyHash ?? "",
          paramOverridesSnapshot: clip.paramOverrides ?? {},
          costCredits: undefined,
          durationMs: clip.durationMs,
          status: "success"
        };

        if (!clip.locked && assetId) {
          // Normal completion: advance the clip to "generated" and update its
          // output asset and hash so the badge reflects the fresh state.
          useTimelineStore.getState().patchClip(clipId, {
            currentAssetId: assetId,
            lastGeneratedHash: clip.dependencyHash,
            status: "generated",
            versions: [...(clip.versions ?? []), version]
          });
        } else {
          // Locked clip: record the version but do NOT replace currentAssetId.
          useTimelineStore.getState().patchClip(clipId, {
            versions: [...(clip.versions ?? []), version]
          });
        }
      }
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
  }));

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
  useTimelineGenerationStore((state) =>
    Object.keys(state.clipJobs).filter(
      (id) =>
        state.clipJobs[id].status === "queued" ||
        state.clipJobs[id].status === "running"
    )
  );

/**
 * Returns an array of clip IDs with failed jobs.
 */
export const useFailedClipIds = (): string[] =>
  useTimelineGenerationStore((state) =>
    Object.keys(state.clipJobs).filter(
      (id) => state.clipJobs[id].status === "failed"
    )
  );
