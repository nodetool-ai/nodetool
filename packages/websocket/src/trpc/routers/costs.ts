import { Prediction } from "@nodetool-ai/models";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import {
  dashboardInput,
  dashboardOutput
} from "@nodetool-ai/protocol/api-schemas/costs.js";

export const costsRouter = router({
  /**
   * Windowed analytics powering the Costs dashboard: per-provider totals, a
   * per-provider daily series, per-model totals, headline stats and recent
   * executions — all scoped to the requested trailing window.
   */
  dashboard: protectedProcedure
    .input(dashboardInput)
    .output(dashboardOutput)
    .query(({ ctx, input }) =>
      Prediction.aggregateDashboard(ctx.userId, {
        days: input.days,
        tzOffsetMinutes: input.tzOffsetMinutes,
        executionsLimit: input.executionsLimit
      })
    )
});
