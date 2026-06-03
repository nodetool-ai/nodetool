/**
 * SketchGenerationStore
 *
 * Tracks per-layer generation jobs for the AI Image Editor and exposes the
 * job state consumed by layer rows and the inspector. Mirrors
 * TimelineGenerationStore.
 *
 * Responsibilities:
 *  - Map layerId → active job state (queued / running / failed / completed).
 *  - Resolve completed-job output asset ids from ResultsStore.
 *
 * Restored layer-row / inspector state that cares about persistence
 * (version history, lastGeneratedHash, raster data) is updated by the
 * consumer after `updateJobStatus("completed", { assetId })` resolves.
 */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import useResultsStore from "../ResultsStore";
import { extractAssetId } from "../outputAssetId";

export type LayerGenerationStatus =
  | "queued"
  | "running"
  | "failed"
  | "completed";

export interface LayerJobState {
  layerId: string;
  jobId: string;
  /** workflowId associated with the layer at job submission time. */
  workflowId: string;
  status: LayerGenerationStatus;
  /** Best-effort 0..100 progress for the dominant generating node. */
  progress?: number;
  /** Asset id resolved from job output on completion. */
  assetId?: string;
  /** Human-readable error message on failure. */
  errorMessage?: string;
}

interface SketchGenerationStoreState {
  layerJobs: Record<string, LayerJobState>;
  jobToLayer: Record<string, string>;

  registerJob: (layerId: string, jobId: string, workflowId: string) => void;
  updateJobStatus: (
    jobId: string,
    status: LayerGenerationStatus,
    extra?: { assetId?: string; errorMessage?: string }
  ) => void;
  updateJobProgress: (jobId: string, progress: number) => void;
  clearJob: (layerId: string) => void;
  getLayerJobState: (layerId: string) => LayerJobState | undefined;
  resolveOutputAssetId: (
    workflowId: string,
    selectedOutputNodeId: string
  ) => string | undefined;
}

const STORAGE_KEY = "sketch-generation-jobs:v1";

const canUseSessionStorage = (): boolean =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

function isLayerJobEntry(value: unknown): value is LayerJobState {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "layerId" in value &&
    "jobId" in value
  );
}

const loadPersistedLayerJobs = (): Record<string, LayerJobState> => {
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
    const result: Record<string, LayerJobState> = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (
        isLayerJobEntry(value) &&
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

const persistLayerJobs = (layerJobs: Record<string, LayerJobState>): void => {
  if (!canUseSessionStorage()) {
    return;
  }
  try {
    const active = Object.fromEntries(
      Object.entries(layerJobs).filter(
        ([, value]) => value.status === "queued" || value.status === "running"
      )
    );
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(active));
  } catch {
    // Ignore quota/private-mode errors.
  }
};

export const useSketchGenerationStore = create<SketchGenerationStoreState>(
  (set, get) => {
    const persistedLayerJobs = loadPersistedLayerJobs();
    const persistedJobToLayer = Object.fromEntries(
      Object.values(persistedLayerJobs).map((job) => [job.jobId, job.layerId])
    );

    return {
      layerJobs: persistedLayerJobs,
      jobToLayer: persistedJobToLayer,

      registerJob: (layerId, jobId, workflowId) => {
        const jobState: LayerJobState = {
          layerId,
          jobId,
          workflowId,
          status: "queued",
          progress: 0
        };

        set((state) => {
          const nextLayerJobs = { ...state.layerJobs, [layerId]: jobState };
          persistLayerJobs(nextLayerJobs);
          return {
            layerJobs: nextLayerJobs,
            jobToLayer: { ...state.jobToLayer, [jobId]: layerId }
          };
        });
      },

      updateJobStatus: (jobId, status, extra) => {
        const { jobToLayer, layerJobs } = get();
        const layerId = jobToLayer[jobId];
        if (!layerId) {
          return;
        }

        const existing = layerJobs[layerId];
        if (!existing) {
          return;
        }

        const updated: LayerJobState = { ...existing, status, ...extra };

        set((state) => {
          const nextLayerJobs = { ...state.layerJobs, [layerId]: updated };
          persistLayerJobs(nextLayerJobs);
          return { layerJobs: nextLayerJobs };
        });
      },

      updateJobProgress: (jobId, progress) => {
        const { jobToLayer, layerJobs } = get();
        const layerId = jobToLayer[jobId];
        if (!layerId) {
          return;
        }

        const existing = layerJobs[layerId];
        if (!existing) {
          return;
        }

        const safeProgress = Math.max(0, Math.min(100, progress));
        set((state) => ({
          layerJobs: {
            ...state.layerJobs,
            [layerId]: { ...existing, progress: safeProgress }
          }
        }));
      },

      clearJob: (layerId) => {
        const { layerJobs, jobToLayer } = get();
        const jobState = layerJobs[layerId];
        if (!jobState) {
          return;
        }

        const newJobToLayer = { ...jobToLayer };
        delete newJobToLayer[jobState.jobId];

        const newLayerJobs = { ...layerJobs };
        delete newLayerJobs[layerId];

        persistLayerJobs(newLayerJobs);
        set({ layerJobs: newLayerJobs, jobToLayer: newJobToLayer });
      },

      getLayerJobState: (layerId) => get().layerJobs[layerId],

      resolveOutputAssetId: (workflowId, selectedOutputNodeId) =>
        extractAssetId(
          useResultsStore
            .getState()
            .getOutputResult(workflowId, selectedOutputNodeId)
        )
    };
  }
);

/** Count of layers currently queued or running. */
export const useGeneratingLayerCount = (): number =>
  useSketchGenerationStore((state) => {
    let count = 0;
    for (const job of Object.values(state.layerJobs)) {
      if (job.status === "queued" || job.status === "running") {
        count++;
      }
    }
    return count;
  });

/** Count of layers in failed state. */
export const useFailedLayerCount = (): number =>
  useSketchGenerationStore((state) => {
    let count = 0;
    for (const job of Object.values(state.layerJobs)) {
      if (job.status === "failed") {
        count++;
      }
    }
    return count;
  });

/** IDs of layers with active (queued/running) jobs. */
export const useGeneratingLayerIds = (): string[] =>
  useSketchGenerationStore(
    useShallow((state) =>
      Object.keys(state.layerJobs).filter(
        (id) =>
          state.layerJobs[id].status === "queued" ||
          state.layerJobs[id].status === "running"
      )
    )
  );

/** IDs of layers whose latest job failed. */
export const useFailedLayerIds = (): string[] =>
  useSketchGenerationStore(
    useShallow((state) =>
      Object.keys(state.layerJobs).filter(
        (id) => state.layerJobs[id].status === "failed"
      )
    )
  );
