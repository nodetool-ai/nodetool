/**
 * What generating the beat plan will cost, before a single clip exists
 * (PRD § 8.3).
 *
 * The sequence cost hook prices the clips a timeline already holds, which is no
 * help on the look step: the whole point of the step is to show the price of a
 * click that has not happened. So this prices the clips the plan *would*
 * create, through the same two pure functions that hook uses —
 * `clipGenerationSpec` and `estimateGenerationCost` — so the figure beside
 * `Generate` and the figure the status bar shows afterwards come from one
 * catalog and cannot disagree.
 *
 * Null when nothing could be priced. The button stays enabled either way: a
 * model with no published rate is a reason to say so, not a reason to block
 * the creator (PRD § 8.3).
 */

import { useMemo } from "react";
import { formatUsd } from "@nodetool-ai/model-pricing";
import type { TimelineBeat } from "@nodetool-ai/timeline";

import { estimateGenerationCost } from "../../utils/generationCostEstimate";
import { clipGenerationSpec, type ClipCostFields } from "./useClipCostEstimate";

export interface BeatPlanCostInputs {
  aspectRatio?: string;
  videoProvider?: string;
  videoModel?: string;
  voiceProvider?: string;
  voiceModel?: string;
  /** Voice on. Without it no voiceover clip is planned, so none is priced. */
  voiced: boolean;
}

export interface BeatPlanCostEstimate {
  total: number;
  /** "$1.24". */
  label: string;
  /** How many of the planned clips a catalog figure covered. */
  pricedCount: number;
  /** Planned clips no figure covered — the total is a floor. */
  unpricedCount: number;
}

/** The clips the plan would create, as the fields a price is derived from. */
export function plannedClipFields(
  beats: readonly TimelineBeat[],
  inputs: BeatPlanCostInputs
): ClipCostFields[] {
  const fields: ClipCostFields[] = [];
  for (const beat of beats) {
    fields.push({
      bindingKind: "text-to-video",
      provider: inputs.videoProvider,
      model: inputs.videoModel,
      aspectRatio: inputs.aspectRatio,
      durationMs: beat.duration_ms
    });
    if (inputs.voiced && (beat.voiceover ?? "").trim().length > 0) {
      fields.push({
        bindingKind: "text-to-audio",
        provider: inputs.voiceProvider,
        model: inputs.voiceModel,
        durationMs: beat.duration_ms
      });
    }
  }
  return fields;
}

export function summarizeBeatPlanCost(
  beats: readonly TimelineBeat[],
  inputs: BeatPlanCostInputs
): BeatPlanCostEstimate | null {
  let total = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  for (const clip of plannedClipFields(beats, inputs)) {
    const spec = clipGenerationSpec(clip);
    const estimate = spec ? estimateGenerationCost(spec) : null;
    if (!estimate) {
      unpricedCount += 1;
      continue;
    }
    total += estimate.total;
    pricedCount += 1;
  }
  if (pricedCount === 0) {
    return null;
  }
  return { total, label: formatUsd(total), pricedCount, unpricedCount };
}

export function useBeatPlanCostEstimate(
  beats: readonly TimelineBeat[],
  inputs: BeatPlanCostInputs
): BeatPlanCostEstimate | null {
  const {
    aspectRatio,
    videoProvider,
    videoModel,
    voiceProvider,
    voiceModel,
    voiced
  } = inputs;
  return useMemo(
    () =>
      summarizeBeatPlanCost(beats, {
        aspectRatio,
        videoProvider,
        videoModel,
        voiceProvider,
        voiceModel,
        voiced
      }),
    [aspectRatio, beats, videoModel, videoProvider, voiceModel, voiceProvider, voiced]
  );
}

export default useBeatPlanCostEstimate;
