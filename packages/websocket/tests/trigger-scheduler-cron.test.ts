/**
 * Cron schedules through the scheduler sweep and the editor's next-fire
 * readout. The clock is injected, so each case drives the sweep to an exact
 * instant on a daylight saving night or after downtime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initTestDb,
  ModelObserver,
  TriggerRegistration
} from "@nodetool-ai/models";
import { TriggerWakeupService } from "@nodetool-ai/kernel";
import { runSchedulerSweepOnce } from "../src/triggers/scheduler.js";
import { nextFireAtIso } from "../src/triggers/schedule-timing.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const at = (iso: string): number => Date.parse(iso);

async function makeCron(
  config: { cron_expr: string; cron_tz?: string },
  opts: {
    createdAt: string;
    lastFiredAt?: string | null;
    cursor?: string | null;
    enabled?: number;
    nodeId?: string;
  }
): Promise<TriggerRegistration> {
  return (await TriggerRegistration.create<TriggerRegistration>({
    user_id: "user-1",
    workflow_id: "wf-1",
    node_id: opts.nodeId ?? "n1",
    kind: "schedule",
    config_json: config,
    enabled: opts.enabled ?? 1,
    created_at: opts.createdAt,
    updated_at: opts.createdAt,
    last_fired_at: opts.lastFiredAt ?? null,
    cursor: opts.cursor ?? null
  })) as TriggerRegistration;
}

function harness() {
  const wakeupService = new TriggerWakeupService();
  const deliver = vi.spyOn(wakeupService, "deliverTriggerInput");
  const sweep = (iso: string) =>
    runSchedulerSweepOnce({ wakeupService, now: () => at(iso) });
  return { deliver, sweep };
}

/** Sweep every `stepMs` from `fromIso` to `toIso`, inclusive. */
async function sweepRange(
  sweep: (iso: string) => Promise<void>,
  fromIso: string,
  toIso: string,
  stepMs: number
): Promise<void> {
  for (let t = at(fromIso); t <= at(toIso); t += stepMs) {
    await sweep(new Date(t).toISOString());
  }
}

describe("cron schedules in the scheduler sweep", () => {
  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => {
    ModelObserver.clear();
  });

  it("fires every weekday at 08:00 Europe/Berlin, not a second earlier, and not twice", async () => {
    const reg = await makeCron(
      { cron_expr: "0 8 * * 1-5", cron_tz: "Europe/Berlin" },
      { createdAt: "2026-11-25T12:00:00.000Z" }
    );
    const { deliver, sweep } = harness();

    await sweep("2026-11-26T06:59:59.000Z");
    expect(deliver).not.toHaveBeenCalled();

    await sweep("2026-11-26T07:00:02.000Z");
    expect(deliver).toHaveBeenCalledTimes(1);
    const call = deliver.mock.calls[0][0];
    expect(call.nodeId).toBe("n1");
    expect(call.inputId).toBe(`${reg.id}:cron:${at("2026-11-26T07:00:00Z")}`);
    expect(call.payload).toMatchObject({
      scheduled_at: "2026-11-26T07:00:00.000Z",
      timestamp: "2026-11-26T07:00:02.000Z",
      source: "schedule",
      event_type: "tick"
    });

    // Later sweeps the same day do not fire again.
    await sweepRange(sweep, "2026-11-26T07:00:05Z", "2026-11-26T20:00:00Z", 600_000);
    expect(deliver).toHaveBeenCalledTimes(1);

    // Friday fires, then the weekend is skipped and Monday fires.
    await sweep("2026-11-27T07:00:00.000Z");
    await sweepRange(sweep, "2026-11-27T07:05:00Z", "2026-11-30T06:59:00Z", 1_800_000);
    expect(deliver).toHaveBeenCalledTimes(2);
    await sweep("2026-11-30T07:00:00.000Z");
    expect(deliver).toHaveBeenCalledTimes(3);
  });

  it("after downtime, fires once for the missed slots and resumes on the calendar", async () => {
    const reg = await makeCron(
      { cron_expr: "0 8 * * *", cron_tz: "UTC" },
      {
        createdAt: "2026-01-01T00:00:00Z",
        lastFiredAt: "2026-01-05T08:00:01Z"
      }
    );
    const { deliver, sweep } = harness();

    // The server was down Jan 6, 7, 8 and 9 and comes back at 14:00 on Jan 9.
    await sweep("2026-01-09T14:00:00.000Z");
    expect(deliver).toHaveBeenCalledTimes(1);
    // A burst would send one input per missed day. Further sweeps send none.
    await sweepRange(sweep, "2026-01-09T14:00:05Z", "2026-01-10T07:59:00Z", 60_000);
    expect(deliver).toHaveBeenCalledTimes(1);

    const [updated] = await TriggerRegistration.findEnabledByKind("schedule");
    expect(updated.id).toBe(reg.id);
    expect(nextFireAtIso(updated)).toBe("2026-01-10T08:00:00.000Z");

    await sweep("2026-01-10T08:00:00.000Z");
    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it("spring forward: a slot inside the skipped hour fires at 03:00 local, once", async () => {
    // Europe/Berlin goes 02:00 -> 03:00 on 2026-03-29, which is 01:00Z.
    await makeCron(
      { cron_expr: "30 2 * * *", cron_tz: "Europe/Berlin" },
      { createdAt: "2026-03-28T12:00:00Z" }
    );
    const { deliver, sweep } = harness();

    await sweep("2026-03-29T00:59:59Z");
    expect(deliver).not.toHaveBeenCalled();
    await sweep("2026-03-29T01:00:00Z");
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0].payload).toMatchObject({
      scheduled_at: "2026-03-29T01:00:00.000Z"
    });

    await sweepRange(sweep, "2026-03-29T01:00:30Z", "2026-03-30T00:29:00Z", 300_000);
    expect(deliver).toHaveBeenCalledTimes(1);
    // The next day is back on 02:30 local, now 00:30Z.
    await sweep("2026-03-30T00:30:00Z");
    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it("fall back: a repeated 02:30 fires once, on its first occurrence", async () => {
    // Europe/Berlin repeats 02:00-03:00 on 2026-10-25: 02:30 is 00:30Z, then 01:30Z.
    await makeCron(
      { cron_expr: "30 2 * * *", cron_tz: "Europe/Berlin" },
      { createdAt: "2026-10-24T12:00:00Z" }
    );
    const { deliver, sweep } = harness();

    await sweep("2026-10-25T00:29:59Z");
    expect(deliver).not.toHaveBeenCalled();

    // Sweep every 5 s, the production period, across both 02:30 occurrences.
    await sweepRange(sweep, "2026-10-25T00:30:00Z", "2026-10-25T02:30:00Z", 5_000);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0].payload).toMatchObject({
      scheduled_at: "2026-10-25T00:30:00.000Z"
    });

    // The next fire is the following day's 02:30 CET, which is 01:30Z.
    await sweep("2026-10-26T01:29:59Z");
    expect(deliver).toHaveBeenCalledTimes(1);
    await sweep("2026-10-26T01:30:00Z");
    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it("does not fire for a slot that passed before the trigger was armed", async () => {
    // Created and saved on Monday, armed on Wednesday at 12:00Z. The cursor
    // holds the moment it was armed, so Tuesday's 08:00 is not owed.
    await makeCron(
      { cron_expr: "0 8 * * *", cron_tz: "UTC" },
      {
        createdAt: "2026-01-05T09:00:00Z",
        cursor: "2026-01-07T12:00:00Z"
      }
    );
    const { deliver, sweep } = harness();

    await sweep("2026-01-07T12:00:05Z");
    expect(deliver).not.toHaveBeenCalled();
    await sweep("2026-01-08T08:00:00Z");
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("skips a registration whose expression or timezone is invalid, without throwing", async () => {
    await makeCron(
      { cron_expr: "not a cron", cron_tz: "UTC" },
      { createdAt: "2020-01-01T00:00:00Z" }
    );
    await makeCron(
      { cron_expr: "0 8 * * *", cron_tz: "Mars/Base" },
      { createdAt: "2020-01-01T00:00:00Z", nodeId: "n2" }
    );
    const { deliver, sweep } = harness();

    await expect(sweep("2026-01-01T00:00:00Z")).resolves.toBeUndefined();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("uses the same input id for a replayed slot after a crash before last_fired_at", async () => {
    const reg = await makeCron(
      { cron_expr: "0 8 * * *", cron_tz: "UTC" },
      { createdAt: "2026-01-01T00:00:00Z" }
    );
    const { deliver, sweep } = harness();

    await sweep("2026-01-02T08:00:00Z");
    reg.last_fired_at = null;
    await reg.save();
    await sweep("2026-01-02T08:00:30Z");

    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver.mock.calls[1][0].inputId).toBe(
      deliver.mock.calls[0][0].inputId
    );
  });
});

describe("cron next-fire readout", () => {
  const createCaller = createCallerFactory(appRouter);
  const ctx = {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;

  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => {
    ModelObserver.clear();
  });

  it("reports the cron, the zone, and the instant the sweep fires at", async () => {
    await makeCron(
      { cron_expr: "0 8 * * 1-5", cron_tz: "Europe/Berlin" },
      {
        createdAt: "2026-11-25T12:00:00.000Z",
        lastFiredAt: "2026-11-25T12:00:00.000Z"
      }
    );

    const { triggers } = await createCaller(ctx).triggers.listByWorkflow({
      workflowId: "wf-1"
    });
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toMatchObject({
      kind: "schedule",
      cron_expr: "0 8 * * 1-5",
      cron_tz: "Europe/Berlin",
      interval_seconds: null,
      next_fire_at: "2026-11-26T07:00:00.000Z"
    });

    const projected = at(triggers[0].next_fire_at as string);
    const { deliver, sweep } = harness();
    await sweep(new Date(projected - 1).toISOString());
    expect(deliver).not.toHaveBeenCalled();
    await sweep(new Date(projected).toISOString());
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0].payload).toMatchObject({
      scheduled_at: triggers[0].next_fire_at
    });
  });

  it("matches the sweep across a spring forward gap", async () => {
    await makeCron(
      { cron_expr: "30 2 * * *", cron_tz: "Europe/Berlin" },
      {
        createdAt: "2026-03-28T12:00:00Z",
        lastFiredAt: "2026-03-28T12:00:00Z"
      }
    );
    const { triggers } = await createCaller(ctx).triggers.listByWorkflow({
      workflowId: "wf-1"
    });
    expect(triggers[0].next_fire_at).toBe("2026-03-29T01:00:00.000Z");
    const { deliver, sweep } = harness();
    await sweep("2026-03-29T00:59:59.999Z");
    expect(deliver).not.toHaveBeenCalled();
    await sweep("2026-03-29T01:00:00.000Z");
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("has no next fire while disabled, and no cron fields for an interval trigger", async () => {
    await makeCron(
      { cron_expr: "0 8 * * *", cron_tz: "UTC" },
      { createdAt: "2026-01-01T00:00:00Z", enabled: 0 }
    );
    await TriggerRegistration.create<TriggerRegistration>({
      user_id: "user-1",
      workflow_id: "wf-1",
      node_id: "n2",
      kind: "schedule",
      config_json: { interval_seconds: 300 },
      enabled: 1
    });
    const { triggers } = await createCaller(ctx).triggers.listByWorkflow({
      workflowId: "wf-1"
    });
    const cron = triggers.find((t) => t.node_id === "n1")!;
    const interval = triggers.find((t) => t.node_id === "n2")!;
    expect(cron.next_fire_at).toBeNull();
    expect(cron.cron_expr).toBe("0 8 * * *");
    expect(interval.cron_expr).toBeNull();
    expect(interval.cron_tz).toBeNull();
    expect(interval.interval_seconds).toBe(300);
  });
});
