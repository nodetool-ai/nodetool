import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initTestDb,
  TriggerInput,
  TriggerRegistration,
  RunEvent
} from "@nodetool-ai/models";
import {
  startDispatcher,
  notifyDispatcher,
  dispatchInput,
  getTriggerWakeupService,
  setTriggerWakeupService,
  type StartJobFn
} from "../src/triggers/dispatcher.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/** A startJob stub that resolves acceptance immediately with a fresh jobId. */
function immediateStub(): { startJob: StartJobFn & { mock: unknown } } {
  let n = 0;
  const startJob = vi.fn(async () => {
    n += 1;
    return { jobId: `job-${n}` };
  });
  return { startJob: startJob as unknown as StartJobFn & { mock: unknown } };
}

/** A startJob stub whose runs stay "in flight" until manually released. */
function gatedStub(): {
  startJob: StartJobFn;
  gates: { release: () => void }[];
} {
  const gates: { release: () => void }[] = [];
  const startJob = vi.fn(async () => {
    let release: () => void = () => {};
    const completion = new Promise<void>((resolve) => {
      release = resolve;
    });
    gates.push({ release });
    return { jobId: `job-${gates.length}`, completion };
  });
  return { startJob: startJob as unknown as StartJobFn, gates };
}

async function waitFor(
  fn: () => boolean | Promise<boolean>,
  timeoutMs = 1000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("waitFor timed out");
}

const BIG_INTERVAL = 1_000_000;

let stop: (() => void) | null = null;

describe("trigger dispatcher — poll/notify dispatch", () => {
  beforeEach(() => {
    initTestDb();
    setTriggerWakeupService(null);
  });

  afterEach(() => {
    stop?.();
    stop = null;
  });

  it("(a) dispatches an unprocessed input for an enabled registration exactly once, then marks it processed", async () => {
    await makeReg();
    await makeInput();
    const calls: unknown[] = [];
    const startJob: StartJobFn = vi.fn(async (req) => {
      calls.push(req);
      return { jobId: "job-1" };
    });

    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });
    await notifyDispatcher();

    expect(startJob).toHaveBeenCalledTimes(1);
    expect(calls[0]).toMatchObject({
      workflowId: "w1",
      userId: "u1",
      triggerEvent: { node_id: "n1", input_id: "i1", payload: { x: 1 } }
    });

    const input = await TriggerInput.findByInputId("i1");
    expect(input?.processed).toBe(1);

    const [reg] = await TriggerRegistration.findByWorkflow("w1");
    expect(reg.last_fired_at).not.toBeNull();
    expect(reg.last_error).toBeNull();

    const events = await RunEvent.getEvents("w1", {
      eventType: "TriggerInputReceived"
    });
    expect(events).toHaveLength(1);
  });

  it("(b) leaves the input unprocessed and records last_error when startJob rejects", async () => {
    await makeReg();
    await makeInput();
    const startJob: StartJobFn = vi.fn(async () => {
      throw new Error("start failed");
    });

    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });
    await notifyDispatcher();

    const input = await TriggerInput.findByInputId("i1");
    expect(input?.processed).toBe(0);

    const [reg] = await TriggerRegistration.findByWorkflow("w1");
    expect(reg.last_error).toContain("start failed");
  });

  it("(c) skips an input for a disabled registration and leaves it unprocessed", async () => {
    await makeReg({ enabled: 0 });
    await makeInput();
    const { startJob } = immediateStub();

    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });
    await notifyDispatcher();

    expect(startJob).not.toHaveBeenCalled();
    const input = await TriggerInput.findByInputId("i1");
    expect(input?.processed).toBe(0);
  });

  it("(c2) marks an input processed as an orphan when no registration exists", async () => {
    await makeInput();
    const { startJob } = immediateStub();

    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });
    await notifyDispatcher();

    expect(startJob).not.toHaveBeenCalled();
    const input = await TriggerInput.findByInputId("i1");
    expect(input?.processed).toBe(1);
  });

  it("(d-queue) serializes runs for the same registration", async () => {
    await makeReg({ config_json: { concurrency: "queue" } });
    await makeInput({ input_id: "i1" });
    await makeInput({ input_id: "i2" });
    const { startJob, gates } = gatedStub();

    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });
    void notifyDispatcher();

    // The first run starts; the second waits for the first to complete.
    await waitFor(() => gates.length === 1);
    await new Promise((r) => setTimeout(r, 20));
    expect(startJob).toHaveBeenCalledTimes(1);

    gates[0].release();
    await waitFor(() => gates.length === 2);
    expect(startJob).toHaveBeenCalledTimes(2);
    gates[1].release();

    await waitFor(async () => {
      const i2 = await TriggerInput.findByInputId("i2");
      return i2?.processed === 1;
    });
  });

  it("(d-skip) marks a second input processed without starting a run while one is in flight", async () => {
    await makeReg({ config_json: { concurrency: "skip" } });
    await makeInput({ input_id: "i1" });
    await makeInput({ input_id: "i2" });
    const { startJob, gates } = gatedStub();

    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });
    void notifyDispatcher();

    await waitFor(() => gates.length === 1);
    await waitFor(async () => {
      const i2 = await TriggerInput.findByInputId("i2");
      return i2?.processed === 1;
    });
    expect(startJob).toHaveBeenCalledTimes(1);

    gates[0].release();
  });

  it("(e) does not double-start when notify and poll overlap", async () => {
    await makeReg();
    await makeInput();
    const { startJob } = immediateStub();

    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });
    await Promise.all([notifyDispatcher(), notifyDispatcher(), notifyDispatcher()]);

    expect(startJob).toHaveBeenCalledTimes(1);
    const input = await TriggerInput.findByInputId("i1");
    expect(input?.processed).toBe(1);
  });
});

describe("trigger dispatcher — dispatchInput contract", () => {
  beforeEach(() => {
    initTestDb();
    setTriggerWakeupService(null);
  });

  afterEach(() => {
    stop?.();
    stop = null;
  });

  it("resolves with the started jobId and marks the input processed", async () => {
    await makeReg();
    await makeInput();
    const startJob: StartJobFn = vi.fn(async () => ({ jobId: "job-xyz" }));

    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });
    const result = await dispatchInput("i1");

    expect(result).toEqual({ jobId: "job-xyz" });
    const input = await TriggerInput.findByInputId("i1");
    expect(input?.processed).toBe(1);
  });

  it('rejects with "registration disabled" for a disabled registration', async () => {
    await makeReg({ enabled: 0 });
    await makeInput();
    const { startJob } = immediateStub();

    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });
    await expect(dispatchInput("i1")).rejects.toThrow(/^registration disabled/);
    expect(startJob).not.toHaveBeenCalled();
  });

  it('rejects with "input not found" for an unknown input id', async () => {
    const { startJob } = immediateStub();
    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });
    await expect(dispatchInput("nope")).rejects.toThrow(/^input not found/);
  });
});

describe("getTriggerWakeupService", () => {
  beforeEach(() => {
    initTestDb();
    setTriggerWakeupService(null);
  });

  it("returns a stable singleton until reset", () => {
    const first = getTriggerWakeupService();
    const second = getTriggerWakeupService();
    expect(second).toBe(first);
    setTriggerWakeupService(null);
    expect(getTriggerWakeupService()).not.toBe(first);
  });

  it("delivering a trigger input makes it dispatchable", async () => {
    await makeReg();
    await getTriggerWakeupService().deliverTriggerInput({
      runId: "w1",
      nodeId: "n1",
      inputId: "delivered",
      payload: { hello: 1 }
    });
    const startJob: StartJobFn = vi.fn(async () => ({ jobId: "job-d" }));
    stop = startDispatcher({ startJob, intervalMs: BIG_INTERVAL });
    const result = await dispatchInput("delivered");
    expect(result).toEqual({ jobId: "job-d" });
  });

  afterEach(() => {
    stop?.();
    stop = null;
  });
});
