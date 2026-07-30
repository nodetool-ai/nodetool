import { describe, expect, it } from "vitest";
import { checkTerminalUniqueness } from "../../src/core/invariants/terminal-uniqueness.js";
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

describe("checkTerminalUniqueness: passing fixture", () => {
  it("reports nothing for exactly one terminal job_update with no evidence for a different precedence", () => {
    const record = baseRecord([
      makeFrame(0, "kernel", "server_to_client", { type: "job_update", status: "running", job_id: "job-1" }),
      makeFrame(1, "kernel", "server_to_client", { type: "node_update", node_id: "n1", status: "completed" }),
      makeFrame(2, "kernel", "server_to_client", { type: "job_update", status: "completed", job_id: "job-1" })
    ]);

    expect(checkTerminalUniqueness(record)).toEqual([]);
  });

  it("expects 'cancelled' precedence when a cancel_job command was sent, and passes when it matches", () => {
    const record = baseRecord([
      makeFrame(0, "kernel", "client_to_server", { command: "cancel_job", data: { job_id: "job-1" } }),
      makeFrame(1, "kernel", "server_to_client", { type: "node_update", node_id: "n1", status: "error" }),
      makeFrame(2, "kernel", "server_to_client", { type: "job_update", status: "cancelled", job_id: "job-1" })
    ]);

    expect(checkTerminalUniqueness(record)).toEqual([]);
  });
});

describe("checkTerminalUniqueness: failing fixtures", () => {
  it("flags more than one terminal job_update, and a frame that follows the first one", () => {
    const record = baseRecord([
      makeFrame(0, "kernel", "server_to_client", { type: "job_update", status: "completed", job_id: "job-1" }),
      makeFrame(1, "kernel", "server_to_client", { type: "job_update", status: "failed", job_id: "job-1" })
    ]);

    const violations = checkTerminalUniqueness(record);
    const invariantIds = violations.map((v) => v.invariant);
    expect(invariantIds).toContain("terminal-uniqueness.multiple");
    expect(invariantIds).toContain("terminal-uniqueness.frames-after-terminal");
  });

  it("flags a completed terminal when a node errored and nothing was cancelled/suspended (precedence)", () => {
    const record = baseRecord([
      makeFrame(0, "kernel", "server_to_client", { type: "node_update", node_id: "n1", status: "error" }),
      makeFrame(1, "kernel", "server_to_client", { type: "job_update", status: "completed", job_id: "job-1" })
    ]);

    const violations = checkTerminalUniqueness(record);
    expect(violations).toEqual([
      expect.objectContaining({
        invariant: "terminal-uniqueness.precedence",
        details: expect.objectContaining({ actual: "completed", expected: "failed" })
      })
    ]);
  });

  it("flags a missing terminal job_update", () => {
    const record = baseRecord([
      makeFrame(0, "kernel", "server_to_client", { type: "job_update", status: "running", job_id: "job-1" })
    ]);

    expect(checkTerminalUniqueness(record)).toEqual([
      expect.objectContaining({ invariant: "terminal-uniqueness.missing" })
    ]);
  });
});
