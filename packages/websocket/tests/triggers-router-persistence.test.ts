import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initTestDb,
  ModelObserver,
  TriggerInput,
  TriggerRegistration
} from "@nodetool-ai/models";
import { TriggerWakeupService } from "@nodetool-ai/kernel";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import {
  DrizzleDurableInboxStore,
  DrizzleTriggerInputStore
} from "../src/triggers/stores.js";
import { setTriggerWakeupService } from "../src/triggers/dispatcher.js";

/**
 * Only the run start is stubbed. The wakeup service is the real one over the
 * real Drizzle stores, so these tests fail if the write path ever regresses to
 * a memory store — which the sibling triggers-router.test.ts cannot catch,
 * since it mocks the service wholesale.
 */
vi.mock("../src/triggers/dispatcher.js", async (orig) => {
  const actual =
    await orig<typeof import("../src/triggers/dispatcher.js")>();
  return { ...actual, dispatchInput: vi.fn() };
});

const { dispatchInput } = await import("../src/triggers/dispatcher.js");

const createCaller = createCallerFactory(appRouter);

function makeCtx(userId = "user-1"): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

async function makeRegistration(): Promise<TriggerRegistration> {
  return (await TriggerRegistration.create<TriggerRegistration>({
    user_id: "user-1",
    workflow_id: "wf-1",
    node_id: "node-1",
    kind: "manual",
    config_json: {},
    enabled: 1,
    cursor: null
  })) as TriggerRegistration;
}

describe("triggers.fire persistence", () => {
  beforeEach(() => {
    initTestDb();
    setTriggerWakeupService(
      new TriggerWakeupService(
        new DrizzleDurableInboxStore(),
        new DrizzleTriggerInputStore()
      )
    );
    vi.mocked(dispatchInput).mockResolvedValue({ jobId: "job-1" });
  });

  afterEach(() => {
    setTriggerWakeupService(null);
    ModelObserver.clear();
    vi.clearAllMocks();
  });

  it("stores exactly one trigger_input row addressed to the registration", async () => {
    const reg = await makeRegistration();
    const caller = createCaller(makeCtx());

    const result = await caller.triggers.fire({
      registrationId: reg.id,
      payload: { hello: 1 },
      idempotencyKey: "key-1"
    });

    expect(result).toEqual({ job_id: "job-1" });

    const stored = await TriggerInput.findByInputId("key-1");
    expect(stored).not.toBeNull();
    expect(stored?.run_id).toBe(reg.workflow_id);
    expect(stored?.node_id).toBe(reg.node_id);
    expect(stored?.processed).toBe(0);
    expect(stored?.payload_json).toEqual({ hello: 1 });

    const unprocessed = await TriggerInput.findUnprocessed(10);
    expect(unprocessed).toHaveLength(1);
  });

  it("stores one row when the same idempotency key fires twice", async () => {
    const reg = await makeRegistration();
    const caller = createCaller(makeCtx());

    await caller.triggers.fire({
      registrationId: reg.id,
      idempotencyKey: "key-dup"
    });
    await caller.triggers.fire({
      registrationId: reg.id,
      idempotencyKey: "key-dup"
    });

    const unprocessed = await TriggerInput.findUnprocessed(10);
    expect(unprocessed).toHaveLength(1);
  });
});
