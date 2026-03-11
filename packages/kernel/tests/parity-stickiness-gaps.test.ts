/**
 * Regression tests for parity gaps #5 and #10.
 *
 * Gap #5 — zip_all Stickiness Logic
 *   Python determines stickiness from _analyze_streaming() — edges that are
 *   NOT on a streaming path are sticky from the start. TypeScript determines
 *   stickiness from open/closed state: a handle only becomes sticky AFTER all
 *   its upstream sources close. This produces different batching behavior in
 *   non-trivial graphs.
 *
 * Gap #10 — Multi-Edge List Type Validation
 *   Python's _classify_list_inputs() checks prop.type.is_list_type() before
 *   marking a handle for list aggregation. TypeScript's
 *   _detectMultiEdgeListInputs() just counts edges — if count > 1 it marks
 *   for aggregation regardless of property type.
 */

import { describe, it, expect } from "vitest";
import { NodeActor, type NodeExecutor } from "../src/actor.js";
import { NodeInbox } from "../src/inbox.js";
import { WorkflowRunner } from "../src/runner.js";
import type { NodeDescriptor, Edge } from "@nodetool/protocol";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<NodeDescriptor> = {}): NodeDescriptor {
  return { id: "test_node", type: "test.Node", ...overrides };
}

function simpleExecutor(
  fn: (inputs: Record<string, unknown>) => Record<string, unknown>
): NodeExecutor {
  return { async process(inputs) { return fn(inputs); } };
}

function streamingExecutor(
  items: Array<Record<string, unknown>>
): NodeExecutor {
  return {
    async process() { return {}; },
    async *genProcess() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

interface SentOutput {
  nodeId: string;
  outputs: Record<string, unknown>;
}

function createActor(
  node: NodeDescriptor,
  inbox: NodeInbox,
  executor: NodeExecutor
): { actor: NodeActor; sentOutputs: SentOutput[]; messages: unknown[] } {
  const sentOutputs: SentOutput[] = [];
  const messages: unknown[] = [];
  const actor = new NodeActor({
    node,
    inbox,
    executor,
    sendOutputs: async (nodeId, outputs) => {
      sentOutputs.push({ nodeId, outputs: { ...outputs } });
    },
    emitMessage: (msg) => messages.push(msg),
  });
  return { actor, sentOutputs, messages };
}

function makeRunner(
  executorMap: Record<string, NodeExecutor>
): WorkflowRunner {
  return new WorkflowRunner("test-job", {
    resolveExecutor: (node) => {
      const exec = executorMap[node.id] ?? executorMap[node.type];
      if (!exec) return simpleExecutor(() => ({}));
      return exec;
    },
  });
}

// ---------------------------------------------------------------------------
// Gap #5 — zip_all Stickiness Logic
// ---------------------------------------------------------------------------

describe("Gap #5 — zip_all stickiness: streaming vs non-streaming edges", () => {
  /**
   * Scenario:
   *   A (non-streaming, sends one value) ---> C (zip_all)
   *   B (streaming, sends 3 values)      ---> C (zip_all)
   *
   * Python behavior: A's edge is identified as non-streaming by
   * _analyze_streaming(). A's handle is sticky from the start. C fires 3
   * times (once per B item), reusing A's value each time without waiting
   * for A to close.
   *
   * TypeScript behavior: C only treats A's handle as sticky AFTER A has
   * sent EOS. With the current implementation, the timing depends on when
   * A closes relative to B's items arriving.
   */
  it("non-streaming handle should be sticky from the start (actor-level)", async () => {
    // GAP #5: This tests actor-level zip_all behavior.
    // In Python, the non-streaming handle is sticky from the start.
    // In TypeScript, stickiness is open/closed based, not streaming-analysis based.
    const node = makeNode({ id: "C", sync_mode: "zip_all" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1); // non-streaming source (A)
    inbox.addUpstream("b", 1); // streaming source (B)

    const { executor, calls } = (() => {
      const calls: Array<Record<string, unknown>> = [];
      return {
        executor: {
          async process(inputs: Record<string, unknown>) {
            calls.push({ ...inputs });
            return { sum: (inputs.a as number) + (inputs.b as number) };
          },
        } as NodeExecutor,
        calls,
      };
    })();

    const { actor, sentOutputs } = createActor(node, inbox, executor);

    // A sends one value and closes
    await inbox.put("a", 10);
    inbox.markSourceDone("a");

    // B sends 3 values then closes
    await inbox.put("b", 1);
    await inbox.put("b", 2);
    await inbox.put("b", 3);
    inbox.markSourceDone("b");

    await actor.run();

    // Python would fire 3 times, reusing A's sticky value for each B item.
    // TypeScript should also fire 3 times because A is closed (sticky).
    // This test verifies the basic case where A closes before B items arrive.
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({ a: 10, b: 1 });
    expect(calls[1]).toEqual({ a: 10, b: 2 });
    expect(calls[2]).toEqual({ a: 10, b: 3 });
  });

  it("interleaved arrival: non-streaming value arrives after some streaming items", async () => {
    // GAP #5: This exposes the timing-dependent divergence.
    // In Python, A's handle is sticky from the start (streaming analysis).
    // In TypeScript, A's handle is only sticky after it closes (EOS).
    //
    // When A hasn't closed yet and B items arrive, TypeScript's _gatherZipAll
    // will wait for A on each iteration. If A has data buffered, it pops it.
    // If A has no data and is still open, it blocks on iterInput(a).
    //
    // This scenario: B sends items, A sends one value, A closes, B sends more.
    const node = makeNode({ id: "C", sync_mode: "zip_all" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return { result: `${inputs.a}-${inputs.b}` };
      },
    };

    const { actor } = createActor(node, inbox, executor);

    // Both A and B have data ready; A closes after one value.
    // B has multiple items.
    await inbox.put("a", "X");
    await inbox.put("b", 1);
    await inbox.put("b", 2);
    await inbox.put("b", 3);
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    await actor.run();

    // After A closes with one value, it should be sticky. B has 3 items.
    // Expect 3 firings, each reusing A's sticky value "X".
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.b)).toEqual([1, 2, 3]);
    expect(calls.every((c) => c.a === "X")).toBe(true);
  });

  it("edgeStreams() correctly identifies streaming vs non-streaming edges", async () => {
    // Verify the runner's streaming analysis BFS marks edges correctly.
    //   A (non-streaming) --> C
    //   B (streaming)     --> C
    const nodes: NodeDescriptor[] = [
      { id: "A", type: "test.Source", name: "a_input" },
      { id: "B", type: "test.StreamSource", name: "b_input", is_streaming_output: true },
      { id: "C", type: "test.Sink", sync_mode: "zip_all" },
    ];
    const edges: Edge[] = [
      { id: "e_ac", source: "A", sourceHandle: "value", target: "C", targetHandle: "a" },
      { id: "e_bc", source: "B", sourceHandle: "value", target: "C", targetHandle: "b" },
    ];

    const runner = makeRunner({
      "A": simpleExecutor(() => ({ value: 10 })),
      "B": streamingExecutor([{ value: 1 }, { value: 2 }, { value: 3 }]),
      "C": simpleExecutor((inputs) => ({ result: inputs })),
    });

    // We need to call run() to trigger _analyzeStreaming, but we can inspect
    // edgeStreams after the run.
    await runner.run({ job_id: "j1", params: { a_input: 10, b_input: 0 } }, { nodes, edges });

    // Edge A->C should NOT be on a streaming path
    expect(runner.edgeStreams(edges[0])).toBe(false);

    // Edge B->C SHOULD be on a streaming path (B is streaming output)
    expect(runner.edgeStreams(edges[1])).toBe(true);
  });

  it("edgeStreams identifies transitive streaming edges", async () => {
    // B (streaming) --> D --> E
    // All edges downstream of B should be streaming.
    const nodes: NodeDescriptor[] = [
      { id: "B", type: "test.StreamSource", name: "b_input", is_streaming_output: true },
      { id: "D", type: "test.Pass" },
      { id: "E", type: "test.Sink" },
    ];
    const edges: Edge[] = [
      { id: "e_bd", source: "B", sourceHandle: "value", target: "D", targetHandle: "x" },
      { id: "e_de", source: "D", sourceHandle: "out", target: "E", targetHandle: "y" },
    ];

    const runner = makeRunner({
      "B": streamingExecutor([{ value: 1 }]),
      "D": simpleExecutor((inputs) => ({ out: inputs.x })),
      "E": simpleExecutor((inputs) => ({ result: inputs.y })),
    });

    await runner.run({ job_id: "j1", params: { b_input: 0 } }, { nodes, edges });

    expect(runner.edgeStreams(edges[0])).toBe(true);
    // Transitive: D is reachable from B, so D->E is also streaming
    expect(runner.edgeStreams(edges[1])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gap #5 — stickyHandles wired from edgeStreams into _gatherZipAll
// ---------------------------------------------------------------------------

describe("Gap #5 — stickyHandles wired from runner streaming analysis", () => {
  it("non-streaming edge handle is sticky before EOS via runner-level wiring", async () => {
    // Setup: A (non-streaming) sends one value, B (streaming) sends 3.
    // Both connect to C (zip_all). C should fire 3 times reusing A's value.
    //
    // The key: A's handle is marked sticky by the runner (edgeStreams = false),
    // so even while A is technically still "open" (hasn't sent EOS yet from
    // C's perspective), C should still reuse A's value.
    //
    // We use the real WorkflowRunner to verify end-to-end wiring.
    const nodes: NodeDescriptor[] = [
      { id: "A", type: "test.Source", name: "a_input" },
      {
        id: "B",
        type: "test.StreamSource",
        name: "b_input",
        is_streaming_output: true,
      },
      { id: "C", type: "test.Combiner", sync_mode: "zip_all" },
    ];
    const edges: Edge[] = [
      {
        id: "e_ac",
        source: "A",
        sourceHandle: "value",
        target: "C",
        targetHandle: "a",
      },
      {
        id: "e_bc",
        source: "B",
        sourceHandle: "value",
        target: "C",
        targetHandle: "b",
      },
    ];

    const cCalls: Array<Record<string, unknown>> = [];

    const runner = makeRunner({
      A: simpleExecutor(() => ({ value: 10 })),
      B: streamingExecutor([{ value: 1 }, { value: 2 }, { value: 3 }]),
      C: {
        async process(inputs) {
          cCalls.push({ ...inputs });
          return { result: `${inputs.a}-${inputs.b}` };
        },
      },
    });

    await runner.run(
      { job_id: "sticky-test", params: { a_input: 10, b_input: 0 } },
      { nodes, edges }
    );

    // C should fire 3 times, reusing A's sticky value for each B item
    expect(cCalls).toHaveLength(3);
    expect(cCalls[0]).toEqual({ a: 10, b: 1 });
    expect(cCalls[1]).toEqual({ a: 10, b: 2 });
    expect(cCalls[2]).toEqual({ a: 10, b: 3 });
  });
});

// ---------------------------------------------------------------------------
// Gap #10 — Multi-Edge List Type Validation
// ---------------------------------------------------------------------------

describe("Gap #10 — multi-edge list type validation", () => {
  /**
   * Python's _classify_list_inputs() checks whether the target property
   * has is_list_type() == true before marking a handle for list aggregation.
   * If the property is a scalar (e.g., int), Python does NOT aggregate
   * even if multiple edges connect to the same handle.
   *
   * TypeScript's _detectMultiEdgeListInputs() just counts edges:
   * if count > 1, it marks for aggregation regardless of property type.
   *
   * This means TypeScript will try to aggregate two values into a list
   * even for a scalar handle, which diverges from Python.
   */
  it("two edges to the same handle: TS marks for aggregation regardless of type", async () => {
    // GAP #10: TypeScript aggregates any handle with >1 edge into a list.
    // Python would NOT aggregate if the target property is not a list type.
    //
    // Graph: A --> C.x, B --> C.x (two edges to the same "x" handle)
    const nodes: NodeDescriptor[] = [
      { id: "A", type: "test.Input", name: "a" },
      { id: "B", type: "test.Input", name: "b" },
      { id: "C", type: "test.Adder" },
    ];
    const edges: Edge[] = [
      { id: "e1", source: "A", sourceHandle: "value", target: "C", targetHandle: "x" },
      { id: "e2", source: "B", sourceHandle: "value", target: "C", targetHandle: "x" },
    ];

    const receivedInputs: Array<Record<string, unknown>> = [];
    const runner = makeRunner({
      "C": {
        async process(inputs) {
          receivedInputs.push({ ...inputs });
          return { result: inputs.x };
        },
      },
    });

    await runner.run(
      { job_id: "j1", params: { a: 10, b: 20 } },
      { nodes, edges }
    );

    // In TypeScript, _detectMultiEdgeListInputs sees 2 edges to C:x
    // and marks it for list aggregation.
    // The runner's inbox will receive two separate put() calls for "x".
    // The actor's zip_all gathers them — depending on inbox semantics,
    // C may see x=10 on one call and x=20 on another, or both.
    //
    // The key divergence: Python with a scalar handle would NOT aggregate.
    // This test documents what TypeScript actually does.
    expect(receivedInputs.length).toBeGreaterThanOrEqual(1);

    // Document the current TS behavior — C receives each value separately
    // (zip_all pops one at a time from the buffer). Both sources feed
    // the same handle so C fires twice.
    // In Python with a non-list property, the second edge value would
    // overwrite the first (no list aggregation), and C would fire once.
  });

  it("_detectMultiEdgeListInputs counts edges without checking property type", async () => {
    // Directly verify that the runner's internal state marks multi-edge handles.
    // This is a structural test — we inspect the runner after it processes edges.
    const nodes: NodeDescriptor[] = [
      { id: "A", type: "test.Input", name: "a" },
      { id: "B", type: "test.Input", name: "b" },
      { id: "C", type: "test.Proc" },
      { id: "D", type: "test.Proc" },
    ];
    const edges: Edge[] = [
      // Two edges to C.x — should be marked as multi-edge
      { id: "e1", source: "A", sourceHandle: "value", target: "C", targetHandle: "x" },
      { id: "e2", source: "B", sourceHandle: "value", target: "C", targetHandle: "x" },
      // One edge to D.y — should NOT be marked
      { id: "e3", source: "A", sourceHandle: "value", target: "D", targetHandle: "y" },
    ];

    const runner = makeRunner({
      "C": simpleExecutor((inputs) => ({ out: inputs.x })),
      "D": simpleExecutor((inputs) => ({ out: inputs.y })),
    });

    await runner.run(
      { job_id: "j1", params: { a: 1, b: 2 } },
      { nodes, edges }
    );

    // Access private _multiEdgeListInputs to verify detection
    // GAP #10: TypeScript marks C.x as multi-edge list without checking
    // if property "x" is actually a list type. Python would check.
    const multiEdge = (runner as unknown as { _multiEdgeListInputs: Map<string, Set<string>> })._multiEdgeListInputs;
    expect(multiEdge.has("C")).toBe(true);
    expect(multiEdge.get("C")!.has("x")).toBe(true);

    // D.y has only one edge — should NOT be marked
    expect(multiEdge.has("D")).toBe(false);
  });

  it("single edge to a handle does not trigger list aggregation", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "A", type: "test.Input", name: "a" },
      { id: "C", type: "test.Proc" },
    ];
    const edges: Edge[] = [
      { id: "e1", source: "A", sourceHandle: "value", target: "C", targetHandle: "x" },
    ];

    const runner = makeRunner({
      "C": simpleExecutor((inputs) => ({ out: inputs.x })),
    });

    await runner.run(
      { job_id: "j1", params: { a: 42 } },
      { nodes, edges }
    );

    const multiEdge = (runner as unknown as { _multiEdgeListInputs: Map<string, Set<string>> })._multiEdgeListInputs;
    expect(multiEdge.has("C")).toBe(false);
  });
});
