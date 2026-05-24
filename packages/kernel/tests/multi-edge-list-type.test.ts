/**
 * Tests for T-K-10: Multi-edge list type validation.
 *
 * Verifies that _detectMultiEdgeListInputs only marks handles for list
 * aggregation when the target handle's type is actually a list type.
 */

import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
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
  const detection = (
    runner as unknown as {
      _multiEdgeListInputs: Map<string, Set<string>>;
    }
  )._multiEdgeListInputs;
  return { result, detection };
}

describe("Multi-edge list type validation (T-K-10)", () => {
  it("aggregates multiple upstream values into one list input execution", async () => {
    const consumerCalls: Array<Record<string, unknown>> = [];
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Source", name: "a" },
      { id: "b", type: "test.Source", name: "b" },
      {
        id: "c",
        type: "test.ListConsumer",
        name: "consumer",
        propertyTypes: { items: "list[int]" }
      }
    ];
    const edges: Edge[] = [
      { source: "a", sourceHandle: "out", target: "c", targetHandle: "items" },
      { source: "b", sourceHandle: "out", target: "c", targetHandle: "items" }
    ];

    const runner = makeRunner({
      a: simpleExecutor(() => ({ out: 1 })),
      b: simpleExecutor(() => ({ out: 2 })),
      c: simpleExecutor((inputs) => {
        consumerCalls.push(inputs);
        return {};
      })
    });

    const result = await runner.run(
      { job_id: "j-agg-1", params: {} },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(consumerCalls).toHaveLength(1);
    const items = consumerCalls[0].items;
    expect(Array.isArray(items)).toBe(true);
    expect([...(items as number[])].sort()).toEqual([1, 2]);
  });

  it("aggregates three scalar values into a list[image] handle fed by multiple edges", async () => {
    // Reproduces the Seedance bug: three image-emitting nodes wired into a
    // single list[image] handle on a FAL/Kie node must be aggregated, not
    // truncated to the first arriving envelope.
    const consumerCalls: Array<Record<string, unknown>> = [];
    const nodes: NodeDescriptor[] = [
      { id: "img1", type: "test.Source", name: "img1" },
      { id: "img2", type: "test.Source", name: "img2" },
      { id: "img3", type: "test.Source", name: "img3" },
      {
        id: "seedance",
        type: "test.Seedance",
        name: "seedance",
        propertyTypes: { images: "list[image]" }
      }
    ];
    const edges: Edge[] = [
      { source: "img1", sourceHandle: "out", target: "seedance", targetHandle: "images" },
      { source: "img2", sourceHandle: "out", target: "seedance", targetHandle: "images" },
      { source: "img3", sourceHandle: "out", target: "seedance", targetHandle: "images" }
    ];

    const runner = makeRunner({
      img1: simpleExecutor(() => ({ out: { type: "image", uri: "a.png" } })),
      img2: simpleExecutor(() => ({ out: { type: "image", uri: "b.png" } })),
      img3: simpleExecutor(() => ({ out: { type: "image", uri: "c.png" } })),
      seedance: simpleExecutor((inputs) => {
        consumerCalls.push(inputs);
        return {};
      })
    });

    const result = await runner.run(
      { job_id: "j-agg-2", params: {} },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(consumerCalls).toHaveLength(1);
    const images = consumerCalls[0].images;
    expect(Array.isArray(images)).toBe(true);
    const uris = (images as Array<{ uri: string }>).map((i) => i.uri).sort();
    expect(uris).toEqual(["a.png", "b.png", "c.png"]);
  });

  it("aggregates per-edge list batches into one list[...] handle", async () => {
    // When each upstream emits a list, the aggregated input contains each
    // list as an entry — the consumer can flatten/concat as needed.
    const consumerCalls: Array<Record<string, unknown>> = [];
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Source", name: "a" },
      { id: "b", type: "test.Source", name: "b" },
      {
        id: "c",
        type: "test.ListConsumer",
        name: "consumer",
        propertyTypes: { batches: "list[int]" }
      }
    ];
    const edges: Edge[] = [
      { source: "a", sourceHandle: "out", target: "c", targetHandle: "batches" },
      { source: "b", sourceHandle: "out", target: "c", targetHandle: "batches" }
    ];

    const runner = makeRunner({
      a: simpleExecutor(() => ({ out: [1, 2] })),
      b: simpleExecutor(() => ({ out: [3, 4] })),
      c: simpleExecutor((inputs) => {
        consumerCalls.push(inputs);
        return {};
      })
    });

    const result = await runner.run(
      { job_id: "j-agg-3", params: {} },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(consumerCalls).toHaveLength(1);
    const batches = consumerCalls[0].batches;
    expect(Array.isArray(batches)).toBe(true);
    const sorted = [...(batches as number[][])].sort((x, y) => x[0] - y[0]);
    expect(sorted).toEqual([[1, 2], [3, 4]]);
  });

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

  it("rejects multiple edges into a non-list (scalar) handle", async () => {
    // Node C has a "value" handle typed as "int" (not a list). Under
    // correlation analysis (docs/correlation-design.md §3/§4) a non-list
    // handle may receive at most one incoming edge; two edges has no
    // well-defined merge, so the graph is rejected at load time.
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

    expect(result.status).toBe("failed");
    expect(result.error).toContain('Handle "value" receives 2 edges');
    expect(result.error).toContain("not a list type");
  });

  it("rejects multiple edges into a handle with no propertyTypes", async () => {
    // No propertyTypes on the node — the handle's type is unknown, so it is
    // not a declared list type. Under correlation analysis a handle that is
    // not a list type may not receive multiple edges; the graph is rejected.
    // (The old scheduler aggregated such handles for backward compatibility;
    // correlation requires explicit list metadata — docs/correlation-design.md §3.)
    const nodes: NodeDescriptor[] = [
      { id: "a", type: "test.Source", name: "a" },
      { id: "b", type: "test.Source", name: "b" },
      {
        id: "c",
        type: "test.Consumer",
        name: "consumer"
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

    expect(result.status).toBe("failed");
    expect(result.error).toContain('Handle "items" receives 2 edges');
    expect(result.error).toContain("not a list type");
  });

  it("rejects multiple edges into a union-typed (non-list) handle", async () => {
    // A union type is NOT a list type. Multiple edges into a non-list handle
    // are rejected by correlation analysis (docs/correlation-design.md §3).
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

    expect(result.status).toBe("failed");
    expect(result.error).toContain('Handle "value" receives 2 edges');
    expect(result.error).toContain("not a list type");
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

  it("allows multi-edge only on the list handle; rejects multi-edge on the scalar handle", async () => {
    // Node C has "values" (list[int], 2 edges — valid for multi-edge) and
    // "tag" (str, 2 edges — invalid). Correlation analysis permits multiple
    // edges only on the list-typed handle; the scalar "tag" handle with two
    // edges rejects the graph (docs/correlation-design.md §3/§4).
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

    const { result } = await runAndGetDetection(
      {
        "test.Source": simpleExecutor(() => ({ out: 10, label: "hi" })),
        "test.MixedConsumer": simpleExecutor(() => ({ result: "ok" }))
      },
      nodes,
      edges,
      { a: 1 },
      "j-mixed"
    );

    // The graph is rejected because the non-list "tag" handle has two edges.
    // (Correlation analysis runs before multi-edge list detection, so the
    // run fails before any detection map is populated.)
    expect(result.status).toBe("failed");
    expect(result.error).toContain('Handle "tag" receives 2 edges');
    expect(result.error).toContain("not a list type");
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

  it("rejects multi-edge when propertyTypes lacks the handle's type", async () => {
    // propertyTypes is set but the handle "items" is not in it, so its type is
    // unknown — not a declared list type. Under correlation analysis a handle
    // that is not a list type may not receive multiple edges, so the graph is
    // rejected (docs/correlation-design.md §3). The old scheduler treated a
    // missing type as a backward-compat aggregation fallback; correlation
    // requires explicit list metadata.
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

    const { result } = await runAndGetDetection(
      {
        "test.Source": simpleExecutor(() => ({ out: 99 })),
        "test.Consumer": simpleExecutor((inputs) => ({ result: inputs.items }))
      },
      nodes,
      edges,
      { a: 1 },
      "j-empty-pt"
    );

    expect(result.status).toBe("failed");
    expect(result.error).toContain('Handle "items" receives 2 edges');
    expect(result.error).toContain("not a list type");
  });
});
