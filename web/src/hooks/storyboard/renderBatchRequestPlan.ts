import type { Shot, ShotModelRef } from "@nodetool-ai/protocol";
import type { scripts } from "@nodetool-ai/protocol/api-schemas";
import { effectiveShotDuration } from "@nodetool-ai/timeline";

import type { RenderStep } from "./useRenderBatchCostEstimate";

export interface RenderBatchRequestPlanEntry {
  shot: Shot;
  requestIndex: number;
  model: ShotModelRef | null;
  seconds?: number;
}

interface CompileRenderBatchRequestPlanInput {
  shots: readonly Shot[];
  step: RenderStep;
  linesById: Map<string, scripts.ScriptLine>;
  modelForShot: (shot: Shot) => ShotModelRef | null;
}

/** Compile the paid request set after expanding per-shot production takes. */
export const compileRenderBatchRequestPlan = ({
  shots,
  step,
  linesById,
  modelForShot
}: CompileRenderBatchRequestPlanInput): RenderBatchRequestPlanEntry[] =>
  shots.flatMap((shot) => {
    const requestCount =
      step === "clip" ? (shot.production?.requested_take_count ?? 1) : 1;
    const seconds =
      step === "clip"
        ? shot.production?.duration_ms !== undefined
          ? shot.production.duration_ms / 1000
          : (effectiveShotDuration(shot, linesById).seconds ??
            shot.duration_seconds)
        : undefined;
    const model = modelForShot(shot);
    return Array.from({ length: requestCount }, (_, requestIndex) => ({
      shot,
      requestIndex,
      model,
      seconds
    }));
  });
