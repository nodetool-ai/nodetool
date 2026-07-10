import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb, Job, Workflow } from "@nodetool-ai/models";
import { NodeRegistry, BaseNode, Passthrough } from "@nodetool-ai/node-sdk";
import type { StreamingOutputs, TriggerEvent } from "@nodetool-ai/node-sdk";
import type { NodeExecutor } from "@nodetool-ai/runtime";
import {
  startHeadlessJob,
  startHeadlessJobDetached,
  type HeadlessJobRuntime
} from "../src/headless-job-runner.js";

const USER = "user-1";

// ── Test nodes ──────────────────────────────────────────────────────────────

/** Emits a constant value on `out`. */
class EchoNode extends BaseNode {
  static readonly nodeType = "test.Echo";
  static readonly metadataOutputTypes = { out: "str" };
  async process(): Promise<Record<string, unknown>> {
    return { out: "hello" };
  }
}

/** Blocks in process() until a shared gate resolves — lets a test observe the
 *  Job row while the run is genuinely in flight. */
let releaseGate: () => void = () => {};
let gate: Promise<void> = Promise.resolve();
function resetGate(): void {
  gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
}
class GatedNode extends BaseNode {
  static readonly nodeType = "test.Gated";
  static readonly metadataOutputTypes = { out: "str" };
  async process(): Promise<Record<string, unknown>> {
    await gate;
    return { out: "done" };
  }
}

/** Throws in process() so the run fails. */
class BoomNode extends BaseNode {
  static readonly nodeType = "test.Boom";
  static readonly metadataOutputTypes = { out: "str" };
  async process(): Promise<Record<string, unknown>> {
    throw new Error("boom");
  }
}

/** Trigger node with an emitTriggerEvent entry point + a static call counter. */
class FakeTriggerNode extends BaseNode {
  static readonly nodeType = "test.FakeTrigger";
  static readonly isTrigger = true;
  static readonly metadataOutputTypes = { value: "any" };
  static emitCalls = 0;
  static reset(): void {
    FakeTriggerNode.emitCalls = 0;
  }
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    yield { value: "live" };
  }
  override async emitTriggerEvent(
    event: TriggerEvent,
    outputs: StreamingOutputs
  ): Promise<void> {
    FakeTriggerNode.emitCalls += 1;
    await super.emitTriggerEvent(event, outputs);
  }
}

function makeRuntime(): HeadlessJobRuntime {
  const registry = new NodeRegistry();
  registry.register(EchoNode);
  registry.register(GatedNode);
  registry.register(BoomNode);
  registry.register(FakeTriggerNode);
  registry.register(Passthrough);
  return {
    registry,
    resolveExecutor: (node): NodeExecutor => registry.resolve(node),
    ensurePythonBridge: async () => {}
  };
}

async function createWorkflow(graph: {
  nodes: unknown[];
  edges: unknown[];
}): Promise<Workflow> {
  return Workflow.create<Workflow>({
    user_id: USER,
    name: "test",
    access: "private",
    graph
  });
}

describe("startHeadlessJob", () => {
  beforeEach(() => {
    initTestDb();
    FakeTriggerNode.reset();
    resetGate();
    releaseGate();
  });

  it("runs a trivial workflow to completion and persists the status", async () => {
    const wf = await createWorkflow({
      nodes: [{ id: "echo", type: EchoNode.nodeType, name: "echo" }],
      edges: []
    });

    const { jobId, status } = await startHeadlessJob(
      { workflowId: wf.id, userId: USER },
      { runtime: makeRuntime() }
    );

    expect(status).toBe("completed");
    const job = await Job.find(USER, jobId);
    expect(job?.status).toBe("completed");
    expect(job?.workflow_id).toBe(wf.id);
  });

  it("makes the Job row visible via Job.find while the run is in flight", async () => {
    resetGate(); // leave the gate closed so process() blocks
    const wf = await createWorkflow({
      nodes: [{ id: "gated", type: GatedNode.nodeType, name: "gated" }],
      edges: []
    });

    const { jobId, status } = await startHeadlessJobDetached(
      { workflowId: wf.id, userId: USER },
      { runtime: makeRuntime() }
    );
    expect(status).toBe("running");

    const running = await Job.find(USER, jobId);
    expect(running).not.toBeNull();
    expect(running?.status).toBe("running");

    releaseGate();
    // Give the background run a beat to settle to its terminal state.
    await new Promise((r) => setTimeout(r, 50));
    const done = await Job.find(USER, jobId);
    expect(done?.status).toBe("completed");
  });

  it("threads triggerEvent to the trigger node's emitTriggerEvent entry point", async () => {
    const wf = await createWorkflow({
      nodes: [
        {
          id: "trigger",
          type: FakeTriggerNode.nodeType,
          name: "trigger",
          is_streaming_output: true
        },
        { id: "sink", type: Passthrough.nodeType, name: "sink" }
      ],
      edges: [
        {
          id: "e1",
          source: "trigger",
          sourceHandle: "value",
          target: "sink",
          targetHandle: "value"
        }
      ]
    });

    const { status } = await startHeadlessJob(
      {
        workflowId: wf.id,
        userId: USER,
        triggerEvent: {
          node_id: "trigger",
          input_id: "i1",
          payload: { value: 42 }
        }
      },
      { runtime: makeRuntime() }
    );

    expect(status).toBe("completed");
    // emitTriggerEvent ran exactly once (genProcess live-listen path skipped).
    expect(FakeTriggerNode.emitCalls).toBe(1);
  });

  it("rejects an unknown workflowId and leaves no Job row behind", async () => {
    await expect(
      startHeadlessJob(
        { workflowId: "does-not-exist", userId: USER },
        { runtime: makeRuntime() }
      )
    ).rejects.toThrow(/not found/i);

    const [jobs] = await Job.paginate(USER, { limit: 100 });
    expect(jobs).toHaveLength(0);
  });

  it("rejects a workflow owned by another user", async () => {
    const wf = await createWorkflow({
      nodes: [{ id: "echo", type: EchoNode.nodeType, name: "echo" }],
      edges: []
    });

    await expect(
      startHeadlessJob(
        { workflowId: wf.id, userId: "someone-else" },
        { runtime: makeRuntime() }
      )
    ).rejects.toThrow(/not found/i);
  });

  it("marks the Job failed with the error message when the workflow fails", async () => {
    const wf = await createWorkflow({
      nodes: [{ id: "boom", type: BoomNode.nodeType, name: "boom" }],
      edges: []
    });

    const { jobId, status } = await startHeadlessJob(
      { workflowId: wf.id, userId: USER },
      { runtime: makeRuntime() }
    );

    expect(status).toBe("failed");
    const job = await Job.find(USER, jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toContain("boom");
  });
});
