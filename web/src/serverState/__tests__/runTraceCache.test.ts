import { QueryClient } from "@tanstack/react-query";
import type { GetRunTraceResult } from "@nodetool-ai/protocol";
import { advanceRunCursor, mergeRunTrace, projectTraceRecords, RUN_TRACE_CACHE_LIMIT } from "../runTraceCache";
import { makeRecord, makeTrace, makeUpdate } from "../../__fixtures__/runTrace";

describe("durable run cache projection", () => {
  it("merges starts, events and ends by span identity rather than duplicating rows", () => {
    const root = makeRecord();
    let snapshot = mergeRunTrace(makeTrace(), makeUpdate(1));
    const ended = { ...makeRecord(2, root.span_id), status: { code: "ERROR" as const }, events: [{ id: "event-1", name: "log", time_ms: 3, attributes: { "log.message": "failed" } }] };
    snapshot = mergeRunTrace(snapshot, makeUpdate(2, snapshot.run.id, ended));
    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.nodes[1]).toMatchObject({ depth: 1, record: { status: { code: "ERROR" }, events: [{ id: "event-1" }] } });
    expect(makeTrace().nodes).toHaveLength(1);
  });

  it("does not mix two concurrent runs or mismatched trace IDs", () => {
    const client = new QueryClient();
    const a = makeTrace();
    const b = makeTrace("d".repeat(32));
    client.setQueryData(["runs", a.run.id], a);
    client.setQueryData(["runs", b.run.id], b);
    client.setQueryData<GetRunTraceResult>(["runs", a.run.id], (current) => current && mergeRunTrace(current, makeUpdate(1, b.run.id)));
    expect(client.getQueryData(["runs", a.run.id])).toBe(a);
    expect(mergeRunTrace(a, { ...makeUpdate(), record: { ...makeRecord(2), trace_id: "e".repeat(32) } })).toBe(a);
    client.clear();
  });

  it("recognizes duplicate cursors, delivery gaps and explicit coalescing", () => {
    const previous = { cursor: 4, needsSnapshot: false };
    expect(advanceRunCursor(previous, 4)).toBe(previous);
    expect(advanceRunCursor(previous, 5)).toEqual({ cursor: 5, needsSnapshot: false });
    expect(advanceRunCursor(previous, 7).needsSnapshot).toBe(true);
    expect(advanceRunCursor(previous, 5, true).needsSnapshot).toBe(true);
  });

  it("reparents out-of-order children and bounds cycles on a large trace", () => {
    const root = makeRecord();
    const child = makeRecord(2, root.span_id);
    const result = projectTraceRecords([child, root]);
    expect(result.map((node) => [node.record.span_id, node.depth])).toEqual([[root.span_id, 0], [child.span_id, 1]]);
    const cyclic = Array.from({ length: 2000 }, (_, index) => makeRecord(index + 1, ((index + 1) % 2000 + 1).toString(16).padStart(16, "0")));
    expect(projectTraceRecords(cyclic)).toHaveLength(2000);
  });

  it("caps new spans but lets existing spans finish and reports privacy/retention flags", () => {
    const snapshot = makeTrace();
    snapshot.nodes = Array.from({ length: RUN_TRACE_CACHE_LIMIT }, (_, index) => ({ record: makeRecord(index + 1), depth: 0 }));
    const capped = mergeRunTrace(snapshot, makeUpdate(1, snapshot.run.id, makeRecord(RUN_TRACE_CACHE_LIMIT + 1)));
    expect(capped.nodes).toHaveLength(RUN_TRACE_CACHE_LIMIT);
    expect(capped.limited).toBe(true);
    const ended = mergeRunTrace(capped, { ...makeUpdate(2, snapshot.run.id, { ...makeRecord(), status: { code: "ERROR" } }), content_expired: true, truncated: true, incomplete: true });
    expect(ended.nodes.find((node) => node.record.span_id === makeRecord().span_id)?.record.status.code).toBe("ERROR");
    expect(ended).toMatchObject({ content_state: "expired", content_expired: true, truncated: true, incomplete: true });
  });

  it("reloads to the same identity tree as the live projection", () => {
    const live = mergeRunTrace(makeTrace(), makeUpdate());
    const stored = { ...makeTrace(), nodes: projectTraceRecords([makeRecord(), makeUpdate().record]) };
    expect(live.nodes).toEqual(stored.nodes);
  });
});
