import { z } from "zod";
import { TriggerRegistration, createTimeOrderedUuid } from "@nodetool-ai/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { getTriggerWakeupService, dispatchInput } from "../../triggers/dispatcher.js";

const fireInput = z.object({
  registrationId: z.string(),
  payload: z.unknown().optional(),
  idempotencyKey: z.string().optional()
});

export const triggersRouter = router({
  fire: protectedProcedure
    .input(fireInput)
    .mutation(async ({ ctx, input }) => {
      const reg = (await TriggerRegistration.get(
        input.registrationId
      )) as TriggerRegistration | null;
      if (!reg || reg.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Trigger registration not found");
      }
      const inputId = input.idempotencyKey ?? createTimeOrderedUuid();
      await getTriggerWakeupService().deliverTriggerInput({
        runId: reg.workflow_id,
        nodeId: reg.node_id,
        inputId,
        payload: input.payload ?? {}
      });
      const { jobId } = await dispatchInput(inputId);
      return { job_id: jobId };
    })
});
