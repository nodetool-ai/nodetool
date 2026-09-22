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
 * A shot's remembered model wins over the board's legacy default. Clips are
 * also priced at each shot's effective duration, then the batch is summed.
 *
 * The shots come from the caller, and they are exactly the ones the button
 * loops over: the estimate is what that click costs, not what an ideal render
 * of the board would.
 */

import { useMemo } from "react";
import type { Shot, ShotModelRef } from "@nodetool-ai/protocol";
import { CLIP_RESOLUTION, STILL_RESOLUTION } from "./renderSpec";
import { compileRenderBatchRequestPlan } from "./renderBatchRequestPlan";
import { priceRenderStep } from "./shotCostPricing";
import { useBoardScriptLines } from "./useShotDuration";
import { useBoardImageModel, useBoardVideoModel } from "./useShotCostEstimate";

/** Which of the two render passes a batch is. */
export type RenderStep = "still" | "clip";

export interface RenderBatchCostEstimate {
  /** Shots the button would render. */
  shotCount: number;
  /** Paid provider requests after expanding requested takes. */
  requestCount: number;
  /** Summed USD over the shots that priced. */
  cost: number;
  /** How many of those shots carry a figure. */
  pricedCount: number;
  /** How many provider requests carry a figure. */
  pricedRequestCount: number;
  /** Why the rest do not, deduplicated. */
  reasons: string[];
  /** What the catalog assumed, and what it warns the figure omits. */
  notes: string[];
}

const EMPTY: RenderBatchCostEstimate = {
  shotCount: 0,
  requestCount: 0,
  cost: 0,
  pricedCount: 0,
  pricedRequestCount: 0,
  reasons: [],
  notes: []
};

export function useRenderBatchCostEstimate(
  boardId: string,
  shots: Shot[],
  step: RenderStep,
  modelForShot?: (shot: Shot) => ShotModelRef | null
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
    const pickerLabel = isStill ? "still model" : "clip model";
    const resolution = isStill ? STILL_RESOLUTION : CLIP_RESOLUTION;

    const plan = compileRenderBatchRequestPlan({
      shots,
      step,
      linesById,
      modelForShot: (shot) =>
        modelForShot
          ? modelForShot(shot)
          : isStill
            ? (shot.still_model ?? imageModel)
            : (shot.clip_model ?? videoModel)
    });
    const pricedShotIds = new Set<string>();
    let pricedRequestCount = 0;

    for (const request of plan) {
      const priced = priceRenderStep(
        label,
        request.model,
        pickerLabel,
        resolution,
        request.seconds,
        notes
      );
      if (priced.cost === null) {
        if (priced.reason) {
          reasons.push(priced.reason);
        }
        continue;
      }
      cost += priced.cost;
      pricedRequestCount += 1;
      pricedShotIds.add(request.shot.id);
    }
    pricedCount = pricedShotIds.size;

    return {
      shotCount: shots.length,
      requestCount: plan.length,
      cost,
      pricedCount,
      pricedRequestCount,
      reasons: Array.from(new Set(reasons)),
      notes: Array.from(new Set(notes))
    };
  }, [shots, step, imageModel, videoModel, linesById, modelForShot]);
}

export default useRenderBatchCostEstimate;
