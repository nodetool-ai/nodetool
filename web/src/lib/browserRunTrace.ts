import { splitTraceRecord, type TraceRecord } from "@nodetool-ai/protocol";
import { restFetch } from "./rest-fetch";

const MAX_QUEUED_SPANS = 2_000;
const MAX_BATCH_SPANS = 32;
const MAX_BATCH_BYTES = 128_000;
const MAX_EVENTS = 128;
const MAX_PREVIEW_LENGTH = 2_000;

export interface BrowserSpan {
  readonly spanId: string;
  event: (name: string, attributes?: Record<string, unknown>) => void;
  end: (error?: unknown) => void;
}

export interface BrowserRunTraceOptions {
  runId: string;
  traceId: string;
  operationId: string;
  instanceId: string;
  widgetId?: string;
  send?: (runId: string, records: TraceRecord[], signal: AbortSignal) => Promise<void>;
  onLostBatch?: () => void;
}

function spanId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  if (bytes.every((byte) => byte === 0)) { bytes[0] = 1; }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function carriesContent(record: TraceRecord): boolean {
  return splitTraceRecord(record).content !== null;
}

/** Bound previews before buffering. Media travels as references, never byte arrays. */
export function traceValuePreview(value: unknown): string {
  const seen = new WeakSet<object>();
  let remaining = MAX_PREVIEW_LENGTH;
  const trim = (candidate: unknown, depth: number): unknown => {
    if (remaining <= 0 || depth > 5) { return "[truncated]"; }
    if (typeof candidate === "string") {
      if (/^(?:data:|blob:)/i.test(candidate)) { return "[media omitted]"; }
      const text = candidate.slice(0, remaining);
      remaining -= text.length;
      return text;
    }
    if (candidate instanceof ArrayBuffer || ArrayBuffer.isView(candidate)) { return "[media omitted]"; }
    if (candidate === null || typeof candidate !== "object") {
      remaining -= 16;
      return typeof candidate === "function" || typeof candidate === "bigint" ? "[omitted]" : candidate;
    }
    if (seen.has(candidate)) { return "[cycle]"; }
    seen.add(candidate);
    if (Array.isArray(candidate)) { return candidate.slice(0, 20).map((item) => trim(item, depth + 1)); }
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(candidate).slice(0, 20)) {
      if (key === "data" || key === "base64") { result[key] = "[media omitted]"; }
      else { result[key.slice(0, 100)] = trim(item, depth + 1); }
    }
    return result;
  };
  return (JSON.stringify(trim(value, 0)) ?? "null").slice(0, MAX_PREVIEW_LENGTH);
}

async function sendSpans(runId: string, records: TraceRecord[], signal: AbortSignal): Promise<void> {
  const response = await restFetch(`/api/runs/${encodeURIComponent(runId)}/spans`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ records }), signal
  });
  if (!response.ok) { throw new Error(`Browser trace write failed (${response.status})`); }
}

/** Invocation-local recorder. Parents are explicit, including across concurrent awaits. */
export class BrowserRunTrace {
  readonly action: BrowserSpan;
  private readonly controller = new AbortController();
  private readonly queue: TraceRecord[] = [];
  private readonly active = new Set<BrowserSpan>();
  private flushing: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private finished = false;
  private metadataOnly = false;
  private closed = false;
  private dropped = 0;
  private spanCount = 0;

  constructor(readonly options: BrowserRunTraceOptions) {
    const attributes: Record<string, unknown> = {
      "app.run_id": options.runId, "app.instance_id": options.instanceId,
      "app.operation_id": options.operationId
    };
    if (options.widgetId) { attributes["ui.widget.id"] = options.widgetId; }
    this.action = this.startSpan("ui.action", attributes, null);
  }

  get traceparent(): string { return `00-${this.options.traceId}-${this.action.spanId}-01`; }
  get isFinished(): boolean { return this.finished; }

  startSpan(name: string, attributes: Record<string, unknown> = {}, parentSpanId: string | null = this.action.spanId): BrowserSpan {
    const id = spanId();
    if (this.closed || this.spanCount >= MAX_QUEUED_SPANS) {
      if (!this.closed) { this.lose(); }
      return { spanId: id, event: () => {}, end: () => {} };
    }
    this.spanCount += 1;
    const start = Date.now();
    const events: TraceRecord["events"] = [];
    let ended = false;
    const span: BrowserSpan = {
      spanId: id,
      event: (eventName, eventAttributes = {}) => {
        if (ended || this.closed) { return; }
        if (events.length >= MAX_EVENTS) { this.lose(); return; }
        events.push({ id: `${id}:${events.length}`, name: eventName, time_ms: Date.now(), attributes: eventAttributes });
      },
      end: (error) => {
        if (ended) { return; }
        ended = true;
        this.active.delete(span);
        if (this.closed) { return; }
        const end = Math.max(start, Date.now());
        const recordedAttributes = { ...attributes };
        if (error instanceof Error) { recordedAttributes["error.type"] = error.name; }
        const record: TraceRecord = {
          trace_id: this.options.traceId, span_id: id, parent_span_id: parentSpanId,
          name, kind: "INTERNAL", start_time_ms: start, end_time_ms: end, duration_ms: end - start,
          status: error === undefined ? { code: "OK" } : { code: "ERROR", message: error instanceof Error ? error.message.slice(0, MAX_PREVIEW_LENGTH) : "Browser operation failed" },
          attributes: recordedAttributes,
          events, resource: { "nodetool.trace.source": "browser" }
        };
        if (this.queue.length >= MAX_QUEUED_SPANS) { this.lose(); return; }
        this.queue.push(record);
        if (!this.timer) {
          this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, 100);
        }
      }
    };
    this.active.add(span);
    return span;
  }

  recordWidgetError(error: unknown, component: string): string {
    const span = this.startSpan("ui.widget_error", { "ui.component": component.slice(0, 200) });
    span.end(error);
    return span.spanId;
  }

  async finish(error?: unknown): Promise<void> {
    if (!this.finished) {
      this.finished = true;
      for (const span of [...this.active]) {
        if (span !== this.action) { span.end(error); }
      }
      this.action.end(error);
    }
    await this.flush();
    if (this.queue.length > 0) { await this.flush(); }
  }

  /** Teardown never implies that the host has finished resolving run secrets. */
  async closeMetadata(error?: unknown): Promise<void> {
    this.metadataOnly = true;
    for (const span of [...this.active]) {
      if (span !== this.action) { span.end(error); }
    }
    this.action.end(error);
    try {
      await this.flush();
      if (this.queue.length > 0) { await this.flush(); }
    } finally { this.dispose(); }
  }

  flush(): Promise<void> {
    if (this.flushing) { return this.flushing; }
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.flushing = this.drain().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  dispose(): void {
    this.closed = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.controller.abort();
    this.queue.length = 0;
    this.active.clear();
  }

  private lose(count = 1): void {
    this.dropped += count;
    this.options.onLostBatch?.();
  }

  private async drain(): Promise<void> {
    const send = this.options.send ?? sendSpans;
    while (!this.closed && this.queue.length > 0) {
      // The host resolves credentials during execution. Keep content until its
      // complete secret set is available, while metadata can stream immediately.
      const available = this.metadataOnly ? this.queue.splice(0).map((record) => splitTraceRecord(record).record)
        : this.finished ? this.queue.splice(0) : this.queue.filter((record) => !carriesContent(record));
      if (!this.finished && !this.metadataOnly) {
        const pending = this.queue.filter(carriesContent);
        this.queue.length = 0;
        this.queue.push(...pending);
      }
      if (available.length === 0) { return; }
      while (!this.closed && available.length > 0) {
      const batch: TraceRecord[] = [];
      let bytes = 16;
      while (batch.length < MAX_BATCH_SPANS && available.length > 0) {
        const pendingRecord = available[0];
        let record = pendingRecord;
        if (record.name === "ui.action" && this.dropped > 0) {
          record = { ...record, attributes: { ...record.attributes,
            "nodetool.trace.incomplete": true, "nodetool.trace.dropped_browser_spans": this.dropped } };
        }
        const size = new TextEncoder().encode(JSON.stringify(record)).length;
        if (size > MAX_BATCH_BYTES) { available.shift(); this.lose(); continue; }
        if (batch.length > 0 && bytes + size > MAX_BATCH_BYTES) { break; }
        available.shift(); batch.push(record); bytes += size;
      }
      if (batch.length === 0) { continue; }
      let sent = false;
      for (let attempt = 0; attempt < 3 && !this.closed; attempt += 1) {
        try { await send(this.options.runId, batch, AbortSignal.any([this.controller.signal, AbortSignal.timeout(10_000)])); sent = true; break; }
        catch { /* The same immutable ids make retry safe. */ }
      }
      if (!sent && !this.closed) { this.lose(batch.length); }
      }
    }
  }
}
