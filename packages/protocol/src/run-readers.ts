import { z } from "zod";
import { runTraceRegistrationSchema, traceRecordSchema, storedRunTraceUpdateSchema } from "./run-trace.js";

export const RUN_SUMMARY_SPAN_LIMIT = 10;
export const RUN_READER_STRING_LIMIT = 2_000;
export const RUN_READER_CONTENT_LIMIT = 32_000;
const resourceId = z.string().min(1).max(200);
const spanId = z.string().regex(/^[0-9a-f]{16}$/).refine((value) => !/^0+$/.test(value));
export const runGetOptionsSchema = z.object({ include_content: z.boolean().default(false) });
export const runListOptionsSchema = z.object({
  kind: z.enum(["app", "workflow", "chat"]).optional(),
  app_id: resourceId.optional(), instance_id: resourceId.optional(), workflow_id: resourceId.optional(), thread_id: resourceId.optional(),
  operation_id: z.string().min(1).max(200).optional(),
  status: runTraceRegistrationSchema.shape.status.optional(), origin: runTraceRegistrationSchema.shape.origin.optional(),
  since: z.iso.datetime().optional(), until: z.iso.datetime().optional(),
  limit: z.number().int().min(1).max(100).default(20), cursor: z.string().max(500).optional()
});
export const runTraceOptionsSchema = z.object({
  depth: z.number().int().min(0).max(64).default(4), focus_span_id: spanId.optional(),
  name: z.string().min(1).max(200).optional(), errors_only: z.boolean().default(false),
  limit: z.number().int().min(1).max(500).default(100), include_content: z.boolean().default(false)
});
export const runLogsOptionsSchema = z.object({
  level: z.string().min(1).max(50).optional(), source: z.string().min(1).max(200).optional(), span_id: spanId.optional(),
  since_ms: z.number().finite().optional(), until_ms: z.number().finite().optional(),
  limit: z.number().int().min(1).max(500).default(100), cursor: z.string().max(500).optional(), include_content: z.boolean().default(false), newest: z.boolean().default(false)
});
export const runAwaitOptionsSchema = z.object({
  timeout_ms: z.number().int().min(1).max(300_000).default(30_000), poll_interval_ms: z.number().int().min(10).max(5_000).default(250)
});
export const runUpdatesOptionsSchema = z.object({
  cursor: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(500).default(100), include_content: z.boolean().default(false)
});
export type RunListOptions = z.input<typeof runListOptionsSchema>;
export type RunGetOptions = z.input<typeof runGetOptionsSchema>;
export type RunTraceOptions = z.input<typeof runTraceOptionsSchema>;
export type RunLogsOptions = z.input<typeof runLogsOptionsSchema>;
export type RunAwaitOptions = z.input<typeof runAwaitOptionsSchema>;
export type RunUpdatesOptions = z.input<typeof runUpdatesOptionsSchema>;
export const runContentStateSchema = z.enum(["available", "absent", "expired", "public", "suppressed"]);
export const runReaderFlagsSchema = z.object({ content_state: runContentStateSchema, content_expired: z.boolean(), truncated: z.boolean(), incomplete: z.boolean() });
const spanSummarySchema = z.object({
  span_id: spanId, parent_span_id: spanId.nullable(), name: z.string(), status: traceRecordSchema.shape.status.shape.code,
  duration_ms: z.number(), error: z.string().nullable()
});
export const runSummarySchema = runReaderFlagsSchema.extend({
  first_failed_span_id: spanId.nullable(), failure_path: z.array(spanSummarySchema),
  cost_by_provider: z.record(z.string(), z.number()), slowest_spans: z.array(spanSummarySchema), counts_by_name: z.record(z.string(), z.number()),
  span_count: z.number().int(), event_count: z.number().int(), generation_ids: z.array(resourceId), document_ids: z.array(resourceId), summary_truncated: z.boolean()
});
export const runReaderRecordSchema = runTraceRegistrationSchema.extend({ parents_limited: z.boolean(), app: z.object({
  instance_id: z.string().nullable(), operation_id: z.string(), app_version: z.number().nullable(), application_id: z.string().nullable(),
  inputs: z.record(z.string(), z.unknown()).nullable().optional(), outputs: z.record(z.string(), z.unknown()).nullable().optional(), content_limited: z.boolean().optional()
}).optional() });
export const getRunResultSchema = z.object({ run: runReaderRecordSchema, summary: runSummarySchema });
export const listRunsResultSchema = z.object({ runs: z.array(runReaderRecordSchema), next_cursor: z.string().nullable() });
export const getRunTraceResultSchema = runReaderFlagsSchema.extend({
  run: runReaderRecordSchema, nodes: z.array(z.object({ record: traceRecordSchema, depth: z.number().int() })), next_cursor: z.null(), limited: z.boolean()
});
export const runLogSchema = z.object({
  id: z.string(), span_id: spanId, span_name: z.string(), time_ms: z.number(), name: z.string(), level: z.string().nullable(), source: z.string().nullable(), attributes: z.record(z.string(), z.unknown())
});
export const getRunLogsResultSchema = runReaderFlagsSchema.extend({ run: runReaderRecordSchema, logs: z.array(runLogSchema), next_cursor: z.string().nullable(), limited: z.boolean() });
export const runUpdatesResultSchema = runReaderFlagsSchema.extend({
  run: runReaderRecordSchema, records: z.array(storedRunTraceUpdateSchema), cursor: z.number().int(), has_more: z.boolean(), resnapshot_required: z.literal(true), limited: z.boolean(), trace_settled: z.boolean()
});
export type RunSummary = z.infer<typeof runSummarySchema>;
export type GetRunResult = z.infer<typeof getRunResultSchema>;
export type ListRunsResult = z.infer<typeof listRunsResultSchema>;
export type GetRunTraceResult = z.infer<typeof getRunTraceResultSchema>;
export type GetRunLogsResult = z.infer<typeof getRunLogsResultSchema>;
export type RunUpdatesResult = z.infer<typeof runUpdatesResultSchema>;
export type RunReaderFlags = z.infer<typeof runReaderFlagsSchema>;
export type RunLog = z.infer<typeof runLogSchema>;
