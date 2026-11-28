import {
  TriggerRegistration,
  createTimeOrderedUuid
} from "@nodetool-ai/models";
import {
  fireTriggerInput,
  fireTriggerOutput,
  listTriggersByWorkflowInput,
  listTriggersByWorkflowOutput
} from "@nodetool-ai/protocol/api-schemas/triggers.js";
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
  scheduleCronSettings,
  scheduleIntervalSeconds
} from "../../triggers/schedule-timing.js";

/**
 * A registration as the editor needs it. Unlike `jobs.triggersRunning`, this
 * includes disabled rows — a trigger that has never been armed still needs a
 * discoverable id, or the Activate toggle has nothing to turn on — and the
 * webhook delivery details, without which a user cannot configure a sender.
 *
 * `config_json` is not returned wholesale: only the webhook token and secret
 * are surfaced, and the stored digest is never sent.
 *
 * `next_fire_at`, `interval_seconds`, `cron_expr` and `cron_tz` are derived,
 * not stored: all come from `schedule-timing.ts`, the same helper the
 * scheduler sweep schedules from. They are non-null only for a `schedule`
 * registration, `interval_seconds` only for an interval one, and the cron pair
 * only for a cron one. `next_fire_at` is also null while it is disabled, since
 * a disabled schedule has no next fire.
 */
function toEditorRegistration(reg: TriggerRegistration) {
  const config = reg.config_json ?? {};
  const cron = scheduleCronSettings(reg);
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
    cron_expr: cron?.expr ?? null,
    cron_tz: cron?.timezone ?? null,
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
    .input(listTriggersByWorkflowInput)
    .output(listTriggersByWorkflowOutput)
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

  fire: protectedProcedure
    .input(fireTriggerInput)
    .output(fireTriggerOutput)
    .mutation(async ({ ctx, input }) => {
      const reg = await TriggerRegistration.get(input.registrationId);
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
      // Input ids share one table-wide unique index with scheduled ticks,
      // webhooks and file events, so a caller's key is scoped to this
      // registration. Unscoped, a key shaped like another source's id would
      // suppress that delivery.
      const inputId =
        input.idempotencyKey !== undefined
          ? `manual:${reg.id}:${input.idempotencyKey}`
          : createTimeOrderedUuid();
      await getTriggerWakeupService().deliverTriggerInput({
        runId: reg.workflow_id,
        nodeId: reg.node_id,
        inputId,
        payload: input.payload ?? {}
      });
      try {
        const { jobId } = await dispatchInput(inputId);
        return { job_id: jobId };
      } catch (err) {
        // A retry whose key was already dispatched finds no unprocessed input.
        if (err instanceof Error && err.message.startsWith("input not found")) {
          throwApiError(
            ApiErrorCode.ALREADY_EXISTS,
            "This idempotency key was already fired"
          );
        }
        throw err;
      }
    })
});
