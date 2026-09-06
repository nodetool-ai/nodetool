/**
 * Job progress on the row (A5.6).
 *
 * `node_progress` was folded only into the debug collector, so `get_job` on a
 * running background render reported "running" and nothing else — for a render
 * that legitimately takes minutes, that is the whole question. The throttle is
 * driven by an injected clock, so the intervals are asserted rather than
 * waited on.
 */
import { describe, expect, it, vi } from "vitest";
import { createJobProgressRecorder } from "../src/service/job-progress.js";

function recorder() {
  const writes: Array<Record<string, unknown>> = [];
  let now = 0;
  const rec = createJobProgressRecorder({
    write: async (progress) => {
      writes.push(progress);
    },
    now: () => now,
    minIntervalMs: 2000,
    minPercentStep: 5
  });
  return { rec, writes, tick: (ms: number) => (now += ms) };
}

describe("createJobProgressRecorder", () => {
  it("writes the first progress message immediately", () => {
    const { rec, writes } = recorder();
    rec({ type: "node_progress", node_id: "n1", progress: 1, total: 100 });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ node_id: "n1", progress: 1, total: 100 });
  });

  it("holds back a small step inside the interval", () => {
    const { rec, writes, tick } = recorder();
    rec({ type: "node_progress", node_id: "n1", progress: 1, total: 100 });
    tick(500);
    rec({ type: "node_progress", node_id: "n1", progress: 2, total: 100 });
    rec({ type: "node_progress", node_id: "n1", progress: 3, total: 100 });
    expect(writes).toHaveLength(1);
  });

  it("writes again once the interval has passed", () => {
    const { rec, writes, tick } = recorder();
    rec({ type: "node_progress", node_id: "n1", progress: 1, total: 100 });
    tick(2000);
    rec({ type: "node_progress", node_id: "n1", progress: 2, total: 100 });
    expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({ progress: 2 });
  });

  it("writes a five-percent jump before the interval is up", () => {
    const { rec, writes, tick } = recorder();
    rec({ type: "node_progress", node_id: "n1", progress: 1, total: 100 });
    tick(100);
    rec({ type: "node_progress", node_id: "n1", progress: 7, total: 100 });
    expect(writes).toHaveLength(2);
  });

  it("always writes the last frame, whatever the throttle says", () => {
    const { rec, writes, tick } = recorder();
    rec({ type: "node_progress", node_id: "n1", progress: 1, total: 100 });
    tick(10);
    rec({ type: "node_progress", node_id: "n1", progress: 100, total: 100 });
    expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({ progress: 100, total: 100 });
  });

  it("ignores every other message type", () => {
    const { rec, writes } = recorder();
    rec({ type: "log_update", content: "hello" });
    rec({ type: "node_update", node_id: "n1" });
    expect(writes).toHaveLength(0);
  });

  it("keeps a failing write from breaking the run", async () => {
    const failing = createJobProgressRecorder({
      write: async () => {
        throw new Error("db down");
      },
      now: () => 0
    });
    expect(() =>
      failing({ type: "node_progress", node_id: "n", progress: 1, total: 2 })
    ).not.toThrow();
    await vi.waitFor(() => true);
  });
});
