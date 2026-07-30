import { describe, it, expect } from "vitest";
import { ExecutionSession } from "../src/index.js";
import { buildTestRegistry } from "./fixtures.js";

const NO_BRIDGE = async () => null;

describe("ExecutionSession — cancel()", () => {
  it("produces a cancelled terminal and records the reason", async () => {
    const registry = buildTestRegistry();
    const session = await ExecutionSession.create({
      graph: {
        nodes: [{ id: "loop", type: "test.execution.Loop", properties: {} }],
        edges: []
      },
      registry,
      bridgeFactory: NO_BRIDGE
    });

    await new Promise((r) => setTimeout(r, 30));
    session.cancel("user-requested");
    const result = await session.result;

    expect(result.status).toBe("cancelled");
    expect(session.cancelReason).toBe("user-requested");
  });
});

describe("ExecutionSession — limits.runTimeoutMs", () => {
  it("cancels the run with reason 'timeout'", async () => {
    const registry = buildTestRegistry();
    const session = await ExecutionSession.create({
      graph: {
        nodes: [{ id: "loop", type: "test.execution.Loop", properties: {} }],
        edges: []
      },
      registry,
      bridgeFactory: NO_BRIDGE,
      limits: { runTimeoutMs: 30 }
    });

    const result = await session.result;

    expect(result.status).toBe("cancelled");
    expect(session.cancelReason).toBe("timeout");
  });

  it("rejects nodeTimeoutMs at create() rather than silently ignoring it", async () => {
    const registry = buildTestRegistry();
    await expect(
      ExecutionSession.create({
        graph: { nodes: [], edges: [] },
        registry,
        bridgeFactory: NO_BRIDGE,
        limits: { nodeTimeoutMs: 100 }
      })
    ).rejects.toThrow(/nodeTimeoutMs/);
  });
});
