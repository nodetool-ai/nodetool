/**
 * E2E Complex Topology Tests – COMPLEX-001..012
 *
 * Tests for non-trivial graph shapes:
 *  - Diamond topology
 *  - Long linear chain
 *  - Fan-out / fan-in
 *  - Disconnected subgraphs
 *  - Error propagation in the middle of a chain
 *  - Streaming + static mix
 */

import { describe, it, expect } from "vitest";
import type {
  NodeDescriptor,
  Edge,
  NodeUpdate,
  EdgeUpdate
} from "@nodetool-ai/protocol";
import { WorkflowRunner } from "../../src/runner.js";
import {
  makeRegistry,
  makeRunner,
  inp,
  nd,
  de,
  Add,
  Passthrough,
  Multiply,
  Constant,
  ErrorNode,
  StreamingCounter
} from "./helpers.js";

// ---------------------------------------------------------------------------
// COMPLEX-001: Diamond topology A→B, A→C, B+C→D
// ---------------------------------------------------------------------------

describe("COMPLEX-001: Diamond topology", () => {
  it("D receives outputs from both B and C branches", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    // A (value=4) → B (+1=5) → D.a
    //             → C (*3=12) → D.b
    // D = Add(a=5, b=12) = 17
    const nodes: NodeDescriptor[] = [
      inp("a_in", "val"),
      nd("B", Add.nodeType, {}, { b: 1 }),
      nd("C", Multiply.nodeType, {}, { b: 3 }),
      nd("D", Add.nodeType, { name: "result" })
    ];
    const edges: Edge[] = [
      de("a_in", "value", "B", "a"),
      de("a_in", "value", "C", "a"),
      de("B", "result", "D", "a"),
      de("C", "result", "D", "b")
    ];

    const result = await runner.run(
      { job_id: "complex-001", params: { val: 4 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs["result"]).toContain(17);
  });
});

// ---------------------------------------------------------------------------
// COMPLEX-002: 10-node linear chain
// ---------------------------------------------------------------------------

describe("COMPLEX-002: 10-node linear chain", () => {
  it("value flows through 8 Add nodes and reaches the sink", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    // Build: in → add0(+1) → add1(+1) → … → add7(+1) → sink
    // 8 adds each adding 1 → input 0 → output 8
    const nodeCount = 8;
    const nodes: NodeDescriptor[] = [inp("src", "x")];
    for (let i = 0; i < nodeCount; i++) {
      nodes.push(nd(`a${i}`, Add.nodeType, {}, { b: 1 }));
    }
    nodes.push(nd("sink", Passthrough.nodeType, { name: "result" }));

    const edges: Edge[] = [];
    // src → a0
    edges.push(de("src", "value", "a0", "a"));
    // ai → a(i+1)
    for (let i = 0; i < nodeCount - 1; i++) {
      edges.push(de(`a${i}`, "result", `a${i + 1}`, "a"));
    }
    // last add → sink
    edges.push(de(`a${nodeCount - 1}`, "result", "sink", "value"));

    const result = await runner.run(
      { job_id: "complex-002", params: { x: 0 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs["result"]).toContain(nodeCount);
  });
});

// ---------------------------------------------------------------------------
// COMPLEX-003: 1→5 fan-out
// ---------------------------------------------------------------------------

describe("COMPLEX-003: Fan-out to 5 sink nodes", () => {
  it("all 5 sinks receive the value from the single source", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const sinkCount = 5;
    const nodes: NodeDescriptor[] = [inp("src", "val")];
    for (let i = 0; i < sinkCount; i++) {
      nodes.push(nd(`s${i}`, Passthrough.nodeType, { name: `out${i}` }));
    }

    const edges: Edge[] = [];
    for (let i = 0; i < sinkCount; i++) {
      edges.push(de("src", "value", `s${i}`, "value"));
    }

    const result = await runner.run(
      { job_id: "complex-003", params: { val: 7 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    for (let i = 0; i < sinkCount; i++) {
      expect(result.outputs[`out${i}`]).toContain(7);
    }
  });
});

// ---------------------------------------------------------------------------
// COMPLEX-006: Two disconnected subgraphs
// ---------------------------------------------------------------------------

describe("COMPLEX-006: Two disconnected subgraphs both execute", () => {
  it("each subgraph completes independently and outputs are captured", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      inp("a1", "val1"),
      nd("add1", Add.nodeType, { name: "result1" }, { b: 10 }),
      inp("a2", "val2"),
      nd("mul2", Multiply.nodeType, { name: "result2" }, { b: 3 })
    ];
    const edges: Edge[] = [
      de("a1", "value", "add1", "a"),
      de("a2", "value", "mul2", "a")
    ];

    const result = await runner.run(
      { job_id: "complex-006", params: { val1: 5, val2: 4 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs["result1"]).toContain(15); // 5+10
    expect(result.outputs["result2"]).toContain(12); // 4*3
  });
});

// ---------------------------------------------------------------------------
// COMPLEX-007: Single node, no edges
// ---------------------------------------------------------------------------

describe("COMPLEX-007: Single source node, no edges", () => {
  it("source Constant node runs and completes", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      nd("const", Constant.nodeType, { name: "val" }, { value: 99 })
    ];
    const edges: Edge[] = [];

    const result = await runner.run(
      { job_id: "complex-007" },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs["val"]).toContain(99);
  });
});

// ---------------------------------------------------------------------------
// COMPLEX-008: Error in middle of chain – downstream never processes
// ---------------------------------------------------------------------------

describe("COMPLEX-008: Error in middle node stops downstream processing", () => {
  it("node C's process() is never called when node B throws", async () => {
    let cCallCount = 0;

    const runner = new WorkflowRunner("test", {
      resolveExecutor: (node) => {
        if (node.id === "B") {
          return {
            async process() {
              throw new Error("B failed");
            }
          };
        }
        if (node.id === "C") {
          return {
            async process() {
              cCallCount++;
              return { result: "c ran" };
            }
          };
        }
        return {
          async process(inputs) {
            return inputs;
          }
        };
      }
    });

    const nodes: NodeDescriptor[] = [
      inp("in", "x"),
      nd("B", "test.B"),
      nd("C", "test.C")
    ];
    const edges: Edge[] = [
      de("in", "value", "B", "value"),
      de("B", "result", "C", "input")
    ];

    const result = await runner.run(
      { job_id: "complex-008", params: { x: 1 } },
      { nodes, edges }
    );

    // B errored → C gets EOS with no data → C's process() never called
    expect(cCallCount).toBe(0);

    // B should have emitted an error node_update
    const bErrors = result.messages.filter(
      (m) =>
        m.type === "node_update" &&
        (m as NodeUpdate).node_id === "B" &&
        (m as NodeUpdate).status === "error"
    );
    expect(bErrors.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// COMPLEX-010: Static + streaming inputs combined
// ---------------------------------------------------------------------------

describe("COMPLEX-010: Static constant + streaming counter feeds Add", () => {
  it("Add fires for each streamed value with the sticky static input", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      inp("static", "b_val"),
      nd(
        "sc",
        StreamingCounter.nodeType,
        { is_streaming_output: true },
        { count: 3, start: 10 }
      ),
      nd("add", Add.nodeType, { name: "result" })
    ];
    const edges: Edge[] = [
      de("static", "value", "add", "b"),
      de("sc", "value", "add", "a", "e-sc-add")
    ];

    const result = await runner.run(
      { job_id: "complex-010", params: { b_val: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    // 3 values (10,11,12) + b=1 → Add fires 3 times
    const active = result.messages.filter(
      (m) =>
        m.type === "edge_update" &&
        (m as EdgeUpdate).edge_id === "e-sc-add" &&
        (m as EdgeUpdate).status === "active"
    );
    expect(active.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// COMPLEX-011: Empty graph
// ---------------------------------------------------------------------------

describe("COMPLEX-011: Empty graph completes immediately", () => {
  it("run() with no nodes returns completed status", async () => {
    const runner = new WorkflowRunner("test", {
      resolveExecutor: () => ({
        async process() {
          return {};
        }
      })
    });

    const result = await runner.run(
      { job_id: "complex-011" },
      { nodes: [], edges: [] }
    );
    expect(result.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// COMPLEX-012: Fan-in with zip_all
// ---------------------------------------------------------------------------

describe("COMPLEX-012: Fan-in with zip_all waits for all inputs", () => {
  it("Add node waits for both upstream branches before firing", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    // Two constant sources → Add (zip_all)
    const nodes: NodeDescriptor[] = [
      nd("c1", Constant.nodeType, {}, { value: 3 }),
      nd("c2", Constant.nodeType, {}, { value: 4 }),
      nd("add", Add.nodeType, { sync_mode: "zip_all", name: "result" })
    ];
    const edges: Edge[] = [
      de("c1", "value", "add", "a"),
      de("c2", "value", "add", "b")
    ];

    const result = await runner.run(
      { job_id: "complex-012" },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs["result"]).toContain(7);
  });
});
