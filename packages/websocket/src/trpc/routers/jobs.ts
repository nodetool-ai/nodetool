/**
 * Jobs router — migrated from REST `/api/jobs*`.
 *
 * Ported verbatim from the legacy http-api.ts handlers (`handleJobsRoot`,
 * `handleJobById`, `handleJobCancel`, and the inline `/running/all` handler).
 * User ownership is enforced on every procedure — a job whose `user_id`
 * doesn't match `ctx.userId` is indistinguishable from a missing one.
 *
 * The trigger stubs (`/api/jobs/triggers/*`) stay on REST — they're
 * 501-placeholders for a feature that isn't available in standalone mode.
 */

import { Job } from "@nodetool/models";
import type { Job as JobModel } from "@nodetool/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  listInput,
  listOutput,
  runningAllOutput,
  getInput,
  jobResponse,
  deleteInput,
  deleteOutput,
  cancelInput,
  cancelOutput,
  type JobResponse,
  type BackgroundJobResponse
} from "@nodetool/protocol/api-schemas/jobs.js";

function toJobResponse(job: JobModel): JobResponse {
  return {
    id: job.id,
    user_id: job.user_id,
    job_type: "workflow" as const,
    status: job.status,
    workflow_id: job.workflow_id,
    started_at: job.started_at ?? null,
    finished_at: job.finished_at ?? null,
    error: job.error ?? null,
    cost: null
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

export const jobsRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ ctx, input }) => {
      const [jobs, nextStartKey] = await Job.paginate(ctx.userId, {
        limit: input.limit,
        workflowId: input.workflow_id
      });
      return {
        jobs: jobs.map((j) => toJobResponse(j)),
        next_start_key: nextStartKey || null
      };
    }),

  // GET /api/jobs/running/all — returns only running/scheduled jobs
  // (legacy paginated with limit=500 then filtered).
  runningAll: protectedProcedure
    .output(runningAllOutput)
    .query(async ({ ctx }) => {
      const [jobs] = await Job.paginate(ctx.userId, { limit: 500 });
      const running = jobs.filter(
        (j) => j.status === "running" || j.status === "scheduled"
      );
      return running.map((j) => toBackgroundJobResponse(j));
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

  delete: protectedProcedure
    .input(deleteInput)
    .output(deleteOutput)
    .mutation(async ({ ctx, input }) => {
      const job = (await Job.get(input.id)) as JobModel | null;
      if (!job || job.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Job not found");
      }
      await job.delete();
      return { ok: true as const };
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
    })
});
