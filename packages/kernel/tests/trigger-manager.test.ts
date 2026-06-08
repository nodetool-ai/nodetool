import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TriggerWorkflowManager,
  type StartJobFn,
  type HasTriggerNodesFn
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
        completion: new Promise<void>(() => {}) // never resolves
      };
    });

    hasTriggerNodes = vi.fn(async () => true);

    manager = TriggerWorkflowManager.getInstance({
      startJob,
      hasTriggerNodes
    });
  });

  afterEach(() => {
    manager.stopWatchdog();
    TriggerWorkflowManager.resetInstance();
  });

  it("startTriggerWorkflow() calls startJob and tracks the job", async () => {
    const job = await manager.startTriggerWorkflow(
      "wf-1",
      "user-1",
      "My Workflow"
    );

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
        userId: "user-1"
      })
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

describe("TriggerWorkflowManager — singleton & lifecycle internals", () => {
  let startJob: ReturnType<typeof vi.fn<StartJobFn>>;
  let hasTriggerNodes: ReturnType<typeof vi.fn<HasTriggerNodesFn>>;

  beforeEach(() => {
    TriggerWorkflowManager.resetInstance();
    startJob = vi.fn(async () => ({
      jobId: "job",
      completion: new Promise<void>(() => {})
    }));
    hasTriggerNodes = vi.fn(async () => true);
  });

  afterEach(() => {
    TriggerWorkflowManager.resetInstance();
  });

  it("getInstance returns the same singleton", () => {
    const a = TriggerWorkflowManager.getInstance({ startJob, hasTriggerNodes });
    const b = TriggerWorkflowManager.getInstance({ startJob, hasTriggerNodes });
    expect(b).toBe(a);
  });

  it("restarts an existing non-running workflow instead of returning it", async () => {
    const mgr = TriggerWorkflowManager.getInstance({ startJob, hasTriggerNodes });
    const job1 = await mgr.startTriggerWorkflow("wf-1", "user-1");
    job1!.status = "failed";
    const job2 = await mgr.startTriggerWorkflow("wf-1", "user-1");
    expect(startJob).toHaveBeenCalledTimes(2);
    expect(job2).not.toBe(job1);
  });

  it("getRunningWorkflow returns the tracked job or undefined", async () => {
    const mgr = TriggerWorkflowManager.getInstance({ startJob, hasTriggerNodes });
    const job = await mgr.startTriggerWorkflow("wf-1", "user-1");
    expect(mgr.getRunningWorkflow("wf-1")).toBe(job);
    expect(mgr.getRunningWorkflow("missing")).toBeUndefined();
  });

  it("marks the job completed when its completion resolves", async () => {
    let resolveCompletion!: () => void;
    startJob.mockImplementation(async () => ({
      jobId: "j",
      completion: new Promise<void>((r) => {
        resolveCompletion = r;
      })
    }));
    const mgr = TriggerWorkflowManager.getInstance({ startJob, hasTriggerNodes });
    const job = await mgr.startTriggerWorkflow("wf-1", "user-1");
    resolveCompletion();
    await job!.completion;
    await Promise.resolve();
    expect(job!.status).toBe("completed");
  });

  it("marks the job cancelled when completion rejects with an AbortError", async () => {
    let rejectCompletion!: (e: Error) => void;
    startJob.mockImplementation(async () => ({
      jobId: "j",
      completion: new Promise<void>((_, rej) => {
        rejectCompletion = rej;
      })
    }));
    const mgr = TriggerWorkflowManager.getInstance({ startJob, hasTriggerNodes });
    const job = await mgr.startTriggerWorkflow("wf-1", "user-1");
    const err = new Error("aborted");
    err.name = "AbortError";
    rejectCompletion(err);
    await job!.completion.catch(() => {});
    await Promise.resolve();
    expect(job!.status).toBe("cancelled");
  });

  it("marks the job failed when completion rejects with a non-abort error", async () => {
    let rejectCompletion!: (e: Error) => void;
    startJob.mockImplementation(async () => ({
      jobId: "j",
      completion: new Promise<void>((_, rej) => {
        rejectCompletion = rej;
      })
    }));
    const mgr = TriggerWorkflowManager.getInstance({ startJob, hasTriggerNodes });
    const job = await mgr.startTriggerWorkflow("wf-1", "user-1");
    rejectCompletion(new Error("boom"));
    await job!.completion.catch(() => {});
    await Promise.resolve();
    expect(job!.status).toBe("failed");
  });

  it("stopTriggerWorkflow returns false when aborting throws", async () => {
    const mgr = TriggerWorkflowManager.getInstance({ startJob, hasTriggerNodes });
    const job = await mgr.startTriggerWorkflow("wf-1", "user-1");
    job!.abortController = {
      abort: () => {
        throw new Error("abort failed");
      }
    } as unknown as AbortController;
    expect(await mgr.stopTriggerWorkflow("wf-1")).toBe(false);
  });
});

describe("TriggerWorkflowManager — watchdog", () => {
  let startJob: ReturnType<typeof vi.fn<StartJobFn>>;
  let hasTriggerNodes: ReturnType<typeof vi.fn<HasTriggerNodesFn>>;

  beforeEach(() => {
    TriggerWorkflowManager.resetInstance();
    vi.useFakeTimers();
    startJob = vi.fn(async () => ({
      jobId: "job",
      completion: new Promise<void>(() => {})
    }));
    hasTriggerNodes = vi.fn(async () => true);
  });

  afterEach(() => {
    vi.useRealTimers();
    TriggerWorkflowManager.resetInstance();
  });

  it("schedules at the configured interval and is idempotent", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    const mgr = TriggerWorkflowManager.getInstance({
      startJob,
      hasTriggerNodes,
      watchdogInterval: 5000
    });
    mgr.startWatchdog();
    mgr.startWatchdog(); // idempotent — no second timer
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 5000);
    mgr.stopWatchdog();
  });

  it("can be restarted after stopping", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    const mgr = TriggerWorkflowManager.getInstance({
      startJob,
      hasTriggerNodes,
      watchdogInterval: 5000
    });
    mgr.startWatchdog();
    mgr.stopWatchdog();
    mgr.startWatchdog();
    expect(spy).toHaveBeenCalledTimes(2);
    mgr.stopWatchdog();
  });

  it("restarts failed and completed jobs and leaves running ones alone", async () => {
    const mgr = TriggerWorkflowManager.getInstance({
      startJob,
      hasTriggerNodes,
      watchdogInterval: 1000
    });
    const failed = await mgr.startTriggerWorkflow("wf-failed", "u");
    const completed = await mgr.startTriggerWorkflow("wf-completed", "u");
    await mgr.startTriggerWorkflow("wf-running", "u");
    failed!.status = "failed";
    completed!.status = "completed";
    expect(startJob).toHaveBeenCalledTimes(3);

    mgr.startWatchdog();
    await vi.advanceTimersByTimeAsync(1000); // fire the watchdog check

    // Both the failed and completed jobs are restarted (2 more startJob calls);
    // the running one is left untouched.
    expect(startJob).toHaveBeenCalledTimes(5);
    expect(mgr.isWorkflowRunning("wf-failed")).toBe(true);
    expect(mgr.isWorkflowRunning("wf-completed")).toBe(true);
    expect(mgr.isWorkflowRunning("wf-running")).toBe(true);
    mgr.stopWatchdog();
  });
});
