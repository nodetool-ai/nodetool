import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TriggerWorkflowManager,
  type StartJobFn,
  type HasTriggerNodesFn,
} from "../src/trigger-manager.js";

describe("TriggerWorkflowManager", () => {
  let startJob: ReturnType<typeof vi.fn<StartJobFn>>;
  let hasTriggerNodes: ReturnType<typeof vi.fn<HasTriggerNodesFn>>;
  let manager: TriggerWorkflowManager;
  let jobCounter: number;

  beforeEach(() => {
    TriggerWorkflowManager.resetInstance();
    jobCounter = 0;

    startJob = vi.fn(async () => {
      jobCounter++;
      return {
        jobId: `job-${jobCounter}`,
        completion: new Promise<void>(() => {}), // never resolves
      };
    });

    hasTriggerNodes = vi.fn(async () => true);

    manager = TriggerWorkflowManager.getInstance({
      startJob,
      hasTriggerNodes,
    });
  });

  afterEach(() => {
    manager.stopWatchdog();
    TriggerWorkflowManager.resetInstance();
  });

  it("startTriggerWorkflow() calls startJob and tracks the job", async () => {
    const job = await manager.startTriggerWorkflow("wf-1", "user-1", "My Workflow");

    expect(job).not.toBeNull();
    expect(job!.jobId).toBe("job-1");
    expect(job!.workflowId).toBe("wf-1");
    expect(job!.status).toBe("running");
    expect(job!.metadata.userId).toBe("user-1");
    expect(job!.metadata.workflowName).toBe("My Workflow");

    expect(startJob).toHaveBeenCalledTimes(1);
    expect(startJob).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf-1",
        userId: "user-1",
      }),
    );
  });

  it("startTriggerWorkflow() returns existing job if already running", async () => {
    const job1 = await manager.startTriggerWorkflow("wf-1", "user-1");
    const job2 = await manager.startTriggerWorkflow("wf-1", "user-1");

    expect(job2).toBe(job1); // same reference
    expect(startJob).toHaveBeenCalledTimes(1); // not called again
  });

  it("startTriggerWorkflow() returns null if no trigger nodes", async () => {
    hasTriggerNodes.mockResolvedValue(false);

    const job = await manager.startTriggerWorkflow("wf-1", "user-1");
    expect(job).toBeNull();
    expect(startJob).not.toHaveBeenCalled();
  });

  it("stopTriggerWorkflow() aborts and removes the job", async () => {
    const job = await manager.startTriggerWorkflow("wf-1", "user-1");
    expect(job).not.toBeNull();
    expect(manager.isWorkflowRunning("wf-1")).toBe(true);

    const stopped = await manager.stopTriggerWorkflow("wf-1");
    expect(stopped).toBe(true);
    expect(manager.isWorkflowRunning("wf-1")).toBe(false);
    expect(job!.status).toBe("cancelled");
  });

  it("stopTriggerWorkflow() returns false for non-existent workflow", async () => {
    const stopped = await manager.stopTriggerWorkflow("nonexistent");
    expect(stopped).toBe(false);
  });

  it("isWorkflowRunning() reflects current state", async () => {
    expect(manager.isWorkflowRunning("wf-1")).toBe(false);

    await manager.startTriggerWorkflow("wf-1", "user-1");
    expect(manager.isWorkflowRunning("wf-1")).toBe(true);

    await manager.stopTriggerWorkflow("wf-1");
    expect(manager.isWorkflowRunning("wf-1")).toBe(false);
  });

  it("listRunningWorkflows() returns copy of running jobs", async () => {
    await manager.startTriggerWorkflow("wf-1", "user-1");
    await manager.startTriggerWorkflow("wf-2", "user-2");

    const running = manager.listRunningWorkflows();
    expect(running.size).toBe(2);
    expect(running.has("wf-1")).toBe(true);
    expect(running.has("wf-2")).toBe(true);

    // It's a copy, not the internal map
    running.delete("wf-1");
    expect(manager.isWorkflowRunning("wf-1")).toBe(true);
  });

  it("shutdown() stops watchdog and all workflows", async () => {
    await manager.startTriggerWorkflow("wf-1", "user-1");
    await manager.startTriggerWorkflow("wf-2", "user-2");

    manager.startWatchdog(60_000);

    await manager.shutdown();

    expect(manager.isWorkflowRunning("wf-1")).toBe(false);
    expect(manager.isWorkflowRunning("wf-2")).toBe(false);
    expect(manager.listRunningWorkflows().size).toBe(0);
  });

  it("startTriggerWorkflow() returns null if startJob throws", async () => {
    startJob.mockRejectedValue(new Error("connection failed"));

    const job = await manager.startTriggerWorkflow("wf-1", "user-1");
    expect(job).toBeNull();
  });
});
