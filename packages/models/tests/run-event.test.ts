/**
 * Tests for the RunEvent model.
 *
 * Covers: constructor defaults, getNextSeq, appendEvent, getEvents,
 * fromDict, getLastEvent.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { RunEvent } from "../src/run-event.js";

// ── Setup ────────────────────────────────────────────────────────────

describe("RunEvent model", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    ModelObserver.clear();
  });

  // ── Constructor defaults ──────────────────────────────────────────

  it("sets default values in constructor", () => {
    const ev = new RunEvent({ run_id: "r1", seq: 0, event_type: "RunCreated" });
    expect(ev.id).toBeTruthy();
    expect(ev.event_time).toBeTruthy();
    expect(ev.node_id).toBeNull();
    expect(ev.payload).toBeNull();
  });

  // ── getNextSeq ────────────────────────────────────────────────────

  it("returns 0 for a run with no events", async () => {
    const seq = await RunEvent.getNextSeq("empty-run");
    expect(seq).toBe(0);
  });

  it("returns next seq after existing events", async () => {
    await RunEvent.appendEvent("r1", "RunCreated", {});
    const seq = await RunEvent.getNextSeq("r1");
    expect(seq).toBe(1);
  });

  it("increments seq for multiple events", async () => {
    await RunEvent.appendEvent("r1", "RunCreated", {});
    await RunEvent.appendEvent("r1", "NodeStarted", {}, "n1");
    await RunEvent.appendEvent("r1", "NodeCompleted", {}, "n1");
    const seq = await RunEvent.getNextSeq("r1");
    expect(seq).toBe(3);
  });

  // ── appendEvent ───────────────────────────────────────────────────

  it("creates an event with correct fields", async () => {
    const ev = await RunEvent.appendEvent("r1", "RunCreated", { key: "val" });
    expect(ev.run_id).toBe("r1");
    expect(ev.event_type).toBe("RunCreated");
    expect(ev.seq).toBe(0);
    expect(ev.payload).toEqual({ key: "val" });
    expect(ev.node_id).toBeNull();
  });

  it("creates an event with node_id", async () => {
    const ev = await RunEvent.appendEvent("r1", "NodeStarted", {}, "node-42");
    expect(ev.node_id).toBe("node-42");
  });

  it("persists event to database", async () => {
    const ev = await RunEvent.appendEvent("r1", "RunCreated", {});
    const loaded = await RunEvent.get<RunEvent>(ev.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.event_type).toBe("RunCreated");
  });

  // ── getEvents ─────────────────────────────────────────────────────

  it("returns all events for a run", async () => {
    await RunEvent.appendEvent("r1", "RunCreated", {});
    await RunEvent.appendEvent("r1", "NodeStarted", {}, "n1");
    await RunEvent.appendEvent("r1", "RunCompleted", {});

    const events = await RunEvent.getEvents("r1");
    expect(events).toHaveLength(3);
    expect(events[0].event_type).toBe("RunCreated");
    expect(events[2].event_type).toBe("RunCompleted");
  });

  it("returns events in seq order", async () => {
    await RunEvent.appendEvent("r1", "RunCreated", {});
    await RunEvent.appendEvent("r1", "NodeStarted", {});
    await RunEvent.appendEvent("r1", "NodeCompleted", {});

    const events = await RunEvent.getEvents("r1");
    for (let i = 1; i < events.length; i++) {
      expect(events[i].seq).toBeGreaterThan(events[i - 1].seq);
    }
  });

  it("filters by seqGt", async () => {
    await RunEvent.appendEvent("r1", "RunCreated", {});
    await RunEvent.appendEvent("r1", "NodeStarted", {});
    await RunEvent.appendEvent("r1", "NodeCompleted", {});

    const events = await RunEvent.getEvents("r1", { seqGt: 0 });
    expect(events).toHaveLength(2);
    expect(events[0].seq).toBe(1);
  });

  it("filters by seqLte", async () => {
    await RunEvent.appendEvent("r1", "RunCreated", {});
    await RunEvent.appendEvent("r1", "NodeStarted", {});
    await RunEvent.appendEvent("r1", "NodeCompleted", {});

    const events = await RunEvent.getEvents("r1", { seqLte: 1 });
    expect(events).toHaveLength(2);
  });

  it("filters by eventType", async () => {
    await RunEvent.appendEvent("r1", "RunCreated", {});
    await RunEvent.appendEvent("r1", "NodeStarted", {}, "n1");
    await RunEvent.appendEvent("r1", "NodeCompleted", {}, "n1");
    await RunEvent.appendEvent("r1", "NodeStarted", {}, "n2");

    const events = await RunEvent.getEvents("r1", { eventType: "NodeStarted" });
    expect(events).toHaveLength(2);
  });

  it("filters by nodeId", async () => {
    await RunEvent.appendEvent("r1", "NodeStarted", {}, "n1");
    await RunEvent.appendEvent("r1", "NodeStarted", {}, "n2");
    await RunEvent.appendEvent("r1", "NodeCompleted", {}, "n1");

    const events = await RunEvent.getEvents("r1", { nodeId: "n1" });
    expect(events).toHaveLength(2);
  });

  it("respects limit", async () => {
    await RunEvent.appendEvent("r1", "RunCreated", {});
    await RunEvent.appendEvent("r1", "NodeStarted", {});
    await RunEvent.appendEvent("r1", "NodeCompleted", {});

    const events = await RunEvent.getEvents("r1", { limit: 2 });
    expect(events).toHaveLength(2);
  });

  it("returns empty for unknown run", async () => {
    const events = await RunEvent.getEvents("nonexistent");
    expect(events).toHaveLength(0);
  });

  it("isolates events between runs", async () => {
    await RunEvent.appendEvent("r1", "RunCreated", {});
    await RunEvent.appendEvent("r2", "RunCreated", {});

    const r1Events = await RunEvent.getEvents("r1");
    expect(r1Events).toHaveLength(1);
  });

  // ── fromDict ──────────────────────────────────────────────────────

  it("deserializes from a plain object", () => {
    const ev = RunEvent.fromDict({
      id: "ev-123",
      run_id: "r1",
      seq: 5,
      event_type: "NodeFailed",
      node_id: "n1",
      payload: { error: "oops" }
    });
    expect(ev.id).toBe("ev-123");
    expect(ev.run_id).toBe("r1");
    expect(ev.seq).toBe(5);
    expect(ev.event_type).toBe("NodeFailed");
    expect(ev.node_id).toBe("n1");
    expect(ev.payload).toEqual({ error: "oops" });
  });

  it("fromDict provides defaults for missing fields", () => {
    const ev = RunEvent.fromDict({});
    expect(ev.id).toBeTruthy();
    expect(ev.run_id).toBe("");
    expect(ev.seq).toBe(0);
    expect(ev.event_type).toBe("RunCreated");
    expect(ev.node_id).toBeNull();
    expect(ev.payload).toBeNull();
  });

  // ── getLastEvent ──────────────────────────────────────────────────

  it("returns the most recent event", async () => {
    await RunEvent.appendEvent("r1", "RunCreated", {});
    await RunEvent.appendEvent("r1", "NodeStarted", {}, "n1");
    await RunEvent.appendEvent("r1", "RunCompleted", {});

    const last = await RunEvent.getLastEvent("r1");
    expect(last).not.toBeNull();
    expect(last!.event_type).toBe("RunCompleted");
  });

  it("filters getLastEvent by eventType", async () => {
    await RunEvent.appendEvent("r1", "RunCreated", {});
    await RunEvent.appendEvent("r1", "NodeStarted", {}, "n1");
    await RunEvent.appendEvent("r1", "RunCompleted", {});

    const last = await RunEvent.getLastEvent("r1", {
      eventType: "NodeStarted"
    });
    expect(last).not.toBeNull();
    expect(last!.event_type).toBe("NodeStarted");
  });

  it("filters getLastEvent by nodeId", async () => {
    await RunEvent.appendEvent("r1", "NodeStarted", {}, "n1");
    await RunEvent.appendEvent("r1", "NodeStarted", {}, "n2");

    const last = await RunEvent.getLastEvent("r1", { nodeId: "n1" });
    expect(last).not.toBeNull();
    expect(last!.node_id).toBe("n1");
  });

  it("getLastEvent returns null for empty run", async () => {
    const last = await RunEvent.getLastEvent("nonexistent");
    expect(last).toBeNull();
  });
});
