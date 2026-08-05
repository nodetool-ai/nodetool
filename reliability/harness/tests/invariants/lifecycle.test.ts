import { describe, expect, it } from "vitest";
import { checkLifecycle } from "../../src/core/invariants/lifecycle.js";
import { makeFrame } from "../../src/core/record.js";
import type { RunRecord } from "../../src/core/record.js";

function baseRecord(frames: RunRecord["frames"]): RunRecord {
  return {
    surface: "kernel",
    jobId: "job-1",
    workflowId: "wf-1",
    startedAt: 0,
    finishedAt: frames.length,
    durationMs: frames.length,
    status: "completed",
    error: null,
    params: {},
    frames
  };
}

describe("checkLifecycle: passing fixture", () => {
  it("reports nothing for a clean running->completed pairing that ends before job terminal", () => {
    const record = baseRecord([
      makeFrame(0, "kernel", "server_to_client", { type: "job_update", status: "running", job_id: "job-1" }),
      makeFrame(1, "kernel", "server_to_client", { type: "node_update", node_id: "n1", status: "running" }),
      makeFrame(2, "kernel", "server_to_client", { type: "node_update", node_id: "n1", status: "completed" }),
      makeFrame(3, "kernel", "server_to_client", { type: "job_update", status: "completed", job_id: "job-1" })
    ]);

    expect(checkLifecycle(record)).toEqual([]);
  });

  it("allows a node to run more than once (loop) as long as each invocation pairs", () => {
    const record = baseRecord([
      makeFrame(0, "kernel", "server_to_client", { type: "node_update", node_id: "n1", status: "running" }),
      makeFrame(1, "kernel", "server_to_client", { type: "node_update", node_id: "n1", status: "completed" }),
      makeFrame(2, "kernel", "server_to_client", { type: "node_update", node_id: "n1", status: "running" }),
      makeFrame(3, "kernel", "server_to_client", { type: "node_update", node_id: "n1", status: "completed" }),
      makeFrame(4, "kernel", "server_to_client", { type: "job_update", status: "completed", job_id: "job-1" })
    ]);

    expect(checkLifecycle(record)).toEqual([]);
  });
});

describe("checkLifecycle: failing fixtures", () => {
  it("flags a node left running with no terminal pairing at all", () => {
    const record = baseRecord([
      makeFrame(0, "kernel", "server_to_client", { type: "node_update", node_id: "n1", status: "running" }),
      makeFrame(1, "kernel", "server_to_client", { type: "job_update", status: "completed", job_id: "job-1" })
    ]);

    const violations = checkLifecycle(record);
    const invariantIds = violations.map((v) => v.invariant);
    expect(invariantIds).toContain("lifecycle.unmatched-running");
    expect(invariantIds).toContain("lifecycle.running-after-job-terminal");
    expect(violations.every((v) => v.nodeId === "n1")).toBe(true);
  });

  it("flags a terminal node_update with no matching running", () => {
    const record = baseRecord([
      makeFrame(0, "kernel", "server_to_client", { type: "node_update", node_id: "n1", status: "completed" }),
      makeFrame(1, "kernel", "server_to_client", { type: "job_update", status: "completed", job_id: "job-1" })
    ]);

    const violations = checkLifecycle(record);
    expect(violations).toEqual([
      expect.objectContaining({
        invariant: "lifecycle.terminal-without-running",
        nodeId: "n1",
        frameIndex: 0
      })
    ]);
  });
});

/**
 * The ws-server cancel shape. `cancelJob` answers the command with a terminal
 * `job_update` straight away (`unified-websocket-runner.ts`, "announce it right
 * away") and deliberately does NOT set `active.finished`, so the drain keeps
 * running and the node terminals follow it. Judging node state against that
 * eager ack calls a converged run dirty — the authoritative terminal is the
 * last one. Duplicate terminals stay `terminal-uniqueness.ts`'s business.
 */
describe("checkLifecycle: a surface that emits an eager terminal ack", () => {
  it("judges node state against the final job_update terminal, not the eager ack", () => {
    const record = baseRecord([
      makeFrame(0, "ws-server", "server_to_client", { type: "job_update", status: "running", job_id: "job-1" }),
      makeFrame(1, "ws-server", "server_to_client", { type: "node_update", node_id: "n1", status: "running" }),
      // The eager cancel ack. Untagged — the driver tags the *second*
      // occurrence redundant, not the first, so "last non-redundant" would
      // re-select this frame and keep the bug.
      makeFrame(2, "ws-server", "server_to_client", { type: "job_update", status: "cancelled", job_id: "job-1" }),
      makeFrame(3, "ws-server", "server_to_client", { type: "node_update", node_id: "n1", status: "cancelled" }),
      {
        ...makeFrame(4, "ws-server", "server_to_client", {
          type: "job_update",
          status: "cancelled",
          job_id: "job-1"
        }),
        redundant: "ws-eager-cancel-ack"
      }
    ]);

    expect(checkLifecycle(record)).toEqual([]);
  });

  it("still flags a node that never closes, even with duplicate terminals", () => {
    const record = baseRecord([
      makeFrame(0, "ws-server", "server_to_client", { type: "node_update", node_id: "n1", status: "running" }),
      makeFrame(1, "ws-server", "server_to_client", { type: "job_update", status: "cancelled", job_id: "job-1" }),
      {
        ...makeFrame(2, "ws-server", "server_to_client", {
          type: "job_update",
          status: "cancelled",
          job_id: "job-1"
        }),
        redundant: "ws-eager-cancel-ack"
      }
    ]);

    const invariantIds = checkLifecycle(record).map((v) => v.invariant);
    expect(invariantIds).toContain("lifecycle.unmatched-running");
    expect(invariantIds).toContain("lifecycle.running-after-job-terminal");
  });
});
