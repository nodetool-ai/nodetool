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

import type { JsonSchema } from "@nodetool-ai/runtime";
import { jobRecord, userIdOf } from "../tools/mcp-tool-support.js";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import {
  listJobsSpec,
  getJobSpec,
  getJobLogsSpec,
  LIST_JOBS_SCHEMA,
  GET_JOB_LOGS_SCHEMA
} from "./jobs.specs.js";
import { isString } from "../utils/type-guards.js";

export { LIST_JOBS_SCHEMA, GET_JOB_LOGS_SCHEMA } from "./jobs.specs.js";

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
    return { jobs: jobs.map(jobRecord), next: next || null };
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
    return { ...jobRecord(job), params: job.params ?? null };
  }
};

const getJobLogs: CapabilityExport = {
  spec: getJobLogsSpec,
  impl: async (run, params) => {
    const { Job } = await import("@nodetool-ai/models");
    const jobId = String(params["job_id"]);
    const job = await Job.find(userIdOf(run.context), jobId);
    if (!job) return { error: `Job ${jobId} was not found.` };
    // `limit` keeps the most recent entries — the tail is what explains a
    // failure. Previously it was forwarded to an endpoint that ignored it.
    const limit = Number(params["limit"] ?? 200);
    const logs = job.logs ?? [];
    return {
      job_id: job.id,
      status: job.status,
      error: job.error_message ?? job.error ?? null,
      total_logs: logs.length,
      logs: logs.slice(Math.max(0, logs.length - limit))
    };
  }
};

/** Every job capability, in the order `getAllMcpTools` offered them. */
export const JOB_CAPABILITIES: readonly CapabilityExport[] = [
  listJobs,
  getJob,
  getJobLogs
];

export const module: CapabilityModule = {
  module: "jobs",
  exports: JOB_CAPABILITIES
};

export { listJobs, getJob, getJobLogs };
