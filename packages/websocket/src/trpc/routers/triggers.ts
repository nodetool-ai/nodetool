import { z } from "zod";
import {
  TriggerRegistration,
  createTimeOrderedUuid
} from "@nodetool-ai/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  getTriggerWakeupService,
  dispatchInput
} from "../../triggers/dispatcher.js";
import {
  nextFireAtIso,
  scheduleIntervalSeconds
} from "../../triggers/schedule-timing.js";

const fireInput = z.object({
  registrationId: z.string(),
  payload: z.unknown().optional(),
  idempotencyKey: z.string().optional()
});

const listByWorkflowInput = z.object({ workflowId: z.string() });

/**
 * A registration as the editor needs it. Unlike `jobs.triggersRunning`, this
 * includes disabled rows — a trigger that has never been armed still needs a
 * discoverable id, or the Activate toggle has nothing to turn on — and the
 * webhook delivery details, without which a user cannot configure a sender.
 *
 * `config_json` is not returned wholesale: only the webhook token and secret
 * are surfaced, and the stored digest is never sent.
 *
 * `next_fire_at` and `interval_seconds` are derived, not stored: both come
 * from `schedule-timing.ts`, the same helper the scheduler sweep schedules
 * from. They are non-null only for a `schedule` registration, and
 * `next_fire_at` additionally only while it is enabled — a disabled schedule
 * has no next fire.
 */
function toEditorRegistration(reg: TriggerRegistration) {
  const config = reg.config_json ?? {};
  const isWebhook = reg.kind === "webhook";
  return {
    id: reg.id,
    workflow_id: reg.workflow_id,
    node_id: reg.node_id,
    kind: reg.kind,
    enabled: reg.enabled === 1,
    last_fired_at: reg.last_fired_at ?? null,
    last_error: reg.last_error ?? null,
    disabled_reason: reg.disabled_reason ?? null,
    consecutive_failures: reg.consecutive_failures,
    run_count: reg.run_count,
    expires_at: reg.expires_at ?? null,
    max_runs: reg.max_runs ?? null,
    next_fire_at: nextFireAtIso(reg),
    interval_seconds: scheduleIntervalSeconds(reg),
    webhook_token: isWebhook
      ? ((config.webhook_token as string | undefined) ?? null)
      : null,
    webhook_secret: isWebhook
      ? ((config.webhook_secret as string | undefined) ?? null)
      : null
  };
}

export const triggersRouter = router({
  /** Every registration for one workflow the caller owns, enabled or not. */
  listByWorkflow: protectedProcedure
    .input(listByWorkflowInput)
    .query(async ({ ctx, input }) => {
      const registrations = await TriggerRegistration.findByWorkflow(
        input.workflowId
      );
      return {
        triggers: registrations
          .filter((reg) => reg.user_id === ctx.userId)
          .map((reg) => toEditorRegistration(reg))
      };
    }),

  fire: protectedProcedure.input(fireInput).mutation(async ({ ctx, input }) => {
    const reg = (await TriggerRegistration.get(
      input.registrationId
    ));
    if (!reg || reg.user_id !== ctx.userId) {
      throwApiError(ApiErrorCode.NOT_FOUND, "Trigger registration not found");
    }
    // Refuse before delivering, not after. The dispatcher rejects a disabled
    // registration too, but by then the input is durably stored — and since
    // a pass only scans *enabled* registrations, it would sit unprocessed
    // until someone re-armed the trigger and then fire as a surprise.
    if (reg.enabled !== 1) {
      throwApiError(
        ApiErrorCode.INVALID_INPUT,
        "Trigger is not active — activate it before firing"
      );
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
