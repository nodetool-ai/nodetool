import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setGlobalAdapterResolver, ModelObserver } from "../src/base-model.js";
import { MemoryAdapterFactory } from "../src/memory-adapter.js";
import { RunNodeState } from "../src/run-node-state.js";
import { RunEvent } from "../src/run-event.js";
import { RunLease } from "../src/run-lease.js";
import { Prediction } from "../src/prediction.js";
import type { ModelClass } from "../src/base-model.js";

const factory = new MemoryAdapterFactory();

async function setup() {
  factory.clear();
  setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
  await (RunNodeState as unknown as ModelClass).createTable();
  await (RunEvent as unknown as ModelClass).createTable();
  await (RunLease as unknown as ModelClass).createTable();
  await (Prediction as unknown as ModelClass).createTable();
}

// ── RunNodeState ──────────────────────────────────────────────────────

describe("RunNodeState model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates with defaults", async () => {
    const state = await (
      RunNodeState as unknown as ModelClass<RunNodeState>
    ).create({
      run_id: "run1",
      node_id: "node1",
    });
    expect(state.status).toBe("idle");
    expect(state.attempt).toBe(1);
    expect(state.retryable).toBe(false);
    expect(state.id).toBe("run1::node1");
  });

  it("getNodeState returns state or null", async () => {
    await (RunNodeState as unknown as ModelClass<RunNodeState>).create({
      run_id: "run1",
      node_id: "node1",
    });

    const found = await RunNodeState.getNodeState("run1", "node1");
    expect(found).not.toBeNull();
    expect(found!.node_id).toBe("node1");

    const notFound = await RunNodeState.getNodeState("run1", "node99");
    expect(notFound).toBeNull();
  });

  it("getOrCreate creates idle state if missing", async () => {
    const state = await RunNodeState.getOrCreate("run1", "node1");
    expect(state.status).toBe("idle");

    // Second call returns existing
    const same = await RunNodeState.getOrCreate("run1", "node1");
    expect(same.id).toBe(state.id);
  });

  it("state transitions", async () => {
    const state = await RunNodeState.getOrCreate("run1", "node1");

    await state.markScheduled();
    expect(state.status).toBe("scheduled");
    expect(state.scheduled_at).toBeTruthy();

    await state.markRunning();
    expect(state.status).toBe("running");
    expect(state.started_at).toBeTruthy();

    await state.markCompleted({ result: 42 });
    expect(state.status).toBe("completed");
    expect(state.completed_at).toBeTruthy();
    expect(state.outputs_json).toEqual({ result: 42 });
  });

  it("markFailed records error and retryable flag", async () => {
    const state = await RunNodeState.getOrCreate("run1", "node1");
    await state.markFailed("timeout", true);
    expect(state.status).toBe("failed");
    expect(state.last_error).toBe("timeout");
    expect(state.retryable).toBe(true);
    expect(state.isRetryableFailure()).toBe(true);
  });

  it("markSuspended and markResuming", async () => {
    const state = await RunNodeState.getOrCreate("run1", "node1");
    await state.markSuspended("waiting for input", { step: 3 });
    expect(state.status).toBe("suspended");
    expect(state.suspension_reason).toBe("waiting for input");
    expect(state.resume_state_json).toEqual({ step: 3 });
    expect(state.isSuspended()).toBe(true);

    await state.markResuming({ step: 3, resumed: true });
    expect(state.status).toBe("running");
    expect(state.resume_state_json).toEqual({ step: 3, resumed: true });
  });

  it("markPaused", async () => {
    const state = await RunNodeState.getOrCreate("run1", "node1");
    await state.markPaused();
    expect(state.isPaused()).toBe(true);
  });

  it("markScheduled increments attempt on retry", async () => {
    const state = await RunNodeState.getOrCreate("run1", "node1");
    await state.markScheduled();
    await state.markRunning();
    // started_at is now set, so next markScheduled increments attempt
    await state.markScheduled();
    expect(state.attempt).toBe(2);
  });

  it("markScheduled with explicit attempt", async () => {
    const state = await RunNodeState.getOrCreate("run1", "node1");
    await state.markScheduled(5);
    expect(state.attempt).toBe(5);
  });

  it("getIncompleteNodes", async () => {
    await (RunNodeState as unknown as ModelClass<RunNodeState>).create({
      run_id: "run1",
      node_id: "n1",
      status: "scheduled",
    });
    await (RunNodeState as unknown as ModelClass<RunNodeState>).create({
      run_id: "run1",
      node_id: "n2",
      status: "running",
    });
    await (RunNodeState as unknown as ModelClass<RunNodeState>).create({
      run_id: "run1",
      node_id: "n3",
      status: "completed",
    });

    const incomplete = await RunNodeState.getIncompleteNodes("run1");
    expect(incomplete).toHaveLength(2);
    expect(incomplete.every((s) => s.isIncomplete())).toBe(true);
  });

  it("getSuspendedNodes", async () => {
    await (RunNodeState as unknown as ModelClass<RunNodeState>).create({
      run_id: "run1",
      node_id: "n1",
      status: "suspended",
    });
    await (RunNodeState as unknown as ModelClass<RunNodeState>).create({
      run_id: "run1",
      node_id: "n2",
      status: "running",
    });

    const suspended = await RunNodeState.getSuspendedNodes("run1");
    expect(suspended).toHaveLength(1);
    expect(suspended[0].node_id).toBe("n1");
  });

  it("status check methods", async () => {
    const state = await RunNodeState.getOrCreate("run1", "node1");
    expect(state.isIncomplete()).toBe(false); // idle is not incomplete

    await state.markScheduled();
    expect(state.isIncomplete()).toBe(true);

    await state.markRunning();
    expect(state.isIncomplete()).toBe(true);

    await state.markCompleted();
    expect(state.isIncomplete()).toBe(false);
    expect(state.isSuspended()).toBe(false);
  });
});

// ── RunEvent ──────────────────────────────────────────────────────────

describe("RunEvent model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("appendEvent creates event with auto-seq", async () => {
    const ev = await RunEvent.appendEvent("run1", "RunCreated", {
      workflow_id: "w1",
    });
    expect(ev.run_id).toBe("run1");
    expect(ev.seq).toBe(0);
    expect(ev.event_type).toBe("RunCreated");
    expect(ev.payload).toEqual({ workflow_id: "w1" });
  });

  it("getNextSeq increments correctly", async () => {
    expect(await RunEvent.getNextSeq("run1")).toBe(0);

    await RunEvent.appendEvent("run1", "RunCreated", {});
    expect(await RunEvent.getNextSeq("run1")).toBe(1);

    await RunEvent.appendEvent("run1", "NodeScheduled", {}, "n1");
    expect(await RunEvent.getNextSeq("run1")).toBe(2);
  });

  it("getEvents returns all events for a run", async () => {
    await RunEvent.appendEvent("run1", "RunCreated", {});
    await RunEvent.appendEvent("run1", "NodeScheduled", {}, "n1");
    await RunEvent.appendEvent("run1", "NodeStarted", {}, "n1");
    await RunEvent.appendEvent("run2", "RunCreated", {});

    const events = await RunEvent.getEvents("run1");
    expect(events).toHaveLength(3);
    expect(events[0].event_type).toBe("RunCreated");
  });

  it("getEvents with seqGt filter", async () => {
    await RunEvent.appendEvent("run1", "RunCreated", {});
    await RunEvent.appendEvent("run1", "NodeScheduled", {});
    await RunEvent.appendEvent("run1", "NodeStarted", {});

    const events = await RunEvent.getEvents("run1", { seqGt: 0 });
    expect(events).toHaveLength(2);
    expect(events[0].seq).toBe(1);
  });

  it("getEvents with eventType filter", async () => {
    await RunEvent.appendEvent("run1", "RunCreated", {});
    await RunEvent.appendEvent("run1", "NodeScheduled", {}, "n1");
    await RunEvent.appendEvent("run1", "NodeCompleted", {}, "n1");

    const events = await RunEvent.getEvents("run1", {
      eventType: "NodeScheduled",
    });
    expect(events).toHaveLength(1);
  });

  it("getEvents with nodeId filter", async () => {
    await RunEvent.appendEvent("run1", "NodeScheduled", {}, "n1");
    await RunEvent.appendEvent("run1", "NodeScheduled", {}, "n2");
    await RunEvent.appendEvent("run1", "NodeStarted", {}, "n1");

    const events = await RunEvent.getEvents("run1", { nodeId: "n1" });
    expect(events).toHaveLength(2);
  });

  it("getLastEvent returns most recent", async () => {
    await RunEvent.appendEvent("run1", "RunCreated", {});
    await RunEvent.appendEvent("run1", "NodeScheduled", {}, "n1");
    await RunEvent.appendEvent("run1", "NodeCompleted", { result: 1 }, "n1");

    const last = await RunEvent.getLastEvent("run1");
    expect(last).not.toBeNull();
    expect(last!.event_type).toBe("NodeCompleted");

    const lastForType = await RunEvent.getLastEvent("run1", {
      eventType: "NodeScheduled",
    });
    expect(lastForType).not.toBeNull();
    expect(lastForType!.event_type).toBe("NodeScheduled");

    const noMatch = await RunEvent.getLastEvent("run99");
    expect(noMatch).toBeNull();
  });

  it("fromDict deserializes a plain object into a RunEvent", () => {
    const ev = RunEvent.fromDict({
      id: "ev-123",
      run_id: "run1",
      seq: 5,
      event_type: "NodeCompleted",
      event_time: "2025-01-01T00:00:00.000Z",
      node_id: "n1",
      payload: { result: 42 },
    });
    expect(ev).toBeInstanceOf(RunEvent);
    expect(ev.id).toBe("ev-123");
    expect(ev.run_id).toBe("run1");
    expect(ev.seq).toBe(5);
    expect(ev.event_type).toBe("NodeCompleted");
    expect(ev.event_time).toBe("2025-01-01T00:00:00.000Z");
    expect(ev.node_id).toBe("n1");
    expect(ev.payload).toEqual({ result: 42 });
  });

  it("fromDict applies defaults for missing fields", () => {
    const ev = RunEvent.fromDict({});
    expect(ev).toBeInstanceOf(RunEvent);
    expect(ev.id).toBeTruthy();
    expect(ev.run_id).toBe("");
    expect(ev.seq).toBe(0);
    expect(ev.event_type).toBe("RunCreated");
    expect(ev.event_time).toBeTruthy();
    expect(ev.node_id).toBeNull();
    expect(ev.payload).toBeNull();
  });
});

// ── Prediction ────────────────────────────────────────────────────────

describe("Prediction model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("find returns a prediction by ID", async () => {
    const created = await (
      Prediction as unknown as ModelClass<Prediction>
    ).create({
      user_id: "u1",
      node_id: "n1",
      provider: "openai",
      model: "gpt-4",
      cost: 0.05,
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    });

    const found = await Prediction.find(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.provider).toBe("openai");
    expect(found!.model).toBe("gpt-4");
    expect(found!.cost).toBe(0.05);
  });

  it("find returns null for non-existent ID", async () => {
    const found = await Prediction.find("nonexistent-id");
    expect(found).toBeNull();
  });

  it("paginate returns predictions for user", async () => {
    for (let i = 0; i < 3; i++) {
      await (Prediction as unknown as ModelClass<Prediction>).create({
        user_id: "u1",
        node_id: `n${i}`,
        provider: "openai",
        model: "gpt-4",
      });
    }
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u2",
      node_id: "n0",
      provider: "openai",
      model: "gpt-4",
    });

    const [results] = await Prediction.paginate("u1");
    expect(results).toHaveLength(3);
    expect(results.every((p) => p.user_id === "u1")).toBe(true);
  });

  it("paginate filters by provider and model", async () => {
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n1",
      provider: "openai",
      model: "gpt-4",
    });
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n2",
      provider: "anthropic",
      model: "claude-3",
    });

    const [byProvider] = await Prediction.paginate("u1", {
      provider: "openai",
    });
    expect(byProvider).toHaveLength(1);
    expect(byProvider[0].provider).toBe("openai");

    const [byModel] = await Prediction.paginate("u1", { model: "claude-3" });
    expect(byModel).toHaveLength(1);
    expect(byModel[0].model).toBe("claude-3");
  });

  it("aggregateByUser sums costs and tokens", async () => {
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n1",
      provider: "openai",
      model: "gpt-4",
      cost: 0.05,
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    });
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n2",
      provider: "openai",
      model: "gpt-4",
      cost: 0.10,
      input_tokens: 200,
      output_tokens: 100,
      total_tokens: 300,
    });

    const agg = await Prediction.aggregateByUser("u1");
    expect(agg.user_id).toBe("u1");
    expect(agg.total_cost).toBeCloseTo(0.15);
    expect(agg.total_input_tokens).toBe(300);
    expect(agg.total_output_tokens).toBe(150);
    expect(agg.total_tokens).toBe(450);
    expect(agg.call_count).toBe(2);
  });

  it("aggregateByUser filters by provider", async () => {
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n1",
      provider: "openai",
      model: "gpt-4",
      cost: 0.05,
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    });
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n2",
      provider: "anthropic",
      model: "claude-3",
      cost: 0.08,
      input_tokens: 80,
      output_tokens: 40,
      total_tokens: 120,
    });

    const agg = await Prediction.aggregateByUser("u1", {
      provider: "openai",
    });
    expect(agg.call_count).toBe(1);
    expect(agg.total_cost).toBeCloseTo(0.05);
    expect(agg.provider).toBe("openai");
  });

  it("aggregateByUser handles null costs/tokens", async () => {
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n1",
      provider: "openai",
      model: "gpt-4",
      // cost, tokens left as null defaults
    });

    const agg = await Prediction.aggregateByUser("u1");
    expect(agg.total_cost).toBe(0);
    expect(agg.total_input_tokens).toBe(0);
    expect(agg.total_output_tokens).toBe(0);
    expect(agg.total_tokens).toBe(0);
    expect(agg.call_count).toBe(1);
  });

  it("aggregateByProvider groups by provider", async () => {
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n1",
      provider: "openai",
      model: "gpt-4",
      cost: 0.05,
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    });
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n2",
      provider: "openai",
      model: "gpt-3.5",
      cost: 0.02,
      input_tokens: 50,
      output_tokens: 25,
      total_tokens: 75,
    });
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n3",
      provider: "anthropic",
      model: "claude-3",
      cost: 0.08,
      input_tokens: 80,
      output_tokens: 40,
      total_tokens: 120,
    });

    const results = await Prediction.aggregateByProvider("u1");
    expect(results).toHaveLength(2);

    const openai = results.find((r) => r.provider === "openai");
    expect(openai).toBeDefined();
    expect(openai!.call_count).toBe(2);
    expect(openai!.total_cost).toBeCloseTo(0.07);
    expect(openai!.total_input_tokens).toBe(150);

    const anthropic = results.find((r) => r.provider === "anthropic");
    expect(anthropic).toBeDefined();
    expect(anthropic!.call_count).toBe(1);
    expect(anthropic!.total_cost).toBeCloseTo(0.08);
  });

  it("aggregateByModel groups by provider+model", async () => {
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n1",
      provider: "openai",
      model: "gpt-4",
      cost: 0.05,
      total_tokens: 150,
    });
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n2",
      provider: "openai",
      model: "gpt-3.5",
      cost: 0.02,
      total_tokens: 75,
    });
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n3",
      provider: "openai",
      model: "gpt-4",
      cost: 0.06,
      total_tokens: 180,
    });

    const results = await Prediction.aggregateByModel("u1");
    expect(results).toHaveLength(2);

    const gpt4 = results.find((r) => r.model === "gpt-4");
    expect(gpt4).toBeDefined();
    expect(gpt4!.provider).toBe("openai");
    expect(gpt4!.call_count).toBe(2);
    expect(gpt4!.total_cost).toBeCloseTo(0.11);
    expect(gpt4!.total_tokens).toBe(330);

    const gpt35 = results.find((r) => r.model === "gpt-3.5");
    expect(gpt35).toBeDefined();
    expect(gpt35!.call_count).toBe(1);
  });

  it("aggregateByModel filters by provider", async () => {
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n1",
      provider: "openai",
      model: "gpt-4",
      cost: 0.05,
    });
    await (Prediction as unknown as ModelClass<Prediction>).create({
      user_id: "u1",
      node_id: "n2",
      provider: "anthropic",
      model: "claude-3",
      cost: 0.08,
    });

    const results = await Prediction.aggregateByModel("u1", {
      provider: "openai",
    });
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe("openai");
    expect(results[0].model).toBe("gpt-4");
  });
});

// ── RunLease ──────────────────────────────────────────────────────────

describe("RunLease model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("acquire creates new lease", async () => {
    const lease = await RunLease.acquire("run1", "worker-1");
    expect(lease).not.toBeNull();
    expect(lease!.run_id).toBe("run1");
    expect(lease!.worker_id).toBe("worker-1");
    expect(lease!.isExpired()).toBe(false);
    expect(lease!.isHeldBy("worker-1")).toBe(true);
    expect(lease!.isHeldBy("worker-2")).toBe(false);
  });

  it("acquire returns null when lease is held", async () => {
    await RunLease.acquire("run1", "worker-1", 300);
    const second = await RunLease.acquire("run1", "worker-2");
    expect(second).toBeNull();
  });

  it("acquire takes over expired lease", async () => {
    // Create a lease with short TTL
    const lease = await RunLease.acquire("run1", "worker-1", 60);
    expect(lease).not.toBeNull();

    // Manually expire it
    lease!.expires_at = new Date(Date.now() - 1000).toISOString();
    await lease!.save();

    const taken = await RunLease.acquire("run1", "worker-2", 60);
    expect(taken).not.toBeNull();
    expect(taken!.worker_id).toBe("worker-2");
  });

  it("renew extends expiration", async () => {
    const lease = await RunLease.acquire("run1", "worker-1", 1);
    expect(lease).not.toBeNull();

    const oldExpires = lease!.expires_at;
    await lease!.renew(300);
    expect(new Date(lease!.expires_at).getTime()).toBeGreaterThan(
      new Date(oldExpires).getTime(),
    );
  });

  it("release deletes the lease", async () => {
    const lease = await RunLease.acquire("run1", "worker-1");
    expect(lease).not.toBeNull();

    await lease!.release();

    // Should be able to acquire again
    const newLease = await RunLease.acquire("run1", "worker-2");
    expect(newLease).not.toBeNull();
    expect(newLease!.worker_id).toBe("worker-2");
  });

  it("cleanupExpired removes expired leases", async () => {
    const l1 = await RunLease.acquire("run1", "worker-1", 60);
    const l2 = await RunLease.acquire("run2", "worker-1", 60);
    await RunLease.acquire("run3", "worker-1", 300);

    // Manually expire first two
    l1!.expires_at = new Date(Date.now() - 1000).toISOString();
    await l1!.save();
    l2!.expires_at = new Date(Date.now() - 1000).toISOString();
    await l2!.save();

    const removed = await RunLease.cleanupExpired();
    expect(removed).toBe(2);

    // run3 lease should still exist
    const remaining = await RunLease.acquire("run3", "worker-2");
    expect(remaining).toBeNull(); // still held
  });

  it("isExpired checks correctly", async () => {
    const lease = await RunLease.acquire("run1", "worker-1", 60);
    expect(lease).not.toBeNull();
    // Manually expire it
    lease!.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(lease!.isExpired()).toBe(true);

    const lease2 = await RunLease.acquire("run2", "worker-1", 300);
    expect(lease2).not.toBeNull();
    expect(lease2!.isExpired()).toBe(false);
  });
});
