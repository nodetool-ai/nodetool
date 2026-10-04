import { z } from "zod";

export const TRACE_CONTENT_KEYS = [
  "llm.request.messages", "llm.response.content", "llm.tool.names",
  "tool.arguments", "tool.result", "agent.objective", "agent.task",
  "console.output", "ui.resolved.value", "app.inputs", "app.outputs",
  "status.message", "span.name", "event.name",
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
export const TRACE_SPAN_EVENT_LIMIT = 128;

const traceIdSchema = z.string().regex(/^[0-9a-f]{32}$/).refine((value) => !/^0+$/.test(value), "Trace id must be nonzero");
const spanIdSchema = z.string().regex(/^[0-9a-f]{16}$/).refine((value) => !/^0+$/.test(value), "Span id must be nonzero");

export const traceRecordSchema = z.object({
  trace_id: traceIdSchema,
  span_id: spanIdSchema,
  parent_span_id: spanIdSchema.nullable(),
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
  trace_id: traceIdSchema,
  root_span_id: spanIdSchema.nullable(),
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

export interface TraceContent {
  name?: string;
  attributes?: Record<string, unknown>;
  resource?: Record<string, unknown>;
  status_message?: string;
  events?: Array<TraceRecord["events"][number] & { id: string }>;
}

const SAFE_TRACE_ATTRIBUTES = new Set([
  "llm.provider", "llm.model", "llm.request.messages_count", "llm.request.tools_count",
  "llm.request.stream", "llm.response.role", "llm.response.tool_calls_count", "llm.response.chunk_count",
  "gen_ai.system", "gen_ai.request.model", "gen_ai.response.model",
  "gen_ai.usage.input_tokens", "gen_ai.usage.output_tokens", "gen_ai.usage.total_tokens",
  "gen_ai.usage.cache_read_input_tokens", "gen_ai.usage.cache_creation_input_tokens", "gen_ai.usage.cost_usd",
  "agent.kind", "agent.provider", "agent.model", "agent.tools_count", "agent.round", "agent.max_rounds",
  "tool.name", "tool.module", "tool.argument_names", "tool.result_type", "tool.result_length",
  "capability.name", "capability.module", "generation.id", "generation.provider", "generation.model",
  "generation.kind", "render.id", "render.kind", "render.shot_count", "document.id", "app.id", "app.instance_id", "app.run_id", "app.operation_id", "app.origin",
  "workflow.id", "workflow.node_count", "job.id", "thread.id", "message.id", "node.id", "node.type",
  "nodetool.task.kind", "nodetool.trace.truncated", "nodetool.trace.incomplete",
  "nodetool.trace.dropped_events", "nodetool.trace.dropped_attributes", "nodetool.trace.dropped_links",
  "http.request.method", "http.response.status_code", "http.route", "url.scheme", "server.port",
  "error.type", "exception.type", "log.level", "log.source", "source", "level", "service.name", "service.version",
  "telemetry.sdk.name", "telemetry.sdk.language", "telemetry.sdk.version", "run.id", "run.kind", "run.origin"
]);
const SAFE_SPAN_NAMES = /^(?:app\.run|chat\.turn|script\.run|workflow\.run|node\.process|capability\.call|generation|render|agent\.(?:loop|round|execute|plan|step)|tool\.call|llm\.(?:chat|stream)(?: [a-zA-Z0-9_./:-]+)?|HTTP (?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)|(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)(?: \/[a-zA-Z0-9_/:.-]*)?)$/;
const SAFE_EVENT_NAMES = new Set(["content.event", "log", "console", "agent.activity", "tool.result", "exception", "ui.resolve_params", "ui.fold"]);

/** Unknown attributes are content until their metadata purpose is declared here. */
export function isTraceContentKey(key: string): boolean {
  return TRACE_CONTENT_KEYS.some((contentKey) => contentKey === key) || !SAFE_TRACE_ATTRIBUTES.has(key);
}

function splitAttributes(attributes: Record<string, unknown>): [Record<string, unknown>, Record<string, unknown>] {
  const metadata: Record<string, unknown> = {};
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    (isTraceContentKey(key) || !isSafeMetadataValue(key, value) ? content : metadata)[key] = value;
  }
  return [metadata, content];
}

const metadataScalarSchema = z.union([z.string(), z.boolean(), z.number().finite()]);
const argumentNamesSchema = z.array(z.string());

function isSafeMetadataValue(key: string, value: unknown): boolean {
  return metadataScalarSchema.safeParse(value).success ||
    (key === "tool.argument_names" && argumentNamesSchema.safeParse(value).success);
}

/** Separate owner content from metadata used by external copies and retained summaries. */
export function splitTraceRecord(record: TraceRecord): { record: TraceRecord; content: TraceContent | null } {
  const [attributes, contentAttributes] = splitAttributes(record.attributes);
  const [resource, contentResource] = splitAttributes(record.resource);
  const content: TraceContent = {};
  if (record.name !== "content.span" && !SAFE_SPAN_NAMES.test(record.name)) { content.name = record.name; }
  if (Object.keys(contentAttributes).length > 0) { content.attributes = contentAttributes; }
  if (Object.keys(contentResource).length > 0) { content.resource = contentResource; }
  if (record.status.message !== undefined) { content.status_message = record.status.message; }
  const contentEvents: NonNullable<TraceContent["events"]> = [];
  const events = record.events.map((event, index) => {
    const id = event.id ?? `${record.span_id}:${index}`;
    const [eventAttributes, eventContent] = splitAttributes(event.attributes ?? {});
    const safeName = SAFE_EVENT_NAMES.has(event.name);
    if (!safeName || Object.keys(eventContent).length > 0) {
      const contentEvent: NonNullable<TraceContent["events"]>[number] = { id, name: event.name, time_ms: event.time_ms };
      if (Object.keys(eventContent).length > 0) { contentEvent.attributes = eventContent; }
      contentEvents.push(contentEvent);
    }
    const metadataEvent: TraceRecord["events"][number] = { id, name: safeName ? event.name : "content.event", time_ms: event.time_ms };
    if (Object.keys(eventAttributes).length > 0) { metadataEvent.attributes = eventAttributes; }
    return metadataEvent;
  });
  if (contentEvents.length > 0) { content.events = contentEvents; }
  return {
    record: { ...record, name: content.name ? "content.span" : record.name, status: { code: record.status.code }, attributes, resource, events },
    content: Object.keys(content).length > 0 ? content : null
  };
}

/** Rehydrate the same record shape for owner-authorized readers. */
export function recombineTraceRecord(record: TraceRecord, content: TraceContent | null): TraceRecord {
  if (!content) { return record; }
  const events = new Map(content.events?.map((event) => [event.id, event]) ?? []);
  const status = { ...record.status };
  if (content.status_message !== undefined) { status.message = content.status_message; }
  return {
    ...record,
    name: content.name ?? record.name,
    attributes: { ...record.attributes, ...content.attributes },
    resource: { ...record.resource, ...content.resource },
    status,
    events: record.events.map((event) => {
      const restored = event.id ? events.get(event.id) : undefined;
      return restored ? { ...event, name: restored.name, attributes: { ...event.attributes, ...restored.attributes } } : event;
    })
  };
}
