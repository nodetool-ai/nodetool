import { z } from "zod";
import {
  appInstanceResponse,
  createInstanceInput,
  duplicateInstanceInput,
  getInstanceInput,
  listInstancesInput,
  updateInstanceInput
} from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import {
  appRunApi,
  createOwnedAppInstance,
  deleteAppInstance,
  duplicateAppInstance,
  getOwnedAppInstance,
  listAppInstances,
  updateOwnedAppInstance
} from "../../lib/app-instances-service.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

export const appInstancesRouter = router({
  create: protectedProcedure
    .input(createInstanceInput)
    .output(appInstanceResponse)
    .mutation(({ ctx, input }) =>
      appRunApi(() => createOwnedAppInstance(ctx.userId, input))
    ),
  ensureDefault: protectedProcedure
    .input(createInstanceInput)
    .output(appInstanceResponse)
    .mutation(({ ctx, input }) =>
      appRunApi(() => createOwnedAppInstance(ctx.userId, input, true))
    ),
  get: protectedProcedure
    .input(getInstanceInput)
    .output(appInstanceResponse)
    .query(({ ctx, input }) =>
      appRunApi(() => getOwnedAppInstance(ctx.userId, input.id))
    ),
  list: protectedProcedure
    .input(listInstancesInput)
    .output(z.array(appInstanceResponse))
    .query(({ ctx, input }) =>
      appRunApi(() =>
        listAppInstances(
          ctx.userId,
          input.application_id,
          input.source_id,
          input.limit
        )
      )
    ),
  update: protectedProcedure
    .input(updateInstanceInput)
    .output(appInstanceResponse)
    .mutation(({ ctx, input }) =>
      appRunApi(() => updateOwnedAppInstance(ctx.userId, input))
    ),
  duplicate: protectedProcedure
    .input(duplicateInstanceInput)
    .output(appInstanceResponse)
    .mutation(({ ctx, input }) =>
      appRunApi(() => duplicateAppInstance(ctx.userId, input.id, input.name))
    ),
  delete: protectedProcedure
    .input(getInstanceInput)
    .output(z.object({ ok: z.boolean() }))
    .mutation(({ ctx, input }) =>
      appRunApi(async () => ({
        ok: await deleteAppInstance(ctx.userId, input.id)
      }))
    )
});
