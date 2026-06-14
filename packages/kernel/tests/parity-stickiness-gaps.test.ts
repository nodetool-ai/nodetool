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
import {
  analyzeCorrelation,
  type NodeAnalysis
} from "../src/correlation-analysis.js";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<NodeDescriptor> = {}): NodeDescriptor {
  return { id: "test_node", type: "test.Node", ...overrides };
}

function simpleExecutor(
  fn: (inputs: Record<string, unknown>) => Record<string, unknown>
): NodeExecutor {
  return {
    async process(inputs) {
      return fn(inputs);
    }
  };
}

function streamingExecutor(
  items: Array<Record<string, unknown>>
): NodeExecutor {
  return {
    async process() {
      return {};
    },
    async *genProcess() {
      for (const item of items) {
        yield item;
      }
    }
  };
}

interface SentOutput {
  nodeId: string;
  outputs: Record<string, unknown>;
}

function createActor(
  node: NodeDescriptor,
  inbox: NodeInbox,
  executor: NodeExecutor,
  correlation?: NodeAnalysis
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
    correlation
  });
  return { actor, sentOutputs, messages };
}

/**
 * Build the real `NodeAnalysis` for the combiner node "C" in the canonical
 * zip_all graph used throughout Gap #5:
 *
 *   A (single output)            ---> C.a
 *   B (per-item iteration output) ---> C.b
 *
 * The static analyzer assigns C.a an empty scope (strict-prefix / empty-scope
 * sticky) and C.b the iteration scope [B:items] (max-scope). This is what
 * makes A's value sticky and reused for each distinct B item — see
 * docs/correlation-design.md §4 (lines 334-356): empty-scope handles stay
 * sticky, max-scope handles fire per projected key.
 */
function zipAllCAnalysis(): NodeAnalysis {
  const nodes: NodeDescriptor[] = [
    {
      id: "A",
      type: "test.Source",
      outputs: { value: "any" },
      output_correlation: { value: { kind: "single", source: "__execution__" } }
    },
    {
      id: "B",
      type: "test.ForEach",
      outputs: { value: "any" },
      output_correlation: {
        value: { kind: "iteration", source: "__execution__", group: "items" }
      }
    },
    {
      id: "C",
      type: "test.Combiner",
      outputs: { sum: "any" },
      output_correlation: { sum: { kind: "single", source: "__execution__" } }
    }
  ];
  const edges: Edge[] = [
    { id: "e_ac", source: "A", sourceHandle: "value", target: "C", targetHandle: "a" },
    { id: "e_bc", source: "B", sourceHandle: "value", target: "C", targetHandle: "b" }
  ];
  const result = analyzeCorrelation({ nodes, edges });
  if (result.issues.length > 0) {
    throw new Error(
      `unexpected analysis issues: ${result.issues.map((i) => i.message).join("; ")}`
    );
  }
  return result.nodes.get("C")!;
}

/** Lineage that places a B item at iteration index `i` (root "B:items"). */
function bItemLineage(i: number): Record<string, { index: number }> {
  return { "B:items": { index: i } };
}

function makeRunner(executorMap: Record<string, NodeExecutor>): WorkflowRunner {
  return new WorkflowRunner("test-job", {
    resolveExecutor: (node) => {
      const exec = executorMap[node.id] ?? executorMap[node.type];
      if (!exec) return simpleExecutor(() => ({}));
      return exec;
    }
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
  it("empty-scope handle is sticky; max-scope handle fires per item (actor-level)", async () => {
    // GAP #5 under correlation: stickiness is decided by the static scope of
    // each handle, not by sync_mode. The analyzer assigns C.a the empty scope
    // (sticky) and C.b the iteration scope [B:items] (max-scope). C therefore
    // fires once per distinct B item, reusing A's sticky value each time.
    // docs/correlation-design.md §4 lines 335-355.
    const node = makeNode({ id: "C" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1); // non-streaming source (A) → empty scope
    inbox.addUpstream("b", 1); // per-item source (B) → [B:items]

    const { executor, calls } = (() => {
      const calls: Array<Record<string, unknown>> = [];
      return {
        executor: {
          async process(inputs: Record<string, unknown>) {
            calls.push({ ...inputs });
            return { sum: (inputs.a as number) + (inputs.b as number) };
          }
        } as NodeExecutor,
        calls
      };
    })();

    const { actor } = createActor(node, inbox, executor, zipAllCAnalysis());

    // A sends one value and closes
    await inbox.put("a", 10);
    inbox.markSourceDone("a");

    // B sends 3 items, each at its own iteration index, then closes
    await inbox.put("b", 1, { correlation_lineage: bItemLineage(0) });
    await inbox.put("b", 2, { correlation_lineage: bItemLineage(1) });
    await inbox.put("b", 3, { correlation_lineage: bItemLineage(2) });
    inbox.markSourceDone("b");

    await actor.run();

    // C fires 3 times, reusing A's sticky value for each B item.
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({ a: 10, b: 1 });
    expect(calls[1]).toEqual({ a: 10, b: 2 });
    expect(calls[2]).toEqual({ a: 10, b: 3 });
  });

  it("interleaved arrival: empty-scope value buffered alongside the items", async () => {
    // GAP #5 under correlation: the empty-scope handle A is sticky from the
    // moment its envelope is buffered — it does not need to close first. The
    // actor buckets each B item by its projected key [B:items=i] and reuses
    // A's sticky value for every key. docs/correlation-design.md §4 line 355.
    const node = makeNode({ id: "C" });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    const calls: Array<Record<string, unknown>> = [];
    const executor: NodeExecutor = {
      async process(inputs) {
        calls.push({ ...inputs });
        return { result: `${inputs.a}-${inputs.b}` };
      }
    };

    const { actor } = createActor(node, inbox, executor, zipAllCAnalysis());

    // A and all three B items are buffered before the actor runs.
    await inbox.put("a", "X");
    await inbox.put("b", 1, { correlation_lineage: bItemLineage(0) });
    await inbox.put("b", 2, { correlation_lineage: bItemLineage(1) });
    await inbox.put("b", 3, { correlation_lineage: bItemLineage(2) });
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    await actor.run();

    // A's empty-scope value "X" is sticky and reused for every B item.
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.b)).toEqual([1, 2, 3]);
    expect(calls.every((c) => c.a === "X")).toBe(true);
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
      {
        id: "A",
        type: "test.Source",
        name: "a_input",
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      },
      {
        id: "B",
        type: "test.StreamSource",
        name: "b_input",
        is_streaming_output: true,
        outputs: { value: "any" },
        // B emits one logical item per yield, so its output is an iteration
        // root. This is what gives C.b a max-scope key per item while C.a stays
        // empty-scope sticky. docs/correlation-design.md §3 (iteration outputs).
        output_correlation: {
          value: { kind: "iteration", source: "__execution__", group: "items" }
        }
      },
      {
        id: "C",
        type: "test.Combiner",
        outputs: { result: "any" },
        output_correlation: {
          result: { kind: "single", source: "__execution__" }
        }
      }
    ];
    const edges: Edge[] = [
      {
        id: "e_ac",
        source: "A",
        sourceHandle: "value",
        target: "C",
        targetHandle: "a"
      },
      {
        id: "e_bc",
        source: "B",
        sourceHandle: "value",
        target: "C",
        targetHandle: "b"
      }
    ];

    const cCalls: Array<Record<string, unknown>> = [];

    const runner = makeRunner({
      A: simpleExecutor(() => ({ value: 10 })),
      B: streamingExecutor([{ value: 1 }, { value: 2 }, { value: 3 }]),
      C: {
        async process(inputs) {
          cCalls.push({ ...inputs });
          return { result: `${inputs.a}-${inputs.b}` };
        }
      }
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
   * The original gap recorded a divergence: TypeScript's
   * _detectMultiEdgeListInputs() counted edges and aggregated regardless of
   * property type, while Python's _classify_list_inputs() checked
   * is_list_type() first.
   *
   * The correlation redesign closed this gap. Both the runner
   * (_detectMultiEdgeListInputs, src/runner.ts ~line 645) and the static
   * analyzer (analyzeCorrelation, src/correlation-analysis.ts ~line 336) now
   * require the target handle to be a list type before aggregating. Two edges
   * into a NON-list handle are a hard correlation-analysis error
   * (docs/correlation-design.md §3 line 358: "A non-list, non-repeating handle
   * may receive at most one value for a given key").
   *
   * These tests now assert the post-redesign behavior.
   */
  it("two edges to a list handle: marked for aggregation; scalar handle is rejected", async () => {
    // List handle: two edges into C.x where x is list[int]. The graph is
    // valid, C runs, and the handle is marked for aggregation.
    const listNodes: NodeDescriptor[] = [
      {
        id: "A",
        type: "test.Input",
        name: "a",
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      },
      {
        id: "B",
        type: "test.Input",
        name: "b",
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      },
      {
        id: "C",
        type: "test.Adder",
        propertyTypes: { x: "list[int]" },
        outputs: { result: "any" },
        output_correlation: {
          result: { kind: "single", source: "__execution__" }
        }
      }
    ];
    const listEdges: Edge[] = [
      { id: "e1", source: "A", sourceHandle: "value", target: "C", targetHandle: "x" },
      { id: "e2", source: "B", sourceHandle: "value", target: "C", targetHandle: "x" }
    ];

    const receivedInputs: Array<Record<string, unknown>> = [];
    const listRunner = makeRunner({
      C: {
        async process(inputs) {
          receivedInputs.push({ ...inputs });
          return { result: inputs.x };
        }
      }
    });
    const listResult = await listRunner.run(
      { job_id: "list", params: { a: 10, b: 20 } },
      { nodes: listNodes, edges: listEdges }
    );

    expect(listResult.status).toBe("completed");
    expect(receivedInputs.length).toBeGreaterThanOrEqual(1);
    const listMultiEdge = (
      listRunner as unknown as { _multiEdgeListInputs: Map<string, Set<string>> }
    )._multiEdgeListInputs;
    expect(listMultiEdge.get("C")?.has("x")).toBe(true);

    // Scalar handle: the same two-edge topology into a non-list handle is now
    // rejected by correlation analysis, so the run fails and C never executes.
    const scalarNodes: NodeDescriptor[] = listNodes.map((n) =>
      n.id === "C" ? { ...n, propertyTypes: { x: "int" } } : n
    );
    const scalarReceived: Array<Record<string, unknown>> = [];
    const scalarRunner = makeRunner({
      C: {
        async process(inputs) {
          scalarReceived.push({ ...inputs });
          return { result: inputs.x };
        }
      }
    });
    const scalarResult = await scalarRunner.run(
      { job_id: "scalar", params: { a: 10, b: 20 } },
      { nodes: scalarNodes, edges: listEdges }
    );

    expect(scalarResult.status).toBe("failed");
    expect(scalarReceived).toHaveLength(0);
    const scalarMultiEdge = (
      scalarRunner as unknown as { _multiEdgeListInputs: Map<string, Set<string>> }
    )._multiEdgeListInputs;
    expect(scalarMultiEdge.has("C")).toBe(false);
  });

  it("_detectMultiEdgeListInputs marks list handles and ignores single edges", async () => {
    // Structural test: inspect the runner's _multiEdgeListInputs after a run.
    // C.x receives two edges and is list-typed → marked. D.y receives one edge
    // → not marked.
    const nodes: NodeDescriptor[] = [
      {
        id: "A",
        type: "test.Input",
        name: "a",
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      },
      {
        id: "B",
        type: "test.Input",
        name: "b",
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      },
      {
        id: "C",
        type: "test.Proc",
        propertyTypes: { x: "list[int]" },
        outputs: { out: "any" },
        output_correlation: { out: { kind: "single", source: "__execution__" } }
      },
      {
        id: "D",
        type: "test.Proc",
        propertyTypes: { y: "int" },
        outputs: { out: "any" },
        output_correlation: { out: { kind: "single", source: "__execution__" } }
      }
    ];
    const edges: Edge[] = [
      // Two edges to C.x (list type) — should be marked as multi-edge.
      { id: "e1", source: "A", sourceHandle: "value", target: "C", targetHandle: "x" },
      { id: "e2", source: "B", sourceHandle: "value", target: "C", targetHandle: "x" },
      // One edge to D.y — should NOT be marked.
      { id: "e3", source: "A", sourceHandle: "value", target: "D", targetHandle: "y" }
    ];

    const runner = makeRunner({
      C: simpleExecutor((inputs) => ({ out: inputs.x })),
      D: simpleExecutor((inputs) => ({ out: inputs.y }))
    });

    await runner.run(
      { job_id: "j1", params: { a: 1, b: 2 } },
      { nodes, edges }
    );

    const multiEdge = (
      runner as unknown as { _multiEdgeListInputs: Map<string, Set<string>> }
    )._multiEdgeListInputs;
    // C.x is a list type with 2 edges → marked.
    expect(multiEdge.has("C")).toBe(true);
    expect(multiEdge.get("C")!.has("x")).toBe(true);

    // D.y has only one edge — should NOT be marked.
    expect(multiEdge.has("D")).toBe(false);
  });

  it("single edge to a handle does not trigger list aggregation", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "A", type: "test.Input", name: "a" },
      { id: "C", type: "test.Proc" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "A",
        sourceHandle: "value",
        target: "C",
        targetHandle: "x"
      }
    ];

    const runner = makeRunner({
      C: simpleExecutor((inputs) => ({ out: inputs.x }))
    });

    await runner.run({ job_id: "j1", params: { a: 42 } }, { nodes, edges });

    const multiEdge = (
      runner as unknown as { _multiEdgeListInputs: Map<string, Set<string>> }
    )._multiEdgeListInputs;
    expect(multiEdge.has("C")).toBe(false);
  });
});
