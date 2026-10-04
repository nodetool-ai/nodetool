import { describe, expect, it } from "vitest";
import { runTraceUpdateSchema, traceRecordSchema, type TraceRecord } from "../src/run-trace.js";

const record: TraceRecord = {
  trace_id: "a".repeat(32),
  span_id: "b".repeat(16),
  parent_span_id: null,
  name: "app.run",
  kind: "INTERNAL",
  start_time_ms: 100,
  end_time_ms: 110,
  duration_ms: 10,
  status: { code: "OK" },
  attributes: { "app.inputs": { prompt: "A drawing" } },
  events: [{ id: "event-1", name: "log", time_ms: 101, attributes: { "log.message": "Started" } }],
  resource: { "service.name": "nodetool" }
};

describe("run trace protocol", () => {
  it("preserves full OpenTelemetry ids and stable event identity in live records", () => {
    expect(runTraceUpdateSchema.parse({ kind: "span_ended", record })).toEqual({ kind: "span_ended", record });
  });

  it("refuses shortened trace and span ids and negative durations", () => {
    expect(traceRecordSchema.safeParse({ ...record, trace_id: record.trace_id.slice(0, 12) }).success).toBe(false);
    expect(traceRecordSchema.safeParse({ ...record, span_id: record.span_id.slice(0, 12) }).success).toBe(false);
    expect(traceRecordSchema.safeParse({ ...record, duration_ms: -1 }).success).toBe(false);
  });
});
