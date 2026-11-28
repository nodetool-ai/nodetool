import { z } from "zod";

/**
 * Trigger registrations as the `jobs.trigger*` and `triggers.*` procedures
 * return them. The server and `nodetool triggers` share these contracts.
 */

/** A registration without its webhook delivery details. */
export const triggerRegistrationResponse = z.object({
  id: z.string(),
  workflow_id: z.string(),
  node_id: z.string(),
  kind: z.string(),
  enabled: z.boolean(),
  last_fired_at: z.string().nullable(),
  last_error: z.string().nullable(),
  /** Non-null only when the dispatcher disarmed it. */
  disabled_reason: z.string().nullable(),
  consecutive_failures: z.number(),
  run_count: z.number(),
  expires_at: z.string().nullable(),
  max_runs: z.number().nullable()
});
export type TriggerRegistrationResponse = z.infer<
  typeof triggerRegistrationResponse
>;

export const triggerIdInput = z.object({ id: z.string() });

export const runningTriggersOutput = z.object({
  triggers: z.array(triggerRegistrationResponse)
});

/**
 * A registration as the editor needs it: the schedule timing and, for a
 * webhook, the token and secret a sender needs.
 */
export const editorTriggerRegistration = triggerRegistrationResponse.extend({
  next_fire_at: z.string().nullable(),
  interval_seconds: z.number().nullable(),
  cron_expr: z.string().nullable(),
  cron_tz: z.string().nullable(),
  webhook_token: z.string().nullable(),
  webhook_secret: z.string().nullable()
});
export type EditorTriggerRegistration = z.infer<
  typeof editorTriggerRegistration
>;

export const listTriggersByWorkflowInput = z.object({ workflowId: z.string() });

export const listTriggersByWorkflowOutput = z.object({
  triggers: z.array(editorTriggerRegistration)
});

export const fireTriggerInput = z.object({
  registrationId: z.string(),
  payload: z.unknown().optional(),
  idempotencyKey: z.string().optional()
});

export const fireTriggerOutput = z.object({ job_id: z.string() });
