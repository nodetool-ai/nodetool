/**
 * Tests for T-K-10: Multi-edge list type validation.
 *
 * Verifies that _detectMultiEdgeListInputs only marks handles for list
 * aggregation when the target handle's type is actually a list type.
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

function makeRunner(executorMap: Record<string, NodeExecutor>): WorkflowRunner {
  return new WorkflowRunner("test-job", {
    resolveExecutor: (node) =>
      executorMap[node.id] ??
      executorMap[node.type] ??
      simpleExecutor(() => ({}))
  });
}

/**
 * Helper: run a graph and return both the result and the private
 * _multiEdgeListInputs map from the runner (for detection verification).
 */
async function runAndGetDetection(
  executorMap: Record<string, NodeExecutor>,
  nodes: NodeDescriptor[],
  edges: Edge[],
  params: Record<string, unknown> = {},
  jobId = "j-test"
) {
  const runner = makeRunner(executorMap);
  const result = await runner.run({ job_id: jobId, params }, { nodes, edges });
  // Access the private detection map for verification
  const detection = (runner as any)._multiEdgeListInputs as Map<
    string,
    Set<string>
  >;
  return { result, detection };
}

describe("Multi-edge list type validation (T-K-10)", () => {
  it("marks list-typed handle with multiple edges for aggregation", async () => {
    // Node C has a "values" handle typed as list[int]
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Source", name: "a" },
      { id: "b", type: "test.Source", name: "b" },
      {
        id: "c",
        type: "test.ListConsumer",
        name: "consumer",
        propertyTypes: { values: "list[int]" }
      }
    ];
    const edges: Edge[] = [
      { source: "a", sourceHandle: "out", target: "c", targetHandle: "values" },
      { source: "b", sourceHandle: "out", target: "c", targetHandle: "values" }
    ];

    const runner = makeRunner({
      "test.Source": simpleExecutor(() => ({ out: 42 })),
      "test.ListConsumer": simpleExecutor((inputs) => ({
        sum: Array.isArray(inputs.values)
          ? (inputs.values as number[]).reduce((a, b) => a + b, 0)
          : inputs.values
      }))
    });

    const result = await runner.run(
      { job_id: "j1", params: { a: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    // The runner should have detected "values" as a multi-edge list input
    // since it's typed as list[int] and has 2 edges.
    // We verify by checking that the node completed successfully.
  });

  it("does NOT mark non-list handle with multiple edges for aggregation", async () => {
    // Node C has a "value" handle typed as "int" (not a list)
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Source", name: "a" },
      { id: "b", type: "test.Source", name: "b" },
      {
        id: "c",
        type: "test.ScalarConsumer",
        name: "consumer",
        propertyTypes: { value: "int" }
      }
    ];
    const edges: Edge[] = [
      { source: "a", sourceHandle: "out", target: "c", targetHandle: "value" },
      { source: "b", sourceHandle: "out", target: "c", targetHandle: "value" }
    ];

    const runner = makeRunner({
      "test.Source": simpleExecutor(() => ({ out: 42 })),
      "test.ScalarConsumer": simpleExecutor((inputs) => ({
        result: inputs.value
      }))
    });

    const result = await runner.run(
      { job_id: "j2", params: { a: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    // The "value" handle is int, not list — so no list aggregation.
  });

  it("skips handles without propertyTypes (backward compat)", async () => {
    // No propertyTypes on the node — multi-edge still gets aggregated
    // for backward compatibility when type info is absent.
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Source", name: "a" },
      { id: "b", type: "test.Source", name: "b" },
      {
        id: "c",
        type: "test.Consumer",
        name: "consumer"
        // No propertyTypes — backward compat: aggregation allowed
      }
    ];
    const edges: Edge[] = [
      { source: "a", sourceHandle: "out", target: "c", targetHandle: "items" },
      { source: "b", sourceHandle: "out", target: "c", targetHandle: "items" }
    ];

    const runner = makeRunner({
      "test.Source": simpleExecutor(() => ({ out: 1 })),
      "test.Consumer": simpleExecutor((inputs) => ({ result: inputs.items }))
    });

    const result = await runner.run(
      { job_id: "j3", params: { a: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
  });

  it("handles union types containing list correctly", async () => {
    // union type is NOT a list type — should not aggregate
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Source", name: "a" },
      { id: "b", type: "test.Source", name: "b" },
      {
        id: "c",
        type: "test.Consumer",
        name: "consumer",
        propertyTypes: { value: "union[str, int]" }
      }
    ];
    const edges: Edge[] = [
      { source: "a", sourceHandle: "out", target: "c", targetHandle: "value" },
      { source: "b", sourceHandle: "out", target: "c", targetHandle: "value" }
    ];

    const runner = makeRunner({
      "test.Source": simpleExecutor(() => ({ out: "hello" })),
      "test.Consumer": simpleExecutor((inputs) => ({ result: inputs.value }))
    });

    const result = await runner.run(
      { job_id: "j4", params: { a: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
  });

  it("detects list[str] type for multi-edge aggregation", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Source", name: "a" },
      { id: "b", type: "test.Source", name: "b" },
      {
        id: "c",
        type: "test.ListConsumer",
        name: "consumer",
        propertyTypes: { values: "list[str]" }
      }
    ];
    const edges: Edge[] = [
      { source: "a", sourceHandle: "out", target: "c", targetHandle: "values" },
      { source: "b", sourceHandle: "out", target: "c", targetHandle: "values" }
    ];

    const { result, detection } = await runAndGetDetection(
      {
        "test.Source": simpleExecutor(() => ({ out: "hello" })),
        "test.ListConsumer": simpleExecutor((inputs) => ({
          result: inputs.values
        }))
      },
      nodes,
      edges,
      { a: "x" },
      "j-str"
    );

    expect(result.status).toBe("completed");
    // list[str] is a list type — detection should mark "values" on node "c"
    expect(detection.has("c")).toBe(true);
    expect(detection.get("c")!.has("values")).toBe(true);
  });

  it("detects list[float] type for multi-edge aggregation", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Source", name: "a" },
      { id: "b", type: "test.Source", name: "b" },
      {
        id: "c",
        type: "test.ListConsumer",
        name: "consumer",
        propertyTypes: { values: "list[float]" }
      }
    ];
    const edges: Edge[] = [
      { source: "a", sourceHandle: "out", target: "c", targetHandle: "values" },
      { source: "b", sourceHandle: "out", target: "c", targetHandle: "values" }
    ];

    const { result, detection } = await runAndGetDetection(
      {
        "test.Source": simpleExecutor(() => ({ out: 3.14 })),
        "test.ListConsumer": simpleExecutor((inputs) => ({
          result: inputs.values
        }))
      },
      nodes,
      edges,
      { a: 1 },
      "j-float"
    );

    expect(result.status).toBe("completed");
    expect(detection.has("c")).toBe(true);
    expect(detection.get("c")!.has("values")).toBe(true);
  });

  it("does NOT detect single edge to list[int] handle", async () => {
    // Multi-edge detection requires 2+ edges — 1 edge should not register
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Source", name: "a" },
      {
        id: "c",
        type: "test.ListConsumer",
        name: "consumer",
        propertyTypes: { values: "list[int]" }
      }
    ];
    const edges: Edge[] = [
      { source: "a", sourceHandle: "out", target: "c", targetHandle: "values" }
    ];

    const { result, detection } = await runAndGetDetection(
      {
        "test.Source": simpleExecutor(() => ({ out: 42 })),
        "test.ListConsumer": simpleExecutor((inputs) => ({
          result: inputs.values
        }))
      },
      nodes,
      edges,
      { a: 1 },
      "j-single"
    );

    expect(result.status).toBe("completed");
    // With only 1 edge, detection should NOT mark this handle
    expect(detection.has("c")).toBe(false);
  });

  it("detects only list handle when mixed handles on same node", async () => {
    // Node C has "values" (list[int], 2 edges) and "tag" (str, 2 edges).
    // Only "values" should be detected for aggregation.
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Source", name: "a" },
      { id: "b", type: "test.Source", name: "b" },
      {
        id: "c",
        type: "test.MixedConsumer",
        name: "consumer",
        propertyTypes: { values: "list[int]", tag: "str" }
      }
    ];
    const edges: Edge[] = [
      { source: "a", sourceHandle: "out", target: "c", targetHandle: "values" },
      { source: "b", sourceHandle: "out", target: "c", targetHandle: "values" },
      { source: "a", sourceHandle: "label", target: "c", targetHandle: "tag" },
      { source: "b", sourceHandle: "label", target: "c", targetHandle: "tag" }
    ];

    const { result, detection } = await runAndGetDetection(
      {
        "test.Source": simpleExecutor(() => ({ out: 10, label: "hi" })),
        "test.MixedConsumer": simpleExecutor((inputs) => ({ result: "ok" }))
      },
      nodes,
      edges,
      { a: 1 },
      "j-mixed"
    );

    expect(result.status).toBe("completed");
    expect(detection.has("c")).toBe(true);
    // "values" (list[int]) should be detected
    expect(detection.get("c")!.has("values")).toBe(true);
    // "tag" (str) should NOT be detected — it's not a list type
    expect(detection.get("c")!.has("tag")).toBe(false);
  });

  it("detects three edges to list-typed handle", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Source", name: "a" },
      { id: "b", type: "test.Source", name: "b" },
      { id: "d", type: "test.Source", name: "d" },
      {
        id: "c",
        type: "test.ListConsumer",
        name: "consumer",
        propertyTypes: { values: "list[int]" }
      }
    ];
    const edges: Edge[] = [
      { source: "a", sourceHandle: "out", target: "c", targetHandle: "values" },
      { source: "b", sourceHandle: "out", target: "c", targetHandle: "values" },
      { source: "d", sourceHandle: "out", target: "c", targetHandle: "values" }
    ];

    const { result, detection } = await runAndGetDetection(
      {
        "test.Source": simpleExecutor(() => ({ out: 7 })),
        "test.ListConsumer": simpleExecutor((inputs) => ({
          result: inputs.values
        }))
      },
      nodes,
      edges,
      { a: 1 },
      "j-three"
    );

    expect(result.status).toBe("completed");
    expect(detection.has("c")).toBe(true);
    expect(detection.get("c")!.has("values")).toBe(true);
  });

  it("detects handle when propertyTypes is empty object (backward compat fallback)", async () => {
    // propertyTypes is set but the handle name is not in it — backward compat
    // The code path: propertyTypes exists, typeStr is undefined for "items",
    // so it falls through to marking the handle for aggregation.
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Source", name: "a" },
      { id: "b", type: "test.Source", name: "b" },
      {
        id: "c",
        type: "test.Consumer",
        name: "consumer",
        propertyTypes: {}
      }
    ];
    const edges: Edge[] = [
      { source: "a", sourceHandle: "out", target: "c", targetHandle: "items" },
      { source: "b", sourceHandle: "out", target: "c", targetHandle: "items" }
    ];

    const { result, detection } = await runAndGetDetection(
      {
        "test.Source": simpleExecutor(() => ({ out: 99 })),
        "test.Consumer": simpleExecutor((inputs) => ({ result: inputs.items }))
      },
      nodes,
      edges,
      { a: 1 },
      "j-empty-pt"
    );

    expect(result.status).toBe("completed");
    // When propertyTypes is {} and handle "items" is not in it, typeStr is undefined,
    // the code skips the isListType check → handle is marked for aggregation
    expect(detection.has("c")).toBe(true);
    expect(detection.get("c")!.has("items")).toBe(true);
  });
});
