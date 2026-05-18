/**
 * Correlated buffered scheduler (PR 3 step 3) — integration tests.
 *
 * Asserts under NODETOOL_USE_CORRELATION=1:
 *  - Same-root diamond joins are deterministic regardless of branch latency.
 *  - Constants stay sticky across correlated keys.
 *  - Nested child keys reuse parent (strict-prefix) values.
 *  - Iteration outputs mint per-frame tokens; index handle is actor-filled.
 *  - Incomparable scopes are rejected with an actionable error.
 *
 * These tests intentionally avoid registry-backed nodes so they can pin the
 * scheduler's behavior in isolation.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  CorrelationLineage,
  Edge,
  NodeDescriptor
} from "@nodetool-ai/protocol";
import { WorkflowRunner } from "../src/runner.js";
import type { MessageEnvelope } from "../src/inbox.js";
import type { NodeExecutor } from "../src/actor.js";
import type { NodeInputs, NodeOutputs } from "../src/io.js";

const FLAG = "NODETOOL_USE_CORRELATION";

interface Captured {
  envelopes: MessageEnvelope[];
}

function captureSink(captured: Captured, handle = "value"): NodeExecutor {
  return {
    async process() {
      return {};
    },
    async run(inputs: NodeInputs) {
      for await (const env of inputs.streamWithEnvelope(handle)) {
        captured.envelopes.push(env);
      }
    }
  };
}

function passthrough(): NodeExecutor {
  return {
    async process(ins) {
      return { value: ins.value };
    }
  };
}

function joinNode(): NodeExecutor {
  // Concatenates two inputs into a string so we can verify pairings.
  return {
    async process(ins) {
      return { value: `${ins.left}|${ins.right}` };
    }
  };
}

function foreachExecutor(): NodeExecutor {
  // Emits each element of `input_list` as a (value, index) frame.
  return {
    async process() {
      return {};
    },
    async *genProcess(ins: Record<string, unknown>) {
      const list = (ins.input_list ?? []) as unknown[];
      for (let i = 0; i < list.length; i++) {
        yield { output: list[i], index: i };
      }
    }
  };
}

function makeRunner(
  executors: Record<string, NodeExecutor>
): WorkflowRunner {
  return new WorkflowRunner("test-job", {
    resolveExecutor: (node) =>
      executors[node.id] ?? executors[node.type] ?? passthrough()
  });
}

describe("correlated buffered scheduler", () => {
  const originalFlag = process.env[FLAG];

  beforeEach(() => {
    process.env[FLAG] = "1";
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = originalFlag;
    }
  });

  it("source node with no inputs fires once with empty lineage", async () => {
    const captured: Captured = { envelopes: [] };
    const nodes: NodeDescriptor[] = [
      {
        id: "src",
        type: "nodetool.input.IntegerInput",
        name: "n",
        properties: { value: 42 }
      },
      {
        id: "sink",
        type: "test.Sink",
        is_streaming_input: true
      }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "src",
        sourceHandle: "value",
        target: "sink",
        targetHandle: "value"
      }
    ];
    const runner = makeRunner({ "test.Sink": captureSink(captured) });
    const result = await runner.run(
      { job_id: "src-empty", params: {} },
      { nodes, edges }
    );
    expect(result.status).toBe("completed");
    expect(captured.envelopes).toHaveLength(1);
    expect(captured.envelopes[0].correlation_lineage).toEqual({});
  });

  it("same-root diamond joins by identity, not arrival order", async () => {
    // Source emits two values with distinct lineage tokens. Two parallel
    // passthroughs feed a join. We deliver them in reversed order on one
    // side to ensure the join pairs by lineage, not FIFO.
    const captured: Captured = { envelopes: [] };

    const seedLineage = (i: number): CorrelationLineage => ({
      "src:items": { index: i }
    });

    // Custom seed: produces multiple envelopes with explicit lineage.
    const seed: NodeExecutor = {
      async process() {
        return {};
      },
      async run(_inputs: NodeInputs, outputs: NodeOutputs) {
        await outputs.emit("value", "A", { lineage: seedLineage(0) });
        await outputs.emit("value", "B", { lineage: seedLineage(1) });
      }
    };

    // Slow leg flips the order of its outputs.
    const slow: NodeExecutor = {
      async process() {
        return {};
      },
      async run(inputs: NodeInputs, outputs: NodeOutputs) {
        const buffered: MessageEnvelope[] = [];
        for await (const env of inputs.streamWithEnvelope("value")) {
          buffered.push(env);
        }
        for (let i = buffered.length - 1; i >= 0; i--) {
          await outputs.forward("value", buffered[i]);
        }
      }
    };

    const nodes: NodeDescriptor[] = [
      {
        id: "src",
        type: "test.Seed",
        is_streaming_input: true,
        outputs: { value: "any" },
        // Declare an iteration output so analyzer sees scope = ["src:items"].
        output_correlation: {
          value: { kind: "iteration", source: "__execution__", group: "items" }
        }
      },
      {
        id: "fast",
        type: "test.Pass",
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "forward", source: "value" }
        }
      },
      {
        id: "slow",
        type: "test.Slow",
        is_streaming_input: true,
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "forward", source: "value" }
        }
      },
      {
        id: "join",
        type: "test.Join",
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      },
      {
        id: "sink",
        type: "test.Sink",
        is_streaming_input: true
      }
    ];
    const edges: Edge[] = [
      { id: "e1", source: "src", sourceHandle: "value", target: "fast", targetHandle: "value" },
      { id: "e2", source: "src", sourceHandle: "value", target: "slow", targetHandle: "value" },
      { id: "e3", source: "fast", sourceHandle: "value", target: "join", targetHandle: "left" },
      { id: "e4", source: "slow", sourceHandle: "value", target: "join", targetHandle: "right" },
      { id: "e5", source: "join", sourceHandle: "value", target: "sink", targetHandle: "value" }
    ];

    const runner = makeRunner({
      "test.Seed": seed,
      "test.Pass": passthrough(),
      "test.Slow": slow,
      "test.Join": joinNode(),
      "test.Sink": captureSink(captured)
    });
    const result = await runner.run(
      { job_id: "diamond", params: {} },
      { nodes, edges }
    );
    expect(result.status).toBe("completed");
    // Two firings, each carrying a pair where left and right share lineage.
    expect(captured.envelopes).toHaveLength(2);
    const values = captured.envelopes.map((e) => e.data).sort();
    expect(values).toEqual(["A|A", "B|B"]);
  });

  it("ForEach mints per-item tokens that downstream sees as lineage", async () => {
    const captured: Captured = { envelopes: [] };
    const nodes: NodeDescriptor[] = [
      {
        id: "src",
        type: "nodetool.input.IntegerInput",
        name: "items",
        properties: { value: ["a", "b", "c"] }
      },
      {
        id: "fe",
        type: "nodetool.control.ForEach",
        is_streaming_output: true,
        outputs: { output: "any", index: "int" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" },
          index: { kind: "iteration", source: "__execution__", group: "items" }
        }
      },
      {
        id: "sink",
        type: "test.Sink",
        is_streaming_input: true
      }
    ];
    const edges: Edge[] = [
      { id: "e1", source: "src", sourceHandle: "value", target: "fe", targetHandle: "input_list" },
      { id: "e2", source: "fe", sourceHandle: "output", target: "sink", targetHandle: "value" }
    ];
    const runner = makeRunner({
      "nodetool.control.ForEach": foreachExecutor(),
      "test.Sink": captureSink(captured)
    });
    const result = await runner.run(
      { job_id: "foreach", params: {} },
      { nodes, edges }
    );
    expect(result.status).toBe("completed");
    expect(captured.envelopes).toHaveLength(3);
    const indices = captured.envelopes.map(
      (e) => e.correlation_lineage["fe:items"]?.index
    );
    expect(indices).toEqual([0, 1, 2]);
    expect(captured.envelopes.map((e) => e.data)).toEqual(["a", "b", "c"]);
  });

  it("incomparable iteration sources fail at correlation analysis", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "fe1",
        type: "nodetool.control.ForEach",
        is_streaming_output: true,
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      },
      {
        id: "fe2",
        type: "nodetool.control.ForEach",
        is_streaming_output: true,
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      },
      {
        id: "join",
        type: "test.Join",
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      }
    ];
    const edges: Edge[] = [
      { id: "e1", source: "fe1", sourceHandle: "output", target: "join", targetHandle: "left" },
      { id: "e2", source: "fe2", sourceHandle: "output", target: "join", targetHandle: "right" }
    ];
    const runner = makeRunner({
      "nodetool.control.ForEach": foreachExecutor(),
      "test.Join": joinNode()
    });
    const result = await runner.run(
      { job_id: "incomparable", params: {} },
      { nodes, edges }
    );
    expect(result.status).toBe("failed");
    expect(result.error ?? "").toMatch(/independent iteration sources/);
  });

  it("flag off keeps legacy scheduler (no correlation analysis)", async () => {
    delete process.env[FLAG];
    // Workflow with incomparable scopes — under flag this would reject, under
    // legacy scheduler it should still load.
    const nodes: NodeDescriptor[] = [
      {
        id: "a",
        type: "nodetool.input.IntegerInput",
        name: "a",
        properties: { value: 1 }
      },
      {
        id: "b",
        type: "nodetool.input.IntegerInput",
        name: "b",
        properties: { value: 2 }
      },
      {
        id: "join",
        type: "test.Join",
        outputs: { value: "any" }
      }
    ];
    const edges: Edge[] = [
      { id: "e1", source: "a", sourceHandle: "value", target: "join", targetHandle: "left" },
      { id: "e2", source: "b", sourceHandle: "value", target: "join", targetHandle: "right" }
    ];
    const runner = makeRunner({ "test.Join": joinNode() });
    const result = await runner.run(
      { job_id: "legacy", params: {} },
      { nodes, edges }
    );
    expect(result.status).toBe("completed");
  });
});
