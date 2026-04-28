/**
 * Runner-level pre-flight node validation.
 *
 * Exercises WorkflowRunnerOptions.validateNode — the hook that catches
 * missing required fields and unset model selections before any actor
 * is spawned.
 */
import { describe, it, expect } from "vitest";
import { WorkflowRunner, type NodeValidator } from "../src/runner.js";
import type { NodeDescriptor, Edge } from "@nodetool/protocol";
import type { NodeExecutor } from "../src/actor.js";

function passthrough(): NodeExecutor {
  return {
    async process(inputs) {
      return { value: inputs.in };
    }
  };
}

function makeRunner(validator?: NodeValidator): WorkflowRunner {
  return new WorkflowRunner("test-job", {
    resolveExecutor: () => passthrough(),
    validateNode: validator
  });
}

describe("WorkflowRunner – pre-flight node validation", () => {
  it("fails the run with collected validation issues", async () => {
    const validator: NodeValidator = (node) => {
      if (node.type === "test.NeedsModel") {
        return [
          {
            property: "model",
            message: 'Property "model" requires a language_model'
          }
        ];
      }
      return [];
    };
    const runner = makeRunner(validator);

    const nodes: NodeDescriptor[] = [
      { id: "n1", type: "test.NeedsModel", name: "model_in", properties: {} }
    ];
    const result = await runner.run(
      { job_id: "j1" },
      { nodes, edges: [] }
    );

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/Graph validation failed/);
    expect(result.error).toMatch(/test\.NeedsModel/);
    expect(result.error).toMatch(/model/);
  });

  it("passes connectedHandles to the validator and skips connected properties", async () => {
    const seen: { id: string; handles: string[] }[] = [];
    const validator: NodeValidator = (node, connected) => {
      seen.push({ id: node.id, handles: [...connected] });
      return [];
    };
    const runner = makeRunner(validator);

    const nodes: NodeDescriptor[] = [
      { id: "src", type: "test.Source", name: "src", properties: {} },
      { id: "dst", type: "test.Dest", properties: {} }
    ];
    const edges: Edge[] = [
      { source: "src", sourceHandle: "out", target: "dst", targetHandle: "in" }
    ];

    await runner.run({ job_id: "j2" }, { nodes, edges });

    const dst = seen.find((s) => s.id === "dst")!;
    expect(dst.handles).toEqual(["in"]);
    const src = seen.find((s) => s.id === "src")!;
    expect(src.handles).toEqual([]);
  });

  it("skips validation entirely when no validateNode option is provided", async () => {
    const runner = new WorkflowRunner("test-job", {
      resolveExecutor: () => passthrough()
    });
    const result = await runner.run(
      { job_id: "j3" },
      {
        nodes: [{ id: "n1", type: "test.Anything", properties: {} }],
        edges: []
      }
    );
    expect(result.status).toBe("completed");
  });

  it("aggregates issues across multiple nodes", async () => {
    const validator: NodeValidator = (node) => [
      {
        property: "x",
        message: `${node.id} missing x`
      }
    ];
    const runner = makeRunner(validator);

    const result = await runner.run(
      { job_id: "j4" },
      {
        nodes: [
          { id: "a", type: "t.A", properties: {} },
          { id: "b", type: "t.B", properties: {} }
        ],
        edges: []
      }
    );

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/2 issue/);
    expect(result.error).toMatch(/a missing x/);
    expect(result.error).toMatch(/b missing x/);
  });

  it("ignores control edges when computing connected handles", async () => {
    const seen: { id: string; handles: string[] }[] = [];
    const validator: NodeValidator = (node, connected) => {
      seen.push({ id: node.id, handles: [...connected] });
      return [];
    };
    const runner = makeRunner(validator);

    const nodes: NodeDescriptor[] = [
      { id: "ctl", type: "test.Controller", properties: {} },
      { id: "tgt", type: "test.Target", properties: {} }
    ];
    const edges: Edge[] = [
      {
        source: "ctl",
        sourceHandle: "trigger",
        target: "tgt",
        targetHandle: "__control__",
        edge_type: "control"
      }
    ];

    await runner.run({ job_id: "j5" }, { nodes, edges });

    const tgt = seen.find((s) => s.id === "tgt")!;
    // Control edges must not be treated as data inputs for validation.
    expect(tgt.handles).toEqual([]);
  });
});
