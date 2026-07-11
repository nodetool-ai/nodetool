/**
 * Boot wiring for the trigger ingestion services (Task 11).
 *
 * server.ts starts the dispatcher and scheduler right after `app.listen`, drains
 * any backlog of unprocessed `trigger_inputs` with one immediate
 * `notifyDispatcher()`, and stops both on shutdown. server.ts itself runs a
 * top-level `await` and side-effects at import time, so it can't be imported
 * into a unit test; these tests exercise the composed start/stop of the two
 * services and the boot-backlog drain exactly as the boot block wires them.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initTestDb, TriggerInput, TriggerRegistration } from "@nodetool-ai/models";
import {
  startDispatcher,
  notifyDispatcher,
  setTriggerWakeupService,
  type StartJobFn
} from "../src/triggers/dispatcher.js";
import { startTriggerScheduler } from "../src/triggers/scheduler.js";

async function makeReg(
  overrides: Record<string, unknown> = {}
): Promise<TriggerRegistration> {
  const reg = new TriggerRegistration({
    user_id: "u1",
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

async function makeInput(
  overrides: Record<string, unknown> = {}
): Promise<TriggerInput> {
  const input = new TriggerInput({
    input_id: "i1",
    run_id: "w1",
    node_id: "n1",
    payload_json: { x: 1 },
    ...overrides
  });
  await input.save();
  return input;
}

const BIG_INTERVAL = 1_000_000;

describe("trigger boot wiring", () => {
  beforeEach(() => {
    initTestDb();
    setTriggerWakeupService(null);
  });

  afterEach(() => {
    setTriggerWakeupService(null);
  });

  it("a start/stop cycle of dispatcher + scheduler leaves no open timers", () => {
    vi.useFakeTimers();
    try {
      const baseline = vi.getTimerCount();

      const stopDispatcher = startDispatcher();
      const stopScheduler = startTriggerScheduler();

      // Both services arm a repeating sweep timer.
      expect(vi.getTimerCount()).toBeGreaterThan(baseline);

      // Shutdown order mirrors server.ts: stop producing before consuming.
      stopScheduler();
      stopDispatcher();

      expect(vi.getTimerCount()).toBe(baseline);
    } finally {
      vi.useRealTimers();
    }
  });

  it("dispatches a trigger_input left unprocessed before boot via the initial notify", async () => {
    // Backlog left by a previous process: an enabled registration and an
    // unprocessed input, both present before the services start.
    await makeReg();
    await makeInput();

    const startJob: StartJobFn = vi.fn(async () => ({ jobId: "job-boot" }));

    // Boot block: start both services, then the one immediate backlog drain.
    const stopDispatcher = startDispatcher({
      startJob,
      intervalMs: BIG_INTERVAL
    });
    const stopScheduler = startTriggerScheduler({ sweepMs: BIG_INTERVAL });
    try {
      await notifyDispatcher();

      expect(startJob).toHaveBeenCalledTimes(1);
      expect(startJob).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: "w1",
          userId: "u1",
          triggerEvent: expect.objectContaining({
            node_id: "n1",
            input_id: "i1",
            payload: { x: 1 }
          })
        })
      );

      const input = await TriggerInput.findByInputId("i1");
      expect(input?.processed).toBe(1);
    } finally {
      stopScheduler();
      stopDispatcher();
    }
  });
});
