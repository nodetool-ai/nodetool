import { BrowserRunTrace, traceValuePreview } from "../browserRunTrace";
import type { TraceRecord } from "@nodetool-ai/protocol";

function fixture() {
  const records: TraceRecord[] = [];
  const send = jest.fn(async (_run: string, batch: TraceRecord[]) => { records.push(...batch); });
  const trace = new BrowserRunTrace({
    runId: "1".repeat(32), traceId: "2".repeat(32), operationId: "main", instanceId: "3".repeat(32), send
  });
  return { trace, records, send };
}

afterEach(() => jest.restoreAllMocks());

test("records one invocation tree with explicit async parents and W3C ancestry", async () => {
  const { trace, records } = fixture();
  const resolve = trace.startSpan("ui.resolve_params");
  const workflow = trace.startSpan("workflow.run", {}, "a".repeat(16));
  const first = trace.startSpan("node.process", { "node.id": "first" }, workflow.spanId);
  const second = trace.startSpan("node.process", { "node.id": "second" }, workflow.spanId);
  second.end(); first.end(); workflow.end(); resolve.end();
  await trace.finish();
  expect(trace.traceparent).toBe(`00-${"2".repeat(32)}-${trace.action.spanId}-01`);
  expect(new Set(records.map((record) => record.span_id)).size).toBe(5);
  expect(records.filter((record) => record.name === "node.process").map((record) => record.parent_span_id)).toEqual([workflow.spanId, workflow.spanId]);
  expect(records.every((record) => record.trace_id === "2".repeat(32) && record.resource["nodetool.trace.source"] === "browser")).toBe(true);
  expect(records.find((record) => record.name === "ui.action")?.parent_span_id).toBeNull();
  trace.dispose();
});

test("retries identical span/event identities and drains concurrent writes", async () => {
  const { trace, send, records } = fixture();
  send.mockRejectedValueOnce(new Error("offline"));
  const span = trace.startSpan("ui.fold");
  span.event("ui.fold", { "ui.resolved.value": "hello" }); span.end();
  await trace.finish();
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0][1]).toEqual(send.mock.calls[1][1]);
  expect(records.flatMap((record) => record.events)).toHaveLength(1);
  await trace.finish();
  expect(send).toHaveBeenCalledTimes(2);
  trace.dispose();
});

test("reports lost batches, bounds the queue, and closes invocation-local spans", async () => {
  const lost = jest.fn();
  const send = jest.fn(async () => { throw new Error("offline"); });
  const trace = new BrowserRunTrace({ runId: "4".repeat(32), traceId: "5".repeat(32), operationId: "main", instanceId: "6".repeat(32), send, onLostBatch: lost });
  const span = trace.startSpan("ui.resolve_params");
  span.end();
  await trace.finish(new TypeError("bad binding"));
  expect(send).toHaveBeenCalledTimes(3);
  expect(lost).toHaveBeenCalled();
  trace.dispose();
  trace.startSpan("ui.fold").end();
  await trace.flush();
  expect(send).toHaveBeenCalledTimes(3);
});

test("isolates simultaneous operations and records a widget failure under its producing run", async () => {
  const first = fixture();
  const second = fixture();
  const id = first.trace.recordWidgetError(new TypeError("render failed"), "Output-1");
  await Promise.all([first.trace.finish(), second.trace.finish()]);
  expect(first.records.find((record) => record.span_id === id)?.status.code).toBe("ERROR");
  expect(first.records.find((record) => record.span_id === id)?.parent_span_id).toBe(first.trace.action.spanId);
  expect(second.records).toHaveLength(1);
  first.trace.dispose(); second.trace.dispose();
});

test("previews omit media bytes and bound cyclic and large parameter values", () => {
  const cyclic: Record<string, unknown> = { media: new Uint8Array([239, 240, 241]), data: "opaque bytes", text: "x".repeat(30_000) };
  cyclic.self = cyclic;
  const preview = traceValuePreview(cyclic);
  expect(preview.length).toBeLessThanOrEqual(2_000);
  expect(preview).toContain("[media omitted]");
  expect(preview).not.toContain("239");
  expect(traceValuePreview("data:image/png;base64,abc")).toBe('"[media omitted]"');
});

test("holds parameter content until host credentials are resolved, while metadata streams", async () => {
  const { trace, records } = fixture();
  const params = trace.startSpan("ui.resolve_params");
  params.event("ui.resolve_params", { "ui.resolved.value": "private-input" });
  params.end();
  trace.startSpan("node.process").end();
  await trace.flush();
  expect(records.map((record) => record.name)).toEqual(["node.process"]);
  await trace.finish();
  expect(records.find((record) => record.name === "ui.resolve_params")?.events[0].attributes?.["ui.resolved.value"]).toBe("private-input");
  trace.dispose();
});

test("persists loss on the action sent after a permanently failed earlier batch", async () => {
  const { trace, records, send } = fixture();
  for (let attempt = 0; attempt < 3; attempt++) { send.mockRejectedValueOnce(new Error("Lost first batch")); }
  for (let span = 0; span < 65; span++) { trace.startSpan("node.process").end(); }
  await trace.finish();
  expect(records).toHaveLength(34);
  expect(records.find((record) => record.name === "ui.action")?.attributes).toMatchObject({
    "nodetool.trace.incomplete": true, "nodetool.trace.dropped_browser_spans": 32
  });
  expect(send.mock.calls[0][1]).toEqual(send.mock.calls[1][1]);
  expect(send.mock.calls[1][1]).toEqual(send.mock.calls[2][1]);
  trace.dispose();
});

test("teardown closes metadata without releasing held values or error content", async () => {
  const { trace, records, send } = fixture();
  const params = trace.startSpan("ui.resolve_params");
  params.event("ui.resolve_params", { "ui.resolved.value": "private-unresolved-key" });
  const active = trace.startSpan("node.process", { "node.id": "active" });
  await trace.closeMetadata(new Error("private-unresolved-key"));
  expect(records.map((record) => record.name)).toEqual(["ui.resolve_params", "node.process", "ui.action"]);
  expect(records.find((record) => record.span_id === active.spanId)?.status.code).toBe("ERROR");
  expect(JSON.stringify(records)).not.toContain("private-unresolved-key");
  expect(trace.isFinished).toBe(false);
  trace.recordWidgetError(new Error("late"), "output");
  await trace.flush();
  expect(send).toHaveBeenCalledTimes(1);
});

test("holds error messages until terminal execution, including a finish during an empty metadata flush", async () => {
  const { trace, records } = fixture();
  trace.recordWidgetError(new Error("unresolved-private-key"), "output");
  const pending = trace.flush();
  const terminal = trace.finish();
  await Promise.all([pending, terminal]);
  expect(records.find((record) => record.name === "ui.widget_error")?.status.message).toBe("unresolved-private-key");
  expect(records.find((record) => record.name === "ui.action")).toBeDefined();
  trace.dispose();
});
