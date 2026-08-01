/**
 * Message capture is opt-in and bounded: a host that only awaits
 * `session.result` (every production caller) must not accumulate an unread
 * queue of the run's messages, and a consumer that opts in but falls behind
 * must fail loudly instead of retaining everything.
 */
import { describe, it, expect } from "vitest";
import { ExecutionSession } from "../src/index.js";
import { buildTestRegistry } from "./fixtures.js";

const NO_BRIDGE = async () => null;

const DOUBLE_GRAPH = {
  nodes: [
    { id: "v", type: "nodetool.input.Value", properties: {} },
    { id: "double", type: "test.execution.Double", properties: {} }
  ],
  edges: [
    { source: "v", sourceHandle: "output", target: "double", targetHandle: "value" }
  ]
};

describe("ExecutionSession — message capture", () => {
  it("queues nothing and refuses `messages` when capture is not requested", async () => {
    const registry = buildTestRegistry();
    const session = await ExecutionSession.create({
      graph: DOUBLE_GRAPH,
      registry,
      bridgeFactory: NO_BRIDGE,
      params: { v: 5 }
    });

    expect(() => session.messages).toThrow(/captureMessages/);
    const result = await session.result;
    expect(result.status).toBe("completed");
  });

  it("throws once an un-drained consumer exceeds the buffer limit", async () => {
    const registry = buildTestRegistry();
    const session = await ExecutionSession.create({
      graph: {
        nodes: [{ id: "loop", type: "test.execution.Loop", properties: {} }],
        edges: []
      },
      registry,
      bridgeFactory: NO_BRIDGE,
      captureMessages: true,
      limits: { runTimeoutMs: 500, messageBufferLimit: 3 }
    });

    // Let the run emit well past the limit before pulling anything.
    await session.result;

    const drain = async (): Promise<void> => {
      for await (const _message of session.messages) {
        // drain
      }
    };
    await expect(drain()).rejects.toThrow(/overflowed/);
  });
});
