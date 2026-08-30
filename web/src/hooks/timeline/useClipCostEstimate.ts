/**
 * What generating one timeline clip costs, at list price.
 *
 * Reads the clip's own direct-generation binding — the model it picked, the
 * rung, and for video the length the clip occupies on the timeline, which is
 * what the direct-gen job asks the provider for. A workflow-bound clip is not
 * priced here: its cost is its graph's, which the inspector estimates with
 * `useGraphCostEstimate` off the fetched workflow.
 *
 * Null whenever no figure can be reached — see `estimateGenerationCost`.
 */

import { useMemo } from "react";
import type { ClipBindingKind } from "@nodetool-ai/timeline";
import {
  estimateGenerationCost,
  type GenerationCostEstimate,
  type GenerationSpec
} from "../../utils/generationCostEstimate";

/**
 * The clip fields a direct-generation price is derived from. Structural so a
 * `TimelineClip` satisfies it without a cast, and so a caller can price a clip
 * it is about to create.
 */
export interface ClipCostFields {
  bindingKind?: ClipBindingKind;
  provider?: string;
  model?: string;
  resolution?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

/** The generation a direct-gen clip describes, or null for a bound workflow. */
export function clipGenerationSpec(
  clip: ClipCostFields | undefined | null
): GenerationSpec | null {
  if (!clip?.model || !clip.bindingKind || clip.bindingKind === "workflow") {
    return null;
  }
  const kind =
    clip.bindingKind === "text-to-video"
      ? "video"
      : clip.bindingKind === "text-to-audio"
        ? "audio"
        : "image";
  return {
    kind,
    provider: clip.provider ?? null,
    model: clip.model,
    resolution: clip.resolution ?? null,
    aspectRatio: clip.aspectRatio ?? null,
    width: clip.width ?? null,
    height: clip.height ?? null,
    // The direct-gen job derives the requested duration from the clip's own
    // length on the timeline, so a per-second model is priced for that.
    seconds:
      kind === "video"
        ? Math.max(1, Math.round((clip.durationMs ?? 4000) / 1000))
        : null
  };
}

export function useClipCostEstimate(
  clip: ClipCostFields | undefined | null
): GenerationCostEstimate | null {
  const {
    bindingKind,
    provider,
    model,
    resolution,
    aspectRatio,
    width,
    height,
    durationMs
  } = clip ?? {};
  // Depend on the fields the price is derived from, not on the clip object —
  // every trim, move and rename replaces that object.
  return useMemo(() => {
    const spec = clipGenerationSpec({
      bindingKind,
      provider,
      model,
      resolution,
      aspectRatio,
      width,
      height,
      durationMs
    });
    return spec ? estimateGenerationCost(spec) : null;
  }, [
    bindingKind,
    provider,
    model,
    resolution,
    aspectRatio,
    width,
    height,
    durationMs
  ]);
}

export default useClipCostEstimate;
