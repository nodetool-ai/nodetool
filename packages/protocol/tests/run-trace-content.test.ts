import { describe, expect, it } from "vitest";
import { splitTraceRecord, recombineTraceRecord, type TraceRecord } from "../src/run-trace.js";

const record: TraceRecord = {
  trace_id: "a".repeat(32), span_id: "b".repeat(16), parent_span_id: null,
  name: "custom private prompt", kind: "INTERNAL", start_time_ms: 1, end_time_ms: 2,
  duration_ms: 1, status: { code: "ERROR", message: "private failure" },
  attributes: { "llm.provider": "test", "llm.response.content": "private answer", "new.unknown.key": "private extra" },
  resource: { "service.name": "nodetool", "host.name": "private hostname" },
  events: [{ id: "b:0", name: "private event name", time_ms: 1, attributes: { "log.level": "error", "log.message": "private message" } }]
};

describe("run trace content classifier", () => {
  it("separates all undeclared values and names before external copies", () => {
    const split = splitTraceRecord(record);
    expect(JSON.stringify(split.record)).not.toContain("private");
    expect(split.record.name).toBe("content.span");
    expect(split.record.events[0].name).toBe("content.event");
    expect(split.record.attributes).toEqual({ "llm.provider": "test" });
    expect(split.content?.attributes?.["new.unknown.key"]).toBe("private extra");
    expect(recombineTraceRecord(split.record, split.content)).toEqual(record);
  });

  it("does not recover content after metadata is split again", () => {
    const metadata = splitTraceRecord(record).record;
    expect(splitTraceRecord(metadata).content).toBeNull();
    expect(recombineTraceRecord(metadata, null)).toEqual(metadata);
  });

  it("classifies nested, mixed and nonfinite values as content even under known metadata keys", () => {
    const split = splitTraceRecord({ ...record, name: "app.run", attributes: { "llm.provider": { body: "private nested data" }, "gen_ai.usage.cost_usd": Infinity, "tool.argument_names": ["arg", { body: "private mixed data" }] }, resource: { "service.name": { body: "private resource data" } }, events: [{ id: "event", name: "log", time_ms: 1, attributes: { "log.source": { body: "private event data" } } }] });
    expect(split.record.attributes).toEqual({});
    expect(split.record.resource).toEqual({});
    expect(JSON.stringify(split.record)).not.toContain("private");
    expect(split.content?.attributes?.["llm.provider"]).toEqual({ body: "private nested data" });
    expect(splitTraceRecord({ ...record, attributes: { "tool.argument_names": ["prompt", "size"] } }).record.attributes["tool.argument_names"]).toEqual(["prompt", "size"]);
  });
});
