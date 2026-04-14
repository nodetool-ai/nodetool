/**
 * End-to-end tests for the bypass routing integration in WorkflowRunner.
 *
 * Verifies that nodes marked with `ui_properties.bypassed === true` are
 * skipped at execution time and that their inputs are routed to
 * downstream targets when types match.
 */

import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import type { NodeDescriptor, Edge } from "@nodetool/protocol";
import type { NodeExecutor } from "../src/actor.js";

function simpleExecutor(
  fn: (inputs: Record<string, unknown>) => Record<string, unknown>
): NodeExecutor {
  return {
    async process(inputs) {
      return fn(inputs);
    }
  };
}

function makeRunner(executors: Record<string, NodeExecutor>): WorkflowRunner {
  return new WorkflowRunner("test-job", {
    resolveExecutor: (node) => {
      const exec = executors[node.id] ?? executors[node.type];
      if (!exec) return simpleExecutor(() => ({}));
      return exec;
    }
  });
}

describe("WorkflowRunner – bypassed nodes", () => {
  it("skips a bypassed node and routes the input straight through", async () => {
    // input(value: string) → double(bypassed, a: string → result: string) → output(value: string)
    // With bypass, "double" never runs — the input flows directly to "output".
    const nodes: NodeDescriptor[] = [
      { id: "input", type: "test.Input", name: "x" },
      {
        id: "double",
        type: "test.Double",
        outputs: { result: "string" },
        propertyTypes: { a: "string" },
        ui_properties: { bypassed: true }
      },
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

    let doubleRan = false;
    const runner = makeRunner({
      "test.Double": simpleExecutor(() => {
        doubleRan = true;
        return { result: "SHOULD_NOT_APPEAR" };
      }),
      "test.Output": simpleExecutor((inputs) => ({ value: inputs.value }))
    });

    const result = await runner.run(
      { job_id: "j-bypass-1", params: { x: "hello" } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(doubleRan).toBe(false);
    expect(result.outputs.result).toContain("hello");
  });

  it("drops outgoing edges whose types do not match any input", async () => {
    // text_input(string) → transform(bypassed, in: string → out: image)
    // → display(image). No matching input for `out: image`, edge dropped,
    // display receives no input and its list stays empty.
    const nodes: NodeDescriptor[] = [
      {
        id: "text_input",
        type: "test.Input",
        name: "text",
        outputs: { value: "string" }
      },
      {
        id: "transform",
        type: "test.Transform",
        outputs: { out: "image" },
        propertyTypes: { in: "string" },
        ui_properties: { bypassed: true }
      },
      {
        id: "display",
        type: "test.Output",
        name: "out",
        propertyTypes: { value: "image" }
      }
    ];
    const edges: Edge[] = [
      {
        source: "text_input",
        sourceHandle: "value",
        target: "transform",
        targetHandle: "in"
      },
      {
        source: "transform",
        sourceHandle: "out",
        target: "display",
        targetHandle: "value"
      }
    ];

    const displayInputs: Array<Record<string, unknown>> = [];
    const runner = makeRunner({
      "test.Output": simpleExecutor((inputs) => {
        displayInputs.push(inputs);
        return { value: inputs.value };
      })
    });

    const result = await runner.run(
      { job_id: "j-bypass-2", params: { text: "ignored" } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    // No compatible route means display never receives the upstream
    // string value — the dropped edge never delivers anything.
    expect(displayInputs.some((i) => i.value === "ignored")).toBe(false);
  });

  it("collapses a chain of bypassed nodes into a single edge", async () => {
    // input → A(bypassed) → B(bypassed) → output
    const nodes: NodeDescriptor[] = [
      { id: "input", type: "test.Input", name: "x" },
      {
        id: "A",
        type: "test.Noop",
        outputs: { out: "string" },
        propertyTypes: { in: "string" },
        ui_properties: { bypassed: true }
      },
      {
        id: "B",
        type: "test.Noop",
        outputs: { out: "string" },
        propertyTypes: { in: "string" },
        ui_properties: { bypassed: true }
      },
      { id: "output", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      { source: "input", sourceHandle: "value", target: "A", targetHandle: "in" },
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      {
        source: "B",
        sourceHandle: "out",
        target: "output",
        targetHandle: "value"
      }
    ];

    let anyRan = false;
    const runner = makeRunner({
      "test.Noop": simpleExecutor(() => {
        anyRan = true;
        return { out: "SHOULD_NOT_APPEAR" };
      }),
      "test.Output": simpleExecutor((inputs) => ({ value: inputs.value }))
    });

    const result = await runner.run(
      { job_id: "j-bypass-3", params: { x: "chain" } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(anyRan).toBe(false);
    expect(result.outputs.result).toContain("chain");
  });
});
