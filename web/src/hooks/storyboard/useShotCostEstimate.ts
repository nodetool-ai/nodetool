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
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useShotDuration } from "./useShotDuration";
import { CLIP_RESOLUTION, STILL_RESOLUTION } from "./renderSpec";
import { priceRenderStep, type ShotCostStep } from "./shotCostPricing";

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

/**
 * The board's two render models, subscribed one at a time: selecting the whole
 * board would re-run this on every shot edit the board makes.
 */
export const useBoardImageModel = (boardId: string) =>
  useStoryboardStore((state) => state.boards[boardId]?.imageModel ?? null);

export const useBoardVideoModel = (boardId: string) =>
  useStoryboardStore((state) => state.boards[boardId]?.videoModel ?? null);

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
        ? priceRenderStep(
            "Still",
            imageModel,
            "still model",
            STILL_RESOLUTION,
            undefined,
            notes
          )
        : null,
      priceRenderStep(
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
