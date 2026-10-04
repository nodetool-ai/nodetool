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

/** Pixel size of every graphics image, so finishing can fit it between its copy. */
export async function measureStoryboardAssetSizes(shots: readonly Shot[], context: ProcessingContext, signal: AbortSignal = context.signal ?? new AbortController().signal): Promise<Record<string, { width: number; height: number }>> {
  const { loadMediaRefBytes } = await import("@nodetool-ai/runtime");
  const { loadImage } = await import("@napi-rs/canvas");
  const assetIds = new Set<string>();
  for (const shot of shots) {
    for (const element of shot.graphics?.elements ?? []) {
      if (element.kind === "asset" && element.asset_id) { assetIds.add(element.asset_id); }
    }
    for (const protection of shot.production?.protected_inputs ?? []) {
      if (protection.asset_id) { assetIds.add(protection.asset_id); }
    }
  }
  signal.throwIfAborted();
  const sizes = await mapWithConcurrency([...assetIds], clampConcurrency(undefined), async (assetId) => {
    try {
      const bytes = await loadMediaRefBytes({ asset_id: assetId }, context);
      if (!bytes?.length) { return null; }
      const image = await loadImage(Buffer.from(bytes));
      return image.width > 0 && image.height > 0 ? ([assetId, { width: image.width, height: image.height }] as const) : null;
    } catch (error) {
      if (signal.aborted) { throw error; }
      // An unreadable image keeps the default slot; validation reports a missing asset.
      return null;
    }
  });
  signal.throwIfAborted();
  return Object.fromEntries(sizes.flatMap((value) => value ? [value] : []));
}
