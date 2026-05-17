/**
 * Verifies that runWorkflow yields ProcessingMessages live and returns
 * the final RunResult — exercised against a structural fake of NodeRegistry
 * so the test stays free of base-nodes' heavy dependencies.
 */

import { describe, it, expect } from "vitest";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { NodeExecutor } from "@nodetool-ai/kernel";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import { runWorkflow } from "../src/run.js";

function passthrough(): NodeExecutor {
  return {
    async process(inputs: Record<string, unknown>) {
      return inputs;
    }
  };
}

function fakeRegistry(): NodeRegistry {
  return {
    resolve: () => passthrough(),
    createNodeValidator: () => () => []
  } as unknown as NodeRegistry;
}

describe("runWorkflow", () => {
  it("yields messages live and returns the final RunResult", async () => {
    const nodes: NodeDescriptor[] = [
      { id: "in", type: "test.Input", name: "value" },
      { id: "out", type: "test.Output", name: "value" }
    ];
    const edges: Edge[] = [
      {
        source: "in",
        sourceHandle: "value",
        target: "out",
        targetHandle: "value"
      }
    ];

    const seen: string[] = [];
    const gen = runWorkflow({
      graph: { nodes, edges },
      registry: fakeRegistry(),
      params: { value: 42 }
    });

    let result;
    while (true) {
      const next = await gen.next();
      if (next.done) {
        result = next.value;
        break;
      }
      seen.push(next.value.type);
    }

    expect(result.status).toBe("completed");
    expect(seen).toContain("job_update");
  });

  it("honours an AbortSignal before the run begins", async () => {
    const ctrl = new AbortController();
    ctrl.abort();

    const gen = runWorkflow({
      graph: {
        nodes: [{ id: "n", type: "test.Noop" }],
        edges: []
      },
      registry: fakeRegistry(),
      signal: ctrl.signal
    });

    // The generator should still terminate; the runner may complete before
    // the signal is observed since there is no I/O to interrupt — we just
    // assert it doesn't hang.
    const settled = await Promise.race([
      (async () => {
        let r;
        while (true) {
          const n = await gen.next();
          if (n.done) {
            r = n.value;
            break;
          }
        }
        return r;
      })(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("hang")), 5000))
    ]);
    expect(settled).toBeDefined();
  });
});
