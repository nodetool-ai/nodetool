import type { Shot } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { clampConcurrency, mapWithConcurrency } from "./concurrency.js";

/** Use measured source length consistently for assembly, design preview and finishing. */
export async function measureStoryboardSources(shots: Shot[], context: ProcessingContext, signal: AbortSignal = context.signal ?? new AbortController().signal): Promise<Shot[]> {
  const { loadMediaRefBytes, probeVideoDurationSeconds } = await import("@nodetool-ai/runtime");
  const { applyMeasuredShotClipDurations, resolveShotSource } = await import("@nodetool-ai/timeline");
  signal.throwIfAborted();
  const measurements = await mapWithConcurrency(shots, clampConcurrency(undefined), async (shot) => {
    const clip = shot.clip;
    const assetId = clip?.asset_id;
    if (shot.status !== "rendered" || !assetId || resolveShotSource(shot)?.kind !== "video") { return null; }
    try {
      const bytes = await loadMediaRefBytes(clip, context);
      const seconds = bytes?.length ? await probeVideoDurationSeconds(bytes, signal) : null;
      return seconds === null ? null : ([assetId, seconds] as const);
    } catch (error) {
      if (signal.aborted) { throw error; }
      // Unmeasurable sources retain their stored duration, as canonical assembly does.
      return null;
    }
  });
  signal.throwIfAborted();
  return applyMeasuredShotClipDurations(shots, new Map(measurements.flatMap((value) => value ? [value] : [])));
}
