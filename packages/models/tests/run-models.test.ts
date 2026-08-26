import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { RunEvent } from "../src/run-event.js";
import { Prediction } from "../src/prediction.js";

function setup() {
  initTestDb();
}

describe("RunEvent model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("appendEvent creates event with auto-seq", async () => {
    const ev = await RunEvent.appendEvent("run1", "RunCreated", {
      workflow_id: "w1"
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

  it("getEvents with seqLte filter", async () => {
    await RunEvent.appendEvent("run1", "RunCreated", {});
    await RunEvent.appendEvent("run1", "NodeScheduled", {});
    await RunEvent.appendEvent("run1", "NodeStarted", {});

    const events = await RunEvent.getEvents("run1", { seqLte: 1 });
    expect(events).toHaveLength(2);
    expect(events.at(-1)?.seq).toBe(1);
  });

  it("getEvents with eventType filter", async () => {
    await RunEvent.appendEvent("run1", "RunCreated", {});
    await RunEvent.appendEvent("run1", "NodeScheduled", {}, "n1");
    await RunEvent.appendEvent("run1", "NodeCompleted", {}, "n1");

    const events = await RunEvent.getEvents("run1", {
      eventType: "NodeScheduled"
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
      eventType: "NodeScheduled"
    });
    expect(lastForType).not.toBeNull();
    expect(lastForType!.event_type).toBe("NodeScheduled");

    const lastForNode = await RunEvent.getLastEvent("run1", {
      nodeId: "n1"
    });
    expect(lastForNode).not.toBeNull();
    expect(lastForNode!.node_id).toBe("n1");

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
      payload: { result: 42 }
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
    const created = await Prediction.create<Prediction>({
      user_id: "u1",
      node_id: "n1",
      provider: "openai",
      model: "gpt-4",
      cost: 0.05,
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150
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
});
