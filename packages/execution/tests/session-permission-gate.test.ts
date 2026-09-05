/**
 * `ExecutionSession.create` is the workflow host: every run leaves it with a
 * permission gate on its context. A caller that brought none gets the
 * headless gate; a caller that set its own — a chat turn's `run_node` —
 * keeps it by reference, so its live mode and allow-set still reach the loops
 * inside the graph.
 */

import { describe, expect, it } from "vitest";
import {
  PERMISSION_GATE_CONTEXT_KEY,
  ProcessingContext,
  type PermissionGateOptions
} from "@nodetool-ai/runtime";
import { BaseNode } from "@nodetool-ai/node-sdk";
import { ExecutionSession } from "../src/index.js";
import { buildTestRegistry } from "./fixtures.js";

const NO_BRIDGE = async () => null;

let capturedGate: unknown = "never-ran";

class CaptureGateNode extends BaseNode {
  static readonly nodeType = "test.execution.CaptureGate";
  static readonly title = "CaptureGate";
  static readonly description = "Captures the gate on the run context";

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    capturedGate = context?.get(PERMISSION_GATE_CONTEXT_KEY);
    return { out: "done" };
  }
}

function registry() {
  const reg = buildTestRegistry();
  reg.register(CaptureGateNode);
  return reg;
}

const graph = {
  nodes: [
    { id: "n1", type: "test.execution.CaptureGate", properties: {} }
  ],
  edges: []
};

function isGate(value: unknown): value is PermissionGateOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    "mode" in value &&
    "requestApproval" in value
  );
}

describe("ExecutionSession and the permission gate", () => {
  it("sets the headless gate when the caller brings no context", async () => {
    capturedGate = "never-ran";
    const session = await ExecutionSession.create({
      graph,
      registry: registry(),
      bridgeFactory: NO_BRIDGE
    });
    const result = await session.result;

    expect(result.status).toBe("completed");
    expect(isGate(capturedGate)).toBe(true);
    if (isGate(capturedGate)) {
      expect(capturedGate.mode).toBe("auto");
    }
  });

  it("sets the headless gate on a caller's context that carries none", async () => {
    capturedGate = "never-ran";
    const context = new ProcessingContext({ jobId: "job-gate", userId: "1" });
    const session = await ExecutionSession.create({
      graph,
      registry: registry(),
      bridgeFactory: NO_BRIDGE,
      context
    });
    await session.result;

    const gate = context.get<unknown>(PERMISSION_GATE_CONTEXT_KEY);
    expect(isGate(gate)).toBe(true);
    expect(capturedGate).toBe(gate);
    if (isGate(gate)) {
      expect(gate.mode).toBe("auto");
      await expect(
        gate.requestApproval({
          toolName: "delete_workflow",
          category: "write",
          args: {},
          message: "Delete"
        })
      ).resolves.toBe("deny");
    }
  });

  it("keeps the gate a caller already set, by reference", async () => {
    capturedGate = "never-ran";
    const hostGate: PermissionGateOptions = {
      mode: "plan",
      sessionAllow: new Set<string>(),
      requestApproval: async () => "allow"
    };
    const context = new ProcessingContext({ jobId: "job-host", userId: "1" });
    context.set(PERMISSION_GATE_CONTEXT_KEY, hostGate);
    const session = await ExecutionSession.create({
      graph,
      registry: registry(),
      bridgeFactory: NO_BRIDGE,
      context
    });
    await session.result;

    expect(context.get(PERMISSION_GATE_CONTEXT_KEY)).toBe(hostGate);
    expect(capturedGate).toBe(hostGate);
  });
});
