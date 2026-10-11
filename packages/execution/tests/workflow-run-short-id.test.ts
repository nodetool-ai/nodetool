/**
 * A run started with a workflow's 12-character short id must record the full
 * id everywhere after `Workflow.find` resolves it: the job row, the workspace
 * lookup and the payload.
 */

import { describe, expect, it, vi } from "vitest";
import { BaseNode, NodeRegistry, type GraphInput } from "@nodetool-ai/node-sdk";
import { type ProcessingContext } from "@nodetool-ai/runtime";

const FULL_ID = "0123456789abcdef0123456789abcdef";

const graph: GraphInput = {
  nodes: [{ id: "n1", type: "test.execution.Constant", data: {} }],
  edges: []
};

class FakeJob {
  id = "job-1";
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
  async save(): Promise<void> {}
}

const jobCreate = vi.fn(
  async (_fields: Record<string, unknown>) => new FakeJob()
);

vi.mock("@nodetool-ai/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Workflow: {
      find: vi.fn(async (_userId: string, id: string) =>
        FULL_ID.startsWith(id)
          ? {
              id: FULL_ID,
              name: "Constant",
              run_mode: "workflow",
              project_id: "default",
              getGraph: () => graph
            }
          : null
      )
    },
    Workspace: { find: vi.fn(async () => null) },
    Job: { create: jobCreate },
    Prediction: { create: vi.fn() },
    getSecret: vi.fn(async () => null)
  };
});

vi.mock("../src/service/run-trace-lifecycle.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/service/run-trace-lifecycle.js")
    >();
  return {
    ...actual,
    registerWorkflowRunTrace: vi.fn(async () => undefined),
    settleRegisteredRunTrace: vi.fn(async () => undefined),
    withRegisteredRunTrace: vi.fn(
      async <T>(
        _context: ProcessingContext,
        _kind: string,
        execute: () => Promise<T>
      ): Promise<T> => execute()
    )
  };
});

const { runWorkflow } = await import("../src/service/workflow-run.js");

class Constant extends BaseNode {
  static readonly nodeType = "test.execution.Constant";
  static readonly title = "Constant";
  static readonly description = "Outputs one";

  async process(): Promise<Record<string, unknown>> {
    return { output: 1 };
  }
}

describe("runWorkflow with a short workflow id", () => {
  it("stores the full workflow id on the job and the payload", async () => {
    const registry = new NodeRegistry();
    registry.register(Constant);
    const resolveWorkspace = vi.fn(async () => null);
    const outcome = await runWorkflow({
      workflowId: FULL_ID.slice(0, 12),
      userId: "user-7",
      environment: { registry },
      resolveWorkspace
    });

    expect(outcome.kind).toBe("payload");
    expect(jobCreate).toHaveBeenCalledWith(
      expect.objectContaining({ workflow_id: FULL_ID })
    );
    expect(resolveWorkspace).toHaveBeenCalledWith(FULL_ID, "user-7");
    if (outcome.kind === "payload") {
      expect(outcome.payload.workflow_id).toBe(FULL_ID);
    }
  });
});
