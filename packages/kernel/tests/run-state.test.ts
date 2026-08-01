/**
 * The read-only run view a supervisor gets, and the lineage rule that decides
 * what it may read.
 *
 * See docs/workflow-supervisor-design.md §6.
 */

import { describe, it, expect } from "vitest";
import { lineageRelated } from "../src/run-state.js";
import { WorkflowRunner } from "../src/runner.js";
import type { RunStateReader } from "../src/run-state.js";
import type { SupervisorHandle, DecisionOutcome } from "../src/supervisor.js";
import type { Escalation } from "@nodetool-ai/protocol";

describe("lineageRelated", () => {
  it("relates a single-fire producer to every invocation", () => {
    expect(lineageRelated([], ["items=7"])).toBe(true);
    expect(lineageRelated([], [])).toBe(true);
  });

  it("relates a producer on the same branch", () => {
    expect(lineageRelated(["items=7"], ["items=7"])).toBe(true);
    expect(lineageRelated(["items=7"], ["items=7", "chunks=2"])).toBe(true);
  });

  it("refuses a sibling item of the same fan-out", () => {
    // The whole reason the tool is scoped: item 3's output is not evidence
    // about item 7's failure, and handing it over is a poisoned repair.
    expect(lineageRelated(["items=3"], ["items=7"])).toBe(false);
  });

  it("refuses a branch the failing invocation never entered", () => {
    expect(lineageRelated(["other=1"], ["items=7"])).toBe(false);
  });
});

/** Records what the runner hands it, so a test can read the view back. */
class CapturingHandle implements SupervisorHandle {
  reader: RunStateReader | null = null;

  attach(reader: RunStateReader): void {
    this.reader = reader;
  }
  async decide(_e: Escalation): Promise<DecisionOutcome> {
    return { verdict: { action: "fail" }, decidedBy: "default" };
  }
  close(): void {}
}

describe("WorkflowRunner run state", () => {
  it("hands the supervisor a view and records node outputs for it", async () => {
    const handle = new CapturingHandle();
    const runner = new WorkflowRunner("job-run-state", {
      resolveExecutor: () => ({
        async process() {
          return { output: "produced" };
        }
      }),
      supervisor: handle
    });

    await runner.run(
      { job_id: "job-run-state", params: {} },
      {
        nodes: [
          { id: "producer", type: "test.Producer", outputs: { output: "str" } }
        ],
        edges: []
      }
    );

    expect(handle.reader).not.toBeNull();
    const read = handle.reader!.readOutput("producer", []);
    expect(read?.outputs).toEqual({ output: "produced" });

    const digest = handle.reader!.digest();
    expect(digest.jobId).toBe("job-run-state");
    expect(digest.nodes).toHaveLength(1);
    expect(digest.nodes[0]).toMatchObject({
      nodeId: "producer",
      status: "completed",
      emissions: 1,
      escalations: 0
    });
  });

  it("records nothing when the run has no supervisor", async () => {
    const runner = new WorkflowRunner("job-unsupervised", {
      resolveExecutor: () => ({
        async process() {
          return { output: "produced" };
        }
      })
    });

    const result = await runner.run(
      { job_id: "job-unsupervised", params: {} },
      {
        nodes: [
          { id: "producer", type: "test.Producer", outputs: { output: "str" } }
        ],
        edges: []
      }
    );

    expect(result.status).toBe("completed");
    expect(result.interventions).toBeUndefined();
  });
});
