import { z } from "zod";
import {
  runListOptionsSchema,
  runTraceOptionsSchema,
  runLogsOptionsSchema,
  runAwaitOptionsSchema,
  runGetOptionsSchema
} from "@nodetool-ai/protocol";
import { zodToJsonSchema } from "@nodetool-ai/runtime";
import type { CapabilitySpec } from "./types.js";

const runIdInputSchema = z.object({
  run_id: z.string().min(1).max(200).describe("An owned run id, full or its exact 12-character prefix.")
});
export const getRunInputSchema = runGetOptionsSchema.extend(runIdInputSchema.shape);
export const getRunTraceInputSchema = runTraceOptionsSchema.extend(runIdInputSchema.shape);
export const getRunLogsInputSchema = runLogsOptionsSchema.extend(runIdInputSchema.shape);
export const awaitRunInputSchema = runAwaitOptionsSchema.extend(runIdInputSchema.shape);

export const listRunsSpec: CapabilitySpec = {
  name: "list_runs",
  description: "List this account's app runs, workflow jobs and chat turns, newest first. Filter by kind, app, instance, workflow, thread, status, origin or time. Use the returned next_cursor for another bounded page, then get_run for a summary.",
  inputSchema: zodToJsonSchema(runListOptionsSchema),
  zodSchema: runListOptionsSchema,
  category: "read",
  userMessage: () => "Listing runs"
};
export const getRunSpec: CapabilitySpec = {
  name: "get_run",
  description: "Read an owned run and its bounded summary first: status, first failed span and ancestor path, cost by provider, slowest spans, counts by name, attached generations and documents. Set include_content=true to inspect bounded saved app inputs and outputs. Reports expired content, truncation and incomplete recording. A failed run is readable data. Drill down by the span ids it names with get_run_trace or get_run_logs.",
  inputSchema: zodToJsonSchema(getRunInputSchema),
  zodSchema: getRunInputSchema,
  category: "read",
  userMessage: (params) => `Reading run ${params["run_id"]}`
};
export const getRunTraceSpec: CapabilitySpec = {
  name: "get_run_trace",
  description: "Read a bounded span tree for an owned run. Limit depth, focus on a full span id, filter by name or errors_only. To inspect recorded prompt, response, arguments or output, name focus_span_id and set include_content=true. Content remains capped, redacted and subject to expiry. Trace and span ids are returned verbatim.",
  inputSchema: zodToJsonSchema(getRunTraceInputSchema),
  zodSchema: getRunTraceInputSchema,
  category: "read",
  userMessage: (params) => `Reading trace for run ${params["run_id"]}`
};
export const getRunLogsSpec: CapabilitySpec = {
  name: "get_run_logs",
  description: "Read an owned run's span events, newest last, filtered by level, source, full span id and time. Use next_cursor for another bounded page. Set include_content=true to inspect bounded recorded console or tool text. Expired or excluded content is reported and cannot be recovered from old job logs.",
  inputSchema: zodToJsonSchema(getRunLogsInputSchema),
  zodSchema: getRunLogsInputSchema,
  category: "read",
  userMessage: (params) => `Reading logs for run ${params["run_id"]}`
};
export const awaitRunSpec: CapabilitySpec = {
  name: "await_run",
  description: "Wait for an owned app run, workflow job or chat turn to complete, fail or be cancelled, then return the same summary as get_run. A failed outcome is readable data. The wait is bounded by timeout_ms and follows the calling action's cancellation signal.",
  inputSchema: zodToJsonSchema(awaitRunInputSchema),
  zodSchema: awaitRunInputSchema,
  category: "read",
  userMessage: (params) => `Waiting for run ${params["run_id"]}`
};
export const runsSpecs: readonly CapabilitySpec[] = [listRunsSpec, getRunSpec, getRunTraceSpec, getRunLogsSpec, awaitRunSpec];
