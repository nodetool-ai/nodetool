/**
 * Arming a cron trigger through `jobs.triggerStart`: it counts from the moment
 * of arming, and it refuses a schedule that could never fire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initTestDb,
  ModelObserver,
  TriggerRegistration
} from "@nodetool-ai/models";
import { TriggerWakeupService } from "@nodetool-ai/kernel";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { runSchedulerSweepOnce } from "../src/triggers/scheduler.js";

const createCaller = createCallerFactory(appRouter);
const ctx = {
  userId: "user-1",
  registry: {} as never,
  apiOptions: { metadataRoots: [], registry: {} as never } as never,
  pythonBridge: {} as never,
  getPythonBridgeReady: () => false
} as Context;

async function makeCron(
  config: Record<string, unknown>,
  enabled: number
): Promise<TriggerRegistration> {
  return (await TriggerRegistration.create<TriggerRegistration>({
    user_id: "user-1",
    workflow_id: "wf-1",
    node_id: "n1",
    kind: "schedule",
    config_json: config,
    enabled,
    created_at: "2026-01-05T09:00:00.000Z",
    updated_at: "2026-01-05T09:00:00.000Z"
  })) as TriggerRegistration;
}

describe("jobs.triggerStart for a cron trigger", () => {
  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => {
    ModelObserver.clear();
    vi.useRealTimers();
  });

  it("counts from the moment of arming, not from when the workflow was first saved", async () => {
    const reg = await makeCron({ cron_expr: "0 8 * * *", cron_tz: "UTC" }, 0);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-07T12:00:00Z"));

    const started = await createCaller(ctx).jobs.triggerStart({ id: reg.id });
    expect(started.enabled).toBe(true);

    const stored = (await TriggerRegistration.get(reg.id)) as TriggerRegistration;
    expect(stored.cursor).toBe("2026-01-07T12:00:00.000Z");

    // Without the anchor, the first sweep would owe the slot at Jan 6 08:00.
    const wakeupService = new TriggerWakeupService();
    const deliver = vi.spyOn(wakeupService, "deliverTriggerInput");
    await runSchedulerSweepOnce({
      wakeupService,
      now: () => Date.parse("2026-01-07T12:00:05Z")
    });
    expect(deliver).not.toHaveBeenCalled();
    await runSchedulerSweepOnce({
      wakeupService,
      now: () => Date.parse("2026-01-08T08:00:00Z")
    });
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("keeps the anchor when it is started again while already armed", async () => {
    const reg = await makeCron(
      { cron_expr: "0 8 * * *", cron_tz: "UTC" },
      1
    );
    reg.cursor = "2026-01-06T00:00:00.000Z";
    await reg.save();

    await createCaller(ctx).jobs.triggerStart({ id: reg.id });

    const stored = (await TriggerRegistration.get(reg.id)) as TriggerRegistration;
    expect(stored.cursor).toBe("2026-01-06T00:00:00.000Z");
  });

  it("refuses an expression that cannot schedule, and leaves the trigger off", async () => {
    const reg = await makeCron({ cron_expr: "0 8 * *", cron_tz: "UTC" }, 0);

    await expect(
      createCaller(ctx).jobs.triggerStart({ id: reg.id })
    ).rejects.toThrow(/4 fields/);

    const stored = (await TriggerRegistration.get(reg.id)) as TriggerRegistration;
    expect(stored.enabled).toBe(0);
  });

  it("refuses an unknown timezone", async () => {
    const reg = await makeCron(
      { cron_expr: "0 8 * * *", cron_tz: "Mars/Base" },
      0
    );
    await expect(
      createCaller(ctx).jobs.triggerStart({ id: reg.id })
    ).rejects.toThrow(/Mars\/Base/);
  });

  it("does not stamp a cursor on an interval trigger", async () => {
    const reg = await makeCron({ interval_seconds: 60 }, 0);
    await createCaller(ctx).jobs.triggerStart({ id: reg.id });
    const stored = (await TriggerRegistration.get(reg.id)) as TriggerRegistration;
    expect(stored.enabled).toBe(1);
    expect(stored.cursor).toBeNull();
  });
});
