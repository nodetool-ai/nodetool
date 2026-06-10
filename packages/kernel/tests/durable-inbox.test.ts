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

describe("DurableInbox.generateMessageId (FNV-1a)", () => {
  it("is a deterministic 16-hex hash of the addressing tuple", () => {
    expect(DurableInbox.generateMessageId("r1", "n1", "in", 1)).toBe(
      "c3cf677587e8ffb4"
    );
  });

  it("zero-pads the first 32-bit half to 8 hex digits", () => {
    const id = DurableInbox.generateMessageId("r", "n", "h", 3);
    expect(id).toBe("0b48aa68a683a153");
    expect(id).toHaveLength(16);
  });

  it("zero-pads the second 32-bit half to 8 hex digits", () => {
    const id = DurableInbox.generateMessageId("run-1", "node-1", "input", 28);
    expect(id).toBe("d14ecf0a0ce9efa9");
    expect(id).toHaveLength(16);
  });

  it("second half depends on content, not just length (ASCII input)", () => {
    // Regression: the old two-half FNV only fed the high byte (always 0
    // for ASCII) into the second state, collapsing it to a length tag.
    const a = DurableInbox.generateMessageId("r1", "n1", "in", 1);
    const b = DurableInbox.generateMessageId("r1", "n1", "in", 2);
    expect(a.slice(8)).not.toBe(b.slice(8));
  });
});

describe("MemoryDurableInboxStore — queries", () => {
  const mk = (over: Partial<import("../src/durable-inbox.js").DurableMessage>) => ({
    id: over.messageId ?? "x",
    runId: "r1",
    nodeId: "n1",
    handle: "h",
    messageId: over.messageId ?? "x",
    seq: 1,
    payload: null,
    status: "pending" as const,
    createdAt: new Date(),
    ...over
  });

  it("findPending filters by run/node/handle/status and sorts by seq", async () => {
    const store = new MemoryDurableInboxStore();
    await store.save(mk({ messageId: "a", seq: 2 }));
    await store.save(mk({ messageId: "b", seq: 1 }));
    await store.save(mk({ messageId: "c", runId: "r2", seq: 1 }));
    await store.save(mk({ messageId: "d", nodeId: "n2", seq: 1 }));
    await store.save(mk({ messageId: "e", handle: "other", seq: 1 }));
    await store.save(mk({ messageId: "f", status: "consumed", seq: 1 }));

    const res = await store.findPending("r1", "n1", "h", 100);
    expect(res.map((m) => m.messageId)).toEqual(["b", "a"]); // seq-sorted, only matching
  });

  it("findPending honours minSeq and limit", async () => {
    const store = new MemoryDurableInboxStore();
    await store.save(mk({ messageId: "s1", seq: 1 }));
    await store.save(mk({ messageId: "s2", seq: 2 }));
    await store.save(mk({ messageId: "s3", seq: 3 }));

    expect(
      (await store.findPending("r1", "n1", "h", 100, 2)).map((m) => m.messageId)
    ).toEqual(["s2", "s3"]);
    expect(
      (await store.findPending("r1", "n1", "h", 1)).map((m) => m.messageId)
    ).toEqual(["s1"]);
  });

  it("getMaxSeq returns the largest matching seq, or 0 when none match", async () => {
    const store = new MemoryDurableInboxStore();
    await store.save(mk({ messageId: "a", seq: 5 }));
    await store.save(mk({ messageId: "b", seq: 3 }));
    await store.save(mk({ messageId: "c", runId: "r2", seq: 99 }));

    expect(await store.getMaxSeq("r1", "n1", "h")).toBe(5);
    expect(await store.getMaxSeq("r1", "n1", "missing")).toBe(0); // handle filter
    expect(await store.getMaxSeq("r1", "missing", "h")).toBe(0); // nodeId filter
    expect(await store.getMaxSeq("missing", "n1", "h")).toBe(0); // runId filter
  });

  it("markConsumed targets the matching message and is a no-op for unknown ids", async () => {
    const store = new MemoryDurableInboxStore();
    await store.save(mk({ messageId: "a", seq: 1 }));
    await store.save(mk({ messageId: "b", seq: 2 }));

    await store.markConsumed("b");
    expect((await store.findByMessageId("b"))!.status).toBe("consumed");
    expect((await store.findByMessageId("a"))!.status).toBe("pending");
    await expect(store.markConsumed("nope")).resolves.toBeUndefined();
  });

  it("deleteConsumed removes only matching consumed messages strictly below the seq", async () => {
    const store = new MemoryDurableInboxStore();
    await store.save(mk({ messageId: "a", seq: 1, status: "consumed" })); // removed
    await store.save(mk({ messageId: "boundary", seq: 3, status: "consumed" })); // kept (not < 3)
    await store.save(mk({ messageId: "high", seq: 5, status: "consumed" })); // kept (>= 3)
    await store.save(mk({ messageId: "pend", seq: 1, status: "pending" })); // kept (pending)
    await store.save(mk({ messageId: "otherRun", runId: "r2", seq: 1, status: "consumed" })); // kept
    await store.save(mk({ messageId: "otherNode", nodeId: "n2", seq: 1, status: "consumed" })); // kept
    await store.save(mk({ messageId: "otherHandle", handle: "x", seq: 1, status: "consumed" })); // kept

    const removed = await store.deleteConsumed("r1", "n1", "h", 3);
    expect(removed).toBe(1);
    expect(await store.findByMessageId("a")).toBeNull();
    expect(await store.findByMessageId("boundary")).not.toBeNull();
    expect(await store.findByMessageId("high")).not.toBeNull();
    expect(await store.findByMessageId("pend")).not.toBeNull();
    expect(await store.findByMessageId("otherRun")).not.toBeNull();
    expect(await store.findByMessageId("otherNode")).not.toBeNull();
    expect(await store.findByMessageId("otherHandle")).not.toBeNull();
  });
});
