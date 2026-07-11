/**
 * Triggers router — the `manual` trigger kind's only event source, and the
 * backing endpoint for the UI "Fire now" button.
 *
 * `fire` delivers one durable `trigger_input` for a caller-owned registration
 * and dispatches it synchronously, returning the started job id. Ownership is
 * enforced: a registration whose `user_id` doesn't match `ctx.userId` is
 * indistinguishable from a missing one (NOT_FOUND either way).
 */

import { z } from "zod";
import { TriggerRegistration, createTimeOrderedUuid } from "@nodetool-ai/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  getTriggerWakeupService,
  dispatchInput
} from "../../triggers/dispatcher.js";

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

      let jobId: string;
      try {
        ({ jobId } = await dispatchInput(inputId));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // A disabled registration is a client-visible state error, not a server
        // fault — surface it as a 400 instead of letting it bubble to a 500.
        if (message.startsWith("registration disabled")) {
          throwApiError(
            ApiErrorCode.INVALID_INPUT,
            "Trigger registration is disabled"
          );
        }
        throw error;
      }

      return { job_id: jobId };
    })
});
