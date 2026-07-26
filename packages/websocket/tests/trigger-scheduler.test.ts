import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initTestDb, ModelObserver, TriggerRegistration } from "@nodetool-ai/models";
import { TriggerWakeupService } from "@nodetool-ai/kernel";
import {
  runSchedulerSweepOnce,
  startScheduler
} from "../src/triggers/scheduler.js";
import { nextFireAtIso } from "../src/triggers/schedule-timing.js";

const BASE_TIME = Date.parse("2026-01-01T00:00:00.000Z");

function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

async function makeRegistration(
  overrides: Partial<{
    config: Record<string, unknown>;
    enabled: number;
    createdAtMs: number;
    lastFiredAtMs: number | null;
  }> = {}
): Promise<TriggerRegistration> {
  const createdAtMs = overrides.createdAtMs ?? BASE_TIME;
  return (await TriggerRegistration.create<TriggerRegistration>({
    user_id: "user-1",
    workflow_id: "wf-1",
    node_id: "n1",
    kind: "schedule",
    config_json: { interval_seconds: 60, ...overrides.config },
    enabled: overrides.enabled ?? 1,
    created_at: isoAt(createdAtMs),
    updated_at: isoAt(createdAtMs),
    last_fired_at:
      overrides.lastFiredAtMs != null ? isoAt(overrides.lastFiredAtMs) : null
  })) as TriggerRegistration;
}

describe("scheduler adapter", () => {
  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => {
    ModelObserver.clear();
    vi.useRealTimers();
  });

  describe("runSchedulerSweepOnce", () => {
    it("fires a due registration with a synthesized tick payload and updates last_fired_at", async () => {
      const registration = await makeRegistration({
        config: { interval_seconds: 60, emit_on_start: false },
        lastFiredAtMs: BASE_TIME
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      // Not yet due.
      await runSchedulerSweepOnce({
        wakeupService,
        now: () => BASE_TIME + 59_000
      });
      expect(deliverSpy).not.toHaveBeenCalled();

      // Due at t+60s.
      await runSchedulerSweepOnce({
        wakeupService,
        now: () => BASE_TIME + 60_000
      });

      expect(deliverSpy).toHaveBeenCalledTimes(1);
      const call = deliverSpy.mock.calls[0][0];
      expect(call.runId).toBe("wf-1");
      expect(call.nodeId).toBe("n1");
      expect(call.payload).toMatchObject({
        source: "schedule",
        event_type: "tick",
        interval_seconds: 60
      });
      expect(typeof call.inputId).toBe("string");
      expect(call.inputId.startsWith(`${registration.id}:`)).toBe(true);

      const updated = (await TriggerRegistration.get(
        registration.id
      )) as TriggerRegistration;
      expect(updated.last_fired_at).toBe(isoAt(BASE_TIME + 60_000));
    });

    it("re-reads registrations each sweep so a config change is picked up without a restart", async () => {
      const registration = await makeRegistration({
        config: { interval_seconds: 60 },
        lastFiredAtMs: BASE_TIME
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      // Shrink the interval to 5s directly on the persisted row, simulating a
      // workflow re-save between sweeps.
      registration.config_json = { interval_seconds: 5 };
      await registration.save();

      await runSchedulerSweepOnce({
        wakeupService,
        now: () => BASE_TIME + 5_000
      });

      expect(deliverSpy).toHaveBeenCalledTimes(1);
    });

    it("catch-up: a registration whose last_fired_at is 10 intervals ago fires exactly once", async () => {
      const intervalMs = 60_000;
      await makeRegistration({
        config: { interval_seconds: 60 },
        lastFiredAtMs: BASE_TIME - 10 * intervalMs
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      await runSchedulerSweepOnce({ wakeupService, now: () => BASE_TIME });

      expect(deliverSpy).toHaveBeenCalledTimes(1);
    });

    it("never fires a disabled registration", async () => {
      await makeRegistration({
        config: { interval_seconds: 60 },
        enabled: 0,
        lastFiredAtMs: BASE_TIME - 10 * 60_000
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      await runSchedulerSweepOnce({ wakeupService, now: () => BASE_TIME });

      expect(deliverSpy).not.toHaveBeenCalled();
    });

    it("honors emit_on_start: fires immediately when never-fired and emit_on_start is true", async () => {
      await makeRegistration({
        config: { interval_seconds: 60, emit_on_start: true },
        createdAtMs: BASE_TIME
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      await runSchedulerSweepOnce({ wakeupService, now: () => BASE_TIME });

      expect(deliverSpy).toHaveBeenCalledTimes(1);
    });

    it("honors emit_on_start=false: the first fire waits a full interval", async () => {
      await makeRegistration({
        config: { interval_seconds: 60, emit_on_start: false },
        createdAtMs: BASE_TIME
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      await runSchedulerSweepOnce({
        wakeupService,
        now: () => BASE_TIME + 59_000
      });
      expect(deliverSpy).not.toHaveBeenCalled();

      await runSchedulerSweepOnce({
        wakeupService,
        now: () => BASE_TIME + 60_000
      });
      expect(deliverSpy).toHaveBeenCalledTimes(1);
    });

    it("honors initial_delay_seconds before the first fire", async () => {
      await makeRegistration({
        config: {
          interval_seconds: 60,
          emit_on_start: true,
          initial_delay_seconds: 30
        },
        createdAtMs: BASE_TIME
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      await runSchedulerSweepOnce({
        wakeupService,
        now: () => BASE_TIME + 29_000
      });
      expect(deliverSpy).not.toHaveBeenCalled();

      await runSchedulerSweepOnce({
        wakeupService,
        now: () => BASE_TIME + 30_000
      });
      expect(deliverSpy).toHaveBeenCalledTimes(1);
    });

    it("derives a stable input_id from the due tick so a crash between fire and mark cannot double-fire", async () => {
      const registration = await makeRegistration({
        config: { interval_seconds: 60 },
        lastFiredAtMs: BASE_TIME - 10 * 60_000
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      // Simulate a crash: deliverTriggerInput succeeds (durable append happens)
      // but the sweep never gets to update last_fired_at because the process
      // dies right after. On restart, the row still shows the stale
      // last_fired_at, so a second sweep recomputes the same due tick.
      await runSchedulerSweepOnce({ wakeupService, now: () => BASE_TIME });
      const firstInputId = deliverSpy.mock.calls[0][0].inputId;

      // Roll last_fired_at back to simulate the crash-before-mark window.
      registration.last_fired_at = isoAt(BASE_TIME - 10 * 60_000);
      await registration.save();

      await runSchedulerSweepOnce({ wakeupService, now: () => BASE_TIME });
      const secondInputId = deliverSpy.mock.calls[1][0].inputId;

      expect(secondInputId).toBe(firstInputId);
    });
  });

  describe("startScheduler", () => {
    it("sweeps on the configured interval and stops on the returned handle", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(BASE_TIME);

      await makeRegistration({
        config: { interval_seconds: 5, emit_on_start: false },
        lastFiredAtMs: BASE_TIME
      });
      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      const stop = startScheduler({
        wakeupService,
        intervalMs: 1_000
      });

      await vi.advanceTimersByTimeAsync(5_000);
      expect(deliverSpy).toHaveBeenCalledTimes(1);

      stop();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(deliverSpy).toHaveBeenCalledTimes(1);
    });

    it("calls notify with the registration id and input id on a new fire", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(BASE_TIME);

      const registration = await makeRegistration({
        config: { interval_seconds: 5, emit_on_start: true },
        createdAtMs: BASE_TIME
      });
      const wakeupService = new TriggerWakeupService();
      const notify = vi.fn();

      const stop = startScheduler({
        wakeupService,
        notify,
        intervalMs: 1_000
      });

      await vi.advanceTimersByTimeAsync(1_000);
      stop();

      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0][0]).toMatchObject({
        registrationId: registration.id
      });
    });
  });

  describe("next-fire projection", () => {
    it("names the exact instant the sweep fires at", async () => {
      // The editor reads nextFireAtIso; the sweep reads computeDueTick. Both
      // go through computeScheduleTiming, so a projection that is one tick off
      // would show up here.
      const registration = await makeRegistration({
        config: { interval_seconds: 60, emit_on_start: false },
        lastFiredAtMs: BASE_TIME
      });
      const projected = Date.parse(nextFireAtIso(registration) as string);
      expect(projected).toBe(BASE_TIME + 60_000);

      const wakeupService = new TriggerWakeupService();
      const deliverSpy = vi.spyOn(wakeupService, "deliverTriggerInput");

      await runSchedulerSweepOnce({ wakeupService, now: () => projected - 1 });
      expect(deliverSpy).not.toHaveBeenCalled();

      await runSchedulerSweepOnce({ wakeupService, now: () => projected });
      expect(deliverSpy).toHaveBeenCalledTimes(1);
    });

    it("moves the projection forward by one interval after a fire", async () => {
      await makeRegistration({
        config: { interval_seconds: 60 },
        lastFiredAtMs: BASE_TIME
      });
      const wakeupService = new TriggerWakeupService();

      await runSchedulerSweepOnce({
        wakeupService,
        now: () => BASE_TIME + 90_000
      });

      const [updated] = await TriggerRegistration.findEnabledByKind("schedule");
      expect(nextFireAtIso(updated)).toBe(isoAt(BASE_TIME + 150_000));
    });
  });
});
