import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initTestDb,
  ModelObserver,
  Workflow,
  Job
} from "@nodetool-ai/models";
import type { Workflow as WorkflowModel } from "@nodetool-ai/models";
import { NodeRegistry, BaseNode } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/node-sdk";
import {
  PERMISSION_GATE_CONTEXT_KEY,
  type PermissionGateOptions
} from "@nodetool-ai/runtime";
import { startHeadlessJob } from "../src/headless-job-runner.js";

const USER_ID = "user-1";

// ── Test nodes ───────────────────────────────────────────────────────

/** Captures the ProcessingContext's triggerEvent when it runs. */
let capturedTriggerEvent: unknown = "never-ran";
/** Captures the permission gate the run context carries. */
let capturedGate: unknown = "never-ran";

class CaptureNode extends BaseNode {
  static readonly nodeType = "test.headless.Capture";
  static readonly title = "Capture";
  static readonly description = "Captures context.triggerEvent";

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    capturedTriggerEvent = context?.triggerEvent ?? null;
    capturedGate = context?.get(PERMISSION_GATE_CONTEXT_KEY) ?? null;
    return { out: "done" };
  }
}

/** Blocks until the test releases it, so the run stays in-flight. */
let releaseGate: () => void = () => {};
let gate: Promise<void> = Promise.resolve();

class GateNode extends BaseNode {
  static readonly nodeType = "test.headless.Gate";
  static readonly title = "Gate";
  static readonly description = "Waits for the test to release it";

  async process(): Promise<Record<string, unknown>> {
    await gate;
    return { out: "opened" };
  }
}

class FailNode extends BaseNode {
  static readonly nodeType = "test.headless.Fail";
  static readonly title = "Fail";
  static readonly description = "Always throws";

  async process(): Promise<Record<string, unknown>> {
    throw new Error("boom from FailNode");
  }
}

function makeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registry.register(CaptureNode);
  registry.register(GateNode);
  registry.register(FailNode);
  return registry;
}

async function makeWorkflow(nodeType: string): Promise<WorkflowModel> {
  return (await Workflow.create<WorkflowModel>({
    user_id: USER_ID,
    name: "headless-test",
    graph: {
      nodes: [{ id: "n1", type: nodeType, data: {} }],
      edges: []
    }
  })) as WorkflowModel;
}

async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  timeoutMs = 5000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value != null) return value;
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("startHeadlessJob", () => {
  beforeEach(() => {
    initTestDb();
    capturedTriggerEvent = "never-ran";
    capturedGate = "never-ran";
    gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
  });
  afterEach(() => ModelObserver.clear());

  it("creates a Job row, runs the graph, and resolves with the terminal status", async () => {
    const wf = await makeWorkflow("test.headless.Capture");

    const result = await startHeadlessJob({
      workflowId: wf.id,
      userId: USER_ID,
      registry: makeRegistry()
    });

    expect(result.status).toBe("completed");
    expect(result.error).toBeNull();
    expect(result.jobId).toBeTruthy();

    const job = await Job.find(USER_ID, result.jobId);
    expect(job).not.toBeNull();
    expect(job?.status).toBe("completed");
    expect(job?.workflow_id).toBe(wf.id);
    expect(job?.started_at).toBeTruthy();
    expect(job?.finished_at).toBeTruthy();
    expect(job?.graph).not.toBeNull();
  });

  it("is visible via Job.find with status 'running' while the run is in flight", async () => {
    const wf = await makeWorkflow("test.headless.Gate");

    const pending = startHeadlessJob({
      workflowId: wf.id,
      userId: USER_ID,
      jobId: "headless-gate-job",
      registry: makeRegistry()
    });

    const running = await waitFor(() => Job.find(USER_ID, "headless-gate-job"));
    expect(running.status).toBe("running");
    expect(running.workflow_id).toBe(wf.id);

    releaseGate();
    const result = await pending;
    expect(result.status).toBe("completed");
    expect(result.jobId).toBe("headless-gate-job");

    const finished = await Job.find(USER_ID, "headless-gate-job");
    expect(finished?.status).toBe("completed");
  });

  it("passes the trigger event through to the ProcessingContext", async () => {
    const wf = await makeWorkflow("test.headless.Capture");

    const triggerEvent = {
      node_id: "n1",
      payload: { hello: 1 },
      input_id: "input-1"
    };
    const result = await startHeadlessJob({
      workflowId: wf.id,
      userId: USER_ID,
      triggerEvent,
      registry: makeRegistry()
    });

    expect(result.status).toBe("completed");
    expect(capturedTriggerEvent).toEqual(triggerEvent);
  });

  it("sets the headless permission gate on the run context", async () => {
    const wf = await makeWorkflow("test.headless.Capture");

    const result = await startHeadlessJob({
      workflowId: wf.id,
      userId: USER_ID,
      registry: makeRegistry()
    });

    expect(result.status).toBe("completed");
    const captured = capturedGate as PermissionGateOptions;
    expect(captured.mode).toBe("auto");
    expect(captured.sessionAllow.size).toBe(0);
    await expect(
      captured.requestApproval({
        toolName: "delete_workflow",
        category: "write",
        args: {},
        message: "Delete"
      })
    ).resolves.toBe("deny");
  });

  it("persists a failed terminal status when a node throws", async () => {
    const wf = await makeWorkflow("test.headless.Fail");

    const result = await startHeadlessJob({
      workflowId: wf.id,
      userId: USER_ID,
      registry: makeRegistry()
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("boom from FailNode");

    const job = await Job.find(USER_ID, result.jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toContain("boom from FailNode");
    expect(job?.finished_at).toBeTruthy();
  });

  it("rejects when the workflow does not exist for the user", async () => {
    await expect(
      startHeadlessJob({
        workflowId: "missing-wf",
        userId: USER_ID,
        registry: makeRegistry()
      })
    ).rejects.toThrow(/Workflow not found/);
  });
});
