import { describe, expect, it } from "vitest";
import { createNodeToolSdkV1ExecutionReadinessProbe } from "../src/sdk/sdk-execution-readiness-probe.js";

describe("NodeTool SDK v1 execution readiness probe", () => {
  it("reports free server capacity as ready", async () => {
    const probe = createNodeToolSdkV1ExecutionReadinessProbe({
      getCapacitySnapshot: () => ({
        inFlightJobs: 1,
        maxConcurrentJobs: 4,
        queuedJobs: 0,
        workflowInFlightJobs: 0,
        maxConcurrentRunsForWorkflow: 1,
        likelyQueued: false
      })
    });

    await expect(probe()).resolves.toMatchObject({
      requirements: [
        {
          id: "nodetool-server",
          status: "available",
          blocking: true
        },
        {
          id: "execution-capacity",
          status: "available",
          blocking: false,
          details: { likely_queued: false }
        }
      ],
      issues: []
    });
  });

  it("reports likely queueing as a non-blocking warning", async () => {
    const probe = createNodeToolSdkV1ExecutionReadinessProbe({
      getCapacitySnapshot: () => ({
        inFlightJobs: 4,
        maxConcurrentJobs: 4,
        queuedJobs: 2,
        workflowInFlightJobs: 1,
        maxConcurrentRunsForWorkflow: 1,
        likelyQueued: true
      })
    });

    const result = await probe();
    expect(result.requirements[1]).toMatchObject({
      status: "available",
      blocking: false,
      details: { queued_jobs: 2, likely_queued: true }
    });
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "execution_likely_queued" })
    ]);
  });

  it("redacts probe failures and blocks only an unavailable target", async () => {
    const probe = createNodeToolSdkV1ExecutionReadinessProbe({
      getTargetReadiness: async () => {
        throw new Error("secret worker URL");
      },
      getCapacitySnapshot: async () => {
        throw new Error("internal queue state");
      }
    });

    const result = await probe();
    expect(result.requirements).toEqual([
      expect.objectContaining({
        id: "execution-target",
        status: "unavailable",
        blocking: true,
        message: "Execution target readiness check failed."
      }),
      expect.objectContaining({
        id: "execution-capacity",
        status: "unknown",
        blocking: false,
        message: "Execution capacity check failed."
      })
    ]);
    expect(JSON.stringify(result)).not.toContain("secret worker URL");
    expect(JSON.stringify(result)).not.toContain("internal queue state");
  });
});
