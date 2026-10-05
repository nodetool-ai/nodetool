/**
 * The `jobs` capability module.
 *
 * Three capabilities that used to be three `Tool` subclasses in
 * `../tools/mcp-tools.ts`: `list_jobs`, `get_job` and `get_job_logs`.
 * `start_background_job` reads the same table but starts a run, so it stays
 * with the run capabilities in `./workflows.ts`.
 *
 * Wire names, descriptions and schemas are unchanged: `getAllMcpTools` builds
 * these through `toolFromCapability`, so every consumer sees the surface it saw
 * before. `@nodetool-ai/models` is imported inside each implementation, so
 * loading this module costs nothing.
 */

import {
  jobRecord,
  jobSummaryRecord,
  userIdOf
} from "../tools/mcp-tool-support.js";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import {
  listJobsSpec,
  getJobSpec,
  getJobLogsSpec,
  cancelJobSpec
} from "./jobs.specs.js";
import { isString } from "../utils/type-guards.js";

/** The paging/filter bag `Job.paginate` takes. */
interface JobPageOptions {
  limit: number;
  workflowId?: string;
}

const listJobs: CapabilityExport = {
  spec: listJobsSpec,
  impl: async (run, params) => {
    const { Job } = await import("@nodetool-ai/models");
    const workflowId = params["workflow_id"];
    const page: JobPageOptions = {
      limit: Number(params["limit"] ?? 100)
    };
    if (isString(workflowId) && workflowId) {
      page.workflowId = workflowId;
    }
    const [jobs, next] = await Job.paginate(userIdOf(run.context), page);
    // Summaries, not full records: a listing reports which jobs exist and how
    // they settled. `get_job` reads one job's outputs.
    return { jobs: jobs.map(jobSummaryRecord), next: next || null };
  }
};

// ---------------------------------------------------------------------------
// get_job
// ---------------------------------------------------------------------------

const getJob: CapabilityExport = {
  spec: getJobSpec,
  impl: async (run, params) => {
    const { Job } = await import("@nodetool-ai/models");
    const jobId = String(params["job_id"]);
    const job = await Job.find(userIdOf(run.context), jobId);
    if (!job) return { error: `Job ${jobId} was not found.` };
    const record = jobRecord(job);
    // The job's own failure message is payload, not a tool failure — a bare
    // `error` string at the result root makes the CodeAct bridge throw and
    // discard everything else on a failed job.
    const { error, ...rest } = record;
    return {
      ...rest,
      job_error: error ?? null,
      params: job.params ?? null,
      // What a still-running job can say about itself. A render posts one
      // `node_progress` per frame; without this a poll during a two-minute
      // render sees "running" and nothing more.
      progress: job.progressRecord()
    };
  }
};

const getJobLogs: CapabilityExport = {
  spec: getJobLogsSpec,
  impl: async (run, params) => {
    const { Job } = await import("@nodetool-ai/models");
    const jobId = String(params["job_id"]);
    const job = await Job.find(userIdOf(run.context), jobId);
    if (!job) return { error: `Job ${jobId} was not found.` };
    const { findRunForSource, getRun, getRunLogs } = await import("@nodetool-ai/execution");
    const trace = await findRunForSource(userIdOf(run.context), "workflow", job.id);
    if (trace) {
      const owner = userIdOf(run.context);
      const tail = await getRunLogs(owner, trace.id, {
        limit: Math.max(1, Math.min(500, Number(params["limit"] ?? 200))),
        newest: true,
        include_content: true
      });
      const { summary } = await getRun(owner, trace.id);
      return {
        job_id: job.id,
        run_id: tail.run.id,
        status: tail.run.status,
        job_error: tail.run.error,
        total_logs: summary.event_count,
        logs: tail.logs,
        content_state: tail.content_state,
        content_expired: tail.content_expired,
        truncated: tail.truncated,
        incomplete: tail.incomplete,
        limited: tail.limited
      };
    }
    // Deletion can mark an older traced job after the first read, then remove
    // its directory before the lookup above. Re-read before allowing fallback.
    const historyJob = await Job.find(userIdOf(run.context), job.id);
    if (!historyJob) { return { error: `Job ${jobId} was not found.` }; }
    if (historyJob.has_run_trace !== 0) {
      return {
        job_id: job.id,
        status: historyJob.status,
        job_error: null,
        total_logs: 0,
        logs: [],
        content_state: "expired",
        content_expired: true,
        truncated: false,
        incomplete: false,
        limited: false
      };
    }
    // `limit` keeps the most recent entries — the tail is what explains a
    // failure. Previously it was forwarded to an endpoint that ignored it.
    const limit = Number(params["limit"] ?? 200);
    const logs = historyJob.logs ?? [];
    // `job_error`, not `error`: the call succeeded even when the job did not,
    // and a root-level `error` string reads as a tool failure downstream.
    return {
      job_id: job.id,
      status: historyJob.status,
      job_error: historyJob.error_message ?? historyJob.error ?? null,
      total_logs: logs.length,
      logs: logs.slice(Math.max(0, logs.length - limit))
    };
  }
};

// ---------------------------------------------------------------------------
// cancel_job
// ---------------------------------------------------------------------------

/**
 * Cancel one of the caller's own runs.
 *
 * `markCancelledIfActive` is the whole security boundary: the user id and the
 * still-active predicate are columns in the one UPDATE, so a job that belongs
 * to someone else and a job that already finished both come back `false`
 * without this code ever holding the row. It cannot clobber the cost and
 * timestamps a finishing run just wrote.
 */
const cancelJob: CapabilityExport = {
  spec: cancelJobSpec,
  impl: async (run, params) => {
    const { Job } = await import("@nodetool-ai/models");
    const jobId = String(params["job_id"]);
    const cancelled = await Job.markCancelledIfActive(
      jobId,
      userIdOf(run.context)
    );
    return cancelled
      ? { job_id: jobId, status: "cancelled" }
      : {
          job_id: jobId,
          cancelled: false,
          error: `Job ${jobId} is not running — it already finished, or it is not yours.`
        };
  }
};

/** Every job capability, in the order `getAllMcpTools` offered them. */
export const JOB_CAPABILITIES: readonly CapabilityExport[] = [
  listJobs,
  getJob,
  getJobLogs,
  cancelJob
];

export const module: CapabilityModule = {
  module: "jobs",
  exports: JOB_CAPABILITIES
};

export { listJobs, getJob, getJobLogs, cancelJob };
