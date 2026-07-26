/**
 * Jobs router — migrated from REST `/api/jobs*`.
 *
 * User ownership is enforced on every procedure — a job whose `user_id`
 * doesn't match `ctx.userId` is indistinguishable from a missing one. The
 * same rule applies to the trigger-registration procedures below, which
 * replace the old `GET/POST /api/jobs/triggers/*` REST stubs.
 */

import { z } from "zod";
import { Job, RunEvent, TriggerRegistration } from "@nodetool-ai/models";
import type { Job as JobModel } from "@nodetool-ai/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  listInput,
  listOutput,
  getInput,
  jobResponse,
  cancelInput,
  cancelOutput,
  type JobResponse,
  type BackgroundJobResponse
} from "@nodetool-ai/protocol/api-schemas/jobs.js";

function toJobResponse(job: JobModel): JobResponse {
  return {
    id: job.id,
    user_id: job.user_id,
    job_type: "workflow" as const,
    status: job.status,
    name: job.name ?? null,
    workflow_id: job.workflow_id,
    started_at: job.started_at ?? null,
    finished_at: job.finished_at ?? null,
    error: job.error ?? null,
    cost: job.cost ?? null
  };
}

function toBackgroundJobResponse(job: JobModel): BackgroundJobResponse {
  return {
    job_id: job.id,
    status: job.status,
    workflow_id: job.workflow_id,
    created_at: job.started_at ?? null,
    is_running: job.status === "running" || job.status === "scheduled",
    is_completed:
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled"
  };
}

export interface TriggerRegistrationResponse {
  id: string;
  workflow_id: string;
  node_id: string;
  kind: string;
  enabled: boolean;
  last_fired_at: string | null;
  last_error: string | null;
}

function toTriggerRegistrationResponse(
  registration: TriggerRegistration
): TriggerRegistrationResponse {
  return {
    id: registration.id,
    workflow_id: registration.workflow_id,
    node_id: registration.node_id,
    kind: registration.kind,
    enabled: registration.enabled === 1,
    last_fired_at: registration.last_fired_at,
    last_error: registration.last_error
  };
}

const triggerIdInput = z.object({ id: z.string() });

async function requireOwnedRegistration(
  id: string,
  userId: string
): Promise<TriggerRegistration> {
  const registration = (await TriggerRegistration.get(
    id
  )) as TriggerRegistration | null;
  if (!registration || registration.user_id !== userId) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Trigger registration not found");
  }
  return registration;
}

export const jobsRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ ctx, input }) => {
      const [jobs, nextStartKey] = await Job.paginate(ctx.userId, {
        limit: input.limit,
        workflowId: input.workflow_id,
        startKey: input.start_key
      });
      return {
        jobs: jobs.map((j) => toJobResponse(j)),
        next_start_key: nextStartKey || null
      };
    }),

  get: protectedProcedure
    .input(getInput)
    .output(jobResponse)
    .query(async ({ ctx, input }) => {
      const job = (await Job.get(input.id)) as JobModel | null;
      if (!job || job.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Job not found");
      }
      return toJobResponse(job);
    }),

  cancel: protectedProcedure
    .input(cancelInput)
    .output(cancelOutput)
    .mutation(async ({ ctx, input }) => {
      const job = (await Job.get(input.id)) as JobModel | null;
      if (!job || job.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Job not found");
      }
      job.markCancelled();
      await job.save();
      return toBackgroundJobResponse(job);
    }),

  // ── triggersRunning (GET /api/jobs/triggers/running) ────────────────────
  // Lists the caller's enabled trigger registrations — the set the host's
  // ingestion adapters (webhook route, scheduler, file watcher) are
  // currently listening for.
  triggersRunning: protectedProcedure.query(async ({ ctx }) => {
    const registrations = await TriggerRegistration.findByUser(ctx.userId);
    return {
      triggers: registrations
        .filter((r) => r.enabled === 1)
        .map((r) => toTriggerRegistrationResponse(r))
    };
  }),

  // ── triggerStart (POST /api/jobs/triggers/:id/start) ────────────────────
  triggerStart: protectedProcedure
    .input(triggerIdInput)
    .mutation(async ({ ctx, input }) => {
      const registration = await requireOwnedRegistration(input.id, ctx.userId);
      const wasEnabled = registration.enabled === 1;
      registration.enabled = 1;
      await registration.save();
      if (!wasEnabled) {
        await RunEvent.appendEvent(
          registration.workflow_id,
          "TriggerRegistered",
          {
            registration_id: registration.id,
            workflow_id: registration.workflow_id,
            kind: registration.kind
          },
          registration.node_id
        );
      }
      return toTriggerRegistrationResponse(registration);
    }),

  // ── triggerStop (POST /api/jobs/triggers/:id/stop) ──────────────────────
  triggerStop: protectedProcedure
    .input(triggerIdInput)
    .mutation(async ({ ctx, input }) => {
      const registration = await requireOwnedRegistration(input.id, ctx.userId);
      registration.enabled = 0;
      await registration.save();
      return toTriggerRegistrationResponse(registration);
    })
});
