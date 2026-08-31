/**
 * A5: `resolveExecutor`/optional `registry` — the escape hatch that lets a
 * host with its own executor-resolution closure (no `NodeRegistry` instance
 * of its own, e.g. `websocket-client-session.ts`) migrate onto
 * `ExecutionSession` without the facade rebuilding a second, possibly
 * divergent resolver from a `bridgeFactory`.
 */
import { describe, it, expect } from "vitest";
import { ExecutionSession } from "../src/index.js";

const NO_BRIDGE = async () => null;

describe("ExecutionSession — resolveExecutor override (no registry)", () => {
  it("runs a graph using only the injected resolveExecutor, no registry", async () => {
    const session = await ExecutionSession.create({
      graph: {
        nodes: [
          {
            id: "double",
            type: "test.execution.Double",
            is_streaming_input: false,
            is_streaming_output: false,
            is_controlled: false,
            is_join_node: false,
            properties: { value: 21 }
          }
        ],
        edges: []
      },
      resolveExecutor: () => ({
        async process(inputs: Record<string, unknown>) {
          return { output: Number(inputs.value ?? 0) * 2 };
        }
      }),
      bridgeFactory: NO_BRIDGE,
      params: {}
    });

    const result = await session.result;

    expect(result.status).toBe("completed");
    expect(result.outputs["double"]).toEqual([42]);
  });

  it("throws at create() when neither registry nor resolveExecutor is given", async () => {
    await expect(
      ExecutionSession.create({
        graph: { nodes: [], edges: [] },
        bridgeFactory: NO_BRIDGE
      } as never)
    ).rejects.toThrow(/registry or resolveExecutor/);
  });
});
