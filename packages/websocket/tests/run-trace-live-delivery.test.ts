import { describe, expect, it } from "vitest";
import type { StoredRunTraceUpdate } from "@nodetool-ai/protocol";
import { RunTraceLiveDelivery, type LiveRunTraceUpdate } from "../src/lib/run-trace-live-delivery.js";

function update(index: number, content = ""): StoredRunTraceUpdate {
  return {
    run_id: "a".repeat(32), kind: "span_end", cursor: index,
    content_expired: false, truncated: false, incomplete: false,
    record: {
      trace_id: "b".repeat(32), span_id: index.toString(16).padStart(16, "0"), parent_span_id: null,
      name: "app.run", kind: "INTERNAL", start_time_ms: 1, end_time_ms: 2, duration_ms: 1,
      status: { code: "OK" }, attributes: { "log.message": content }, events: [], resource: {}
    }
  };
}

async function drainMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("bounded stored trace delivery", () => {
  it("bounds a slow reader and signals resnapshot while delivering the latest records", async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const sent: LiveRunTraceUpdate[] = [];
    const delivery = new RunTraceLiveDelivery(async (record) => {
      sent.push(record);
      if (sent.length === 1) { await blocked; }
    }, () => {});
    for (let index = 1; index <= 1000; index++) { delivery.enqueue(update(index)); }
    expect(sent).toHaveLength(1);
    expect(delivery.bufferedSpanCount).toBe(128);
    expect(delivery.bufferedBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    release?.();
    await drainMicrotasks();
    expect(sent).toHaveLength(129);
    expect(sent[1]?.resnapshot_required).toBe(true);
    expect(sent.at(-1)?.cursor).toBe(1000);
    expect(delivery.bufferedSpanCount).toBe(0);
  });

  it("coalesces one span and applies the byte cap while a transport write is pending", async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const sent: LiveRunTraceUpdate[] = [];
    const delivery = new RunTraceLiveDelivery(async (record) => {
      sent.push(record);
      if (sent.length === 1) { await blocked; }
    }, () => {}, { spans: 128, bytes: 1500 });
    delivery.enqueue(update(1));
    delivery.enqueue(update(2, "old"));
    delivery.enqueue({ ...update(2, "latest"), cursor: 3 });
    expect(delivery.bufferedSpanCount).toBe(1);
    delivery.enqueue(update(4, "x".repeat(2000)));
    expect(delivery.bufferedBytes).toBeLessThanOrEqual(1500);
    release?.();
    await drainMicrotasks();
    expect(sent.at(-1)?.record.attributes["log.message"]).toBe("latest");
    expect(sent.at(-1)?.resnapshot_required).toBe(true);
  });

  it("clears buffered content on disconnect and marks recovery after a failed send", async () => {
    const sent: LiveRunTraceUpdate[] = [];
    const errors: unknown[] = [];
    const delivery = new RunTraceLiveDelivery(async (record) => {
      sent.push(record);
      if (sent.length === 1) { throw new Error("disconnected"); }
    }, (error) => errors.push(error));
    delivery.enqueue(update(1));
    delivery.enqueue(update(2));
    await drainMicrotasks();
    expect(errors).toHaveLength(1);
    expect(sent[1]?.resnapshot_required).toBe(true);
    delivery.close();
    delivery.enqueue(update(3));
    expect(sent).toHaveLength(2);
    expect(delivery.bufferedBytes).toBe(0);
  });
});
