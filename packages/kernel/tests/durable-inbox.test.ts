import { describe, it, expect } from "vitest";
import { DurableInbox, MemoryDurableInboxStore } from "../src/durable-inbox.js";

describe("MemoryDurableInboxStore", () => {
  it("basic operations work end-to-end", async () => {
    const store = new MemoryDurableInboxStore();

    await store.save({
      id: "m1",
      runId: "r1",
      nodeId: "n1",
      handle: "input",
      messageId: "m1",
      seq: 1,
      payload: { data: "hello" },
      status: "pending",
      createdAt: new Date()
    });

    const found = await store.findByMessageId("m1");
    expect(found).not.toBeNull();
    expect(found!.payload).toEqual({ data: "hello" });

    expect(await store.findByMessageId("nonexistent")).toBeNull();
  });
});

describe("DurableInbox", () => {
  it("append() creates a message with correct fields", async () => {
    const inbox = new DurableInbox("run-1", "node-1");
    const msg = await inbox.append("input", { value: 42 });

    expect(msg.runId).toBe("run-1");
    expect(msg.nodeId).toBe("node-1");
    expect(msg.handle).toBe("input");
    expect(msg.seq).toBe(1);
    expect(msg.payload).toEqual({ value: 42 });
    expect(msg.status).toBe("pending");
    expect(msg.createdAt).toBeInstanceOf(Date);
    expect(msg.id).toBe(msg.messageId);
  });

  it("append() is idempotent — same messageId returns existing", async () => {
    const inbox = new DurableInbox("run-1", "node-1");

    const msg1 = await inbox.append("input", { a: 1 }, "custom-id-1");
    const msg2 = await inbox.append("input", { a: 2 }, "custom-id-1");

    // Should return the same message (first one)
    expect(msg2.messageId).toBe(msg1.messageId);
    expect(msg2.payload).toEqual({ a: 1 }); // original payload preserved
  });

  it("generateMessageId() is deterministic", () => {
    const id1 = DurableInbox.generateMessageId("r1", "n1", "h1", 1);
    const id2 = DurableInbox.generateMessageId("r1", "n1", "h1", 1);
    expect(id1).toBe(id2);

    // Different inputs produce different IDs
    const id3 = DurableInbox.generateMessageId("r1", "n1", "h1", 2);
    expect(id3).not.toBe(id1);
  });

  it("getPending() returns only pending messages in seq order", async () => {
    const inbox = new DurableInbox("run-1", "node-1");

    await inbox.append("input", { v: 1 });
    await inbox.append("input", { v: 2 });
    const msg3 = await inbox.append("input", { v: 3 });

    // Consume the second message
    const pending1 = await inbox.getPending("input");
    expect(pending1).toHaveLength(3);

    // Mark middle one consumed
    await inbox.markConsumed(pending1[1]);

    const pending2 = await inbox.getPending("input");
    expect(pending2).toHaveLength(2);
    expect(pending2[0].seq).toBe(1);
    expect(pending2[1].seq).toBe(3);
  });

  it("markConsumed() changes status, consumed messages excluded from getPending", async () => {
    const inbox = new DurableInbox("run-1", "node-1");

    const msg = await inbox.append("input", { x: 1 });
    expect(msg.status).toBe("pending");

    await inbox.markConsumed(msg);

    const pending = await inbox.getPending("input");
    expect(pending).toHaveLength(0);
  });

  it("getMaxSeq() returns highest sequence number", async () => {
    const inbox = new DurableInbox("run-1", "node-1");

    expect(await inbox.getMaxSeq("input")).toBe(0);

    await inbox.append("input", { a: 1 });
    expect(await inbox.getMaxSeq("input")).toBe(1);

    await inbox.append("input", { a: 2 });
    expect(await inbox.getMaxSeq("input")).toBe(2);

    await inbox.append("input", { a: 3 });
    expect(await inbox.getMaxSeq("input")).toBe(3);

    // Different handle has its own sequence
    expect(await inbox.getMaxSeq("other")).toBe(0);
  });

  it("cleanupConsumed() removes old consumed messages and returns count", async () => {
    const inbox = new DurableInbox("run-1", "node-1");

    const msg1 = await inbox.append("input", { a: 1 });
    const msg2 = await inbox.append("input", { a: 2 });
    const msg3 = await inbox.append("input", { a: 3 });

    // Consume first two
    await inbox.markConsumed(msg1);
    await inbox.markConsumed(msg2);

    // Cleanup consumed messages with seq < 3 (removes msg1 and msg2)
    const removed = await inbox.cleanupConsumed("input", 3);
    expect(removed).toBe(2);

    // msg3 is still pending
    const pending = await inbox.getPending("input");
    expect(pending).toHaveLength(1);
    expect(pending[0].seq).toBe(3);

    // Cleanup again — nothing to remove
    const removed2 = await inbox.cleanupConsumed("input", 10);
    expect(removed2).toBe(0);
  });
});
