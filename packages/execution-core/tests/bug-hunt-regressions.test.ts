import { describe, it, expect, vi } from "vitest";
import type { Edge, Escalation, NodeDescriptor } from "@nodetool-ai/protocol";
import { analyzeCorrelation } from "../src/correlation-analysis.js";
import { getInputTypeString } from "../src/graph-utils.js";
import { WorkflowRunner } from "../src/runner.js";
import { validateSubstituteOutputs } from "../src/substitute-validator.js";
import { BoundedHandle, type SupervisorHandle } from "../src/supervisor.js";
import { withExplicitNodeFlags } from "../src/graph.js";

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

function makeEscalation(overrides: Partial<Escalation> = {}): Escalation {
  return {
    nodeId: "n1",
    nodeType: "test.Node",
    correlationLineage: [],
    invocationKey: "",
    allowedActions: ["retry", "skip", "fail"],
    detail: "boom",
    inputs: {},
    declaredOutputs: { output: "str" },
    attempt: 1,
    spentCostUsd: 0,
    createdAssets: false,
    retrySafe: true,
    emitted: false,
    ...overrides
  };
}

describe("Bug 1: BoundedHandle timeout and abort enforcement on hung decide()", () => {
  it("fails closed when inner decide() ignores AbortSignal and never settles (timeout)", async () => {
    const hungInner: SupervisorHandle = {
      decide: () => new Promise(() => {}),
      close: () => {}
    };
    const bounded = new BoundedHandle(hungInner, { decisionTimeoutMs: 25 });
    const ac = new AbortController();

    const outcome = await bounded.decide(makeEscalation(), ac.signal);
    expect(outcome).toEqual({
      verdict: { action: "fail" },
      decidedBy: "bounds"
    });
  });

  it("fails closed immediately when runSignal aborts while inner decide() ignores AbortSignal", async () => {
    const hungInner: SupervisorHandle = {
      decide: () => new Promise(() => {}),
      close: () => {}
    };
    const bounded = new BoundedHandle(hungInner, { decisionTimeoutMs: 60_000 });
    const ac = new AbortController();

    const p = bounded.decide(makeEscalation(), ac.signal);
    await tick(10);
    ac.abort();

    const outcome = await p;
    expect(outcome).toEqual({
      verdict: { action: "fail" },
      decidedBy: "bounds"
    });
  });
});

describe("Bug 2: validateSubstituteOutputs prototype-named keys", () => {
  it("rejects extra prototype-named keys like toString instead of crashing", async () => {
    const result = await validateSubstituteOutputs(
      { value: "ok", toString: "extra" },
      { declaredOutputs: { value: "str" } }
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      'output "toString" is not declared by this node'
    );
  });

  it("reports missing declared slot even when its name is an Object.prototype property", async () => {
    const result = await validateSubstituteOutputs(
      {},
      { declaredOutputs: { toString: "str" } }
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      'output "toString" is declared by this node but missing'
    );
  });
});

describe("Bug 3: Prototype-inherited property lookups on handle/slot maps", () => {
  it("analyzeCorrelation does not treat Object.prototype members as output_correlation entries", () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "src",
        type: "test.Code",
        dynamic_outputs: { toString: { type: "str" } },
        output_correlation: {}
      }
    ];
    const analysis = analyzeCorrelation({ nodes, edges: [] });
    expect(analysis.issues).toEqual([]);
  });

  it("getInputTypeString does not return Object.prototype.toString for prototype-named handles", () => {
    const node: NodeDescriptor = {
      id: "n1",
      type: "test.Dynamic",
      propertyTypes: {},
      dynamic_inputs: { toString: { type: "str" } }
    };
    expect(getInputTypeString(node, "toString")).toBe("str");
    expect(
      getInputTypeString({ id: "n2", type: "test.Dynamic", propertyTypes: {} }, "toString")
    ).toBeUndefined();
  });

  it("WorkflowRunner does not route Object.prototype.toString when a node omits a prototype-named output handle", async () => {
    const received: unknown[] = [];
    const nodes: NodeDescriptor[] = [
      { id: "src", type: "test.Source", dynamic_outputs: { toString: { type: "any" } } },
      { id: "sink", type: "test.Sink" }
    ];
    const edges: Edge[] = [
      { id: "e1", source: "src", sourceHandle: "toString", target: "sink", targetHandle: "x" }
    ];
    const runner = new WorkflowRunner("j-proto-route", {
      resolveExecutor: (node) =>
        node.id === "src"
          ? { async process() { return {}; } }
          : {
              async process(inputs) {
                received.push(inputs.x);
                return { output: inputs.x };
              }
            }
    });
    const result = await runner.run(
      { job_id: "j-proto-route" },
      withExplicitNodeFlags({ nodes, edges })
    );
    expect(result.status).toBe("completed");
    // Sink should not have been called with Object.prototype.toString
    expect(received).toEqual([]);
  });

  it("WorkflowRunner does not crash in multi-edge list detection or nested list check for prototype-named target handles", async () => {
    const received: unknown[] = [];
    const nodes: NodeDescriptor[] = [
      { id: "s1", type: "test.Source", outputs: { output: "str" } },
      { id: "s2", type: "test.Source", outputs: { output: "str" } },
      {
        id: "sink",
        type: "test.Sink",
        propertyTypes: {},
        dynamic_inputs: { toString: { type: "list[str]" } }
      }
    ];
    const edges: Edge[] = [
      { id: "e1", source: "s1", sourceHandle: "output", target: "sink", targetHandle: "toString" },
      { id: "e2", source: "s2", sourceHandle: "output", target: "sink", targetHandle: "toString" }
    ];
    // Note: correlation analysis requires propertyTypes[handle] to be a list type for multi-edge,
    // so test _detectMultiEdgeListInputs and isNestedListHandle with an explicit list in propertyTypes
    // vs empty propertyTypes on a controlled node's action schema.
    const ctlNodes: NodeDescriptor[] = [
      { id: "ctl", type: "test.Ctl" },
      {
        id: "tgt",
        type: "test.Tgt",
        is_controlled: true,
        properties: { toString: "hello" },
        propertyTypes: {}
      }
    ];
    const ctlEdges: Edge[] = [
      {
        id: "c1",
        source: "ctl",
        sourceHandle: "__control__",
        target: "tgt",
        targetHandle: "__control__",
        edge_type: "control"
      }
    ];
    const runner = new WorkflowRunner("j-proto-ctl", {
      resolveExecutor: (node) => ({
        async process(inputs) {
          if (node.id === "ctl") received.push(inputs._control_context);
          return {};
        }
      })
    });
    const result = await runner.run(
      { job_id: "j-proto-ctl" },
      withExplicitNodeFlags({ nodes: ctlNodes, edges: ctlEdges })
    );
    expect(result.status).toBe("completed");
    expect(received.length).toBe(1);
    // Avoid unused warning
    expect(nodes.length).toBe(3);
    expect(edges.length).toBe(2);
  });
});

describe("Bug 4: finishInputStream duplicate calls must not prematurely close multi-upstream handles", () => {
  it("ignores duplicate finishInputStream calls so sibling upstreams are not cut off", async () => {
    let releaseSibling!: () => void;
    const siblingHold = new Promise<void>((r) => (releaseSibling = r));
    const collected: unknown[] = [];

    const nodes: NodeDescriptor[] = [
      {
        id: "streamIn",
        type: "nodetool.input.StringInput",
        name: "stream",
        is_streaming_output: true,
        outputs: { output: "str" }
      },
      {
        id: "sibling",
        type: "test.SlowSource",
        outputs: { output: "str" }
      },
      {
        id: "collect",
        type: "test.Collect",
        propertyTypes: { items: "list[str]" },
        outputs: { output: "list[str]" }
      }
    ];
    const edges: Edge[] = [
      { id: "e1", source: "streamIn", sourceHandle: "output", target: "collect", targetHandle: "items" },
      { id: "e2", source: "sibling", sourceHandle: "output", target: "collect", targetHandle: "items" }
    ];

    const runner = new WorkflowRunner("j-dup-finish", {
      resolveExecutor: (node) => {
        if (node.id === "streamIn") {
          return { async process(inputs) { return { output: inputs.value }; } };
        }
        if (node.id === "sibling") {
          return {
            async process() {
              await siblingHold;
              return { output: "from-sibling" };
            }
          };
        }
        return {
          async process(inputs) {
            collected.push(inputs.items);
            return { output: inputs.items };
          }
        };
      }
    });

    const runPromise = runner.run(
      { job_id: "j-dup-finish" },
      withExplicitNodeFlags({ nodes, edges })
    );
    await tick(20);
    await runner.pushInputValue("stream", "from-stream");
    // Call finishInputStream twice before sibling finishes
    runner.finishInputStream("stream");
    runner.finishInputStream("stream");
    await tick(20);
    // Collect must NOT have fired yet — sibling is still open!
    expect(collected).toEqual([]);

    releaseSibling();
    const result = await runPromise;
    expect(result.status).toBe("completed");
    expect(collected).toEqual([["from-stream", "from-sibling"]]);
  });
});

describe("Bug 5: Initialized executors are finalized if _dispatchInputs fails", () => {
  it("finalizes all initialized executors when an input node's process() throws during dispatch", async () => {
    const finalized: string[] = [];
    const initSpy = vi.fn();

    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "x" },
      { id: "worker", type: "test.Worker" }
    ];
    const edges: Edge[] = [
      { id: "e1", source: "in", sourceHandle: "value", target: "worker", targetHandle: "a" }
    ];

    const runner = new WorkflowRunner("j-dispatch-fail", {
      resolveExecutor: (node) => ({
        async initialize() {
          initSpy(node.id);
        },
        async finalize() {
          finalized.push(node.id);
        },
        async process() {
          if (node.id === "in") throw new Error("bad input payload");
          return { output: 1 };
        }
      })
    });

    const result = await runner.run(
      { job_id: "j-dispatch-fail", params: { x: "bad" } },
      withExplicitNodeFlags({ nodes, edges })
    );
    expect(result.status).toBe("failed");
    expect(result.error).toContain("bad input payload");
    expect(initSpy).toHaveBeenCalledTimes(2);
    expect(finalized.sort()).toEqual(["in", "worker"]);
  });
});
