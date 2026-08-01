import { describe, expect, it } from "vitest";
import { checkLeaks } from "../../src/core/invariants/leaks.js";
import type { ResourceCounterSnapshot, RunRecord } from "../../src/core/record.js";

function baseRecord(resourceCounters?: ResourceCounterSnapshot[]): RunRecord {
  return {
    surface: "kernel",
    jobId: "job-1",
    workflowId: "wf-1",
    startedAt: 0,
    finishedAt: 10,
    durationMs: 10,
    status: "completed",
    error: null,
    params: {},
    frames: [],
    resourceCounters
  };
}

const ZERO: Omit<ResourceCounterSnapshot, "at"> = {
  liveActors: 0,
  pendingControlResponses: 0,
  pendingTimers: 0,
  pythonBridgePendingRequests: 0,
  activeJobs: 0,
  startingJobs: 0
};

describe("checkLeaks: passing fixtures", () => {
  it("reports nothing when every post-run counter is zero", () => {
    const record = baseRecord([
      { at: "before", ...ZERO, liveActors: 3 },
      { at: "after", ...ZERO }
    ]);
    expect(checkLeaks(record)).toEqual([]);
  });

  it("reports nothing when repeated post-run snapshots stay flat", () => {
    const record = baseRecord([
      { at: "after", ...ZERO },
      { at: "after", ...ZERO },
      { at: "after", ...ZERO }
    ]);
    expect(checkLeaks(record)).toEqual([]);
  });
});

describe("checkLeaks: failing fixtures", () => {
  it("flags a record with no post-run snapshot — an uninstrumented driver asserts nothing", () => {
    expect(checkLeaks(baseRecord())).toEqual([
      expect.objectContaining({ invariant: "leaks.not-instrumented" })
    ]);
  });

  it("flags a record whose only snapshot is a pre-run baseline", () => {
    expect(checkLeaks(baseRecord([{ at: "before", ...ZERO }]))).toEqual([
      expect.objectContaining({ invariant: "leaks.not-instrumented" })
    ]);
  });

  it("flags a nonzero post-run counter", () => {
    const record = baseRecord([{ at: "after", ...ZERO, liveActors: 1, activeJobs: 2 }]);

    const violations = checkLeaks(record);
    const invariantIds = violations.map((v) => v.invariant);
    expect(invariantIds).toContain("leaks.liveActors-nonzero");
    expect(invariantIds).toContain("leaks.activeJobs-nonzero");
    expect(invariantIds).not.toContain("leaks.pendingTimers-nonzero");
  });

  it("flags growth of a counter across repeated iterations", () => {
    const record = baseRecord([
      { at: "after", ...ZERO },
      { at: "after", ...ZERO, pendingTimers: 1 },
      { at: "after", ...ZERO, pendingTimers: 2 }
    ]);

    const violations = checkLeaks(record);
    const growthViolations = violations.filter(
      (v) => v.invariant === "leaks.pendingTimers-growth"
    );
    // Both the nonzero-at-snapshot findings and the two successive growth
    // steps (0->1, 1->2) are reported.
    expect(growthViolations.length).toBe(2);
  });
});
