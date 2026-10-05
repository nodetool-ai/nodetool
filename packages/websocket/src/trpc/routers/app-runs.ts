import { z } from "zod";
import {
  appRunResponse,
  getRunInput,
  listRunsInput,
  reserveRunInput
} from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import {
  appRunApi,
  deleteAppRun,
  getOwnedAppRun,
  listAppRuns,
  patchAppRunInput,
  patchOwnedAppRun,
  reserveOwnedAppRun
} from "../../lib/app-instances-service.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

export const appRunsRouter = router({
  reserve: protectedProcedure
    .input(reserveRunInput)
    .output(appRunResponse)
    .mutation(({ ctx, input }) =>
      appRunApi(() => reserveOwnedAppRun(ctx.userId, input))
    ),
  get: protectedProcedure
    .input(getRunInput)
    .output(appRunResponse)
    .query(({ ctx, input }) =>
      appRunApi(() => getOwnedAppRun(ctx.userId, input.id))
    ),
  list: protectedProcedure
    .input(listRunsInput)
    .output(z.array(appRunResponse))
    .query(({ ctx, input }) =>
      appRunApi(() => listAppRuns(ctx.userId, input.instance_id, input.limit))
    ),
  update: protectedProcedure
    .input(patchAppRunInput)
    .output(appRunResponse)
    .mutation(({ ctx, input }) =>
      appRunApi(() => patchOwnedAppRun(ctx.userId, input))
    ),
  delete: protectedProcedure
    .input(getRunInput)
    .output(z.object({ ok: z.boolean() }))
    .mutation(({ ctx, input }) =>
      appRunApi(async () => ({ ok: await deleteAppRun(ctx.userId, input.id) }))
    )
});
