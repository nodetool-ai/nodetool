import { describe, expect, it, vi } from "vitest";
import { SdkLiveRunnerRegistry } from "../src/sdk/sdk-live-runner-registry.js";

describe("SDK live runner registry", () => {
  it("scopes exact runner capacity to its authenticated user", async () => {
    const getSdkExecutionCapacitySnapshot = vi.fn(async () => ({
      inFlightJobs: 1,
      maxConcurrentJobs: 4,
      queuedJobs: 0,
      workflowInFlightJobs: 0,
      maxConcurrentRunsForWorkflow: 1,
      likelyQueued: false
    }));
    const registry = new SdkLiveRunnerRegistry();
    const runnerId = registry.register("alice", {
      getSdkExecutionCapacitySnapshot
    });

    await expect(
      registry.getCapacity({
        runnerId,
        userId: "alice",
        workflowId: "workflow-1",
        concurrent: true
      })
    ).resolves.toMatchObject({ inFlightJobs: 1 });
    await expect(
      registry.getCapacity({
        runnerId,
        userId: "bob",
        workflowId: "workflow-1"
      })
    ).rejects.toThrow("unavailable");
    expect(getSdkExecutionCapacitySnapshot).toHaveBeenCalledWith({
      workflowId: "workflow-1",
      concurrent: true
    });

    registry.unregister(runnerId);
    expect(registry.has(runnerId, "alice")).toBe(false);
  });
});
