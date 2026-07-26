import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TriggerWorkflowManager,
  type StartJobFn,
  type HasTriggerNodesFn,
  type TriggerJob
} from "../src/trigger-manager.js";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** Let queued microtasks (promise continuations) run. */
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("TriggerWorkflowManager — stop racing an in-flight start", () => {
  let startJob: ReturnType<typeof vi.fn<StartJobFn>>;
  let hasTriggerNodes: ReturnType<typeof vi.fn<HasTriggerNodesFn>>;
  let manager: TriggerWorkflowManager;

  beforeEach(() => {
    TriggerWorkflowManager.resetInstance();
    startJob = vi.fn(async () => ({
      jobId: "job-1",
      completion: new Promise<void>(() => {})
    }));
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

  it("stops the job a still-pending start is about to produce", async () => {
    // Arrange: hold the start open so the job exists only in _pendingStarts.
    const gate = deferred<boolean>();
    hasTriggerNodes.mockReturnValue(gate.promise);
    const startPromise = manager.startTriggerWorkflow("wf-1", "user-1");
    await flush();
    expect(manager.isWorkflowRunning("wf-1")).toBe(false); // not tracked yet

    // Act: the user stops it before the start lands.
    const stopPromise = manager.stopTriggerWorkflow("wf-1");
    gate.resolve(true);
    const stopped = await stopPromise;
    const job = await startPromise;

    // Assert: the stop waited for the start and cancelled its job, rather than
    // finding nothing and leaving the workflow running behind the user's back.
    expect(stopped).toBe(true);
    expect(job).not.toBeNull();
    expect((job as TriggerJob).status).toBe("cancelled");
    expect((job as TriggerJob).abortController.signal.aborted).toBe(true);
    expect(manager.isWorkflowRunning("wf-1")).toBe(false);
  });

  it("returns false instead of propagating when the in-flight start rejects", async () => {
    // Arrange: the start fails after the stop has begun awaiting it.
    const gate = deferred<boolean>();
    hasTriggerNodes.mockReturnValue(gate.promise);
    const startPromise = manager.startTriggerWorkflow("wf-1", "user-1");
    const startFailure = startPromise.catch(() => "start rejected");
    await flush();

    // Act
    const stopPromise = manager.stopTriggerWorkflow("wf-1");
    gate.reject(new Error("lookup exploded"));

    // Assert: a failed start leaves nothing to stop — the caller of stop sees
    // false, not the start's error.
    await expect(stopPromise).resolves.toBe(false);
    await expect(startFailure).resolves.toBe("start rejected");
    expect(manager.isWorkflowRunning("wf-1")).toBe(false);
  });
});

describe("TriggerWorkflowManager — job completion failures", () => {
  let startJob: ReturnType<typeof vi.fn<StartJobFn>>;
  let manager: TriggerWorkflowManager;
  let completion: Deferred<void>;

  beforeEach(() => {
    TriggerWorkflowManager.resetInstance();
    completion = deferred<void>();
    startJob = vi.fn(async () => ({
      jobId: "job-1",
      completion: completion.promise
    }));
    manager = TriggerWorkflowManager.getInstance({
      startJob,
      hasTriggerNodes: async () => true
    });
  });

  afterEach(() => {
    manager.stopWatchdog();
    TriggerWorkflowManager.resetInstance();
  });

  it("marks the job failed when the completion rejects with a non-Error value", async () => {
    // Arrange
    const job = await manager.startTriggerWorkflow("wf-1", "user-1");
    expect(job).not.toBeNull();

    // Act: a rejection carrying no `.name` at all (not an Error, not even an
    // object) — the handler must classify it, not throw while inspecting it.
    completion.reject(undefined);
    await flush();

    // Assert
    expect((job as TriggerJob).status).toBe("failed");
    expect(manager.isWorkflowRunning("wf-1")).toBe(false);
  });
});
