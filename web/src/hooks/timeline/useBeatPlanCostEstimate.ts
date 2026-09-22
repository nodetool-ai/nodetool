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
 * Null only when there is no plan. A source-only edit returns an explicit
 * zero-request commitment. When a model has no published rate, the estimate
 * reports unpriced requests instead of blocking the creator (PRD § 8.3).
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
  /** Timeline destinations created by the reviewed plan. */
  destinationCount: number;
  /** Compiled video candidates, including every requested take. */
  videoRequestCount: number;
  /** Voice requests created alongside the video candidates. */
  voiceRequestCount: number;
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
    // Review is an authoring surface. Empty prompts and transient take values
    // are reported by its validation instead of letting pricing throw during
    // render. For a valid plan this is the same expansion the production
    // compiler performs. Imported-source beats reuse existing footage, so
    // they have a destination but no paid video request.
    const requestedTakes = beat.production?.requested_take_count;
    const takeCount =
      Number.isInteger(requestedTakes) && (requestedTakes ?? 0) > 0
        ? (requestedTakes as number)
        : 1;
    if (!beat.source_clip_id) {
      fields.push(
        ...Array.from({ length: takeCount }, () => ({
          bindingKind: "text-to-video" as const,
          provider: inputs.videoProvider,
          model: inputs.videoModel,
          aspectRatio: inputs.aspectRatio,
          durationMs: beat.duration_ms
        }))
      );
    }
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
  const planned = plannedClipFields(beats, inputs);
  let total = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  for (const clip of planned) {
    const spec = clipGenerationSpec(clip);
    const estimate = spec ? estimateGenerationCost(spec) : null;
    if (!estimate) {
      unpricedCount += 1;
      continue;
    }
    total += estimate.total;
    pricedCount += 1;
  }
  if (beats.length === 0) {
    return null;
  }
  return {
    total,
    label: formatUsd(total),
    destinationCount: beats.length,
    videoRequestCount: planned.filter(
      (clip) => clip.bindingKind === "text-to-video"
    ).length,
    voiceRequestCount: planned.filter(
      (clip) => clip.bindingKind === "text-to-audio"
    ).length,
    pricedCount,
    unpricedCount
  };
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
    [
      aspectRatio,
      beats,
      videoModel,
      videoProvider,
      voiceModel,
      voiceProvider,
      voiced
    ]
  );
}

export default useBeatPlanCostEstimate;
