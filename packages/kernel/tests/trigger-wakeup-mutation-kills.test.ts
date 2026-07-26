import { describe, it, expect, vi } from "vitest";
import { TriggerWakeupService } from "../src/trigger-wakeup.js";

/**
 * The per-(runId, nodeId) DurableInbox cache is the service's only unbounded
 * structure: a long-lived service accumulates one entry per run forever unless
 * cleanupProcessed/disposeRun evict exactly the right keys. The map is private
 * and has no public accessor, so these tests read it directly — the bounded
 * memory contract is real even though it is not observable through the API.
 */
interface WakeupInternals {
  _inboxes: Map<string, unknown>;
}

const inboxKeys = (svc: TriggerWakeupService): string[] =>
  [...(svc as unknown as WakeupInternals)._inboxes.keys()].sort();

const key = (runId: string, nodeId: string): string =>
  JSON.stringify([runId, nodeId]);

describe("TriggerWakeupService — inbox cache eviction", () => {
  it("cleanupProcessed evicts only the cleaned (runId, nodeId) inbox, keeping same-run and same-node neighbours", async () => {
    // Arrange: three distinct (run, node) pairs share a run id or a node id
    // with the pair being cleaned, so a filter that matches on either field
    // alone would evict the wrong entries.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
      const svc = new TriggerWakeupService();
      await svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n1",
        inputId: "a",
        payload: {}
      });
      await svc.deliverTriggerInput({
        runId: "r2",
        nodeId: "n1",
        inputId: "b",
        payload: {}
      });
      await svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n2",
        inputId: "c",
        payload: {}
      });
      svc.markProcessed("a");
      vi.setSystemTime(new Date("2024-01-01T01:00:00Z"));

      // Act: purge (r1, n1) — its only input is processed, so nothing remains.
      const removed = svc.cleanupProcessed("r1", "n1", 0);

      // Assert
      expect(removed).toBe(1);
      expect(inboxKeys(svc)).toEqual([key("r1", "n2"), key("r2", "n1")].sort());
    } finally {
      vi.useRealTimers();
    }
  });

  it("cleanupProcessed keeps the cached inbox while any input remains for that (runId, nodeId)", async () => {
    // Arrange: (r1, n1) keeps an unprocessed input; (r2, n1) exists so a
    // whole-array predicate (every) would wrongly report "nothing remains".
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
      const svc = new TriggerWakeupService();
      await svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n1",
        inputId: "a",
        payload: {}
      });
      await svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n1",
        inputId: "b",
        payload: {}
      });
      await svc.deliverTriggerInput({
        runId: "r2",
        nodeId: "n1",
        inputId: "c",
        payload: {}
      });
      svc.markProcessed("a");
      vi.setSystemTime(new Date("2024-01-01T01:00:00Z"));

      // Act
      const removed = svc.cleanupProcessed("r1", "n1", 0);

      // Assert: "b" still belongs to (r1, n1), so its inbox must survive.
      expect(removed).toBe(1);
      expect(svc.getPendingInputs("r1", "n1").map((i) => i.inputId)).toEqual([
        "b"
      ]);
      expect(inboxKeys(svc)).toContain(key("r1", "n1"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("disposeRun drops one run's inputs and inboxes while another run stays intact", async () => {
    // Arrange: two runs, one sharing a node id with the disposed run.
    const svc = new TriggerWakeupService();
    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "a",
      payload: { from: "r1" }
    });
    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n2",
      inputId: "b",
      payload: { from: "r1" }
    });
    await svc.deliverTriggerInput({
      runId: "r2",
      nodeId: "n1",
      inputId: "c",
      payload: { from: "r2" }
    });

    // Act
    svc.disposeRun("r1");

    // Assert: r1 is gone entirely, r2 is untouched and still queryable.
    expect(svc.getPendingInputs("r1", "n1")).toHaveLength(0);
    expect(svc.getPendingInputs("r1", "n2")).toHaveLength(0);
    const r2Pending = svc.getPendingInputs("r2", "n1");
    expect(r2Pending.map((i) => i.inputId)).toEqual(["c"]);
    expect(r2Pending[0].payload).toEqual({ from: "r2" });
    expect(inboxKeys(svc)).toEqual([key("r2", "n1")]);
  });
});

describe("TriggerWakeupService — stored input fields", () => {
  it("round-trips the cursor of a delivered input, leaving it undefined when omitted", async () => {
    // Arrange
    const svc = new TriggerWakeupService();

    // Act
    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "with-cursor",
      payload: {},
      cursor: "page-2"
    });
    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "no-cursor",
      payload: {}
    });

    // Assert: the cursor is the caller's resume token — it must survive storage.
    const pending = svc.getPendingInputs("r1", "n1");
    expect(pending.map((i) => i.cursor)).toEqual(["page-2", undefined]);
  });

  it("records createdAt at delivery and processedAt at markProcessed", async () => {
    // Arrange
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
      const svc = new TriggerWakeupService();
      await svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n1",
        inputId: "i1",
        payload: {}
      });
      const stored = svc.getPendingInputs("r1", "n1")[0];
      expect(stored.createdAt).toEqual(new Date("2024-01-01T00:00:00Z"));
      expect(stored.processedAt).toBeUndefined();

      // Act
      vi.setSystemTime(new Date("2024-01-01T00:05:00Z"));
      svc.markProcessed("i1");

      // Assert: processedAt is the cleanup clock, stamped when marking, not at
      // delivery.
      expect(stored.processed).toBe(true);
      expect(stored.processedAt).toEqual(new Date("2024-01-01T00:05:00Z"));
      expect(stored.createdAt).toEqual(new Date("2024-01-01T00:00:00Z"));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TriggerWakeupService — defaults", () => {
  it("getPendingInputs returns at most 100 inputs when no limit is given", async () => {
    // Arrange
    const svc = new TriggerWakeupService();
    for (let i = 0; i < 150; i++) {
      await svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n1",
        inputId: `i${i}`,
        payload: { i }
      });
    }

    // Act
    const pending = svc.getPendingInputs("r1", "n1");

    // Assert
    expect(pending).toHaveLength(100);
    expect(pending[0].inputId).toBe("i0");
    expect(pending[99].inputId).toBe("i99");
  });

  it("cleanupProcessed defaults to a 24 hour retention window", async () => {
    // Arrange: two processed inputs straddling the default cutoff.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
      const svc = new TriggerWakeupService();
      await svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n1",
        inputId: "old",
        payload: {}
      });
      svc.markProcessed("old"); // processedAt = T0

      vi.setSystemTime(new Date("2024-01-01T02:00:00Z"));
      await svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n1",
        inputId: "recent",
        payload: {}
      });
      svc.markProcessed("recent"); // processedAt = T0 + 2h

      // Act: 25h after "old" was processed, 23h after "recent" was.
      vi.setSystemTime(new Date("2024-01-02T01:00:00Z"));
      const removed = svc.cleanupProcessed("r1", "n1");

      // Assert
      expect(removed).toBe(1);
      // "recent" (processed 23h ago) survived the default call and is still
      // removable with a shorter window.
      expect(svc.cleanupProcessed("r1", "n1", 22)).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TriggerWakeupService — idempotency scope (current behaviour)", () => {
  it("CURRENT BEHAVIOUR: a repeated inputId is rejected even for a different run and node", async () => {
    // Arrange: the idempotency check keys on inputId alone, ignoring
    // runId/nodeId. This test pins today's behaviour, not a desired one — see
    // the note below.
    const svc = new TriggerWakeupService();
    const first = await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "event-1",
      payload: { a: 1 }
    });
    expect(first).toBe(true);

    // Act: same event id, entirely different run and node.
    const second = await svc.deliverTriggerInput({
      runId: "r2",
      nodeId: "n2",
      inputId: "event-1",
      payload: { a: 2 }
    });

    // Assert: it is treated as a duplicate and nothing is stored for (r2, n2).
    // If inputIds are ever scoped per run/node rather than globally unique,
    // this drops real events silently and the check must widen to the
    // (runId, nodeId, inputId) triple.
    expect(second).toBe(false);
    expect(svc.getPendingInputs("r2", "n2")).toHaveLength(0);
    expect(svc.getPendingInputs("r1", "n1")).toHaveLength(1);
  });
});
