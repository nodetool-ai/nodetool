import { describe, expect, it } from "vitest";
import type { TraceRecord } from "@nodetool-ai/protocol";
import { sanitizeRunTraceRecord } from "../src/run-trace.js";

function record(attributes: Record<string, unknown>): TraceRecord {
  return { trace_id: "a".repeat(32), span_id: "1234567890abcdef", parent_span_id: null, name: "workflow.run", kind: "INTERNAL",
    start_time_ms: 1, end_time_ms: 5, duration_ms: 4, status: { code: "OK" }, attributes, events: [], resource: {} };
}
const clean = (attributes: Record<string, unknown>) => sanitizeRunTraceRecord(record(attributes), { contentSuppressed: false }).attributes;

describe("sanitizeRunTraceRecord value handling", () => {
  it("redacts secret-named attribute keys and nested object keys", () => {
    const out = clean({ "llm.request.messages": { Authorization: "Bearer x", api_key: "k", "access-token": "t", nested: { password: "p", ok: "fine" } } });
    expect(out["llm.request.messages"]).toEqual({
      Authorization: "[REDACTED:secret]", api_key: "[REDACTED:secret]", "access-token": "[REDACTED:secret]",
      nested: { password: "[REDACTED:secret]", ok: "fine" }
    });
  });
  it("redacts a secret-named top-level attribute key", () => {
    expect(clean({ cookie: "abc", "llm.provider": "test" })).toMatchObject({ "llm.provider": "test" });
    expect(clean({ cookie: "abc" }).cookie).toBe("[REDACTED:secret]");
  });
  it("normalizes numbers, booleans, null and unsupported values", () => {
    const out = clean({ "llm.request.messages": [1, Number.NaN, Infinity, true, null, undefined, () => 1] });
    expect(out["llm.request.messages"]).toEqual([1, null, null, true, null, null, null]);
  });
  it("omits binary buffers and typed arrays", () => {
    const out = clean({ "llm.request.messages": [new Uint8Array([1, 2]), new ArrayBuffer(2), { type: "Buffer", data: [1] }] });
    expect(out["llm.request.messages"]).toEqual(["[omitted]", "[omitted]", "[omitted:media]"]);
  });
  it("omits data of inline media objects but keeps other fields", () => {
    const out = clean({ "llm.request.messages": { type: "image", data: "AAAA", uri: "x" } });
    expect(out["llm.request.messages"]).toEqual({ type: "image", data: "[omitted:media]", uri: "x" });
  });
  it("sanitizes JSON strings that embed inline media and leaves other JSON alone", () => {
    const media = clean({ "llm.request.messages": JSON.stringify({ type: "audio", data: "AAAA" }) });
    expect(JSON.parse(media["llm.request.messages"] as string)).toEqual({ type: "audio", data: "[omitted:media]" });
    const plain = JSON.stringify({ a: 1 });
    expect(clean({ "llm.request.messages": plain })["llm.request.messages"]).toBe(plain);
    expect(clean({ "llm.request.messages": "{not json" })["llm.request.messages"]).toBe("{not json");
  });
  it("caps depth, array length and key length", () => {
    let deep: unknown = "leaf"; for (let i = 0; i < 15; i++) { deep = { n: deep }; }
    expect(JSON.stringify(clean({ "llm.request.messages": deep }))).toContain("[omitted]");
    const arr = clean({ "llm.request.messages": Array.from({ length: 1_500 }, (_, i) => i) });
    expect((arr["llm.request.messages"] as unknown[]).length).toBe(1_000);
    const longKey = Object.keys(clean({ "llm.request.messages": { ["key ".repeat(75)]: 1 } })["llm.request.messages"] as object)[0];
    expect(longKey?.length).toBe(200);
  });
  it("redacts supplied secret values inside strings and keys", () => {
    const out = sanitizeRunTraceRecord(record({ "llm.request.messages": { "has-hunter2-key": "val hunter2" } }), { secretValues: ["hunter2"] }).attributes;
    expect(JSON.stringify(out)).not.toContain("hunter2");
  });
});
