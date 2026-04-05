/**
 * WorkflowRunner integration tests.
 *
 * Covers end-to-end scenarios mirroring Python test_e2e_runner_scenarios.py:
 *  - Simple linear pipeline
 *  - Multi-output capture
 *  - Job status progression
 *  - Error handling
 *  - Cancellation
 *  - Streaming propagation
 */

import { describe, it, expect } from "vitest";
import { WorkflowRunner, type RunJobRequest } from "../src/runner.js";
import type {
  NodeDescriptor,
  Edge,
  JobUpdate,
  NodeUpdate,
  EdgeUpdate
} from "@nodetool/protocol";
import type { NodeExecutor } from "../src/actor.js";
import type { ProcessingContext } from "@nodetool/runtime";

// ---------------------------------------------------------------------------
// Test executor factory
// ---------------------------------------------------------------------------

function simpleExecutor(
  fn: (inputs: Record<string, unknown>) => Record<string, unknown>
): NodeExecutor {
  return {
    async process(inputs) {
      return fn(inputs);
    }
  };
}

function makeRunner(
  executorMap: Record<string, NodeExecutor>,
  executionContext?: ProcessingContext
): WorkflowRunner {
  return new WorkflowRunner("test-job", {
    resolveExecutor: (node) => {
      const exec = executorMap[node.id] ?? executorMap[node.type];
      if (!exec) {
        return simpleExecutor(() => ({}));
      }
      return exec;
    },
    executionContext
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WorkflowRunner – simple pipeline", () => {
  it("runs a linear A → B pipeline and collects output", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "input", type: "test.Input", name: "x" },
      { id: "double", type: "test.Double" },
      { id: "output", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        source: "input",
        sourceHandle: "value",
        target: "double",
        targetHandle: "a"
      },
      {
        source: "double",
        sourceHandle: "result",
        target: "output",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({
      "test.Double": simpleExecutor((inputs) => ({
        result: (inputs.a as number) * 2
      })),
      "test.Output": simpleExecutor((inputs) => ({
        value: inputs.value
      }))
    });

    const result = await runner.run(
      { job_id: "j1", params: { x: 5 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.result).toBeDefined();
    expect(result.outputs.result).toContain(10);
  });
});

describe("WorkflowRunner – job status messages", () => {
  it("emits running and completed job updates", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "val" },
      { id: "out", type: "test.Output" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({
      "test.Output": simpleExecutor((inputs) => inputs)
    });

    const result = await runner.run(
      { job_id: "j2", params: { val: 42 } },
      { nodes, edges }
    );

    const jobMsgs = result.messages.filter(
      (m) => m.type === "job_update"
    ) as JobUpdate[];

    expect(jobMsgs.some((m) => m.status === "running")).toBe(true);
    expect(jobMsgs.some((m) => m.status === "completed")).toBe(true);
  });
});

describe("WorkflowRunner – error handling", () => {
  it("reports failed status on executor error", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "val" },
      { id: "bad", type: "test.Bad" }
    ];
    const edges: Edge[] = [
      { source: "in", sourceHandle: "value", target: "bad", targetHandle: "a" }
    ];

    const runner = makeRunner({
      "test.Bad": {
        async process() {
          throw new Error("node exploded");
        }
      }
    });

    const result = await runner.run(
      { job_id: "j3", params: { val: 1 } },
      { nodes, edges }
    );

    // The node error is caught by the actor, not the runner
    // The runner itself still completes
    const nodeMsgs = result.messages.filter(
      (m) => m.type === "node_update"
    ) as NodeUpdate[];
    expect(nodeMsgs.some((m) => m.status === "error")).toBe(true);
  });
});

describe("WorkflowRunner – dangling edges are filtered (Python parity)", () => {
  it("silently removes dangling edges and completes successfully", async () => {
    const nodes: NodeDescriptor[] = [{ id: "a", type: "test.A" }];
    const edges: Edge[] = [
      {
        source: "missing",
        sourceHandle: "out",
        target: "a",
        targetHandle: "in"
      }
    ];

    const runner = makeRunner({});
    const result = await runner.run({ job_id: "j4" }, { nodes, edges });

    // Python parity: _filterInvalidEdges removes the dangling edge before validation
    expect(result.status).toBe("completed");
  });
});

describe("WorkflowRunner – edge counters", () => {
  it("emits edge_update messages with counters", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "mid", type: "test.Pass" },
      { id: "out", type: "test.Output" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "in",
        sourceHandle: "value",
        target: "mid",
        targetHandle: "value"
      },
      {
        id: "e2",
        source: "mid",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({
      "test.Pass": simpleExecutor((inputs) => ({ value: inputs.value })),
      "test.Output": simpleExecutor((inputs) => inputs)
    });

    const result = await runner.run(
      { job_id: "j5", params: { x: 42 } },
      { nodes, edges }
    );

    const edgeMsgs = result.messages.filter(
      (m) => m.type === "edge_update"
    ) as EdgeUpdate[];
    expect(edgeMsgs.length).toBeGreaterThanOrEqual(1);
    expect(
      edgeMsgs.some((m) => m.edge_id === "e2" && m.status === "active")
    ).toBe(true);
    expect(
      edgeMsgs.some((m) => m.edge_id === "e2" && m.status === "completed")
    ).toBe(true);
    const active = edgeMsgs.find(
      (m) => m.edge_id === "e2" && m.status === "active"
    );
    expect(active?.counter ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe("WorkflowRunner – cancellation", () => {
  it("marks job as cancelled", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "slow", type: "test.Slow" }
    ];
    const edges: Edge[] = [
      { source: "in", sourceHandle: "value", target: "slow", targetHandle: "a" }
    ];

    const runner = makeRunner({
      "test.Slow": {
        async process() {
          // Simulate slow processing
          await new Promise((r) => setTimeout(r, 500));
          return { result: 1 };
        }
      }
    });

    // Start and cancel
    const runPromise = runner.run(
      { job_id: "j6", params: { x: 1 } },
      { nodes, edges }
    );

    // Cancel after a short delay
    setTimeout(() => runner.cancel(), 50);

    const result = await runPromise;
    expect(result.status).toBe("cancelled");
  });
});

describe("WorkflowRunner – multiple output nodes", () => {
  it("captures outputs from multiple sink nodes", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "out1", type: "test.Out", name: "result1" },
      { id: "out2", type: "test.Out", name: "result2" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "out1",
        targetHandle: "value"
      },
      {
        source: "in",
        sourceHandle: "value",
        target: "out2",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({
      "test.Out": simpleExecutor((inputs) => ({ value: inputs.value }))
    });

    const result = await runner.run(
      { job_id: "j7", params: { x: 99 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.result1).toBeDefined();
    expect(result.outputs.result2).toBeDefined();
  });
});

describe("WorkflowRunner – stream input", () => {
  it("accepts runtime streamed input and finishes input stream", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "stream_input", type: "test.Input", name: "stream_input" },
      { id: "sink", type: "test.Sink", name: "sink" }
    ];
    const edges: Edge[] = [
      {
        source: "stream_input",
        sourceHandle: "value",
        target: "sink",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({
      "test.Sink": simpleExecutor((inputs) => ({ value: inputs.value }))
    });

    const runPromise = runner.run(
      { job_id: "j-stream", params: {} },
      { nodes, edges }
    );

    await new Promise((r) => setTimeout(r, 10));
    await runner.pushInputValue("stream_input", 123);
    runner.finishInputStream("stream_input");

    const result = await runPromise;
    expect(result.status).toBe("completed");
    expect(result.outputs.sink).toContain(123);
  });
});

describe("WorkflowRunner – execution context forwarding", () => {
  it("forwards emitted processing messages to executionContext.emit", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "val" },
      { id: "out", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];
    const forwarded: Array<{
      type?: string;
      status?: string;
      node_id?: string;
    }> = [];
    const executionContext = {
      emit(msg: { type?: string; status?: string; node_id?: string }) {
        forwarded.push(msg);
      }
    } as unknown as ProcessingContext;

    const runner = makeRunner(
      {
        "test.Output": simpleExecutor((inputs) => ({ value: inputs.value }))
      },
      executionContext
    );

    await runner.run(
      { job_id: "ctx-forward", params: { val: 7 } },
      { nodes, edges }
    );

    expect(
      forwarded.some(
        (m) =>
          m.type === "node_update" &&
          m.node_id === "out" &&
          m.status === "running"
      )
    ).toBe(true);
    expect(
      forwarded.some(
        (m) =>
          m.type === "node_update" &&
          m.node_id === "out" &&
          m.status === "completed"
      )
    ).toBe(true);
    expect(
      forwarded.some((m) => m.type === "job_update" && m.status === "completed")
    ).toBe(true);
  });
});

describe("WorkflowRunner – source nodes that are not external inputs", () => {
  it("executes source constant nodes and completes", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "n1",
        type: "nodetool.constant.String",
        name: "nodetool.constant.String",
        properties: { value: "Hello World" }
      },
      {
        id: "n2",
        type: "nodetool.text.FilterString",
        name: "nodetool.text.FilterString",
        properties: { criteria: "world" }
      }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "n1",
        sourceHandle: "output",
        target: "n2",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({
      "nodetool.constant.String": simpleExecutor(() => ({
        output: "Hello World"
      })),
      "nodetool.text.FilterString": simpleExecutor((inputs) => {
        const value = String(inputs.value ?? "");
        return { output: value.toLowerCase().includes("world") ? value : "" };
      })
    });

    const result = await runner.run(
      { job_id: "j-constant-filter", params: {} },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    const edgeMsgs = result.messages.filter(
      (m) => m.type === "edge_update"
    ) as EdgeUpdate[];
    expect(
      edgeMsgs.some((m) => m.edge_id === "e1" && (m.counter ?? 0) > 0)
    ).toBe(true);
  });
});
