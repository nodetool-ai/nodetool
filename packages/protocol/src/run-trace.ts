import { z } from "zod";

export const TRACE_CONTENT_KEYS = [
  "llm.request.messages", "llm.response.content", "llm.tool.names",
  "tool.arguments", "tool.result", "agent.objective", "agent.task",
  "console.output", "ui.resolved.value", "app.inputs", "app.outputs",
  "exception.message", "exception.stacktrace", "log.message", "log.arguments",
  "workflow.name", "thread.title", "node.logs",
  "event.log", "event.console", "event.agent.activity", "event.tool.result",
  "event.exception", "event.ui.resolve_params", "event.ui.fold"
] as const;

export const TRACE_RESTRICTED_CAPABILITY_MODULES = ["email", "google", "browser"] as const;
export const TRACE_STRING_LIMIT = 20_000;
export const TRACE_CONTENT_BYTE_LIMIT = 1_000_000;
export const TRACE_SPAN_LIMIT = 2_000;
export const TRACE_EVENT_LIMIT = 10_000;

export const traceRecordSchema = z.object({
  trace_id: z.string().regex(/^[0-9a-f]{32}$/),
  span_id: z.string().regex(/^[0-9a-f]{16}$/),
  parent_span_id: z.string().regex(/^[0-9a-f]{16}$/).nullable(),
  name: z.string().min(1).max(200),
  kind: z.enum(["INTERNAL", "SERVER", "CLIENT", "PRODUCER", "CONSUMER"]),
  start_time_ms: z.number().finite(),
  end_time_ms: z.number().finite(),
  duration_ms: z.number().finite().min(0),
  status: z.object({ code: z.enum(["UNSET", "OK", "ERROR"]), message: z.string().optional() }),
  attributes: z.record(z.string(), z.unknown()),
  events: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(200),
    time_ms: z.number().finite(),
    attributes: z.record(z.string(), z.unknown()).optional()
  })),
  resource: z.record(z.string(), z.unknown())
});
export type TraceRecord = z.infer<typeof traceRecordSchema>;

export const runTraceParentSchema = z.object({
  kind: z.enum(["app", "instance", "app_run", "workflow", "job", "thread", "message"]),
  id: z.string().min(1).max(200)
});
export type RunTraceParent = z.infer<typeof runTraceParentSchema>;

export const runTraceRegistrationSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  kind: z.enum(["app", "workflow", "chat"]),
  source_id: z.string(),
  parent_run_id: z.string().nullable(),
  trace_id: z.string().regex(/^[0-9a-f]{32}$/),
  root_span_id: z.string().regex(/^[0-9a-f]{16}$/).nullable(),
  origin: z.enum(["ui", "agent", "cli", "debug", "public"]),
  status: z.enum(["running", "completed", "failed", "cancelled"]),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  cost_usd: z.number().nullable(),
  error: z.string().nullable(),
  content_expired: z.number().int(),
  truncated: z.number().int(),
  incomplete: z.number().int(),
  parents: z.array(runTraceParentSchema)
});
export type RunTraceRegistration = z.infer<typeof runTraceRegistrationSchema>;

export const runTraceUpdateSchema = z.object({
  kind: z.enum(["span_started", "span_updated", "span_ended", "span_event"]),
  record: traceRecordSchema
});
export type RunTraceUpdate = z.infer<typeof runTraceUpdateSchema>;

export const storedRunTraceUpdateSchema = runTraceUpdateSchema.extend({
  run_id: z.string(),
  cursor: z.number().int().min(0),
  content_expired: z.boolean(),
  truncated: z.boolean(),
  incomplete: z.boolean()
});
export type StoredRunTraceUpdate = z.infer<typeof storedRunTraceUpdateSchema>;
