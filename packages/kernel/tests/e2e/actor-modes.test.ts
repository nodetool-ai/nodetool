/**
 * E2E Actor Mode Tests – ACTOR-001..018
 *
 * Tests different actor execution modes:
 *  - Buffered (standard process())
 *  - Streaming input (is_streaming_input)
 *  - Streaming output (is_streaming_output / genProcess)
 *  - Both streaming flags
 *  - Sync modes: on_any vs zip_all
 *  - Sticky inputs
 */

import { describe, it, expect } from "vitest";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import {
  makeRegistry,
  makeRunner,
  inp,
  nd,
  de,
  Add,
  Passthrough,
  StreamingCounter,
  IntAccumulator,
  StreamingInputProcessor,
  FullStreamingNode,
  SilentNode
} from "./helpers.js";

// ---------------------------------------------------------------------------
// ACTOR-001: Standard buffered node
// ---------------------------------------------------------------------------

describe("ACTOR-001: Standard buffered process() node", () => {
  it("Add node processes inputs once and returns result", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      inp("a", "a"),
      inp("b", "b"),
      nd("add", Add.nodeType, { name: "add" })
    ];
    const edges: Edge[] = [
      de("a", "value", "add", "a"),
      de("b", "value", "add", "b")
    ];

    const result = await runner.run(
      { job_id: "actor-001", params: { a: 7, b: 3 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs["add"]).toContain(10);
  });
});

// ---------------------------------------------------------------------------
// ACTOR-002: Streaming input node called once with empty inputs
// ---------------------------------------------------------------------------

describe("ACTOR-002: Streaming input mode – process() called once with {}", () => {
  it("StreamingInputProcessor runs once regardless of upstream data", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      inp("trigger", "trigger"),
      nd("proc", StreamingInputProcessor.nodeType, {
        is_streaming_input: true,
        name: "proc"
      })
    ];
    const edges: Edge[] = [de("trigger", "value", "proc", "data")];

    const result = await runner.run(
      { job_id: "actor-002", params: { trigger: 42 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    // StreamingInputProcessor.process({}) returns { result: "processed" }
    expect(result.outputs["proc"]).toContain("processed");
  });
});

// ---------------------------------------------------------------------------
// ACTOR-003: Streaming output via genProcess
// ---------------------------------------------------------------------------

describe("ACTOR-003: Streaming output node yields multiple values", () => {
  it("StreamingCounter yields count=3 values", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      inp("trig", "trig"),
      nd(
        "counter",
        StreamingCounter.nodeType,
        { is_streaming_output: true },
        { count: 3, start: 0 }
      ),
      nd("sink", Passthrough.nodeType, { name: "sink" })
    ];
    const edges: Edge[] = [
      de("trig", "value", "counter", "start"),
      de("counter", "value", "sink", "value", "e-counter-sink")
    ];

    const result = await runner.run(
      { job_id: "actor-003", params: { trig: 0 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    // 3 values emitted from counter → 3 edge_update active messages
    const edgeUpdates = result.messages.filter(
      (m) =>
        m.type === "edge_update" &&
        (m as { edge_id: string }).edge_id === "e-counter-sink" &&
        (m as { status: string }).status === "active"
    );
    expect(edgeUpdates.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ACTOR-004: FullStreamingNode – both flags set
// ---------------------------------------------------------------------------

describe("ACTOR-004: FullStreamingNode has both streaming flags", () => {
  it("is_streaming_input takes priority, process() called once", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      inp("trig", "trig"),
      nd(
        "full",
        FullStreamingNode.nodeType,
        {
          is_streaming_input: true,
          is_streaming_output: true,
          name: "full"
        },
        { count: 2 }
      )
    ];
    const edges: Edge[] = [de("trig", "value", "full", "input")];

    const result = await runner.run(
      { job_id: "actor-004", params: { trig: 1 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    // is_streaming_input → process({}) called once → { result: "full-streaming" }
    expect(result.outputs["full"]).toContain("full-streaming");
  });
});

// ---------------------------------------------------------------------------
// ACTOR-005: on_any sync mode fires per individual input
// ---------------------------------------------------------------------------

describe("ACTOR-005: on_any sync mode fires on each individual input", () => {
  it("IntAccumulator in on_any mode accumulates all inputs", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      inp("a", "a"),
      inp("b", "b"),
      nd("acc", IntAccumulator.nodeType, { sync_mode: "on_any", name: "acc" })
    ];
    const edges: Edge[] = [
      de("a", "value", "acc", "value"),
      de("b", "value", "acc", "value")
    ];

    const result = await runner.run(
      { job_id: "actor-005", params: { a: 10, b: 20 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    // on_any fires for each item; with 2 upstream edges on same handle,
    // IntAccumulator processes each value as it arrives
    expect(result.outputs["acc"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ACTOR-006: zip_all sync mode waits for all handles
// ---------------------------------------------------------------------------

describe("ACTOR-006: zip_all sync mode waits until all handles have data", () => {
  it("Add node (zip_all) only fires after both a and b arrive", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      inp("a", "a"),
      inp("b", "b"),
      nd("add", Add.nodeType, { sync_mode: "zip_all", name: "add" })
    ];
    const edges: Edge[] = [
      de("a", "value", "add", "a"),
      de("b", "value", "add", "b")
    ];

    const result = await runner.run(
      { job_id: "actor-006", params: { a: 4, b: 6 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs["add"]).toContain(10);
  });
});

// ---------------------------------------------------------------------------
// ACTOR-007: Sticky inputs – streaming source + static source
// ---------------------------------------------------------------------------

describe("ACTOR-007: Sticky input semantics with streaming upstream", () => {
  it("static input is reused for each item from streaming source", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    // StreamingCounter (count=3) feeds Add.a; static param feeds Add.b
    // Add should fire 3 times using sticky b=10
    const nodes: NodeDescriptor[] = [
      inp("static_b", "b"),
      nd(
        "counter",
        StreamingCounter.nodeType,
        { is_streaming_output: true },
        { count: 3, start: 1 }
      ),
      nd("add", Add.nodeType, { name: "add" })
    ];
    const edges: Edge[] = [
      de("static_b", "value", "add", "b"),
      de("counter", "value", "add", "a", "e-add")
    ];

    const result = await runner.run(
      { job_id: "actor-007", params: { b: 10 } },
      { nodes, edges }
    );

    expect(result.status).toBe("completed");
    // 3 values from counter (1,2,3) + sticky b=10 → 3 executions: 11, 12, 13
    const edgeUpdates = result.messages.filter(
      (m) =>
        m.type === "edge_update" &&
        (m as { edge_id: string }).edge_id === "e-add" &&
        (m as { status: string }).status === "active"
    );
    expect(edgeUpdates.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ACTOR-013: Source node with no inputs runs once
// ---------------------------------------------------------------------------

describe("ACTOR-013: Source node with no incoming edges executes once", () => {
  it("SilentNode runs and completes with no output", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      nd("silent", SilentNode.nodeType, { name: "silent" })
    ];
    const edges: Edge[] = [];

    const result = await runner.run({ job_id: "actor-013" }, { nodes, edges });

    expect(result.status).toBe("completed");
    // SilentNode returns {} so no values pushed to output
    expect(result.outputs["silent"]?.length ?? 0).toBe(0);
    // But it should have emitted running + completed node_update
    const nodeUpdates = result.messages.filter(
      (m) =>
        m.type === "node_update" &&
        (m as { node_id: string }).node_id === "silent"
    );
    expect(
      nodeUpdates.some((m) => (m as { status: string }).status === "running")
    ).toBe(true);
    expect(
      nodeUpdates.some((m) => (m as { status: string }).status === "completed")
    ).toBe(true);
  });
});
