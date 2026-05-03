/**
 * Regression tests for parity gaps #9 and #15.
 *
 * Gap #9 — Output Node Handling:
 *   Python's process_output_node() emits OutputUpdate messages (type: "output_update")
 *   per value, with normalization and consecutive deduplication. TypeScript collects
 *   outputs in result.outputs but never emits output_update messages.
 *
 * Gap #15 — Edge Counter Updates:
 *   Python emits EdgeUpdate messages at multiple lifecycle points:
 *     - During send_messages(): status "message_sent" with counter
 *     - During _dispatch_inputs(): status "message_sent" for input dispatch
 *     - During _send_EOS(): status "completed"
 *     - During drain_active_edges(): status "drained"
 *   TypeScript emits during _sendMessages() (status "active") and _sendEOS()
 *   (status "completed"), but NOT during _dispatchInputs() and NOT "drained" status.
 */

import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import type {
  NodeDescriptor,
  Edge,
  EdgeUpdate,
  OutputUpdate
} from "@nodetool-ai/protocol";
import type { NodeExecutor } from "../src/actor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    resolveExecutor: (node) => {
      const exec = executorMap[node.id] ?? executorMap[node.type];
      if (!exec) {
        return simpleExecutor(() => ({}));
      }
      return exec;
    }
  });
}

// ---------------------------------------------------------------------------
// Gap #9 — Output Node Handling
// ---------------------------------------------------------------------------

describe("Gap #9 — OutputUpdate messages", () => {
  it("should emit output_update messages for output nodes (not yet implemented)", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "double", type: "test.Double" },
      { id: "out", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "in",
        sourceHandle: "value",
        target: "double",
        targetHandle: "a"
      },
      {
        id: "e2",
        source: "double",
        sourceHandle: "result",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({
      "test.Double": simpleExecutor((inputs) => ({
        result: (inputs.a as number) * 2
      })),
      "test.Output": simpleExecutor((inputs) => ({
        value: inputs.value
      }))
    });

    const result = await runner.run(
      { job_id: "gap9-1", params: { x: 5 } },
      { nodes, edges }
    );

    // The runner does collect outputs correctly
    expect(result.status).toBe("completed");
    expect(result.outputs.result).toContain(10);

    // GAP #9: output_update messages not yet emitted.
    // Python emits an OutputUpdate for each value produced by an output node.
    // TypeScript only collects outputs in result.outputs after actor completes.
    const outputMsgs = result.messages.filter(
      (m) => m.type === "output_update"
    ) as OutputUpdate[];

    // Gap #9 fixed: output_update messages are now emitted.
    expect(outputMsgs.length).toBeGreaterThanOrEqual(1);
    expect(outputMsgs.some((m) => m.node_id === "out" && m.value === 10)).toBe(
      true
    );
  });

  it("should deduplicate consecutive identical output values (not yet implemented)", async () => {
    // Streaming node that yields the same value twice
    const nodes: NodeDescriptor[] = [
      { id: "streamer", type: "test.Streamer", is_streaming_output: true },
      { id: "out", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "streamer",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    let callCount = 0;
    const runner = makeRunner({
      "test.Streamer": {
        async *stream() {
          yield { value: "same" };
          yield { value: "same" }; // duplicate
          yield { value: "different" };
          callCount++;
        }
      } as unknown as NodeExecutor,
      "test.Output": simpleExecutor((inputs) => ({
        value: inputs.value
      }))
    });

    const result = await runner.run(
      { job_id: "gap9-dedup", params: {} },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");

    // GAP #9: Consecutive deduplication not implemented.
    // Python's process_output_node() deduplicates consecutive identical values,
    // emitting only one OutputUpdate when the same value appears back-to-back.
    // TypeScript does not have this logic since it doesn't emit output_update at all.
    const outputMsgs = result.messages.filter(
      (m) => m.type === "output_update"
    ) as OutputUpdate[];

    // Currently no output_update messages at all — dedup is moot
    expect(outputMsgs.length).toBe(0); // Current behavior

    // TODO: When gap #9 is fixed, consecutive dedup should reduce 3 yields to 2 output_updates:
    // expect(outputMsgs.length).toBe(2); // "same" (once) + "different"
  });

  it("should include proper fields in output_update messages (not yet implemented)", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "out", type: "test.Output", name: "my_output" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "in",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({
      "test.Output": simpleExecutor((inputs) => ({
        value: inputs.value
      }))
    });

    const result = await runner.run(
      { job_id: "gap9-fields", params: { x: "hello" } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");

    // GAP #9: OutputUpdate message fields not populated.
    // Python OutputUpdate includes: node_id, node_name, output_name, value, output_type, metadata
    const outputMsgs = result.messages.filter(
      (m) => m.type === "output_update"
    ) as OutputUpdate[];

    // Gap #9 fixed: OutputUpdate message fields are now populated.
    expect(outputMsgs.length).toBeGreaterThanOrEqual(1);
    const msg = outputMsgs.find((m) => m.node_id === "out");
    expect(msg).toBeDefined();
    expect(msg!.node_id).toBe("out");
    expect(msg!.node_name).toBe("my_output");
    expect(msg!.value).toBe("hello");
    expect(msg!.output_type).toBeDefined();
    expect(msg!.metadata).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Gap #15 — Edge Counter Updates
// ---------------------------------------------------------------------------

describe("Gap #15 — Edge counter updates during input dispatch", () => {
  it("should emit edge_update with status 'active' during _dispatchInputs (not yet implemented)", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "mid", type: "test.Pass" },
      { id: "out", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        id: "e-in-mid",
        source: "in",
        sourceHandle: "value",
        target: "mid",
        targetHandle: "value"
      },
      {
        id: "e-mid-out",
        source: "mid",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({
      "test.Pass": simpleExecutor((inputs) => ({ value: inputs.value })),
      "test.Output": simpleExecutor((inputs) => inputs)
    });

    const result = await runner.run(
      { job_id: "gap15-dispatch", params: { x: 42 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");

    const edgeMsgs = result.messages.filter(
      (m) => m.type === "edge_update"
    ) as EdgeUpdate[];

    // The input→mid edge (e-in-mid) value is dispatched during _dispatchInputs().
    // GAP #15: _dispatchInputs() calls _incrementEdgeCounter() which emits "active",
    // but Python uses "message_sent" status instead of "active".
    // The TS edge does get an "active" status from _incrementEdgeCounter — this part works.
    const inputEdgeActive = edgeMsgs.filter(
      (m) => m.edge_id === "e-in-mid" && m.status === "active"
    );
    expect(inputEdgeActive.length).toBeGreaterThanOrEqual(1);

    // Python also emits "message_sent" status — TS uses "active" instead.
    // This is a naming discrepancy. Document it:
    const inputEdgeMessageSent = edgeMsgs.filter(
      (m) => m.edge_id === "e-in-mid" && m.status === "message_sent"
    );
    // GAP #15: TypeScript emits "active" where Python emits "message_sent"
    expect(inputEdgeMessageSent.length).toBe(0); // Current behavior — no "message_sent" status
  });

  it("should emit edge_update with 'drained' status after completion (not yet implemented)", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "out", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "in",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({
      "test.Output": simpleExecutor((inputs) => ({ value: inputs.value }))
    });

    const result = await runner.run(
      { job_id: "gap15-drained", params: { x: 99 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");

    const edgeMsgs = result.messages.filter(
      (m) => m.type === "edge_update"
    ) as EdgeUpdate[];

    // Python emits "drained" status during drain_active_edges() after all actors complete.
    // TypeScript does not have drain_active_edges() and does not emit "drained".
    const drainedMsgs = edgeMsgs.filter((m) => m.status === "drained");

    // GAP #15: "drained" status not yet emitted
    expect(drainedMsgs.length).toBe(0); // Current behavior

    // GAP #15: For a simple input→output pipeline, the input node is skipped
    // (not an actor), so _sendEOS is never called for the input→output edge.
    // This means even "completed" is not emitted for input edges.
    // In Python, drain_active_edges() would handle this at the end.
    const completedMsgs = edgeMsgs.filter((m) => m.status === "completed");
    expect(completedMsgs.length).toBe(0); // Current behavior — input edges get no "completed"

    // TODO: When gap #15 is fixed, drain_active_edges should emit "drained" or "completed":
    // expect(completedMsgs.length).toBeGreaterThanOrEqual(1);
  });

  it("should emit edge_update during _dispatchInputs for multi-param workflows (not yet implemented)", async () => {
    // Two input nodes feeding into a single processing node
    const nodes: NodeDescriptor[] = [
      { id: "in_a", type: "test.Input", name: "a" },
      { id: "in_b", type: "test.Input", name: "b" },
      { id: "add", type: "test.Add" },
      { id: "out", type: "test.Output", name: "sum" }
    ];
    const edges: Edge[] = [
      {
        id: "ea",
        source: "in_a",
        sourceHandle: "value",
        target: "add",
        targetHandle: "a"
      },
      {
        id: "eb",
        source: "in_b",
        sourceHandle: "value",
        target: "add",
        targetHandle: "b"
      },
      {
        id: "eout",
        source: "add",
        sourceHandle: "result",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({
      "test.Add": simpleExecutor((inputs) => ({
        result: (inputs.a as number) + (inputs.b as number)
      })),
      "test.Output": simpleExecutor((inputs) => inputs)
    });

    const result = await runner.run(
      { job_id: "gap15-multi", params: { a: 3, b: 7 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.sum).toContain(10);

    const edgeMsgs = result.messages.filter(
      (m) => m.type === "edge_update"
    ) as EdgeUpdate[];

    // Both input edges should have "active" messages from _dispatchInputs
    const eaActive = edgeMsgs.filter(
      (m) => m.edge_id === "ea" && m.status === "active"
    );
    const ebActive = edgeMsgs.filter(
      (m) => m.edge_id === "eb" && m.status === "active"
    );
    expect(eaActive.length).toBeGreaterThanOrEqual(1);
    expect(ebActive.length).toBeGreaterThanOrEqual(1);

    // Python would emit "message_sent" for these — TS emits "active"
    // GAP #15: Status naming discrepancy between Python and TypeScript
    const messageSent = edgeMsgs.filter((m) => m.status === "message_sent");
    expect(messageSent.length).toBe(0); // Current behavior

    // All edges should eventually get "completed"
    const eaCompleted = edgeMsgs.filter(
      (m) => m.edge_id === "ea" && m.status === "completed"
    );
    const ebCompleted = edgeMsgs.filter(
      (m) => m.edge_id === "eb" && m.status === "completed"
    );
    // GAP #15: _sendEOS skips edges from input nodes (they are not actors),
    // so "completed" may not be emitted for input→target edges.
    // In Python, drain_active_edges() handles this at the end.
    // Currently these edges only get "active" from _dispatchInputs, no "completed".
    expect(eaCompleted.length).toBe(0); // Current behavior — no EOS for input edges
    expect(ebCompleted.length).toBe(0); // Current behavior — no EOS for input edges

    // TODO: When fixed, input edges should also get "completed" or "drained":
    // expect(eaCompleted.length).toBeGreaterThanOrEqual(1);
    // expect(ebCompleted.length).toBeGreaterThanOrEqual(1);
  });

  it("edge_update lifecycle for non-input edges works correctly", async () => {
    // Verify that edges between non-input nodes DO get both "active" and "completed"
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "mid", type: "test.Pass" },
      { id: "out", type: "test.Output", name: "result" }
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "in",
        sourceHandle: "value",
        target: "mid",
        targetHandle: "value"
      },
      {
        id: "e2",
        source: "mid",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    const runner = makeRunner({
      "test.Pass": simpleExecutor((inputs) => ({ value: inputs.value })),
      "test.Output": simpleExecutor((inputs) => inputs)
    });

    const result = await runner.run(
      { job_id: "gap15-lifecycle", params: { x: 42 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");

    const edgeMsgs = result.messages.filter(
      (m) => m.type === "edge_update"
    ) as EdgeUpdate[];

    // e2 (mid→out) gets both "active" and "completed" — this works in TS
    expect(
      edgeMsgs.some((m) => m.edge_id === "e2" && m.status === "active")
    ).toBe(true);
    expect(
      edgeMsgs.some((m) => m.edge_id === "e2" && m.status === "completed")
    ).toBe(true);

    // e1 (in→mid) gets "active" from _dispatchInputs but no "completed" from _sendEOS
    // because input nodes are skipped (not actors), so _sendEOS is never called for them.
    expect(
      edgeMsgs.some((m) => m.edge_id === "e1" && m.status === "active")
    ).toBe(true);

    // GAP #15: Input→target edges don't get "completed" status
    // Python handles this via drain_active_edges() which TS doesn't implement
    const e1Completed = edgeMsgs.filter(
      (m) => m.edge_id === "e1" && m.status === "completed"
    );
    expect(e1Completed.length).toBe(0); // Current behavior — no "completed" for input edges

    // But no "drained" either
    expect(edgeMsgs.some((m) => m.status === "drained")).toBe(false); // Current behavior
  });
});
