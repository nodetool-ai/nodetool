import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initTestDb,
  ModelObserver,
  RunEvent,
  TriggerInput,
  TriggerRegistration
} from "@nodetool-ai/models";
import { TriggerWakeupService } from "@nodetool-ai/kernel";
import type { TriggerInput as TriggerInputRecord } from "@nodetool-ai/kernel";
import { DrizzleTriggerInputStore } from "../src/triggers/stores.js";
import {
  createTriggerDispatcher,
  dispatchInput,
  getTriggerWakeupService,
  setTriggerWakeupService,
  startDispatcher
} from "../src/triggers/dispatcher.js";
import type { DispatchedJob } from "../src/triggers/dispatcher.js";

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function makeRegistration(
  overrides: Partial<{
    workflowId: string;
    nodeId: string;
    kind: string;
    config: Record<string, unknown>;
    enabled: number;
    lastError: string | null;
  }> = {}
): Promise<TriggerRegistration> {
  return (await TriggerRegistration.create<TriggerRegistration>({
    user_id: "user-1",
    workflow_id: overrides.workflowId ?? "wf-1",
    node_id: overrides.nodeId ?? "n1",
    kind: overrides.kind ?? "webhook",
    config_json: overrides.config ?? {},
    enabled: overrides.enabled ?? 1,
    last_error: overrides.lastError ?? null
  })) as TriggerRegistration;
}

async function storeInput(
  store: DrizzleTriggerInputStore,
  inputId: string,
  overrides: Partial<{
    runId: string;
    nodeId: string;
    payload: unknown;
    createdAt: Date;
  }> = {}
): Promise<TriggerInputRecord> {
  const record: TriggerInputRecord = {
    runId: overrides.runId ?? "wf-1",
    nodeId: overrides.nodeId ?? "n1",
    inputId,
    payload: overrides.payload ?? { hello: inputId },
    processed: false,
    createdAt: overrides.createdAt ?? new Date()
  };
  await store.insertIfAbsent(record);
  return record;
}

function okJob(jobId: string): DispatchedJob {
  return { jobId, status: "completed", error: null };
}

async function isProcessed(inputId: string): Promise<boolean> {
  const row = await TriggerInput.findByInputId(inputId);
  return row?.processed === 1;
}

describe("trigger dispatcher", () => {
  let store: DrizzleTriggerInputStore;

  beforeEach(() => {
    initTestDb();
    store = new DrizzleTriggerInputStore();
    setTriggerWakeupService(null);
  });

  afterEach(() => {
    ModelObserver.clear();
    setTriggerWakeupService(null);
    vi.useRealTimers();
  });

  it("(a) starts exactly one run with trigger_event set and marks the input processed", async () => {
    const registration = await makeRegistration();
    await storeInput(store, "in-1", { payload: { body: { a: 1 } } });

    const startJob = vi.fn(async () => okJob("job-1"));
    const dispatcher = createTriggerDispatcher({ store, startJob });

    await dispatcher.runOnce();

    expect(startJob).toHaveBeenCalledTimes(1);
    expect(startJob.mock.calls[0][0]).toMatchObject({
      workflowId: "wf-1",
      userId: "user-1",
      triggerEvent: {
        node_id: "n1",
        input_id: "in-1",
        payload: { body: { a: 1 } }
      }
    });
    expect(await isProcessed("in-1")).toBe(true);

    // TriggerInputReceived is emitted for the dispatched input.
    const events = await RunEvent.getEvents("wf-1", {
      eventType: "TriggerInputReceived"
    });
    expect(events).toHaveLength(1);
    expect(events[0].node_id).toBe("n1");
    expect(events[0].payload).toMatchObject({
      input_id: "in-1",
      registration_id: registration.id
    });

    // A second pass finds nothing left to do.
    await dispatcher.runOnce();
    expect(startJob).toHaveBeenCalledTimes(1);
  });

  it("(b) a startJob rejection leaves the input unprocessed and writes last_error", async () => {
    const registration = await makeRegistration();
    await storeInput(store, "in-1");

    const startJob = vi.fn(async () => {
      throw new Error("boom");
    });
    const dispatcher = createTriggerDispatcher({ store, startJob });

    await dispatcher.runOnce();

    expect(startJob).toHaveBeenCalledTimes(1);
    expect(await isProcessed("in-1")).toBe(false);
    const reloaded = (await TriggerRegistration.get(
      registration.id
    )) as TriggerRegistration;
    expect(reloaded.last_error).toContain("boom");

    // Redelivered on the next tick.
    await dispatcher.runOnce();
    expect(startJob).toHaveBeenCalledTimes(2);
  });

  it("(b') a resolved-but-failed run counts as delivered: processed, with last_error recorded", async () => {
    const registration = await makeRegistration();
    await storeInput(store, "in-1");

    const startJob = vi.fn(async () => ({
      jobId: "job-1",
      status: "failed" as const,
      error: "node exploded"
    }));
    const dispatcher = createTriggerDispatcher({ store, startJob });

    await dispatcher.runOnce();

    expect(await isProcessed("in-1")).toBe(true);
    const reloaded = (await TriggerRegistration.get(
      registration.id
    )) as TriggerRegistration;
    expect(reloaded.last_error).toContain("node exploded");

    await dispatcher.runOnce();
    expect(startJob).toHaveBeenCalledTimes(1);
  });

  it("clears a stale last_error after a successful dispatch", async () => {
    const registration = await makeRegistration({ lastError: "old failure" });
    await storeInput(store, "in-1");

    const dispatcher = createTriggerDispatcher({
      store,
      startJob: async () => okJob("job-1")
    });
    await dispatcher.runOnce();

    const reloaded = (await TriggerRegistration.get(
      registration.id
    )) as TriggerRegistration;
    expect(reloaded.last_error).toBeNull();
  });

  it("(c) skips an input whose registration is disabled and leaves it unprocessed", async () => {
    await makeRegistration({ enabled: 0 });
    await storeInput(store, "in-1");

    const startJob = vi.fn(async () => okJob("job-1"));
    const dispatcher = createTriggerDispatcher({ store, startJob });

    await dispatcher.runOnce();

    expect(startJob).not.toHaveBeenCalled();
    expect(await isProcessed("in-1")).toBe(false);
  });

  it("(d) queue policy: the second event for a registration waits for the first run", async () => {
    await makeRegistration({ config: { concurrency: "queue" } });
    await storeInput(store, "in-1", { createdAt: new Date(Date.now() - 1000) });
    await storeInput(store, "in-2");

    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const startJob = vi.fn(async (opts: { triggerEvent?: unknown }) => {
      const event = opts.triggerEvent as { input_id: string };
      if (event.input_id === "in-1") await firstGate;
      return okJob(`job-${event.input_id}`);
    });

    const dispatcher = createTriggerDispatcher({ store, startJob });
    const pass = dispatcher.runOnce();
    await flush();

    // Only the first run has started; the second is queued behind it.
    expect(startJob).toHaveBeenCalledTimes(1);
    expect(await isProcessed("in-2")).toBe(false);

    releaseFirst?.();
    await pass;

    expect(startJob).toHaveBeenCalledTimes(2);
    expect(await isProcessed("in-1")).toBe(true);
    expect(await isProcessed("in-2")).toBe(true);
  });

  it("(d) parallel policy (default): both events run without waiting", async () => {
    await makeRegistration();
    await storeInput(store, "in-1", { createdAt: new Date(Date.now() - 1000) });
    await storeInput(store, "in-2");

    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const startJob = vi.fn(async (opts: { triggerEvent?: unknown }) => {
      await gate;
      const event = opts.triggerEvent as { input_id: string };
      return okJob(`job-${event.input_id}`);
    });

    const dispatcher = createTriggerDispatcher({ store, startJob });
    const pass = dispatcher.runOnce();
    await flush();

    expect(startJob).toHaveBeenCalledTimes(2);
    release?.();
    await pass;
  });

  it("(d) skip policy: an event arriving while a run is in flight is marked processed without a run", async () => {
    await makeRegistration({ config: { concurrency: "skip" } });
    await storeInput(store, "in-1", { createdAt: new Date(Date.now() - 1000) });
    await storeInput(store, "in-2");

    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const startJob = vi.fn(async (opts: { triggerEvent?: unknown }) => {
      await gate;
      const event = opts.triggerEvent as { input_id: string };
      return okJob(`job-${event.input_id}`);
    });

    const dispatcher = createTriggerDispatcher({ store, startJob });
    const pass = dispatcher.runOnce();
    await flush();

    expect(startJob).toHaveBeenCalledTimes(1);
    expect(await isProcessed("in-2")).toBe(true);

    release?.();
    await pass;
    expect(startJob).toHaveBeenCalledTimes(1);
    expect(await isProcessed("in-1")).toBe(true);
  });

  it("(e) two overlapping dispatch passes never double-start the same input", async () => {
    await makeRegistration();
    await storeInput(store, "in-1");

    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const startJob = vi.fn(async () => {
      await gate;
      return okJob("job-1");
    });

    const dispatcher = createTriggerDispatcher({ store, startJob });
    const first = dispatcher.runOnce();
    await flush();
    const second = dispatcher.runOnce();
    await flush();

    expect(startJob).toHaveBeenCalledTimes(1);
    // The input is still unprocessed while the run is in flight: it is marked
    // only after the run is accepted (crash window documented in the module).
    expect(await isProcessed("in-1")).toBe(false);

    release?.();
    await Promise.all([first, second]);

    expect(startJob).toHaveBeenCalledTimes(1);
    expect(await isProcessed("in-1")).toBe(true);
  });

  describe("dispatchInput", () => {
    it("dispatches one stored input immediately and resolves with the job id", async () => {
      await makeRegistration();
      await storeInput(store, "in-1");

      const startJob = vi.fn(async () => okJob("job-42"));
      const stop = startDispatcher({ store, startJob, intervalMs: 60_000 });
      try {
        const result = await dispatchInput("in-1");
        expect(result).toEqual({ jobId: "job-42" });
        expect(startJob).toHaveBeenCalledTimes(1);
        expect(await isProcessed("in-1")).toBe(true);
      } finally {
        stop();
      }
    });

    it("rejects with 'input not found' for an unknown input id", async () => {
      const stop = startDispatcher({
        store,
        startJob: async () => okJob("job-1"),
        intervalMs: 60_000
      });
      try {
        await expect(dispatchInput("nope")).rejects.toThrow(/^input not found/);
      } finally {
        stop();
      }
    });

    it("rejects with 'input not found' when no registration owns the input", async () => {
      await storeInput(store, "orphan");
      const stop = startDispatcher({
        store,
        startJob: async () => okJob("job-1"),
        intervalMs: 60_000
      });
      try {
        await expect(dispatchInput("orphan")).rejects.toThrow(
          /^input not found/
        );
      } finally {
        stop();
      }
    });

    it("rejects with 'registration disabled' for a disabled registration", async () => {
      await makeRegistration({ enabled: 0 });
      await storeInput(store, "in-1");

      const startJob = vi.fn(async () => okJob("job-1"));
      const stop = startDispatcher({ store, startJob, intervalMs: 60_000 });
      try {
        await expect(dispatchInput("in-1")).rejects.toThrow(
          /^registration disabled/
        );
        expect(startJob).not.toHaveBeenCalled();
        expect(await isProcessed("in-1")).toBe(false);
      } finally {
        stop();
      }
    });

    it("joins an in-flight dispatch instead of starting a second run", async () => {
      await makeRegistration();
      await storeInput(store, "in-1");

      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const startJob = vi.fn(async () => {
        await gate;
        return okJob("job-1");
      });

      const stop = startDispatcher({ store, startJob, intervalMs: 60_000 });
      try {
        const a = dispatchInput("in-1");
        const b = dispatchInput("in-1");
        release?.();
        expect(await a).toEqual({ jobId: "job-1" });
        expect(await b).toEqual({ jobId: "job-1" });
        expect(startJob).toHaveBeenCalledTimes(1);
      } finally {
        stop();
      }
    });

    it("rejects when no dispatcher is running", async () => {
      await expect(dispatchInput("in-1")).rejects.toThrow(/not started/);
    });
  });

  describe("startDispatcher", () => {
    it("dispatches a backlog input on start and stops on the returned handle", async () => {
      await makeRegistration();
      await storeInput(store, "in-1");

      const startJob = vi.fn(async () => okJob("job-1"));
      const stop = startDispatcher({ store, startJob, intervalMs: 10 });
      try {
        await vi.waitFor(() => expect(startJob).toHaveBeenCalledTimes(1));
        await storeInput(store, "in-2");
        await vi.waitFor(() => expect(startJob).toHaveBeenCalledTimes(2));
      } finally {
        stop();
      }

      await storeInput(store, "in-3");
      await flush();
      expect(startJob).toHaveBeenCalledTimes(2);
    });

    it("notify() dispatches immediately without waiting for the poll", async () => {
      await makeRegistration();

      const startJob = vi.fn(async () => okJob("job-1"));
      const stop = startDispatcher({
        store,
        startJob,
        intervalMs: 3_600_000
      });
      try {
        await stop.drain();
        expect(startJob).not.toHaveBeenCalled();

        await storeInput(store, "in-1");
        stop.notify({ registrationId: "r", inputId: "in-1" });
        await stop.drain();

        expect(startJob).toHaveBeenCalledTimes(1);
      } finally {
        stop();
      }
    });
  });

  describe("getTriggerWakeupService", () => {
    it("lazily creates a singleton and returns the wired instance once set", () => {
      const lazy = getTriggerWakeupService();
      expect(lazy).toBeInstanceOf(TriggerWakeupService);
      expect(getTriggerWakeupService()).toBe(lazy);

      const wired = new TriggerWakeupService();
      setTriggerWakeupService(wired);
      expect(getTriggerWakeupService()).toBe(wired);
    });
  });
});
