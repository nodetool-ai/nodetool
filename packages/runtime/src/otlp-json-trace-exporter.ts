import type { Attributes, HrTime } from "@opentelemetry/api";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

type AnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number | string }
  | { bytesValue: string }
  | { arrayValue: { values: AnyValue[] } }
  | { kvlistValue: { values: KeyValue[] } }
  | Record<string, never>;
interface KeyValue { key: string; value: AnyValue }

function anyValue(value: unknown): AnyValue {
  if (typeof value === "string") { return { stringValue: value }; }
  if (typeof value === "boolean") { return { boolValue: value }; }
  if (typeof value === "number") {
    if (Number.isInteger(value)) { return { intValue: BigInt(value).toString() }; }
    return { doubleValue: Number.isFinite(value) ? value : Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity" };
  }
  if (value instanceof Uint8Array) { return { bytesValue: Buffer.from(value).toString("base64") }; }
  if (Array.isArray(value)) { return { arrayValue: { values: value.map(anyValue) } }; }
  if (typeof value === "object" && value !== null) {
    return { kvlistValue: { values: Object.entries(value).filter(([, item]) => item != null).map(([key, item]) => ({ key, value: anyValue(item) })) } };
  }
  // Null entries in SDK attribute arrays represent an empty AnyValue.
  return {};
}

function attributes(values: Attributes | undefined): KeyValue[] {
  return Object.entries(values ?? {}).filter(([, value]) => value != null).map(([key, value]) => ({ key, value: anyValue(value) }));
}

function unixNano(time: HrTime): string {
  return (BigInt(time[0]) * 1_000_000_000n + BigInt(time[1])).toString();
}

function flags(traceFlags: number, isRemote?: boolean): number {
  return (traceFlags & 0xff) | 0x100 | (isRemote ? 0x200 : 0);
}

function encodeSpan(span: ReadableSpan) {
  const ctx = span.spanContext();
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: span.parentSpanContext?.spanId,
    traceState: ctx.traceState?.serialize(),
    name: span.name,
    kind: span.kind + 1,
    startTimeUnixNano: unixNano(span.startTime),
    endTimeUnixNano: unixNano(span.endTime),
    attributes: attributes(span.attributes),
    droppedAttributesCount: span.droppedAttributesCount,
    events: span.events.map((event) => ({
      name: event.name, timeUnixNano: unixNano(event.time),
      attributes: attributes(event.attributes), droppedAttributesCount: event.droppedAttributesCount ?? 0
    })),
    droppedEventsCount: span.droppedEventsCount,
    links: span.links.map((link) => ({
      traceId: link.context.traceId, spanId: link.context.spanId,
      traceState: link.context.traceState?.serialize(), attributes: attributes(link.attributes),
      droppedAttributesCount: link.droppedAttributesCount ?? 0,
      flags: flags(link.context.traceFlags, link.context.isRemote)
    })),
    droppedLinksCount: span.droppedLinksCount,
    status: span.status,
    flags: flags(ctx.traceFlags, span.parentSpanContext?.isRemote)
  };
}

/** OTLP JSON uses hex IDs, decimal strings for 64-bit integers, and numeric enums. */
export function encodeOtlpTraces(spans: readonly ReadableSpan[]) {
  const resources = new Map<ReadableSpan["resource"], Map<string, ReadableSpan[]>>();
  for (const span of spans) {
    let scopes = resources.get(span.resource);
    if (!scopes) { scopes = new Map(); resources.set(span.resource, scopes); }
    const key = JSON.stringify(span.instrumentationScope);
    let group = scopes.get(key);
    if (!group) { group = []; scopes.set(key, group); }
    group.push(span);
  }
  return { resourceSpans: [...resources].map(([resource, scopes]) => ({
    resource: { attributes: attributes(resource.attributes), droppedAttributesCount: 0 },
    schemaUrl: resource.schemaUrl,
    scopeSpans: [...scopes.values()].map((group) => {
      const scope = group[0]?.instrumentationScope;
      return {
        scope: { name: scope?.name, version: scope?.version },
        schemaUrl: scope?.schemaUrl,
        spans: group.map(encodeSpan)
      };
    })
  })) };
}

export interface OtlpExporterConfig {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

export function otlpExporterConfigFromEnv(env: NodeJS.ProcessEnv): OtlpExporterConfig | null {
  const key = env["TRACELOOP_API_KEY"];
  const base = env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  const traces = env["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"];
  if (!key && !base && !traces) { return null; }
  const headers: Record<string, string> = {};
  for (const entry of (env["OTEL_EXPORTER_OTLP_HEADERS"] ?? "").split(",")) {
    const separator = entry.indexOf("=");
    if (separator < 1) { continue; }
    const name = entry.slice(0, separator).trim().toLowerCase();
    if (name) { headers[name] = decodeURIComponent(entry.slice(separator + 1).trim()); }
  }
  if (key) { headers["authorization"] = `Bearer ${key}`; }
  return {
    url: traces || (base ? `${base.replace(/\/+$/, "")}/v1/traces` : "https://api.traceloop.com/v1/traces"),
    headers
  };
}

export class OtlpJsonTraceExporter implements SpanExporter {
  private readonly pending = new Set<Promise<void>>();
  private stopped = false;

  constructor(private readonly config: OtlpExporterConfig, private readonly send: typeof fetch = fetch) {}

  export(spans: ReadableSpan[], callback: (result: ExportResult) => void): void {
    if (this.stopped) { callback({ code: ExportResultCode.FAILED, error: new Error("Trace exporter is shut down") }); return; }
    const pending = this.post(spans).then(
      () => callback({ code: ExportResultCode.SUCCESS }),
      (error: unknown) => callback({ code: ExportResultCode.FAILED, error: error instanceof Error ? error : new Error(String(error)) })
    );
    this.pending.add(pending);
    void pending.finally(() => this.pending.delete(pending));
  }

  private async post(spans: readonly ReadableSpan[]): Promise<void> {
    await Promise.all(spans.map((span) => span.resource.waitForAsyncAttributes?.()));
    // The endpoint is operator-configured, not a caller URL, so safeFetch is unnecessary.
    const response = await this.send(this.config.url, {
      method: "POST", headers: { ...this.config.headers, "content-type": "application/json" },
      body: JSON.stringify(encodeOtlpTraces(spans)), signal: AbortSignal.timeout(10_000), redirect: "error"
    });
    await response.body?.cancel();
    if (!response.ok) { throw new Error(`OTLP trace export failed with HTTP ${response.status}`); }
  }

  async shutdown(): Promise<void> {
    this.stopped = true;
    await Promise.all(this.pending);
  }
}
