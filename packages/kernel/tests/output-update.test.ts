/**
 * Tests for T-K-9: OutputUpdate messages emitted after node produces output.
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
  it("emits output_update after node produces output", async () => {
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
    expect(outputUpdates.length).toBeGreaterThanOrEqual(1);

    // Check that at least one output_update has the node's output
    const n1Update = outputUpdates.find(
      (m) => m.type === "output_update" && m.node_id === "n1"
    );
    expect(n1Update).toBeDefined();
    if (n1Update && n1Update.type === "output_update") {
      expect(n1Update.output_name).toBe("output");
      expect(n1Update.value).toBe(42);
    }
  });

  it("emits output_update for each output handle", async () => {
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
    expect(outputUpdates.length).toBe(2);
    const handles = outputUpdates.map((m) =>
      m.type === "output_update" ? m.output_name : ""
    );
    expect(handles).toContain("a");
    expect(handles).toContain("b");
  });

  it("does not emit output_update for undefined values", async () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "n1",
        type: "test.Source",
        outputs: { output: "int", extra: "str" }
      },
      { id: "n2", type: "test.Sink", outputs: { result: "int" } }
    ];
    const edges = [
      { source: "n1", sourceHandle: "output", target: "n2", targetHandle: "a" }
    ];

    const runner = new WorkflowRunner("job1", {
      resolveExecutor: (node) => {
        if (node.id === "n1") {
          // Only output on "output", not "extra"
          return makeExecutor(() => ({ output: 5 }));
        }
        return makeExecutor(() => ({ result: 5 }));
      }
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
});
