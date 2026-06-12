/**
 * Tests for T-K-9: OutputUpdate messages emitted after node produces output.
 *
 * Contract: output_update is emitted for terminal (unconnected) handles only —
 * connected handles deliver their value downstream on the edge and are
 * suppressed — unless the node sets `always_emit_output_updates`.
 */
import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import type { NodeDescriptor } from "@nodetool-ai/protocol";
import type { NodeExecutor } from "../src/actor.js";

function makeExecutor(
  fn: () => Record<string, unknown> | Promise<Record<string, unknown>>
): NodeExecutor {
  return {
    process: async () => fn()
  };
}

describe("T-K-9: OutputUpdate messages", () => {
  it("emits output_update for terminal handles, suppresses connected ones", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "n1", type: "test.Source", outputs: { output: "int" } },
      { id: "n2", type: "test.Sink", outputs: { result: "int" } }
    ];
    const edges = [
      { source: "n1", sourceHandle: "output", target: "n2", targetHandle: "a" }
    ];

    const runner = new WorkflowRunner("job1", {
      resolveExecutor: (node) => {
        if (node.id === "n1") {
          return makeExecutor(() => ({ output: 42 }));
        }
        return makeExecutor(() => ({ result: 99 }));
      }
    });

    const result = await runner.run({ job_id: "job1" }, { nodes, edges });

    const outputUpdates = result.messages.filter(
      (m) => m.type === "output_update"
    );
    // n1's "output" is connected → suppressed; n2's "result" is terminal.
    expect(
      outputUpdates.some(
        (m) => m.type === "output_update" && m.node_id === "n1"
      )
    ).toBe(false);
    const n2Update = outputUpdates.find(
      (m) => m.type === "output_update" && m.node_id === "n2"
    );
    expect(n2Update).toBeDefined();
    if (n2Update && n2Update.type === "output_update") {
      expect(n2Update.output_name).toBe("result");
      expect(n2Update.value).toBe(99);
    }
  });

  it("emits output_update only for unconnected handles of a multi-output node", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "n1", type: "test.MultiOut", outputs: { a: "int", b: "str" } },
      { id: "n2", type: "test.Sink", outputs: { result: "int" } }
    ];
    const edges = [
      { source: "n1", sourceHandle: "a", target: "n2", targetHandle: "x" }
    ];

    const runner = new WorkflowRunner("job1", {
      resolveExecutor: (node) => {
        if (node.id === "n1") {
          return makeExecutor(() => ({ a: 10, b: "hello" }));
        }
        return makeExecutor(() => ({ result: 10 }));
      }
    });

    const result = await runner.run({ job_id: "job1" }, { nodes, edges });

    const outputUpdates = result.messages.filter(
      (m) => m.type === "output_update" && m.node_id === "n1"
    );
    // "a" is connected → suppressed; "b" is terminal → emitted.
    expect(outputUpdates.length).toBe(1);
    if (outputUpdates[0].type === "output_update") {
      expect(outputUpdates[0].output_name).toBe("b");
      expect(outputUpdates[0].value).toBe("hello");
    }
  });

  it("always_emit_output_updates restores emission for connected handles", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "n1",
        type: "test.Monitor",
        outputs: { output: "int" },
        always_emit_output_updates: true
      },
      { id: "n2", type: "test.Sink", outputs: { result: "int" } }
    ];
    const edges = [
      { source: "n1", sourceHandle: "output", target: "n2", targetHandle: "a" }
    ];

    const runner = new WorkflowRunner("job1", {
      resolveExecutor: (node) => {
        if (node.id === "n1") {
          return makeExecutor(() => ({ output: 7 }));
        }
        return makeExecutor(() => ({ result: 7 }));
      }
    });

    const result = await runner.run({ job_id: "job1" }, { nodes, edges });

    const n1Update = result.messages.find(
      (m) => m.type === "output_update" && m.node_id === "n1"
    );
    expect(n1Update).toBeDefined();
    if (n1Update && n1Update.type === "output_update") {
      expect(n1Update.output_name).toBe("output");
      expect(n1Update.value).toBe(7);
    }
  });

  it("does not emit output_update for undefined values", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "n1",
        type: "test.Source",
        outputs: { output: "int", extra: "str" }
      }
    ];
    const edges: Array<Record<string, unknown>> = [];

    const runner = new WorkflowRunner("job1", {
      // Only output on "output", not "extra" — both handles terminal.
      resolveExecutor: () => makeExecutor(() => ({ output: 5 }))
    });

    const result = await runner.run({ job_id: "job1" }, { nodes, edges });

    const outputUpdates = result.messages.filter(
      (m) => m.type === "output_update" && m.node_id === "n1"
    );
    // Should only emit for "output", not "extra"
    expect(outputUpdates.length).toBe(1);
    if (outputUpdates[0].type === "output_update") {
      expect(outputUpdates[0].output_name).toBe("output");
    }
  });

  it("uses workflow output name for nodetool.output.Output (vvvv / SDK pins)", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "out1",
        type: "nodetool.output.Output",
        outputs: { output: "any" },
        properties: { name: "assistant_reply", value: null, description: "" }
      }
    ];
    const edges: Array<Record<string, unknown>> = [];

    const runner = new WorkflowRunner("job-pin-names", {
      resolveExecutor: (node) => {
        if (node.id === "out1") {
          return makeExecutor(() => ({ output: "hello" }));
        }
        return makeExecutor(() => ({}));
      }
    });

    const result = await runner.run({ job_id: "job-pin-names" }, { nodes, edges });

    const ou = result.messages.filter(
      (m) => m.type === "output_update" && m.node_id === "out1"
    );
    expect(ou.length).toBeGreaterThanOrEqual(1);
    const first = ou[0];
    expect(first.type).toBe("output_update");
    if (first.type === "output_update") {
      expect(first.output_name).toBe("assistant_reply");
      expect(first.value).toBe("hello");
    }
  });
});
