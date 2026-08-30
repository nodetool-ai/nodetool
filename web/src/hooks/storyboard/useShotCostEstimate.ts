/**
 * useShotCostEstimate
 *
 * A live per-shot render cost, computed the way `render_storyboard_clips`
 * prices a clip: the board's video model (the model every clip renders with,
 * `StoryboardStore.videoModel`) priced through `getModelUnitPrice` with the
 * shot's effective duration. Falls back to the shot's stored `cost_estimate`
 * (written by the last render) when no video model is selected or the
 * catalog has no price for it — never to a bare "no data" when a prior
 * render already knows the answer.
 */

import { useMemo } from "react";
import type { Shot } from "@nodetool-ai/protocol";
import { getModelUnitPrice } from "../../utils/modelUnitPricing";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useShotDuration } from "./useShotDuration";

export interface ShotCostEstimate {
  /** The whole-run cost in USD, already multiplied by duration. */
  cost: number;
  /** "live" priced off the board's current model selection; "stored" is the last render's own figure. */
  source: "live" | "stored";
}

/** The board's video model, read as a `SelectedModel` for the pricing catalog. */
const useVideoModel = (boardId: string) =>
  useStoryboardStore((state) => state.boards[boardId]?.videoModel ?? null);

/** A price billed in "units" or "credits" has no fixed currency value. */
const isVagueBillingUnit = (unit: string | undefined): boolean =>
  !!unit && /\bunits?\b|\bcredits?\b/i.test(unit.trim());

export function useShotCostEstimate(
  boardId: string,
  shot: Shot
): ShotCostEstimate | null {
  const videoModel = useVideoModel(boardId);
  const duration = useShotDuration(boardId, shot);
  const seconds = duration.seconds ?? shot.duration_seconds;

  return useMemo(() => {
    if (videoModel) {
      const price = getModelUnitPrice(
        { id: videoModel.id, provider: videoModel.provider },
        { seconds }
      );
      if (
        price &&
        !price.declined &&
        Number.isFinite(price.unit_price) &&
        !isVagueBillingUnit(price.billing_unit)
      ) {
        return { cost: price.unit_price, source: "live" };
      }
    }
    return shot.cost_estimate != null
      ? { cost: shot.cost_estimate, source: "stored" }
      : null;
  }, [videoModel, seconds, shot.cost_estimate]);
}

export default useShotCostEstimate;
