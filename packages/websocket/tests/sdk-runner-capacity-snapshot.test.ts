import { describe, expect, it } from "vitest";
import { WebSocketClientSession } from "../src/websocket-client-session.js";

describe("SDK runner capacity snapshot", () => {
  it("reads the admission state without reserving or queueing a job", async () => {
    const runner = new WebSocketClientSession({
      resolveExecutor: () => ({
        async process() {
          return {};
        }
      })
    });

    const first = await runner.getSdkExecutionCapacitySnapshot({
      workflowId: "workflow-1"
    });
    const second = await runner.getSdkExecutionCapacitySnapshot({
      workflowId: "workflow-1"
    });

    expect(first).toEqual({
      inFlightJobs: 0,
      maxConcurrentJobs: 4,
      queuedJobs: 0,
      workflowInFlightJobs: 0,
      maxConcurrentRunsForWorkflow: 1,
      likelyQueued: false
    });
    expect(second).toEqual(first);
  });
});
