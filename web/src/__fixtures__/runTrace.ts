import type { GetRunTraceResult, StoredRunTraceUpdate, TraceRecord } from "@nodetool-ai/protocol";

export function makeRecord(index = 1, parent: string | null = null): TraceRecord {
  return { trace_id: "a".repeat(32), span_id: index.toString(16).padStart(16, "0"), parent_span_id: parent,
    name: index === 1 ? "app.run" : "script.run", kind: "INTERNAL", start_time_ms: index, end_time_ms: index + 2, duration_ms: 2,
    status: { code: "OK" }, attributes: {}, resource: {}, events: [] };
}
export function makeTrace(runId = "b".repeat(32)): GetRunTraceResult {
  return { run: { id: runId, user_id: "owner", kind: "app", source_id: "c".repeat(32), trace_id: "a".repeat(32),
    parent_run_id: null, root_span_id: makeRecord().span_id, origin: "ui", status: "running", started_at: "2026-10-04T12:00:00Z",
    ended_at: null, cost_usd: 0, error: null, content_expired: 0, truncated: 0, incomplete: 0, parents: [], parents_limited: false },
    nodes: [{ record: makeRecord(), depth: 0 }], content_state: "available", content_expired: false, truncated: false, incomplete: false, limited: false, next_cursor: null };
}
export function makeUpdate(cursor = 1, runId = "b".repeat(32), record = makeRecord(2, makeRecord().span_id)): StoredRunTraceUpdate {
  return { kind: "span_ended", run_id: runId, cursor, record, content_expired: false, truncated: false, incomplete: false };
}
