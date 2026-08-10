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

// ---------------------------------------------------------------------------
// list_jobs
// ---------------------------------------------------------------------------

const LIST_JOBS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description: "Optional workflow ID to filter by"
    },
    limit: {
      type: "number",
      description: "Maximum number of jobs to return",
      default: 100
    }
  },
  required: [] as string[]
};

const listJobs: CapabilityExport = {
  spec: {
    name: "list_jobs",
    description: "List jobs (workflow executions) with optional filtering.",
    inputSchema: LIST_JOBS_SCHEMA,
    category: "read",
    userMessage: (params) => {
      const wfId = params["workflow_id"];
      return wfId ? `Listing jobs for workflow ${wfId}` : "Listing jobs";
    }
  },
  impl: async (run, params) => {
    const { Job } = await import("@nodetool-ai/models");
    const workflowId = params["workflow_id"];
    const [jobs, next] = await Job.paginate(userIdOf(run.context), {
      limit: Number(params["limit"] ?? 100),
      ...(typeof workflowId === "string" && workflowId ? { workflowId } : {})
    });
    return { jobs: jobs.map(jobRecord), next: next || null };
  }
};

// ---------------------------------------------------------------------------
// get_job
// ---------------------------------------------------------------------------

const getJob: CapabilityExport = {
  spec: {
    name: "get_job",
    description:
      "Get details about a specific job including status, timing, and error info.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: {
          type: "string",
          description: "The job ID"
        }
      },
      required: ["job_id"]
    },
    category: "read",
    userMessage: (params) => `Getting job ${params["job_id"]}`
  },
  impl: async (run, params) => {
    const { Job } = await import("@nodetool-ai/models");
    const jobId = String(params["job_id"]);
    const job = await Job.find(userIdOf(run.context), jobId);
    if (!job) return { error: `Job ${jobId} was not found.` };
    return { ...jobRecord(job), params: job.params ?? null };
  }
};

// ---------------------------------------------------------------------------
// get_job_logs
// ---------------------------------------------------------------------------

const GET_JOB_LOGS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    job_id: {
      type: "string",
      description: "The job ID"
    },
    limit: {
      type: "number",
      description: "Maximum number of log entries to return",
      default: 200
    }
  },
  required: ["job_id"]
};

const getJobLogs: CapabilityExport = {
  spec: {
    name: "get_job_logs",
    description: "Get logs for a job to debug workflow executions.",
    inputSchema: GET_JOB_LOGS_SCHEMA,
    category: "read",
    userMessage: (params) => `Getting logs for job ${params["job_id"]}`
  },
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
