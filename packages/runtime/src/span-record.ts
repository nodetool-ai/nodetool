import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { TraceRecord } from "@nodetool-ai/protocol";

/**
 * Stable, analyzer-friendly JSON shape derived from a {@link ReadableSpan}.
 *
 * `start_time_ms` / `end_time_ms` are unix-epoch milliseconds; `duration_ms`
 * is end−start. Timestamps are ms (not ns) because that's what every
 * downstream consumer (logs, dashboards, LLMs) actually uses.
 */
const SPAN_KINDS = ["INTERNAL", "SERVER", "CLIENT", "PRODUCER", "CONSUMER"] as const;
const STATUS_CODES = ["UNSET", "OK", "ERROR"] as const;

/**
 * Convert an OTel hrTime ([seconds, nanoseconds]) to integer unix-epoch ms.
 *
 * We round (rather than truncate) so a 0.6ms span doesn't read as 0ms, and
 * we keep the schema integer-typed for downstream JSONL consumers that
 * assume `start_time_ms`/`end_time_ms`/`duration_ms` are whole numbers.
 */
function hrTimeToMs(hrTime: [number, number]): number {
  return Math.round(hrTime[0] * 1000 + hrTime[1] / 1_000_000);
}

export function spanToRecord(span: ReadableSpan): TraceRecord {
  const ctx = span.spanContext();
  const startMs = hrTimeToMs(span.startTime);
  const endMs = hrTimeToMs(span.endTime);
  const statusCode = { code: STATUS_CODES[span.status.code] ?? "UNSET" };
  const status = span.status.message
    ? { ...statusCode, message: span.status.message }
    : statusCode;
  return {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    parent_span_id: span.parentSpanContext?.spanId ?? null,
    name: span.name,
    kind: SPAN_KINDS[span.kind] ?? "INTERNAL",
    start_time_ms: startMs,
    end_time_ms: endMs,
    duration_ms: endMs - startMs,
    status,
    attributes: { ...span.attributes },
    events: span.events.map((e) => {
      const event = { name: e.name, time_ms: hrTimeToMs(e.time) };
      return e.attributes
        ? { ...event, attributes: { ...e.attributes } }
        : event;
    }),
    resource: { ...span.resource.attributes }
  };
}
