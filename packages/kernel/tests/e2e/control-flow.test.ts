/**
 * E2E Control Flow Tests – CTRL-001..030
 *
 * Tests automatic control event routing through control edges.
 * Controller nodes emit { __control__: ControlEvent } on their __control__
 * output handle, which the runner routes to controlled nodes via control edges.
 */

import { describe, it, expect } from "vitest";
import type { NodeDescriptor, Edge } from "@nodetool/protocol";
import { Graph, GraphValidationError } from "../../src/graph.js";
import {
  makeRegistry,
  makeRunner,
  inp,
  nd,
  de,
  ce,
  SimpleController,
  MultiTriggerController,
  StopEventController,
  ThresholdProcessor,
  ErrorNode,
  Passthrough
} from "./helpers.js";

// ---------------------------------------------------------------------------
// CTRL-001: SimpleController → ThresholdProcessor (no data inputs)
// ---------------------------------------------------------------------------

describe("CTRL-001: SimpleController triggers ThresholdProcessor once", () => {
  it("emits RunEvent with threshold=0.8, controlled node processes once", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      nd(
        "ctrl",
        SimpleController.nodeType,
        { is_streaming_output: true },
        { threshold: 0.8, mode: "normal" }
      ),
      nd("proc", ThresholdProcessor.nodeType, {
        is_controlled: true,
        name: "proc"
      })
    ];
    const edges: Edge[] = [ce("ctrl", "proc")];

    const result = await runner.run({ job_id: "ctrl-001" }, { nodes, edges });

    expect(result.status).toBe("completed");
    // ThresholdProcessor should have been called and produced output
    expect(result.outputs["proc"]).toBeDefined();
    expect(result.outputs["proc"].length).toBeGreaterThanOrEqual(1);
    expect(String(result.outputs["proc"][0])).toContain("threshold=0.8");
  });
});

// ---------------------------------------------------------------------------
// CTRL-002: SimpleController → ThresholdProcessor with custom mode
// ---------------------------------------------------------------------------

describe("CTRL-002: RunEvent properties override controlled node behaviour", () => {
  it("mode=strict from RunEvent properties is applied", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      nd(
        "ctrl",
        SimpleController.nodeType,
        { is_streaming_output: true },
        { threshold: 0.5, mode: "strict" }
      ),
      nd(
        "proc",
        ThresholdProcessor.nodeType,
        { is_controlled: true, name: "proc" },
        { value: 0.5 }
      )
    ];
    const edges: Edge[] = [ce("ctrl", "proc")];

    const result = await runner.run({ job_id: "ctrl-002" }, { nodes, edges });

    expect(result.status).toBe("completed");
    // mode=strict: 0.5 > 0.5 is false
    expect(String(result.outputs["proc"][0])).toContain("mode=strict");
    expect(String(result.outputs["proc"][0])).toContain("exceeds=false");
  });
});

// ---------------------------------------------------------------------------
// CTRL-003: Controller with threshold=0.3, value=0.5 → exceeds=true
// ---------------------------------------------------------------------------

describe("CTRL-003: Value exceeds threshold in RunEvent", () => {
  it("threshold=0.3 with value=0.5 results in exceeds=true", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      nd(
        "ctrl",
        SimpleController.nodeType,
        { is_streaming_output: true },
        { threshold: 0.3, mode: "normal" }
      ),
      nd(
        "proc",
        ThresholdProcessor.nodeType,
        { is_controlled: true, name: "proc" },
        { value: 0.5 }
      )
    ];
    const edges: Edge[] = [ce("ctrl", "proc")];

    const result = await runner.run({ job_id: "ctrl-003" }, { nodes, edges });

    expect(result.status).toBe("completed");
    expect(String(result.outputs["proc"][0])).toContain("exceeds=true");
  });
});

// ---------------------------------------------------------------------------
// CTRL-004: Controller with threshold=0.9, value=0.5 → exceeds=false
// ---------------------------------------------------------------------------

describe("CTRL-004: Value does not exceed threshold in RunEvent", () => {
  it("threshold=0.9 with value=0.5 results in exceeds=false", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      nd(
        "ctrl",
        SimpleController.nodeType,
        { is_streaming_output: true },
        { threshold: 0.9, mode: "normal" }
      ),
      nd(
        "proc",
        ThresholdProcessor.nodeType,
        { is_controlled: true, name: "proc" },
        { value: 0.5 }
      )
    ];
    const edges: Edge[] = [ce("ctrl", "proc")];

    const result = await runner.run({ job_id: "ctrl-004" }, { nodes, edges });

    expect(result.status).toBe("completed");
    expect(String(result.outputs["proc"][0])).toContain("exceeds=false");
  });
});

// ---------------------------------------------------------------------------
// CTRL-005: MultiTriggerController → ThresholdProcessor (N executions)
// ---------------------------------------------------------------------------

describe("CTRL-005: MultiTriggerController triggers ThresholdProcessor N times", () => {
  it("3 RunEvents result in 3 edge counter increments on downstream edge", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    // Controller → ThresholdProcessor → Passthrough (sink to count outputs)
    const nodes: NodeDescriptor[] = [
      nd(
        "ctrl",
        MultiTriggerController.nodeType,
        { is_streaming_output: true },
        { count: 3, threshold: 0.5 }
      ),
      nd(
        "proc",
        ThresholdProcessor.nodeType,
        { is_controlled: true },
        { value: 0.7 }
      ),
      nd("sink", Passthrough.nodeType, { name: "sink" })
    ];
    const edges: Edge[] = [
      ce("ctrl", "proc"),
      de("proc", "result", "sink", "value", "e-proc-sink")
    ];

    const result = await runner.run({ job_id: "ctrl-005" }, { nodes, edges });

    expect(result.status).toBe("completed");
    // Edge from proc to sink should have counter=3
    const edgeUpdates = result.messages.filter(
      (m) =>
        m.type === "edge_update" &&
        (m as { edge_id: string }).edge_id === "e-proc-sink"
    );
    const maxCounter = Math.max(
      0,
      ...edgeUpdates.map((m) => (m as { counter?: number | null }).counter ?? 0)
    );
    expect(maxCounter).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// CTRL-006: SimpleController → two ThresholdProcessors (fan-out)
// ---------------------------------------------------------------------------

describe("CTRL-006: Controller fan-out to two controlled nodes", () => {
  it("both controlled nodes receive the RunEvent and execute", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      nd(
        "ctrl",
        SimpleController.nodeType,
        { is_streaming_output: true },
        { threshold: 0.6 }
      ),
      nd(
        "p1",
        ThresholdProcessor.nodeType,
        { is_controlled: true, name: "p1" },
        { value: 0.7 }
      ),
      nd(
        "p2",
        ThresholdProcessor.nodeType,
        { is_controlled: true, name: "p2" },
        { value: 0.3 }
      )
    ];
    const edges: Edge[] = [ce("ctrl", "p1"), ce("ctrl", "p2")];

    const result = await runner.run({ job_id: "ctrl-006" }, { nodes, edges });

    expect(result.status).toBe("completed");
    expect(result.outputs["p1"]).toBeDefined();
    expect(result.outputs["p2"]).toBeDefined();
    expect(String(result.outputs["p1"][0])).toContain("threshold=0.6");
    expect(String(result.outputs["p2"][0])).toContain("threshold=0.6");
  });
});

// ---------------------------------------------------------------------------
// CTRL-017: Controlled node that errors
// ---------------------------------------------------------------------------

describe("CTRL-017: Error in controlled node propagates via node_update", () => {
  it("error status emitted for the controlled node", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      nd(
        "ctrl",
        SimpleController.nodeType,
        { is_streaming_output: true },
        { threshold: 0.5 }
      ),
      nd(
        "err",
        ErrorNode.nodeType,
        { is_controlled: true },
        { message: "controlled error" }
      )
    ];
    const edges: Edge[] = [ce("ctrl", "err")];

    const result = await runner.run({ job_id: "ctrl-017" }, { nodes, edges });

    // Runner still completes (actor catches error internally)
    expect(result.status).toBe("completed");
    const nodeErrors = result.messages.filter(
      (m) =>
        m.type === "node_update" &&
        (m as { node_id: string; status: string }).node_id === "err" &&
        (m as { status: string }).status === "error"
    );
    expect(nodeErrors.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// CTRL-018: Controller node itself throws
// ---------------------------------------------------------------------------

describe("CTRL-018: Error in controller node", () => {
  it("node_update error emitted for the controller", async () => {
    // Use ErrorNode as the "controller" (it throws and has no outputs anyway)
    const nodes: NodeDescriptor[] = [
      inp("in", "val"),
      nd("ctrl", ErrorNode.nodeType, {}, { message: "controller error" }),
      nd("proc", ThresholdProcessor.nodeType, { is_controlled: true })
    ];
    const edges: Edge[] = [
      de("in", "value", "ctrl", "value")
      // No control edge since ErrorNode is not a real controller;
      // this just tests that error in a "before-controlled" node works
    ];

    const runner = makeRunner(makeRegistry());
    const result = await runner.run(
      { job_id: "ctrl-018", params: { val: 1 } },
      { nodes, edges }
    );

    const hasError = result.messages.some(
      (m) =>
        m.type === "node_update" && (m as { status: string }).status === "error"
    );
    expect(hasError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CTRL-026: Control cycle detection
// ---------------------------------------------------------------------------

describe("CTRL-026: Control cycle in graph is rejected", () => {
  it("Graph.validate() throws GraphValidationError for control cycle", () => {
    const nodes: NodeDescriptor[] = [nd("a", "test.A"), nd("b", "test.B")];
    const edges: Edge[] = [
      ce("a", "b"),
      ce("b", "a") // creates a cycle in control edges
    ];

    expect(() => new Graph({ nodes, edges }).validate()).toThrow(
      GraphValidationError
    );
    expect(() => new Graph({ nodes, edges }).validate()).toThrow(/cycle/);
  });
});

// ---------------------------------------------------------------------------
// CTRL-027: Self-loop in control edges is rejected
// ---------------------------------------------------------------------------

describe("CTRL-027: Self-loop control edge is rejected", () => {
  it("Graph.validate() throws GraphValidationError for self-loop", () => {
    const nodes: NodeDescriptor[] = [nd("a", "test.A")];
    const edges: Edge[] = [ce("a", "a")]; // self-loop

    expect(() => new Graph({ nodes, edges }).validate()).toThrow(
      GraphValidationError
    );
  });
});

// ---------------------------------------------------------------------------
// CTRL-028: StopEventController → ThresholdProcessor
// ---------------------------------------------------------------------------

describe("CTRL-028: StopEvent causes controlled node to stop without processing", () => {
  it("ThresholdProcessor receives stop and exits without calling process", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      nd("ctrl", StopEventController.nodeType, { is_streaming_output: true }),
      nd("proc", ThresholdProcessor.nodeType, {
        is_controlled: true,
        name: "proc"
      })
    ];
    const edges: Edge[] = [ce("ctrl", "proc")];

    const result = await runner.run({ job_id: "ctrl-028" }, { nodes, edges });

    expect(result.status).toBe("completed");
    // proc received a stop event so it never called process() and produced no values
    expect(result.outputs["proc"]?.length ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CTRL-029: Multiple controllers to one controlled node
// ---------------------------------------------------------------------------

describe("CTRL-029: Multiple controllers → one controlled node", () => {
  it("controlled node processes once per controller RunEvent", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);

    const nodes: NodeDescriptor[] = [
      nd(
        "ctrl1",
        SimpleController.nodeType,
        { is_streaming_output: true },
        { threshold: 0.3 }
      ),
      nd(
        "ctrl2",
        SimpleController.nodeType,
        { is_streaming_output: true },
        { threshold: 0.7 }
      ),
      nd(
        "proc",
        ThresholdProcessor.nodeType,
        { is_controlled: true },
        { value: 0.5 }
      ),
      nd("sink", Passthrough.nodeType, { name: "sink" })
    ];
    const edges: Edge[] = [
      ce("ctrl1", "proc"),
      ce("ctrl2", "proc"),
      de("proc", "result", "sink", "value", "e1")
    ];

    const result = await runner.run({ job_id: "ctrl-029" }, { nodes, edges });

    expect(result.status).toBe("completed");
    // 2 controllers each emit 1 RunEvent → proc executes 2 times → 2 messages on edge
    const edgeUpdates = result.messages.filter(
      (m) =>
        m.type === "edge_update" && (m as { edge_id: string }).edge_id === "e1"
    );
    const maxCounter = Math.max(
      0,
      ...edgeUpdates.map((m) => (m as { counter?: number | null }).counter ?? 0)
    );
    expect(maxCounter).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// CTRL-030: __control_output__ routing
// ---------------------------------------------------------------------------

describe("CTRL-030: __control_output__ is routed to controlled nodes as RunEvent", () => {
  it("__control_output__ properties reach the controlled node", async () => {
    const { WorkflowRunner } = await import("../../src/runner.js");

    const nodes: NodeDescriptor[] = [
      { id: "agent", type: "test.Controller" },
      { id: "proc", type: "test.Processor", is_controlled: true, name: "proc" }
    ];
    const edges: Edge[] = [ce("agent", "proc")];

    const calls: Array<Record<string, unknown>> = [];
    const runner = new WorkflowRunner("ctrl-030", {
      resolveExecutor: (node) => {
        if (node.id === "agent") {
          return {
            async process() {
              // Controller outputs __control_output__ with raw properties
              return { __control_output__: { brightness: 0.8, contrast: 1.2 } };
            }
          };
        }
        // Controlled processor records what it receives
        return {
          async process(inputs) {
            calls.push({ ...inputs });
            return { result: "ok" };
          }
        };
      }
    });

    const result = await runner.run({ job_id: "ctrl-030" }, { nodes, edges });

    expect(result.status).toBe("completed");
    expect(calls.length).toBe(1);
    expect(calls[0].brightness).toBe(0.8);
    expect(calls[0].contrast).toBe(1.2);
  });
});
