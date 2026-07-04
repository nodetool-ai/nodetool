import { describe, it, expect, vi } from "vitest";
import { TriggerWakeupService } from "../src/trigger-wakeup.js";
import { MemoryDurableInboxStore } from "../src/durable-inbox.js";

describe("TriggerWakeupService", () => {
  it("deliverTriggerInput() stores input and returns true", async () => {
    const svc = new TriggerWakeupService();

    const result = await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "input-1",
      payload: { event: "click" }
    });

    expect(result).toBe(true);

    const pending = svc.getPendingInputs("r1", "n1");
    expect(pending).toHaveLength(1);
    expect(pending[0].inputId).toBe("input-1");
    expect(pending[0].payload).toEqual({ event: "click" });
    expect(pending[0].processed).toBe(false);
  });

  it("deliverTriggerInput() is idempotent — duplicate inputId returns false", async () => {
    const svc = new TriggerWakeupService();

    const first = await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "input-1",
      payload: { a: 1 }
    });
    expect(first).toBe(true);

    const second = await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "input-1",
      payload: { a: 2 }
    });
    expect(second).toBe(false);

    // Only one input stored
    const pending = svc.getPendingInputs("r1", "n1");
    expect(pending).toHaveLength(1);
  });

  it("getPendingInputs() returns unprocessed inputs", async () => {
    const svc = new TriggerWakeupService();

    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i1",
      payload: { x: 1 }
    });
    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i2",
      payload: { x: 2 }
    });
    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n2",
      inputId: "i3",
      payload: { x: 3 }
    });

    // Only inputs for n1
    const pending = svc.getPendingInputs("r1", "n1");
    expect(pending).toHaveLength(2);

    // Different node
    const pendingN2 = svc.getPendingInputs("r1", "n2");
    expect(pendingN2).toHaveLength(1);
  });

  it("markProcessed() marks input as processed, excluded from pending", async () => {
    const svc = new TriggerWakeupService();

    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i1",
      payload: { v: 1 }
    });
    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i2",
      payload: { v: 2 }
    });

    svc.markProcessed("i1");

    const pending = svc.getPendingInputs("r1", "n1");
    expect(pending).toHaveLength(1);
    expect(pending[0].inputId).toBe("i2");
  });

  it("cleanupProcessed() removes old processed inputs", async () => {
    const svc = new TriggerWakeupService();

    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i1",
      payload: {}
    });

    svc.markProcessed("i1");

    // Wait 1ms so processedAt is strictly in the past
    await new Promise((r) => setTimeout(r, 2));

    // olderThanHours=0 means cutoff = Date.now(), processedAt < now
    const removed = svc.cleanupProcessed("r1", "n1", 0);
    expect(removed).toBe(1);

    // Nothing left to clean
    const removed2 = svc.cleanupProcessed("r1", "n1", 0);
    expect(removed2).toBe(0);
  });

  it("cleanupProcessed() does not remove unprocessed or recent inputs", async () => {
    const svc = new TriggerWakeupService();

    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i1",
      payload: {}
    });

    // Not processed — should not be removed
    const removed = svc.cleanupProcessed("r1", "n1", 0);
    expect(removed).toBe(0);

    const pending = svc.getPendingInputs("r1", "n1");
    expect(pending).toHaveLength(1);
  });
});

describe("TriggerWakeupService — durable store delivery", () => {
  it("appends the payload to the provided store under the 'trigger' handle", async () => {
    const store = new MemoryDurableInboxStore();
    const svc = new TriggerWakeupService(store);

    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i1",
      payload: { e: 1 }
    });

    const pending = await store.findPending("r1", "n1", "trigger", 100);
    expect(pending).toHaveLength(1);
    expect(pending[0].messageId).toBe("trigger-i1");
    expect(pending[0].payload).toEqual({ e: 1 });
  });
});

describe("TriggerWakeupService — concurrent delivery sequencing (finding #9)", () => {
  it("assigns strictly increasing, duplicate-free seq under concurrent deliveries for the same (run, node)", async () => {
    const store = new MemoryDurableInboxStore();
    const svc = new TriggerWakeupService(store);

    const N = 50;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        svc.deliverTriggerInput({
          runId: "r1",
          nodeId: "n1",
          inputId: `input-${i}`,
          payload: { i }
        })
      )
    );

    // Every distinct inputId is a new delivery.
    expect(results.every((r) => r === true)).toBe(true);

    const persisted = await store.findPending("r1", "n1", "trigger", N * 2);
    expect(persisted).toHaveLength(N);

    const seqs = persisted.map((m) => m.seq);
    // Duplicate-free.
    expect(new Set(seqs).size).toBe(N);
    // Strictly increasing 1..N (findPending sorts by seq).
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  });

  it("keeps sequences independent across distinct (run, node) pairs", async () => {
    const store = new MemoryDurableInboxStore();
    const svc = new TriggerWakeupService(store);

    await Promise.all([
      svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n1",
        inputId: "a",
        payload: {}
      }),
      svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n2",
        inputId: "b",
        payload: {}
      }),
      // A colliding plain-":" join of these two would be "r1:n2:x" vs
      // "r1:n2x" — JSON keying keeps them apart.
      svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n2x",
        inputId: "c",
        payload: {}
      })
    ]);

    expect(await store.findPending("r1", "n1", "trigger", 10)).toHaveLength(1);
    expect(await store.findPending("r1", "n2", "trigger", 10)).toHaveLength(1);
    expect(await store.findPending("r1", "n2x", "trigger", 10)).toHaveLength(1);
  });
});

describe("TriggerWakeupService — getPendingInputs filtering", () => {
  it("respects the limit", async () => {
    const svc = new TriggerWakeupService();
    for (const id of ["a", "b", "c"]) {
      await svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n1",
        inputId: id,
        payload: {}
      });
    }
    expect(svc.getPendingInputs("r1", "n1", 2)).toHaveLength(2);
  });

  it("filters by runId", async () => {
    const svc = new TriggerWakeupService();
    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i1",
      payload: {}
    });
    await svc.deliverTriggerInput({
      runId: "r2",
      nodeId: "n1",
      inputId: "i2",
      payload: {}
    });
    expect(svc.getPendingInputs("r1", "n1").map((i) => i.inputId)).toEqual([
      "i1"
    ]);
  });
});

describe("TriggerWakeupService — markProcessed targeting", () => {
  it("marks only the input with the given id", async () => {
    const svc = new TriggerWakeupService();
    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i1",
      payload: {}
    });
    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i2",
      payload: {}
    });
    svc.markProcessed("i2");
    expect(svc.getPendingInputs("r1", "n1").map((i) => i.inputId)).toEqual([
      "i1"
    ]);
  });

  it("is a no-op for an unknown id", async () => {
    const svc = new TriggerWakeupService();
    await svc.deliverTriggerInput({
      runId: "r1",
      nodeId: "n1",
      inputId: "i1",
      payload: {}
    });
    expect(() => svc.markProcessed("nope")).not.toThrow();
    expect(svc.getPendingInputs("r1", "n1")).toHaveLength(1);
  });
});

describe("TriggerWakeupService — cleanupProcessed details", () => {
  it("removes only matching, processed, old inputs", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
      const svc = new TriggerWakeupService();
      await svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n1",
        inputId: "match",
        payload: {}
      });
      await svc.deliverTriggerInput({
        runId: "r2",
        nodeId: "n1",
        inputId: "otherRun",
        payload: {}
      });
      await svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n2",
        inputId: "otherNode",
        payload: {}
      });
      await svc.deliverTriggerInput({
        runId: "r1",
        nodeId: "n1",
        inputId: "unprocessed",
        payload: {}
      });
      svc.markProcessed("match");
      svc.markProcessed("otherRun");
      svc.markProcessed("otherNode");

      vi.setSystemTime(new Date("2024-01-02T00:00:00Z")); // a day later

      expect(svc.cleanupProcessed("r1", "n1", 1)).toBe(1); // only "match"
      // The others were untouched, so they are still individually removable.
      expect(svc.cleanupProcessed("r2", "n1", 1)).toBe(1); // otherRun
      expect(svc.cleanupProcessed("r1", "n2", 1)).toBe(1); // otherNode
      expect(svc.getPendingInputs("r1", "n1").map((i) => i.inputId)).toEqual([
        "unprocessed"
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps inputs newer than the age threshold", async () => {
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
      svc.markProcessed("i1"); // processedAt = 00:00
      vi.setSystemTime(new Date("2024-01-01T00:30:00Z")); // 30 min later
      // threshold 2h => cutoff 22:30 yesterday; processed at 00:00 is newer
      expect(svc.cleanupProcessed("r1", "n1", 2)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not remove an input processed exactly at the cutoff", async () => {
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
      svc.markProcessed("i1"); // processedAt = T0
      vi.setSystemTime(new Date("2024-01-01T01:00:00Z")); // +1h
      // cutoff = now - 1h = T0 exactly; the comparison is strict `<`
      expect(svc.cleanupProcessed("r1", "n1", 1)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
