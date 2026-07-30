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
