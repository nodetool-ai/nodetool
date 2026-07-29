import { describe, expect, it, vi } from "vitest";
import { createNodeToolSdkV1WorkerReadinessAdapter } from "../src/sdk/sdk-worker-readiness-adapter.js";

describe("NodeTool SDK v1 worker readiness adapter", () => {
  it("reads only the selected persisted worker", async () => {
    const listWorkers = vi.fn(async () => [
      {
        id: "worker-a",
        profile_name: "RunPod A40",
        target: "runpod",
        status: "attached"
      },
      {
        id: "worker-b",
        profile_name: "Vast backup",
        target: "vast",
        status: "stopped"
      }
    ]);
    const probe = createNodeToolSdkV1WorkerReadinessAdapter({
      workerId: "worker-a",
      listWorkers
    });

    await expect(probe()).resolves.toEqual({
      id: "worker-a",
      name: "RunPod A40",
      ready: true,
      message: null
    });
    expect(listWorkers).toHaveBeenCalledOnce();
  });

  it("does not claim stopped or missing workers are ready", async () => {
    await expect(
      createNodeToolSdkV1WorkerReadinessAdapter({
        workerId: "worker-a",
        listWorkers: () => [
          {
            id: "worker-a",
            profile_name: "GPU",
            target: "runpod",
            status: "stopped"
          }
        ]
      })()
    ).resolves.toMatchObject({
      ready: false,
      message: "Selected execution worker is stopped."
    });

    await expect(
      createNodeToolSdkV1WorkerReadinessAdapter({
        workerId: "missing",
        listWorkers: () => []
      })()
    ).resolves.toMatchObject({
      ready: false,
      message: "Selected execution worker was not found."
    });
  });
});
