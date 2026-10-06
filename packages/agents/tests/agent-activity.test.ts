import { expect, it, vi } from "vitest";
import { ProcessingContext, recordTraceEvent } from "@nodetool-ai/runtime";
import { splitTraceRecord, type TraceRecord } from "@nodetool-ai/protocol";
import { agentActivityReporter } from "../src/capabilities/agent-activity.js";

vi.mock("@nodetool-ai/runtime", async (original) => ({ ...await original<typeof import("@nodetool-ai/runtime")>(), recordTraceEvent: vi.fn() }));

it("records distinct stable reporter identities for same-node loops with reused tool ids", () => {
  const context = new ProcessingContext({ userId: "owner", jobId: "job", runTraceContext: {
    runId: "a".repeat(32), traceId: "b".repeat(32), userId: "owner", origin: "ui", secretValues: new Set(), policy: { contentSuppressed: false }
  } });
  const a = agentActivityReporter(context, "same-node");
  const b = agentActivityReporter(context, "same-node");
  const call = { id: "same-call", name: "tool", args: {} };
  a.event(call); b.event(call); a.toolResult(call, "result A", false); b.toolResult(call, "result B", false);
  const attrs = vi.mocked(recordTraceEvent).mock.calls.map((call) => call[1]);
  expect(attrs).toHaveLength(4);
  expect(attrs[0]?.["agent.activity_id"]).toBe(attrs[2]?.["agent.activity_id"]);
  expect(attrs[1]?.["agent.activity_id"]).toBe(attrs[3]?.["agent.activity_id"]);
  expect(attrs[0]?.["agent.activity_id"]).not.toBe(attrs[1]?.["agent.activity_id"]);
  const record: TraceRecord = { trace_id: "b".repeat(32), span_id: "c".repeat(16), parent_span_id: null,
    name: "agent.loop", kind: "INTERNAL", start_time_ms: 1, end_time_ms: 2, duration_ms: 1,
    status: { code: "OK" }, attributes: {}, resource: {}, events: [{ name: "agent.activity", time_ms: 1, attributes: attrs[0] }] };
  expect(splitTraceRecord(record).record.events[0]?.attributes?.["agent.activity_id"]).toBe(attrs[0]?.["agent.activity_id"]);
});
