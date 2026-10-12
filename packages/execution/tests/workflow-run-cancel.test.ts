/**
 * Cancelling a background `runWorkflow` run.
 *
 * A background run has no WebSocket session, so before `cancelActiveRuns`
 * a cancel only wrote the job row: the run kept going (a timeline render
 * encoded for hours) and its finish then overwrote `cancelled` with
 * `completed`. These cases cancel a run that is parked in a node, and check
 * that the node sees the abort and that the row keeps the cancel.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseNode, NodeRegistry, type GraphInput } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/** The job row as the database holds it. */
const row = { status: "running" };
const terminalWrites: Array<{ status: string; landed: boolean }> = [];

class FakeJob {
  id = "job-cancel";
  status = "running";
  error: string | null = null;
  logs: unknown[] = [];
  metadata_json: Record<string, unknown> | null = null;
  markCompleted(): void {
    this.status = "completed";
  }
  markCancelled(): void {
    this.status = "cancelled";
  }
  markFailed(message: string): void {
    this.status = "failed";
    this.error = message;
  }
  async save(): Promise<void> {
    row.status = this.status;
  }
  /** `Job.saveIfActive`: lands only while the row is still running. */
  async saveIfActive(): Promise<boolean> {
    const landed = row.status === "running";
    terminalWrites.push({ status: this.status, landed });
    if (landed) row.status = this.status;
    else this.status = row.status;
    return landed;
  }
}

vi.mock("@nodetool-ai/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Workspace: { find: vi.fn(async () => null) },
    Job: {
      create: vi.fn(async () => new FakeJob()),
      recordProgressIfActive: vi.fn(async () => true)
    },
    Prediction: { create: vi.fn() },
    getSecret: vi.fn(async () => null)
  };
});

vi.mock("../src/service/run-trace-lifecycle.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/service/run-trace-lifecycle.js")>();
  return {
    ...actual,
    registerWorkflowRunTrace: vi.fn(async () => undefined),
    settleRegisteredRunTrace: vi.fn(async () => undefined),
    withRegisteredRunTrace: vi.fn(
      async <T>(_context: ProcessingContext, _kind: string, execute: () => Promise<T>): Promise<T> => execute()
    )
  };
});

const { runWorkflow } = await import("../src/service/workflow-run.js");
const { cancelActiveRuns, isActiveRun } = await import("../src/service/active-runs.js");

let entered: () => void = () => {};
let abortSeenAt = 0;

/** Holds the run until its context is aborted, the way a long render does. */
class Parked extends BaseNode {
  static readonly nodeType = "test.cancel.Parked";
  static readonly title = "Parked";
  static readonly description = "Waits for the run's signal";
  static readonly metadataOutputTypes = { output: "str" };

  async process(context: ProcessingContext): Promise<Record<string, unknown>> {
    entered();
    await new Promise<void>((resolve) => {
      if (context.signal.aborted) return resolve();
      context.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    abortSeenAt = Date.now();
    return { output: "finished after the cancel" };
  }
}

const graph: GraphInput = {
  nodes: [{ id: "parked", type: "test.cancel.Parked", data: {} }],
  edges: []
};

beforeEach(() => {
  row.status = "running";
  terminalWrites.length = 0;
  abortSeenAt = 0;
});

describe("cancelling a background run", () => {
  it("stops the run and keeps the row cancelled", async () => {
    const registry = new NodeRegistry();
    registry.register(Parked);
    const running = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const outcome = await runWorkflow({
      workflowId: "",
      graph,
      userId: "user-7",
      background: true,
      environment: { registry },
      resolveWorkspace: async () => null
    });
    expect(outcome.kind).toBe("payload");
    await running;
    expect(isActiveRun("job-cancel")).toBe(true);

    // What jobs.cancel and cancel_job do: the row first, then the run.
    row.status = "cancelled";
    const cancelledAt = Date.now();
    expect(cancelActiveRuns("someone-else", ["job-cancel"])).toBe(0);
    expect(cancelActiveRuns("user-7", ["job-cancel"])).toBe(1);

    await vi.waitFor(() => expect(terminalWrites.length).toBeGreaterThan(0), {
      timeout: 5000
    });
    expect(abortSeenAt).toBeGreaterThan(0);
    expect(abortSeenAt - cancelledAt).toBeLessThan(5000);
    expect(terminalWrites.every((write) => !write.landed)).toBe(true);
    expect(row.status).toBe("cancelled");
    expect(isActiveRun("job-cancel")).toBe(false);
  });

  it("forgets a run once it settles on its own", async () => {
    const registry = new NodeRegistry();
    registry.register(Parked);
    const running = new Promise<void>((resolve) => {
      entered = resolve;
    });
    await runWorkflow({
      workflowId: "",
      graph,
      userId: "user-7",
      background: true,
      environment: { registry },
      resolveWorkspace: async () => null
    });
    await running;
    // A cancel that lands before the row is written still stops the run;
    // the run's own terminal write then records it.
    cancelActiveRuns("user-7", ["job-cancel"]);
    await vi.waitFor(() => expect(isActiveRun("job-cancel")).toBe(false), { timeout: 5000 });
    expect(cancelActiveRuns("user-7", ["job-cancel"])).toBe(0);
  });
});
