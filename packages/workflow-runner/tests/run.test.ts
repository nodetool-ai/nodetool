/**
 * Verifies that runWorkflow yields ProcessingMessages live and returns
 * the final RunResult — exercised against a structural fake of NodeRegistry
 * so the test stays free of base-nodes' heavy dependencies.
 */

import { describe, it, expect, vi } from "vitest";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  WorkflowRunner,
  type NodeExecutor,
  type NodeValidator
} from "@nodetool-ai/kernel";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import { runWorkflow } from "../src/run.js";

function passthrough(): NodeExecutor {
  return {
    async process(inputs: Record<string, unknown>) {
      return inputs;
    }
  };
}

function fakeRegistry(
  resolve: (node: NodeDescriptor) => NodeExecutor = () => passthrough()
): NodeRegistry {
  return {
    resolve,
    createNodeValidator: () => () => [],
    getClass: () => undefined
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

  it("cancels the runner when the AbortSignal fires", async () => {
    const cancelSpy = vi.spyOn(WorkflowRunner.prototype, "cancel");
    try {
      const ctrl = new AbortController();
      const streamingExecutor: NodeExecutor = {
        async process() {
          return {};
        },
        async run(inputs) {
          for await (const value of inputs.stream("value")) {
            void value;
          }
        }
      };

      const gen = runWorkflow({
        graph: {
          nodes: [
            {
              id: "in",
              type: "test.Input",
              name: "value",
              is_streaming_output: true
            },
            {
              id: "stream",
              type: "test.Streaming",
              is_streaming_input: true
            }
          ],
          edges: [
            {
              source: "in",
              sourceHandle: "value",
              target: "stream",
              targetHandle: "value"
            }
          ]
        },
        registry: fakeRegistry((node) =>
          node.type === "test.Streaming" ? streamingExecutor : passthrough()
        ),
        signal: ctrl.signal
      });

      const first = await gen.next();
      expect(first.done).toBe(false);
      ctrl.abort();

      let status: string | undefined;
      while (true) {
        const next = await gen.next();
        if (next.done) {
          status = next.value.status;
          break;
        }
      }

      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(status).toBe("cancelled");
    } finally {
      cancelSpy.mockRestore();
    }
  });

  it("composes platform validation with the registry's property validator", async () => {
    let propCalls = 0;
    let platformCalls = 0;
    const propValidator: NodeValidator = () => {
      propCalls++;
      return null;
    };
    const platformValidator: NodeValidator = (descriptor) => {
      platformCalls++;
      return descriptor.type === "test.Banned"
        ? [
            {
              nodeId: descriptor.id,
              nodeType: descriptor.type,
              property: "*",
              message: "not supported on platform 'workers'"
            }
          ]
        : [];
    };

    const registry = {
      resolve: () => passthrough(),
      createNodeValidator: () => propValidator,
      createPlatformValidator: () => platformValidator,
      getClass: () => undefined
    } as unknown as NodeRegistry;

    const gen = runWorkflow({
      graph: {
        nodes: [{ id: "bad", type: "test.Banned" }],
        edges: []
      },
      registry,
      platform: "workers"
    });

    let result;
    while (true) {
      const n = await gen.next();
      if (n.done) {
        result = n.value;
        break;
      }
    }

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/workers/);
    expect(propCalls).toBeGreaterThan(0);
    expect(platformCalls).toBeGreaterThan(0);
  });

  it("hydrates streaming flags from the registry's classes", async () => {
    // The graph carries NO is_streaming_input — exactly what a web client
    // sends. Without hydration the actor one-shots process() and the node
    // never streams (the synth "stops immediately" regression).
    let streamed = false;
    const streamingExecutor: NodeExecutor = {
      async process() {
        return {};
      },
      async run(inputs) {
        streamed = true;
        for await (const value of inputs.stream("value")) {
          void value;
        }
      }
    };
    const registry = {
      resolve: () => streamingExecutor,
      createNodeValidator: () => () => [],
      getClass: () => ({ isStreamingInput: true })
    } as unknown as NodeRegistry;

    const gen = runWorkflow({
      graph: {
        nodes: [{ id: "stream", type: "test.Streaming" }],
        edges: []
      },
      registry
    });
    while (!(await gen.next()).done) {
      // drain
    }
    expect(streamed).toBe(true);
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
