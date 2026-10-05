import { listAppInstanceMetadata } from "@nodetool-ai/models";
import { z } from "zod";
import {
  appInstanceResponse,
  advanceInstanceInput,
  createInstanceInput,
  duplicateInstanceInput,
  getInstanceInput,
  listInstancesInput,
  listInstanceMetadataInput,
  listInstanceMetadataResponse,
  updateInstanceInput
} from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import {
  appRunApi,
  advanceOwnedAppInstance,
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
  listMetadata: protectedProcedure
    .input(listInstanceMetadataInput)
    .output(listInstanceMetadataResponse)
    .query(({ ctx, input }) =>
      appRunApi(() =>
        listAppInstanceMetadata(ctx.userId, {
          applicationId: input.application_id,
          sourceId: input.source_id,
          limit: input.limit,
          cursor: input.cursor
        })
      )
    ),
  update: protectedProcedure
    .input(updateInstanceInput)
    .output(appInstanceResponse)
    .mutation(({ ctx, input }) =>
      appRunApi(() => updateOwnedAppInstance(ctx.userId, input))
    ),
  advance: protectedProcedure
    .input(advanceInstanceInput)
    .output(appInstanceResponse)
    .mutation(({ ctx, input }) =>
      appRunApi(() => advanceOwnedAppInstance(ctx.userId, input))
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
