/**
 * Tests for T-K-11: WorkflowRunner.sendControlEvent with response promise.
 */
import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import type { NodeExecutor } from "../src/actor.js";

describe("T-K-11: sendControlEvent", () => {
  function makeControlSetup() {
    const nodes: NodeDescriptor[] = [
      {
        id: "ctrl",
        type: "test.Controller",
        is_streaming_output: true,
        outputs: { __control__: "control" }
      },
      {
        id: "worker",
        type: "test.Worker",
        is_controlled: true,
        outputs: { result: "int" }
      }
    ];
    const edges: Edge[] = [
      {
        id: "ce1",
        source: "ctrl",
        sourceHandle: "__control__",
        target: "worker",
        targetHandle: "__control__",
        edge_type: "control"
      }
    ];
    return { nodes, edges };
  }

  it("dispatches run event and resolves with node outputs", async () => {
    const { nodes, edges } = makeControlSetup();

    let resolveCtrl!: () => void;
    const cancelledRef = { cancelled: false };
    const ctrlStarted = new Promise<void>((r) => {
      resolveCtrl = r;
    });

    const runner = new WorkflowRunner("job1", {
      resolveExecutor: (node) => {
        if (node.id === "ctrl") {
          return {
            async *genProcess() {
              resolveCtrl();
              // Yield initial event
              yield {
                __control__: { event_type: "run", properties: { x: 1 } }
              };
              // Wait until test signals done (poll, don't block)
              while (!cancelledRef.cancelled) {
                await new Promise((r) => setTimeout(r, 10));
              }
              // Send stop event
              yield { __control__: { event_type: "stop" } };
            },
            process: async () => ({})
          } as unknown as NodeExecutor;
        }
        return {
          process: async (inputs) => {
            const x = (inputs.x as number) ?? 0;
            return { result: x * 2 };
          }
        };
      }
    });

    const runPromise = runner.run({ job_id: "job1" }, { nodes, edges });

    await ctrlStarted;
    await new Promise((r) => setTimeout(r, 50));

    const output = await runner.sendControlEvent("worker", { x: 21 });
    expect(output).toBeDefined();
    expect(output.result).toBe(42);

    // Signal controller to finish
    cancelledRef.cancelled = true;
    const result = await runPromise;
    expect(result.status).toBe("completed");
  }, 10000);

  it("rejects (does not hang) when target actor already terminated", async () => {
    // Regression: an agent that dispatches a *burst* of control tool calls
    // to the same controlled node hangs forever if that node errors (and so
    // terminates) on the first call — the 2nd/3rd sendControlEvent register
    // a pending response that nothing can ever resolve. This reproduces a
    // controlled node that throws on its first run.
    const { nodes, edges } = makeControlSetup();

    let resolveCtrl!: () => void;
    const cancelledRef = { cancelled: false };
    const ctrlStarted = new Promise<void>((r) => {
      resolveCtrl = r;
    });

    const runner = new WorkflowRunner("job1", {
      resolveExecutor: (node) => {
        if (node.id === "ctrl") {
          return {
            async *genProcess() {
              resolveCtrl();
              yield {
                __control__: { event_type: "run", properties: { x: 1 } }
              };
              while (!cancelledRef.cancelled) {
                await new Promise((r) => setTimeout(r, 10));
              }
              yield { __control__: { event_type: "stop" } };
            },
            process: async () => ({})
          } as unknown as NodeExecutor;
        }
        // Worker throws on its control event → its actor terminates.
        return {
          process: async () => {
            throw new Error("worker boom");
          }
        };
      }
    });

    const runPromise = runner.run({ job_id: "job1" }, { nodes, edges });
    await ctrlStarted;
    await new Promise((r) => setTimeout(r, 50));

    // First dispatch: the worker errors → the pending response is rejected.
    await expect(runner.sendControlEvent("worker", { x: 1 })).rejects.toThrow();

    // Second dispatch to the now-terminated worker must reject promptly
    // instead of hanging. The 10s test timeout fails the test if it hangs.
    await expect(runner.sendControlEvent("worker", { x: 2 })).rejects.toThrow();

    cancelledRef.cancelled = true;
    await runPromise;
  }, 10000);

  it("rejects if target node inbox not found", async () => {
    const runner = new WorkflowRunner("job1", {
      resolveExecutor: () => ({
        process: async () => ({ output: 1 })
      })
    });

    await expect(
      runner.sendControlEvent("nonexistent", { x: 1 })
    ).rejects.toThrow();
  });

  it("multiple control events resolve independently", async () => {
    const { nodes, edges } = makeControlSetup();

    let resolveCtrl!: () => void;
    const cancelledRef = { cancelled: false };
    const ctrlStarted = new Promise<void>((r) => {
      resolveCtrl = r;
    });

    const runner = new WorkflowRunner("job1", {
      resolveExecutor: (node) => {
        if (node.id === "ctrl") {
          return {
            async *genProcess() {
              resolveCtrl();
              yield {
                __control__: { event_type: "run", properties: { x: 0 } }
              };
              while (!cancelledRef.cancelled) {
                await new Promise((r) => setTimeout(r, 10));
              }
              yield { __control__: { event_type: "stop" } };
            },
            process: async () => ({})
          } as unknown as NodeExecutor;
        }
        return {
          process: async (inputs) => {
            const x = (inputs.x as number) ?? 0;
            return { result: x + 1 };
          }
        };
      }
    });

    const runPromise = runner.run({ job_id: "job1" }, { nodes, edges });
    await ctrlStarted;
    await new Promise((r) => setTimeout(r, 50));

    const out1 = await runner.sendControlEvent("worker", { x: 10 });
    expect(out1.result).toBe(11);

    const out2 = await runner.sendControlEvent("worker", { x: 20 });
    expect(out2.result).toBe(21);

    cancelledRef.cancelled = true;
    await runPromise;
  }, 10000);
});
