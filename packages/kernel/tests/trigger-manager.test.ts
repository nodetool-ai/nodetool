import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Capture the manager's logger so the watchdog's "needs restart" warning can be
// asserted (it distinguishes the shutting-down early-return from the per-restart
// bail, which are otherwise indistinguishable through startJob).
const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@nodetool-ai/config", () => ({
  createLogger: () => ({
    warn,
    info: () => {},
    error: () => {},
    debug: () => {}
  })
}));

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

describe("TriggerWorkflowManager — shutdown & restart internals", () => {
  type Internals = {
    _shuttingDown: boolean;
    _watchdogCheckInFlight: Promise<void> | null;
    _watchdogCheck: () => Promise<void>;
  };
  const internals = (m: TriggerWorkflowManager): Internals =>
    m as unknown as Internals;

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
        completion: new Promise<void>(() => {})
      };
    });
    hasTriggerNodes = vi.fn(async () => true);
    manager = TriggerWorkflowManager.getInstance({ startJob, hasTriggerNodes });
  });

  afterEach(() => {
    manager.stopWatchdog();
    TriggerWorkflowManager.resetInstance();
  });

  it("joins an in-flight start instead of starting a second job", async () => {
    // Both calls happen before the first start resolves, so the second must
    // join the in-flight start (via _pendingStarts) rather than start again.
    const p1 = manager.startTriggerWorkflow("wf-c", "u");
    const p2 = manager.startTriggerWorkflow("wf-c", "u");
    const [a, b] = await Promise.all([p1, p2]);

    expect(a).toBe(b);
    expect(startJob).toHaveBeenCalledTimes(1);
  });

  it("watchdog check does nothing while shutting down", async () => {
    await manager.startTriggerWorkflow("wf-s", "u");
    manager.getRunningWorkflow("wf-s")!.status = "failed";
    internals(manager)._shuttingDown = true;
    startJob.mockClear();
    warn.mockClear();

    await internals(manager)._watchdogCheck();

    // The check returns before scanning for restarts: no restart, and not even
    // the "needs restart" warning is logged.
    expect(startJob).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("watchdog restarts only failed/completed jobs, not running or cancelled", async () => {
    await manager.startTriggerWorkflow("wf-run", "u");
    await manager.startTriggerWorkflow("wf-cancel", "u");
    manager.getRunningWorkflow("wf-cancel")!.status = "cancelled";
    startJob.mockClear();

    await internals(manager)._watchdogCheck();

    // A running job early-returns; a cancelled job is not a restart trigger.
    expect(startJob).not.toHaveBeenCalled();
  });

  it("clears the shutting-down flag after shutdown completes", async () => {
    await manager.shutdown();
    expect(internals(manager)._shuttingDown).toBe(false);
  });

  it("shutdown waits for an in-flight watchdog check and then clears it", async () => {
    let done = false;
    internals(manager)._watchdogCheckInFlight = new Promise<void>((res) =>
      setTimeout(() => {
        done = true;
        res();
      }, 10)
    );

    await manager.shutdown();

    expect(done).toBe(true);
    expect(internals(manager)._watchdogCheckInFlight).toBe(null);
  });

  it("a restart loop in flight stops restarting once shutdown begins", async () => {
    const int = internals(manager);
    await manager.startTriggerWorkflow("wf-a", "u");
    await manager.startTriggerWorkflow("wf-b", "u");
    manager.getRunningWorkflow("wf-a")!.status = "failed";
    manager.getRunningWorkflow("wf-b")!.status = "failed";

    // Pause the first restart at its hasTriggerNodes await so shutdown can flip
    // the shutting-down flag while the watchdog check is between iterations.
    let releaseFirst!: () => void;
    hasTriggerNodes.mockImplementationOnce(
      () =>
        new Promise<boolean>((res) => {
          releaseFirst = () => res(true);
        })
    );
    startJob.mockClear();

    const check = int._watchdogCheck();
    int._watchdogCheckInFlight = check;

    const sd = manager.shutdown(); // sets _shuttingDown, awaits the in-flight check
    releaseFirst(); // first restart finishes; the loop advances to wf-b
    await Promise.all([check, sd]);

    // wf-a was restarting when shutdown flipped the flag; wf-b is skipped.
    expect(startJob).toHaveBeenCalledTimes(1);
  });
});
