import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initTestDb,
  getDb,
  triggerInputs,
  TriggerInput,
  TriggerRegistration
} from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import {
  startDispatcher,
  setTriggerWakeupService,
  type StartJobFn
} from "../src/triggers/dispatcher.js";

const createCaller = createCallerFactory(appRouter);

const BIG_INTERVAL = 1_000_000;

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

async function makeReg(
  overrides: Record<string, unknown> = {}
): Promise<TriggerRegistration> {
  const reg = new TriggerRegistration({
    user_id: "user-1",
    workflow_id: "w1",
    node_id: "n1",
    kind: "manual",
    config_json: {},
    enabled: 1,
    ...overrides
  });
  await reg.save();
  return reg;
}

async function countInputs(): Promise<number> {
  const rows = await getDb().select().from(triggerInputs);
  return rows.length;
}

let stop: (() => void) | null = null;

describe("triggers router — fire", () => {
  beforeEach(() => {
    initTestDb();
    setTriggerWakeupService(null);
  });

  afterEach(() => {
    stop?.();
    stop = null;
    vi.restoreAllMocks();
  });

  it("(a) fires an owned registration, returns the stubbed job id, and stores exactly one input", async () => {
    const reg = await makeReg();
    const startJob: StartJobFn = vi.fn(async () => ({ jobId: "job-xyz" }));
    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });

    const caller = createCaller(makeCtx());
    const result = await caller.triggers.fire({
      registrationId: reg.id,
      payload: { hello: 1 }
    });

    expect(result).toEqual({ job_id: "job-xyz" });
    expect(startJob).toHaveBeenCalledTimes(1);
    expect(startJob).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "w1",
        userId: "user-1",
        triggerEvent: expect.objectContaining({
          node_id: "n1",
          payload: { hello: 1 }
        })
      })
    );
    expect(await countInputs()).toBe(1);
  });

  it("(b) throws NOT_FOUND for a registration owned by another user", async () => {
    const reg = await makeReg({ user_id: "other-user" });
    const startJob: StartJobFn = vi.fn(async () => ({ jobId: "job-1" }));
    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });

    const caller = createCaller(makeCtx());
    await expect(
      caller.triggers.fire({ registrationId: reg.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(startJob).not.toHaveBeenCalled();
    expect(await countInputs()).toBe(0);
  });

  it("(c) throws NOT_FOUND for an unknown registration id", async () => {
    const startJob: StartJobFn = vi.fn(async () => ({ jobId: "job-1" }));
    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });

    const caller = createCaller(makeCtx());
    await expect(
      caller.triggers.fire({ registrationId: "nope" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(startJob).not.toHaveBeenCalled();
  });

  it("(d) stores one input when fired twice with the same idempotency key", async () => {
    const reg = await makeReg();
    const startJob: StartJobFn = vi.fn(async () => ({ jobId: "job-1" }));
    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });

    const caller = createCaller(makeCtx());
    const first = await caller.triggers.fire({
      registrationId: reg.id,
      payload: { a: 1 },
      idempotencyKey: "key-1"
    });
    const second = await caller.triggers.fire({
      registrationId: reg.id,
      payload: { a: 2 },
      idempotencyKey: "key-1"
    });

    expect(first).toEqual({ job_id: "job-1" });
    expect(second).toEqual({ job_id: "job-1" });
    expect(await countInputs()).toBe(1);

    // The single stored input keeps the first delivery's payload (idempotent).
    const stored = await TriggerInput.findByInputId("key-1");
    expect(stored?.payload_json).toEqual({ a: 1 });
  });

  it("maps a disabled registration to a 400 rather than a 500", async () => {
    const reg = await makeReg({ enabled: 0 });
    const startJob: StartJobFn = vi.fn(async () => ({ jobId: "job-1" }));
    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });

    const caller = createCaller(makeCtx());
    await expect(
      caller.triggers.fire({ registrationId: reg.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(startJob).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = createCaller(makeCtx({ userId: null }));
    await expect(
      caller.triggers.fire({ registrationId: "any" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
