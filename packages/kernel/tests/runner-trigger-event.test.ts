/**
 * `trigger_event` on RunJobRequest reaching the executor's ProcessingContext.
 *
 * Sibling of runner-node-validation.test.ts: exercises WorkflowRunner.run()
 * end-to-end with a real ProcessingContext supplied as
 * WorkflowRunnerOptions.executionContext, and asserts the trigger payload is
 * visible to node executors as `ctx.triggerEvent` during the run.
 */
import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import type { NodeDescriptor } from "@nodetool-ai/protocol";
import type { NodeExecutor } from "../src/actor.js";
import { ProcessingContext } from "@nodetool-ai/runtime";

describe("WorkflowRunner – trigger_event propagation", () => {
  it("exposes RunJobRequest.trigger_event on the executionContext as triggerEvent", async () => {
    const ctx = new ProcessingContext({ jobId: "job-placeholder" });
    let seenDuringRun: unknown;

    const executor: NodeExecutor = {
      async process() {
        seenDuringRun = ctx.triggerEvent;
        return {};
      }
    };

    const runner = new WorkflowRunner("j1", {
      resolveExecutor: () => executor,
      executionContext: ctx
    });

    const nodes: NodeDescriptor[] = [
      { id: "n1", type: "test.Trigger", properties: {} }
    ];

    const triggerEvent = {
      node_id: "n1",
      payload: { hello: "world" },
      input_id: "input-1"
    };

    const result = await runner.run(
      { job_id: "j1", trigger_event: triggerEvent },
      { nodes, edges: [] }
    );

    expect(result.status).toBe("completed");
    expect(seenDuringRun).toEqual(triggerEvent);
    expect(ctx.triggerEvent).toEqual(triggerEvent);
  });

  it("leaves triggerEvent null when RunJobRequest carries none", async () => {
    const ctx = new ProcessingContext({ jobId: "job-placeholder" });
    ctx.triggerEvent = {
      node_id: "stale",
      payload: null,
      input_id: "stale-input"
    };

    const executor: NodeExecutor = {
      async process() {
        return {};
      }
    };

    const runner = new WorkflowRunner("j2", {
      resolveExecutor: () => executor,
      executionContext: ctx
    });

    const nodes: NodeDescriptor[] = [
      { id: "n1", type: "test.Plain", properties: {} }
    ];

    const result = await runner.run({ job_id: "j2" }, { nodes, edges: [] });

    expect(result.status).toBe("completed");
    expect(ctx.triggerEvent).toBeNull();
  });
});
