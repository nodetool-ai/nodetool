/**
 * useRenderBatchCostEstimate
 *
 * What the toolbar's *Render stills* and *Render clips* buttons are about to
 * spend, across every shot they would fire at. The per-shot inspector answers
 * the same question one shot at a time; a batch button spends N times that in
 * one click, which is the number worth seeing before the click.
 *
 * Priced through the same `priceRenderStep` the inspector uses, so a shot
 * cannot be quoted one figure in the inspector and another in the toolbar.
 * Stills are identical across shots — one model, one rung — while a clip's
 * price moves with each shot's effective duration, so clips are priced shot by
 * shot and summed.
 *
 * The shots come from the caller, and they are exactly the ones the button
 * loops over: the estimate is what that click costs, not what an ideal render
 * of the board would.
 */

import { useMemo } from "react";
import type { Shot } from "@nodetool-ai/protocol";
import { effectiveShotDuration } from "@nodetool-ai/timeline";

import { CLIP_RESOLUTION, STILL_RESOLUTION } from "./renderSpec";
import { priceRenderStep } from "./shotCostPricing";
import { useBoardScriptLines } from "./useShotDuration";
import {
  useBoardImageModel,
  useBoardVideoModel
} from "./useShotCostEstimate";

/** Which of the two render passes a batch is. */
export type RenderStep = "still" | "clip";

export interface RenderBatchCostEstimate {
  /** Shots the button would render. */
  shotCount: number;
  /** Summed USD over the shots that priced. */
  cost: number;
  /** How many of those shots carry a figure. */
  pricedCount: number;
  /** Why the rest do not, deduplicated. */
  reasons: string[];
  /** What the catalog assumed, and what it warns the figure omits. */
  notes: string[];
}

const EMPTY: RenderBatchCostEstimate = {
  shotCount: 0,
  cost: 0,
  pricedCount: 0,
  reasons: [],
  notes: []
};

export function useRenderBatchCostEstimate(
  boardId: string,
  shots: Shot[],
  step: RenderStep
): RenderBatchCostEstimate {
  const imageModel = useBoardImageModel(boardId);
  const videoModel = useBoardVideoModel(boardId);
  // Clip lengths come from the linked script's takes when there is one; the
  // lines are fetched once for the whole batch rather than per shot.
  const linesById = useBoardScriptLines(boardId);

  return useMemo(() => {
    if (shots.length === 0) {
      return EMPTY;
    }
    const notes: string[] = [];
    const reasons: string[] = [];
    let cost = 0;
    let pricedCount = 0;

    // What the step is, decided once: only the duration varies per shot.
    const isStill = step === "still";
    const label = isStill ? "Still" : "Clip";
    const model = isStill ? imageModel : videoModel;
    const pickerLabel = isStill ? "still model" : "clip model";
    const resolution = isStill ? STILL_RESOLUTION : CLIP_RESOLUTION;

    for (const shot of shots) {
      // A still carries no duration; a clip is priced at the length the render
      // will ask for, which the linked script's takes may decide.
      const seconds = isStill
        ? undefined
        : (effectiveShotDuration(shot, linesById).seconds ??
          shot.duration_seconds);
      const priced = priceRenderStep(
        label,
        model,
        pickerLabel,
        resolution,
        seconds,
        notes
      );
      if (priced.cost === null) {
        if (priced.reason) {
          reasons.push(priced.reason);
        }
        continue;
      }
      cost += priced.cost;
      pricedCount += 1;
    }

    return {
      shotCount: shots.length,
      cost,
      pricedCount,
      reasons: Array.from(new Set(reasons)),
      notes: Array.from(new Set(notes))
    };
  }, [shots, step, imageModel, videoModel, linesById]);
}

export default useRenderBatchCostEstimate;
