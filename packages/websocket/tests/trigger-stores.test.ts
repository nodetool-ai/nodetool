import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb } from "@nodetool-ai/models";
import { DurableInbox, type TriggerInput } from "@nodetool-ai/kernel";
import {
  DrizzleTriggerInputStore,
  DrizzleDurableInboxStore
} from "../src/triggers/stores.js";

function record(
  partial: Partial<TriggerInput> & { inputId: string }
): TriggerInput {
  return {
    runId: "r1",
    nodeId: "n1",
    payload: {},
    processed: false,
    createdAt: new Date(),
    ...partial
  };
}

describe("DrizzleTriggerInputStore", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("round-trips a trigger input and lists it as unprocessed", async () => {
    const store = new DrizzleTriggerInputStore();
    const created = await store.insertIfAbsent(
      record({ inputId: "i1", payload: { a: 1 } })
    );
    expect(created).toBe(true);

    const unprocessed = await store.findUnprocessed();
    expect(unprocessed).toHaveLength(1);
    expect(unprocessed[0].inputId).toBe("i1");
    expect(unprocessed[0].runId).toBe("r1");
    expect(unprocessed[0].nodeId).toBe("n1");
    expect(unprocessed[0].payload).toEqual({ a: 1 });
    expect(unprocessed[0].processed).toBe(false);
  });

  it("duplicate input_id returns false instead of throwing", async () => {
    const store = new DrizzleTriggerInputStore();
    const rec = record({ inputId: "dup", payload: { a: 1 } });
    expect(await store.insertIfAbsent(rec)).toBe(true);

    // The second insert must resolve to false, not reject on the unique index.
    const second = await store.insertIfAbsent(
      record({ inputId: "dup", payload: { a: 2 } })
    );
    expect(second).toBe(false);
    expect(await store.findUnprocessed()).toHaveLength(1);
  });

  it("markProcessed excludes the input; unknown id resolves without throwing", async () => {
    const store = new DrizzleTriggerInputStore();
    await store.insertIfAbsent(record({ inputId: "i1" }));
    await store.markProcessed("i1");
    expect(await store.findUnprocessed()).toHaveLength(0);
    await expect(store.markProcessed("nope")).resolves.toBeUndefined();
  });

  it("cleanupProcessed removes only processed rows older than the cutoff", async () => {
    const store = new DrizzleTriggerInputStore();
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await store.insertIfAbsent(
      record({ inputId: "old", processed: true, processedAt: old, createdAt: old })
    );
    await store.insertIfAbsent(record({ inputId: "fresh" }));
    expect(await store.cleanupProcessed("r1", "n1", 24)).toBe(1);
    expect((await store.findUnprocessed()).map((i) => i.inputId)).toEqual([
      "fresh"
    ]);
  });
});

describe("DrizzleDurableInboxStore", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("append preserves msg_seq ordering", async () => {
    const store = new DrizzleDurableInboxStore();
    const inbox = new DurableInbox("r1", "n1", store);
    for (const p of [{ i: 0 }, { i: 1 }, { i: 2 }]) {
      await inbox.append("trigger", p);
    }
    const pending = await store.findPending("r1", "n1", "trigger", 100);
    expect(pending.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(pending.map((m) => m.payload)).toEqual([{ i: 0 }, { i: 1 }, { i: 2 }]);
  });

  it("getMaxSeq survives a new store instance over the same DB (restart)", async () => {
    const first = new DrizzleDurableInboxStore();
    const inbox = new DurableInbox("r1", "n1", first);
    await inbox.append("trigger", { a: 1 });
    await inbox.append("trigger", { a: 2 });
    expect(await first.getMaxSeq("r1", "n1", "trigger")).toBe(2);

    // Simulate a process restart: a brand-new store instance, same DB.
    const second = new DrizzleDurableInboxStore();
    expect(await second.getMaxSeq("r1", "n1", "trigger")).toBe(2);

    // A fresh inbox over the new store keeps the sequence going.
    const inbox2 = new DurableInbox("r1", "n1", second);
    const msg = await inbox2.append("trigger", { a: 3 });
    expect(msg.seq).toBe(3);
    expect(await second.getMaxSeq("r1", "n1", "trigger")).toBe(3);
  });

  it("append is idempotent by messageId", async () => {
    const store = new DrizzleDurableInboxStore();
    const inbox = new DurableInbox("r1", "n1", store);
    const first = await inbox.append("trigger", { a: 1 }, "trigger-i1");
    const again = await inbox.append("trigger", { a: 999 }, "trigger-i1");
    expect(again.seq).toBe(first.seq);
    expect((await store.findPending("r1", "n1", "trigger", 100)).map((m) => m.seq)).toEqual([1]);
  });

  it("markConsumed then findPending excludes the message", async () => {
    const store = new DrizzleDurableInboxStore();
    const inbox = new DurableInbox("r1", "n1", store);
    const m1 = await inbox.append("trigger", { a: 1 });
    await inbox.append("trigger", { a: 2 });
    await store.markConsumed(m1.messageId);
    const pending = await store.findPending("r1", "n1", "trigger", 100);
    expect(pending.map((m) => m.seq)).toEqual([2]);
  });

  it("deleteConsumed removes consumed messages below a seq", async () => {
    const store = new DrizzleDurableInboxStore();
    const inbox = new DurableInbox("r1", "n1", store);
    const m1 = await inbox.append("trigger", { a: 1 });
    const m2 = await inbox.append("trigger", { a: 2 });
    await inbox.append("trigger", { a: 3 });
    await store.markConsumed(m1.messageId);
    await store.markConsumed(m2.messageId);
    expect(await store.deleteConsumed("r1", "n1", "trigger", 3)).toBe(2);
  });
});
