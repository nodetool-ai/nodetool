import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowRunner } from "../src/runner.js";

const setStatus = vi.hoisted(() => vi.fn());
vi.mock("@nodetool-ai/runtime/tracing", async (importOriginal) => {
  const original = await importOriginal<typeof import("@nodetool-ai/runtime/tracing")>();
  return {
    ...original,
    withWorkflowSpan: async (_attributes: unknown, fn: (span: { setStatus: typeof setStatus }) => Promise<unknown>) => fn({ setStatus })
  };
});

describe("workflow root trace outcome", () => {
  beforeEach(() => setStatus.mockClear());

  it("marks a returned graph-validation failure as an error", async () => {
    const runner = new WorkflowRunner("failed-trace", { resolveExecutor: () => ({ process: async () => ({}) }) });
    const result = await runner.run({ job_id: "failed-trace" }, {
      nodes: [{ id: "loop", type: "test.Loop" }],
      edges: [{ source: "loop", sourceHandle: "value", target: "loop", targetHandle: "value" }]
    });
    expect(result.status).toBe("failed");
    expect(setStatus).toHaveBeenCalledWith({ code: 2 });
  });

  it("marks returned cancellation as an error", async () => {
    let runner: WorkflowRunner;
    runner = new WorkflowRunner("cancelled-trace", { resolveExecutor: () => ({ process: async () => { runner.cancel(); return {}; } }) });
    const result = await runner.run({ job_id: "cancelled-trace" }, { nodes: [{ id: "cancel", type: "test.Cancel" }], edges: [] });
    expect(result.status).toBe("cancelled");
    expect(setStatus).toHaveBeenCalledWith({ code: 2 });
  });
});
