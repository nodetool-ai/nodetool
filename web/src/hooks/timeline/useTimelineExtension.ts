import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ExtensionRequest, ExtensionTiming } from "@nodetool-ai/timeline";
import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import {
  applyTimelineExtension,
  attachTimelineExtension,
  prepareTimelineExtension,
  submitTimelineExtension
} from "../../lib/timelineExtension";
import { watchGeneration } from "../../lib/websocket/generationWatch";

interface ExtensionJob {
  request: ExtensionRequest;
  status: "running" | "ready" | "error";
  error?: string;
}

interface ExtensionJobsState {
  jobs: Record<string, ExtensionJob>;
  put: (job: ExtensionJob) => void;
}

export const useExtensionJobsStore = create<ExtensionJobsState>()(
  persist(
    (set) => ({
      jobs: {},
      put: (job) =>
        set((state) => ({
          jobs: { ...state.jobs, [job.request.requestId]: job }
        }))
    }),
    {
      name: "nodetool-timeline-extensions",
      storage: createJSONStorage(() => localStorage)
    }
  )
);

const inFlight = new Set<string>();
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function useTimelineExtension(sequenceId: string | null | undefined): {
  start: (
    input: Parameters<typeof prepareTimelineExtension>[1]
  ) => Promise<void>;
  recover: (request: ExtensionRequest) => void;
  apply: (request: ExtensionRequest, timing: ExtensionTiming) => void;
} {
  const timeline = useTimelineStoreApi();
  const jobs = useExtensionJobsStore((state) => state.jobs);

  const recover = useCallback(
    (request: ExtensionRequest): void => {
      if (inFlight.has(request.requestId)) {
        return;
      }
      inFlight.add(request.requestId);
      useExtensionJobsStore.getState().put({ request, status: "running" });
      watchGeneration(
        request.requestId,
        Date.now() + 30 * 60 * 1000,
        (outcome) => {
          const settle = async (): Promise<void> => {
            try {
              if (outcome?.status !== "completed" || !outcome.assetIds[0]) {
                throw new Error(
                  outcome?.error ??
                    "Extension is still unresolved. Check recovery again later."
                );
              }
              await attachTimelineExtension(
                timeline,
                request,
                outcome.assetIds[0]
              );
              useExtensionJobsStore
                .getState()
                .put({ request, status: "ready" });
            } catch (error) {
              useExtensionJobsStore
                .getState()
                .put({ request, status: "error", error: messageOf(error) });
            } finally {
              inFlight.delete(request.requestId);
            }
          };
          void settle();
        }
      );
    },
    [timeline]
  );

  useEffect(() => {
    for (const job of Object.values(jobs)) {
      if (job.request.sequenceId === sequenceId && job.status === "running") {
        recover(job.request);
      }
    }
  }, [jobs, recover, sequenceId]);

  const start = useCallback(
    async (
      input: Parameters<typeof prepareTimelineExtension>[1]
    ): Promise<void> => {
      const currentSequence = timeline.getState().sequenceId;
      const running = Object.values(useExtensionJobsStore.getState().jobs).some(
        (job) =>
          job.status === "running" &&
          job.request.sequenceId === currentSequence &&
          job.request.source.clipId === input.clipId
      );
      if (running) {
        throw new Error(
          "Wait for this clip's extension to finish before requesting another."
        );
      }
      const request = prepareTimelineExtension(timeline, input);
      inFlight.add(request.requestId);
      useExtensionJobsStore.getState().put({ request, status: "running" });
      try {
        await submitTimelineExtension(timeline, request);
        useExtensionJobsStore.getState().put({ request, status: "ready" });
      } catch (error) {
        useExtensionJobsStore
          .getState()
          .put({ request, status: "error", error: messageOf(error) });
        throw error;
      } finally {
        inFlight.delete(request.requestId);
      }
    },
    [timeline]
  );

  const apply = useCallback(
    (request: ExtensionRequest, timing: ExtensionTiming): void => {
      applyTimelineExtension(timeline, request, timing);
    },
    [timeline]
  );
  return { start, recover, apply };
}
