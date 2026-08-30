/**
 * useShotCostEstimate
 *
 * What rendering one shot costs, priced the way `render_storyboard_stills` and
 * `render_storyboard_clips` bill it: the board's image model for the shot's
 * still and the board's video model for its clip, both through
 * `getModelUnitPrice`, at the same resolution rungs the render sends
 * (`STILL_RESOLUTION`, `CLIP_RESOLUTION`) and with the shot's effective
 * duration multiplying a per-second clip model. A `direct` shot skips the
 * still, because it generates from the prompt and never renders one.
 *
 * Every step the shot pays for comes back, priced or not, and only the clip's
 * moves with the shot's length — one total would hide which of them a change
 * touched. A step nobody can price carries the reason instead of a figure: a
 * board with no clip model picked would otherwise show a still price and
 * nothing beside it, which reads as a bug rather than as a setting nobody has
 * chosen yet.
 *
 * Falls back to the shot's stored `cost_estimate` (written by the last render)
 * when no step prices at all — a figure that already happened beats two
 * reasons.
 */

import { useMemo } from "react";
import type { Shot } from "@nodetool-ai/protocol";
import { shotRenderMode } from "@nodetool-ai/protocol";
import { getModelUnitPrice } from "../../utils/modelUnitPricing";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useShotDuration } from "./useShotDuration";
import { CLIP_RESOLUTION, STILL_RESOLUTION } from "./renderSpec";

/** One render step the shot pays for. */
export interface ShotCostStep {
  /** "Still" or "Clip". */
  label: string;
  /** The step's cost in USD, or null when nothing prices it. */
  cost: number | null;
  /** How the figure was reached: "4 s × $0.1/s at 1080p". */
  breakdown?: string;
  /** Why there is no figure, when there is none. */
  reason?: string;
}

export interface ShotCostEstimate {
  /** The whole-shot cost in USD: every priced step below, summed. */
  cost: number;
  /** "live" priced off the board's current model selection; "stored" is the last render's own figure. */
  source: "live" | "stored";
  /** The steps, in render order. Empty when the figure is stored. */
  steps: ShotCostStep[];
  /** What the catalogs assumed, and what they warn the figure omits. */
  notes: string[];
}

/** A model selection as the pricing catalog takes it. */
interface BoardModel {
  id: string;
  provider: string | null;
  name?: string;
}

/**
 * The board's two render models, subscribed one at a time: selecting the whole
 * board would re-run this on every shot edit the board makes.
 */
const useBoardImageModel = (boardId: string) =>
  useStoryboardStore((state) => state.boards[boardId]?.imageModel ?? null);

const useBoardVideoModel = (boardId: string) =>
  useStoryboardStore((state) => state.boards[boardId]?.videoModel ?? null);

/** A price billed in "units" or "credits" has no fixed currency value. */
const isVagueBillingUnit = (unit: string | undefined): boolean =>
  !!unit && /\bunits?\b|\bcredits?\b/i.test(unit.trim());

/** A price that can be shown as money, or null. */
function usable(
  price: ReturnType<typeof getModelUnitPrice>
): NonNullable<ReturnType<typeof getModelUnitPrice>> | null {
  if (
    !price ||
    price.declined ||
    !Number.isFinite(price.unit_price) ||
    isVagueBillingUnit(price.billing_unit)
  ) {
    return null;
  }
  return price;
}

/**
 * One step's price, or the reason there is none.
 *
 * The rung the render sends is asked for first. A model that publishes no such
 * rung declines it, and the answer then is the model's base spec plus a note —
 * dropping the step would hide the clip's cost on every model whose ladder
 * stops below 1080p.
 */
function priceStep(
  label: string,
  model: BoardModel | null,
  pickerLabel: string,
  resolution: string,
  seconds: number | undefined,
  notes: string[]
): ShotCostStep {
  if (!model?.id) {
    return {
      label,
      cost: null,
      reason: `No ${pickerLabel} picked for this board.`
    };
  }
  const selected = { id: model.id, provider: model.provider };
  const atRung = usable(getModelUnitPrice(selected, { resolution, seconds }));
  const price = atRung ?? usable(getModelUnitPrice(selected, { seconds }));
  if (!price) {
    return {
      label,
      cost: null,
      reason: `No published price for ${model.name || model.id}.`
    };
  }
  if (!atRung) {
    notes.push(
      `${label.toLowerCase()}: this model publishes no ${resolution} price — shown at its base spec`
    );
  }
  notes.push(...(price.assumptions ?? []), ...(price.warnings ?? []));
  return { label, cost: price.unit_price, breakdown: price.breakdown };
}

export function useShotCostEstimate(
  boardId: string,
  shot: Shot
): ShotCostEstimate {
  const imageModel = useBoardImageModel(boardId);
  const videoModel = useBoardVideoModel(boardId);
  const duration = useShotDuration(boardId, shot);
  const seconds = duration.seconds ?? shot.duration_seconds;
  const rendersStill = shotRenderMode(shot) !== "direct";

  return useMemo(() => {
    const notes: string[] = [];
    const steps = [
      rendersStill
        ? priceStep(
            "Still",
            imageModel,
            "still model",
            STILL_RESOLUTION,
            undefined,
            notes
          )
        : null,
      priceStep(
        "Clip",
        videoModel,
        "clip model",
        CLIP_RESOLUTION,
        seconds,
        notes
      )
    ].filter((step): step is ShotCostStep => step !== null);

    const priced = steps.filter(
      (step): step is ShotCostStep & { cost: number } => step.cost !== null
    );
    if (priced.length > 0) {
      return {
        cost: priced.reduce((sum, step) => sum + step.cost, 0),
        source: "live",
        steps,
        notes: Array.from(new Set(notes))
      };
    }
    if (shot.cost_estimate != null) {
      return { cost: shot.cost_estimate, source: "stored", steps: [], notes: [] };
    }
    return { cost: 0, source: "live", steps, notes: [] };
  }, [imageModel, videoModel, rendersStill, seconds, shot.cost_estimate]);
}

export default useShotCostEstimate;
