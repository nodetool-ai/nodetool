import { context, trace, type Attributes, type Context, type Span as ApiSpan } from "@opentelemetry/api";
import type { ReadableSpan, Span, SpanProcessor, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { isTraceContentKey, splitTraceRecord, TRACE_STRING_LIMIT, TRACE_CONTENT_BYTE_LIMIT, type TraceRecord, type RunTraceRegistration, type RunTraceUpdate } from "@nodetool-ai/protocol";
import { redactTraceText, setLogHook, safeProcessEnv, type LogEntry } from "@nodetool-ai/config";
import { spanToRecord } from "./span-record.js";
import { bindSpanRunTraceScope, getRunTraceScope, isRunTraceSuppressed, recordTraceEvent, withoutRunTrace, type RunTraceScope } from "./run-trace-context.js";
import { sanitizeTraceContentText, stringifyTraceContent } from "./run-trace-serialization.js";

export type TraceIncompleteReason = "queue_overflow" | "store_failure";
export interface RunTraceWrite {
  readonly runId?: string;
  readonly userId?: string;
  readonly update: RunTraceUpdate;
  readonly secretValues: ReadonlySet<string>;
  readonly contentSuppressed: boolean;
  readonly isRoot: boolean;
}
export interface TraceSanitizerOptions {
  readonly secretValues: ReadonlySet<string>;
  readonly public: boolean;
  readonly contentSuppressed: boolean;
}
export interface RunTraceStore {
  lookup(traceId: string): Promise<RunTraceRegistration | null>;
  write(updates: readonly RunTraceWrite[]): Promise<void>;
  markIncomplete(traceId: string, reason: TraceIncompleteReason): Promise<void>;
  flush(): Promise<void>;
  sanitize(record: TraceRecord, options: TraceSanitizerOptions): TraceRecord;
}

let store: RunTraceStore | null = null;
const scopes = new WeakMap<ReadableSpan, RunTraceScope>();
const scopeRoots = new WeakMap<RunTraceScope, string>();
const NO_SECRETS: ReadonlySet<string> = new Set();
const ROOT_NAMES = new Set(["app.run", "workflow.run", "chat.turn"]);
const MAX_QUEUED_SPANS = 1_000;
const MAX_QUEUE_BYTES = 8_000_000;
const MAX_ROOT_RESERVATIONS = 64;
const MAX_DIAGNOSTIC_BACKLOG = 1_000;
const DIAGNOSTIC_FLUSH_TIMEOUT_MS = 1_000;

function hasOversizedContent(value: unknown, depth = 0): boolean {
  if (typeof value === "string") { return value.length > TRACE_STRING_LIMIT; }
  if (depth > 12) { return true; }
  if (Array.isArray(value)) { return value.length > 1_000 || value.some((item) => hasOversizedContent(item, depth + 1)); }
  if (value && typeof value === "object") { const entries = Object.values(value); return entries.length > 1_000 || entries.some((item) => hasOversizedContent(item, depth + 1)); }
  return false;
}

/** Attach durable storage independently of external sink initialization. */
export function configureRunTraceStore(adapter: RunTraceStore): void { store = adapter; }

function redactRecord(record: TraceRecord, options: TraceSanitizerOptions): TraceRecord {
  if (record.name.length > 200 || record.events.some((event) => event.name.length > 200) || hasOversizedContent(record.attributes) || hasOversizedContent(record.resource) || record.events.some((event) => hasOversizedContent(event.attributes)) || (record.status.message?.length ?? 0) > TRACE_STRING_LIMIT) {
    record = { ...record, attributes: { ...record.attributes, "nodetool.trace.truncated": true } };
  }
  const omitEncodedMedia = (attributes: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, typeof value === "string" && isTraceContentKey(key) ? sanitizeTraceContentText(value, options.secretValues) : value]));
  record = { ...record, attributes: omitEncodedMedia(record.attributes), resource: omitEncodedMedia(record.resource), events: record.events.map((event) => {
    const sanitizedEvent = { ...event };
    if (event.attributes) { sanitizedEvent.attributes = omitEncodedMedia(event.attributes); }
    return sanitizedEvent;
  }) };
  if (store) { return store.sanitize(record, options); }
  let bytes = 0;
  const clean = (value: unknown, depth: number): unknown => {
    if (depth > 12 || bytes >= TRACE_CONTENT_BYTE_LIMIT) { return "[truncated]"; }
    if (typeof value === "string") {
      const text = redactTraceText(value, options.secretValues).slice(0, TRACE_STRING_LIMIT);
      bytes += text.length * 2;
      return text;
    }
    if (value instanceof Uint8Array) { return "[media omitted]"; }
    if (Array.isArray(value)) { return value.slice(0, 1_000).map((item) => clean(item, depth + 1)); }
    if (typeof value === "object" && value !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value).slice(0, 1_000)) { result[key] = isCredentialKey(key) ? "[REDACTED:credential]" : clean(item, depth + 1); }
      return result;
    }
    return value;
  };
  const status = { ...record.status };
  if (record.status.message) { status.message = redactTraceText(record.status.message, options.secretValues).slice(0, TRACE_STRING_LIMIT); }
  const sanitized = {
    ...record,
    name: redactTraceText(record.name, options.secretValues).slice(0, 200),
    status,
    attributes: cleanAttributes(record.attributes, clean),
    resource: cleanAttributes(record.resource, clean),
    events: record.events.map((event) => {
      const sanitizedEvent = { ...event, name: redactTraceText(event.name, options.secretValues).slice(0, 200) };
      if (event.attributes) { sanitizedEvent.attributes = cleanAttributes(event.attributes, clean); }
      return sanitizedEvent;
    })
  };
  return options.public || options.contentSuppressed ? splitTraceRecord(sanitized).record : sanitized;
}

function cleanAttributes(values: Record<string, unknown>, clean: (value: unknown, depth: number) => unknown): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) { output[key] = isCredentialKey(key) ? "[REDACTED:credential]" : clean(value, 0); }
  return output;
}

function isCredentialKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_.\s]/g, "");
  return /apikey|secret|password|passwd|authorization|privatekey|credentials/.test(normalized) || ["token", "accesstoken", "refreshtoken", "sessiontoken", "cookie"].includes(normalized);
}

function eventTime(milliseconds: number): [number, number] {
  return [Math.floor(milliseconds / 1_000), (milliseconds % 1_000) * 1_000_000];
}

/** External copies always mask credentials and exclude visitor and suppressed content. */
export function externalTraceRecord(record: TraceRecord, scope?: RunTraceScope): TraceRecord {
  const sanitized = redactRecord(record, {
    secretValues: scope?.secretValues ?? NO_SECRETS,
    public: scope?.origin === "public",
    contentSuppressed: scope?.policy.contentSuppressed ?? false
  });
  return safeProcessEnv()["NODETOOL_TRACE_INCLUDE_CONTENT"] === "1" && scope?.origin !== "public" && !scope?.policy.contentSuppressed
    ? sanitized
    : splitTraceRecord(sanitized).record;
}

/** Preserve the captured run policy even when an exporter runs after its async scope ends. */
export function externalSpanRecord(span: ReadableSpan): TraceRecord {
  return externalTraceRecord(spanToRecord(span), scopes.get(span));
}

function otelAttributes(input: Record<string, unknown>): Attributes {
  const result: Attributes = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") { result[key] = value; }
    else if (Array.isArray(value) && value.every((item) => typeof item === "string")) { result[key] = value; }
  }
  return result;
}

/** Filter before OTLP or the legacy console exporter can inspect an SDK span. */
export class ContentFilteringSpanExporter implements SpanExporter {
  constructor(private readonly exporter: SpanExporter) {}
  export(spans: ReadableSpan[], callback: Parameters<SpanExporter["export"]>[1]): void {
    this.exporter.export(spans.map((span) => {
      const record = externalTraceRecord(spanToRecord(span), scopes.get(span));
      const instrumentationScope: { name: string; version?: string } = { name: redactTraceText(span.instrumentationScope?.name ?? "nodetool", scopes.get(span)?.secretValues) };
      if (span.instrumentationScope?.version) { instrumentationScope.version = redactTraceText(span.instrumentationScope.version, scopes.get(span)?.secretValues); }
      const status: ReadableSpan["status"] = { code: span.status.code };
      if (record.status.message) { status.message = record.status.message; }
      const filtered = {
        ...span,
        duration: span.duration,
        ended: span.ended,
        droppedAttributesCount: span.droppedAttributesCount,
        droppedEventsCount: span.droppedEventsCount,
        droppedLinksCount: span.droppedLinksCount,
        spanContext: () => ({ traceId: span.spanContext().traceId, spanId: span.spanContext().spanId, traceFlags: span.spanContext().traceFlags }),
        links: (span.links ?? []).map((link) => ({ context: { traceId: link.context.traceId, spanId: link.context.spanId, traceFlags: link.context.traceFlags } })),
        instrumentationScope,
        name: record.name,
        attributes: otelAttributes(record.attributes),
        status,
        events: record.events.map((event) => {
          const filteredEvent: ReadableSpan["events"][number] = { name: event.name, time: eventTime(event.time_ms) };
          if (event.attributes) { filteredEvent.attributes = otelAttributes(event.attributes); }
          return filteredEvent;
        }),
        resource: resourceFromAttributes(otelAttributes(record.resource))
      };
      if (span.parentSpanContext) { filtered.parentSpanContext = { traceId: span.parentSpanContext.traceId, spanId: span.parentSpanContext.spanId, traceFlags: span.parentSpanContext.traceFlags }; }
      return filtered;
    }), callback);
  }
  shutdown(): Promise<void> { return this.exporter.shutdown(); }
  forceFlush(): Promise<void> { return this.exporter.forceFlush?.() ?? Promise.resolve(); }
}

interface QueuedWrite { readonly write: RunTraceWrite; readonly bytes: number; }

/** Record registered spans with bounded coalescing, preserving final roots under pressure. */
export class RunTraceSpanProcessor implements SpanProcessor {
  private readonly queue = new Map<string, QueuedWrite>();
  private readonly roots = new Map<string, QueuedWrite>();
  private queueBytes = 0;
  private pending: Promise<void> | null = null;
  private readonly failed = new Set<string>();
  private readonly diagnosticQueue = new Map<string, TraceIncompleteReason>();
  private diagnostic: Promise<void> | null = null;
  private readonly diagnosticWaiters = new Set<() => void>();
  private readonly eventIds = new WeakMap<object, string>();
  private readonly eventCounters = new WeakMap<ReadableSpan, number>();

  onStart(span: Span, _parent: Context): void {
    if (isRunTraceSuppressed()) { return; }
    const scope = getRunTraceScope();
    if (!scope || scope.traceId !== span.spanContext().traceId) { return; }
    if (scope?.traceId === span.spanContext().traceId) {
      scopes.set(span, scope);
      bindSpanRunTraceScope(span, scope);
      if (ROOT_NAMES.has(span.name) && !scopeRoots.has(scope)) { scopeRoots.set(scope, span.spanContext().spanId); }
    }
    this.capture(span, "span_started");
    const addEvent = span.addEvent.bind(span);
    span.addEvent = (...args: Parameters<ApiSpan["addEvent"]>) => {
      const result = addEvent(...args);
      this.capture(span, "span_event");
      return result;
    };
  }
  onEnd(span: ReadableSpan): void { this.capture(span, "span_ended"); }

  private capture(span: ReadableSpan, kind: RunTraceUpdate["kind"]): void {
    if (!store || isRunTraceSuppressed()) { return; }
    const scope = scopes.get(span);
    if (!scope) { return; }
    const record = spanToRecord(span);
    if (kind !== "span_ended") {
      record.end_time_ms = record.start_time_ms;
      record.duration_ms = 0;
    }
    if (this.failed.has(record.trace_id)) { record.attributes["nodetool.trace.incomplete"] = true; }
    if (span.droppedEventsCount > 0 || span.droppedAttributesCount > 0 || span.droppedLinksCount > 0) {
      record.attributes["nodetool.trace.truncated"] = true;
      record.attributes["nodetool.trace.dropped_events"] = span.droppedEventsCount;
      record.attributes["nodetool.trace.dropped_attributes"] = span.droppedAttributesCount;
      record.attributes["nodetool.trace.dropped_links"] = span.droppedLinksCount;
    }
    record.events = span.events.map((event, index) => {
      let id = this.eventIds.get(event);
      if (!id) {
        const counter = this.eventCounters.get(span) ?? 0;
        id = `${record.span_id}:${counter}`;
        this.eventCounters.set(span, counter + 1);
        this.eventIds.set(event, id);
      }
      return { ...record.events[index], id };
    });
    const isRoot = scope ? scopeRoots.get(scope) === record.span_id : ROOT_NAMES.has(record.name) && record.parent_span_id === null;
    const write: RunTraceWrite = {
      runId: scope.runId,
      userId: scope.userId,
      update: { kind, record },
      secretValues: scope?.secretValues ?? NO_SECRETS,
      contentSuppressed: scope.origin === "public" || scope.policy.contentSuppressed,
      isRoot
    };
    const key = `${record.trace_id}:${record.span_id}`;
    const bytes = JSON.stringify(record).length * 2;
    const previous = this.queue.get(key);
    if ((this.queue.size >= MAX_QUEUED_SPANS && !previous) || this.queueBytes - (previous?.bytes ?? 0) + bytes > MAX_QUEUE_BYTES) {
      this.flagIncomplete(record.trace_id, "queue_overflow");
      record.attributes["nodetool.trace.incomplete"] = true;
      if (isRoot && kind === "span_ended" && (this.roots.has(key) || this.roots.size < MAX_ROOT_RESERVATIONS)) {
        const sanitized = redactRecord(record, { secretValues: write.secretValues, public: scope.origin === "public", contentSuppressed: write.contentSuppressed });
        this.roots.set(key, { write: { ...write, update: { kind, record: splitTraceRecord(sanitized).record } }, bytes: 0 });
      }
    } else {
      this.queue.set(key, { write, bytes });
      this.queueBytes += bytes - (previous?.bytes ?? 0);
    }
    this.schedule();
  }

  private flagIncomplete(traceId: string, reason: TraceIncompleteReason): void {
    if (this.failed.has(traceId)) { return; }
    if (this.failed.size >= 1_000) { this.failed.clear(); }
    this.failed.add(traceId);
    if (this.diagnosticQueue.size < MAX_DIAGNOSTIC_BACKLOG) { this.diagnosticQueue.set(traceId, reason); }
    this.scheduleDiagnostic();
    if (typeof process !== "undefined") { process.stderr.write(`Run trace recording incomplete: ${reason}\n`); }
  }

  private scheduleDiagnostic(): void {
    if (this.diagnostic) { return; }
    const next = this.diagnosticQueue.entries().next().value;
    if (!next) {
      for (const done of this.diagnosticWaiters) { done(); }
      return;
    }
    const [traceId, reason] = next;
    this.diagnosticQueue.delete(traceId);
    this.diagnostic = Promise.resolve().then(() => withoutRunTrace(async () => {
      try { await store?.markIncomplete(traceId, reason); } catch { /* An unavailable store must not launch parallel diagnostics. */ }
    })).finally(() => { this.diagnostic = null; this.scheduleDiagnostic(); });
  }

  private flushDiagnostics(): Promise<void> {
    if (!this.diagnostic && this.diagnosticQueue.size === 0) { return Promise.resolve(); }
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); this.diagnosticWaiters.delete(done); resolve(); };
      const timer = setTimeout(done, DIAGNOSTIC_FLUSH_TIMEOUT_MS);
      this.diagnosticWaiters.add(done);
    });
  }

  private schedule(): void {
    if (this.pending) { return; }
    this.pending = Promise.resolve().then(() => this.drain()).finally(() => {
      this.pending = null;
      if (this.queue.size > 0 || this.roots.size > 0) { this.schedule(); }
    });
  }

  private async drain(): Promise<void> {
    while (this.queue.size > 0 || this.roots.size > 0) {
      const batch: RunTraceWrite[] = [];
      for (const collection of [this.queue, this.roots]) {
        for (const [key, queued] of collection) {
          collection.delete(key);
          if (collection === this.queue) { this.queueBytes -= queued.bytes; }
          batch.push(queued.write);
          if (batch.length >= 100) { break; }
        }
        if (batch.length >= 100) { break; }
      }
      try {
        await withoutRunTrace(async () => {
          const adapter = store;
          if (!adapter) { return; }
          const registrations = new Map<string, RunTraceRegistration | null>();
          const accepted: RunTraceWrite[] = [];
          for (const write of batch) {
            const traceId = write.update.record.trace_id;
            if (!registrations.has(traceId)) { registrations.set(traceId, await adapter.lookup(traceId)); }
            const registration = registrations.get(traceId);
            if (!registration || (write.userId && registration.user_id !== write.userId)) { continue; }
            // Redact the coalesced snapshot once, before storage or live publication.
            accepted.push({ ...write, runId: write.runId ?? registration.id, userId: registration.user_id, update: { ...write.update, record: redactRecord(write.update.record, { secretValues: write.secretValues, public: registration.origin === "public", contentSuppressed: write.contentSuppressed }) } });
          }
          if (accepted.length > 0) { await adapter.write(accepted); }
        });
      } catch {
        for (const traceId of new Set(batch.map((write) => write.update.record.trace_id))) { this.flagIncomplete(traceId, "store_failure"); }
      }
    }
  }
  async forceFlush(): Promise<void> {
    while (this.pending) { await this.pending; }
    await this.flushDiagnostics();
    await withoutRunTrace(async () => store?.flush());
  }
  shutdown(): Promise<void> { return this.forceFlush(); }
}

function serializeArgs(args: readonly unknown[]): string {
  return stringifyTraceContent(args);
}

/** Convert run log output to trace events and keep its external copy content-free. */
export function installRunTraceLogHook(): void {
  setLogHook((entry: LogEntry) => {
    const scope = getRunTraceScope();
    if (!scope) { return { message: entry.message, args: entry.args }; }
    recordTraceEvent("log", { "log.level": entry.level, "log.source": entry.source, "log.message": entry.message, "log.arguments": serializeArgs(entry.args) });
    const spanId = trace.getSpan(context.active())?.spanContext().spanId;
    if (safeProcessEnv()["NODETOOL_TRACE_INCLUDE_CONTENT"] === "1" && scope.origin !== "public" && !scope.policy.contentSuppressed) {
      return { message: sanitizeTraceContentText(entry.message, scope.secretValues), args: [serializeArgs(entry.args)] };
    }
    const metadata: Record<string, string> = { trace_id: scope.traceId, level: entry.level, source: redactTraceText(entry.source, scope.secretValues).slice(0, 200) };
    if (spanId) { metadata["span_id"] = spanId; }
    return { message: "Run log event", args: [metadata] };
  });
}
