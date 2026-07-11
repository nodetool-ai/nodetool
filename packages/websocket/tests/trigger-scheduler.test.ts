/**
 * Tests for the interval/schedule adapter (Task 10).
 *
 * The sweep is exercised directly through `runSchedulerSweep(now)` with explicit
 * timestamps — fully deterministic, no timer/async interplay. A separate case
 * checks `startTriggerScheduler` wires an interval and its stop fn clears it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initTestDb,
  TriggerRegistration,
  TriggerInput
} from "@nodetool-ai/models";
import { setTriggerWakeupService } from "../src/triggers/dispatcher.js";
import {
  runSchedulerSweep,
  startTriggerScheduler
} from "../src/triggers/scheduler.js";

const MINUTE = 60_000;

async function seedSchedule(
  config: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): Promise<TriggerRegistration> {
  const reg = new TriggerRegistration({
    user_id: "u1",
    workflow_id: "wf-1",
    node_id: "node-1",
    kind: "schedule",
    config_json: config,
    enabled: 1,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides
  });
  await reg.save();
  return reg;
}

describe("trigger scheduler", () => {
  beforeEach(() => {
    initTestDb();
    setTriggerWakeupService(null);
  });

  afterEach(() => {
    setTriggerWakeupService(null);
  });

  it("does not fire before the first interval (emit_on_start=false)", async () => {
    // epoch = 0, interval 60s, emit_on_start false → first fire at t=60s.
    await seedSchedule({ interval_seconds: 60, emit_on_start: false });

    await runSchedulerSweep(30 * 1000); // 30s < 60s
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);
  });

  it("fires at t+interval and updates last_fired_at", async () => {
    await seedSchedule({ interval_seconds: 60, emit_on_start: false });

    const now = 60 * 1000; // exactly one interval after epoch 0
    await runSchedulerSweep(now);

    const inputs = await TriggerInput.findUnprocessed(10);
    expect(inputs).toHaveLength(1);
    const payload = inputs[0].payload_json as Record<string, unknown>;
    expect(payload).toMatchObject({
      tick: 1,
      source: "interval",
      event_type: "tick",
      interval_seconds: 60
    });
    expect(payload.timestamp).toBe(new Date(now).toISOString());

    const [reg] = await TriggerRegistration.findByWorkflow("wf-1");
    expect(reg.last_fired_at).toBe(new Date(now).toISOString());
  });

  it("fires immediately when emit_on_start is true (tick 0)", async () => {
    await seedSchedule({ interval_seconds: 60, emit_on_start: true });

    await runSchedulerSweep(1000); // 1s after epoch
    const inputs = await TriggerInput.findUnprocessed(10);
    expect(inputs).toHaveLength(1);
    expect((inputs[0].payload_json as Record<string, unknown>).tick).toBe(0);
  });

  it("does not fire again until the next interval elapses", async () => {
    const reg = await seedSchedule({
      interval_seconds: 60,
      emit_on_start: false
    });
    await runSchedulerSweep(60 * 1000);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(1);

    // 30s later: not due yet.
    await runSchedulerSweep(90 * 1000);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(1);

    // one full interval after last fire: due again.
    const fresh = (await TriggerRegistration.findByWorkflow("wf-1"))[0];
    expect(fresh.id).toBe(reg.id);
    await runSchedulerSweep(120 * 1000);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(2);
  });

  it("picks up a config change on the next sweep", async () => {
    const reg = await seedSchedule({
      interval_seconds: 600,
      emit_on_start: false
    });

    await runSchedulerSweep(60 * 1000); // 60s < 600s interval → not due
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);

    // Shorten the interval; next sweep should re-read and fire.
    reg.config_json = { interval_seconds: 60, emit_on_start: false };
    await reg.save();

    await runSchedulerSweep(60 * 1000);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(1);
  });

  it("catches up exactly once when last_fired_at is 10 intervals stale", async () => {
    await seedSchedule(
      { interval_seconds: 60, emit_on_start: false },
      { last_fired_at: new Date(60 * 1000).toISOString() } // fired at tick 1
    );

    // now is 10 intervals past the last fire.
    const now = 60 * 1000 + 10 * MINUTE;
    await runSchedulerSweep(now);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(1);

    // A second sweep at the same instant must not fire again.
    await runSchedulerSweep(now);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(1);
  });

  it("never fires a disabled registration", async () => {
    await seedSchedule(
      { interval_seconds: 60, emit_on_start: true },
      { enabled: 0 }
    );
    await runSchedulerSweep(10 * MINUTE);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);
  });

  it("deterministic inputId dedupes a lost last_fired_at update (one input)", async () => {
    // emit_on_start, epoch 0, interval 60s. At now=300s the due tick is 5.
    await seedSchedule({ interval_seconds: 60, emit_on_start: true });
    const now = 5 * MINUTE;

    await runSchedulerSweep(now);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(1);

    // Simulate the last_fired_at write being lost: reset it to null, then sweep
    // again at the same instant. The tick index (5) is identical, so the
    // deterministic inputId makes the delivery idempotent — no second input.
    const [reg] = await TriggerRegistration.findByWorkflow("wf-1");
    reg.last_fired_at = null;
    await reg.save();

    await runSchedulerSweep(now);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(1);
  });

  it("records last_error once and skips an invalid interval", async () => {
    await seedSchedule({ interval_seconds: 0, emit_on_start: true });
    await runSchedulerSweep(10 * MINUTE);

    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);
    const [reg] = await TriggerRegistration.findByWorkflow("wf-1");
    expect(reg.last_error).toBeTruthy();
  });

  it("startTriggerScheduler wires an interval whose stop fn clears it", () => {
    vi.useFakeTimers();
    try {
      const stop = startTriggerScheduler({ sweepMs: 5000 });
      expect(vi.getTimerCount()).toBe(1);
      stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
