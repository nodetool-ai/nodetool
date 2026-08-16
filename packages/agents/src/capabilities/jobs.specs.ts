/**
 * The `jobs` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `jobs.ts`, so nothing the
 * implementations pull in reaches the entry graph. `jobs.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

export const LIST_JOBS_SCHEMA: JsonSchema = {
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
  required: []
};

export const GET_JOB_LOGS_SCHEMA: JsonSchema = {
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

export const listJobsSpec: CapabilitySpec = {
  name: "list_jobs",
  description: "List jobs (workflow executions) with optional filtering.",
  inputSchema: LIST_JOBS_SCHEMA,
  category: "read",
  userMessage: (params) => {
    const wfId = params["workflow_id"];
    return wfId ? `Listing jobs for workflow ${wfId}` : "Listing jobs";
  }
};

export const getJobSpec: CapabilitySpec = {
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
};

export const getJobLogsSpec: CapabilitySpec = {
  name: "get_job_logs",
  description: "Get logs for a job to debug workflow executions.",
  inputSchema: GET_JOB_LOGS_SCHEMA,
  category: "read",
  userMessage: (params) => `Getting logs for job ${params["job_id"]}`
};

/** Every spec this module declares, in declaration order. */
export const jobsSpecs: readonly CapabilitySpec[] = [
  listJobsSpec,
  getJobSpec,
  getJobLogsSpec
];
