/**
 * `ExecutionSessionOptions.supervisor` — the one integration point every
 * surface configures supervision through (docs/workflow-supervisor-design.md
 * §7). What matters here is that the facade forwards the handle to the runner
 * and adds nothing: a scripted handle's verdict must change the run's outcome,
 * and a session without one must never escalate.
 */
import { describe, it, expect } from "vitest";
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { DecisionOutcome, SupervisorHandle } from "@nodetool-ai/kernel";
import { ExecutionSession } from "../src/index.js";
import { buildTestRegistry } from "./fixtures.js";

const NO_BRIDGE = async () => null;

class Boom extends BaseNode {
  static readonly nodeType = "test.execution.Boom";
  static readonly title = "Boom";
  static readonly description = "Always throws";

  @prop({ type: "int", default: 0 })
  declare value: unknown;

  async process(): Promise<Record<string, unknown>> {
    throw new Error("node exploded");
  }
}

function graph() {
  return {
    nodes: [
      { id: "v", type: "nodetool.input.Value", properties: {} },
      { id: "b", type: "test.execution.Boom", properties: {} }
    ],
    edges: [
      {
        source: "v",
        sourceHandle: "output",
        target: "b",
        targetHandle: "value"
      }
    ]
  };
}

/** Answers every escalation the same way, and counts the calls. */
class ScriptedHandle implements SupervisorHandle {
  calls = 0;
  constructor(private readonly outcome: DecisionOutcome) {}
  async decide(): Promise<DecisionOutcome> {
    this.calls++;
    return this.outcome;
  }
  close(): void {}
}

describe("ExecutionSession — supervisor", () => {
  it("forwards the handle: a skip verdict completes a run that would fail", async () => {
    const registry = buildTestRegistry();
    registry.register(Boom);
    const supervisor = new ScriptedHandle({
      verdict: { action: "skip" },
      decidedBy: "agent"
    });

    const session = await ExecutionSession.create({
      graph: graph(),
      registry,
      bridgeFactory: NO_BRIDGE,
      params: { v: 1 },
      supervisor
    });

    const result = await session.result;

    expect(supervisor.calls).toBe(1);
    expect(result.status).toBe("completed");
    expect(result.interventions?.[0]?.verdict.action).toBe("skip");
  });

  it("escalates nothing without a handle", async () => {
    const registry = buildTestRegistry();
    registry.register(Boom);

    const session = await ExecutionSession.create({
      graph: graph(),
      registry,
      bridgeFactory: NO_BRIDGE,
      params: { v: 1 }
    });

    const result = await session.result;

    expect(result.status).toBe("failed");
    expect(result.interventions).toBeUndefined();
  });
});
