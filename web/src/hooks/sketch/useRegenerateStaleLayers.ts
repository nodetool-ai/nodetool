/** Re-generate Stale Layers preflight + sequential drainer. */

import { useCallback, useEffect, useRef, useState } from "react";

import { useSketchInstance } from "../../stores/sketch/SketchInstance";
import {
  startLayerGeneration,
  type LayerGenerationOutcome
} from "./useGenerateLayer";

interface RegenerateStalePreflight {
  staleLayerIds: string[];
  lockedLayerIds: string[];
}

interface UseRegenerateStaleLayersResult {
  preflight: () => RegenerateStalePreflight;
  regenerateStaleLayers: () => Promise<{
    started: number;
    skipped: number;
    failed: number;
  }>;
  isBusy: boolean;
}

type Settled = LayerGenerationOutcome | { status: "aborted" };

export function useRegenerateStaleLayers(): UseRegenerateStaleLayersResult {
  // The drain outlives a tab switch, so it reads and writes this editor's
  // stores rather than whichever one is focused when a job settles.
  const instance = useSketchInstance();
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);
  // Aborted on unmount so the drainer stops waiting on the job in flight.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const preflight = useCallback((): RegenerateStalePreflight => {
    const bindings = Object.values(instance.session.getState().bindings);
    const staleLayerIds: string[] = [];
    const lockedLayerIds: string[] = [];
    for (const b of bindings) {
      if (b.status === "stale") {
        staleLayerIds.push(b.layerId);
      } else if (b.status === "locked") {
        lockedLayerIds.push(b.layerId);
      }
    }
    return { staleLayerIds, lockedLayerIds };
  }, [instance]);

  const regenerateStaleLayers = useCallback(async () => {
    if (busyRef.current) {
      return { started: 0, skipped: 0, failed: 0 };
    }
    const documentId = instance.session.getState().documentId;
    if (!documentId) {
      return { started: 0, skipped: 0, failed: 0 };
    }
    const controller = new AbortController();
    abortRef.current = controller;
    busyRef.current = true;
    setIsBusy(true);
    let started = 0;
    let skipped = 0;
    let failed = 0;
    try {
      const { staleLayerIds } = preflight();
      for (const layerId of staleLayerIds) {
        if (controller.signal.aborted) break;
        const binding = instance.session.getState().bindings[layerId];
        if (!binding || binding.status !== "stale" || !binding.workflowId) {
          skipped++;
          continue;
        }

        let settle: (outcome: Settled) => void = () => {};
        const settled = new Promise<Settled>((resolve) => {
          settle = resolve;
        });
        const onAbort = (): void => settle({ status: "aborted" });
        controller.signal.addEventListener("abort", onAbort, { once: true });

        let outcome: Settled;
        try {
          // The whole flow — run, job subscription, version append, raster
          // write-back. The subscription is the part this loop used to skip,
          // which left every job stuck at "queued" forever.
          const jobId = await startLayerGeneration(
            {
              documentId,
              layerId,
              workflowId: binding.workflowId,
              selectedOutputNodeId: binding.selectedOutputNodeId,
              paramOverrides: binding.paramOverrides,
              dependencyHash: binding.dependencyHash
            },
            { target: instance, onSettled: settle }
          );
          if (!jobId) {
            skipped++;
            continue;
          }
          outcome = await settled;
        } catch {
          failed++;
          break;
        } finally {
          controller.signal.removeEventListener("abort", onAbort);
        }

        if (outcome.status === "aborted") {
          break;
        }
        if (outcome.status === "failed") {
          failed++;
          // Stop on first failure so the user can address it before the
          // rest of the queue drains.
          break;
        }
        started++;
      }
    } finally {
      busyRef.current = false;
      setIsBusy(false);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
    return { started, skipped, failed };
  }, [instance, preflight]);

  return { preflight, regenerateStaleLayers, isBusy };
}
