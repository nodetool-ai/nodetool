/**
 * NodeInbox tests – parity with Python inbox behavior.
 *
 * Covers:
 *  - Per-handle FIFO ordering
 *  - Upstream source counting and EOS
 *  - iterInput / iterAny semantics
 *  - Backpressure (buffer limit)
 *  - Arrival-order multiplexing
 *  - isFullyDrained / hasPendingWork
 *  - closeAll
 */

import { describe, it, expect } from "vitest";
import { NodeInbox } from "../src/inbox.js";

// Helper: collect all items from an async generator
async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

// ---------------------------------------------------------------------------

describe("NodeInbox – basic FIFO", () => {
  it("yields items in put order for a single handle", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    await inbox.put("a", 1);
    await inbox.put("a", 2);
    await inbox.put("a", 3);
    inbox.markSourceDone("a");

    const items = await collect(inbox.iterInput("a"));
    expect(items).toEqual([1, 2, 3]);
  });

  it("iterInput completes after EOS", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("x", 1);

    await inbox.put("x", "hello");
    inbox.markSourceDone("x");

    const items = await collect(inbox.iterInput("x"));
    expect(items).toEqual(["hello"]);
  });
});

describe("NodeInbox – multiple upstream sources", () => {
  it("requires all sources to be done before EOS", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 2); // 2 upstream producers

    await inbox.put("a", 1);
    inbox.markSourceDone("a"); // first source done
    expect(inbox.isFullyDrained()).toBe(false);

    await inbox.put("a", 2);
    inbox.markSourceDone("a"); // second source done

    const items = await collect(inbox.iterInput("a"));
    expect(items).toEqual([1, 2]);
    expect(inbox.isFullyDrained()).toBe(true);
  });
});

describe("NodeInbox – iterAny", () => {
  it("yields items in arrival order across handles", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    await inbox.put("a", "a1");
    await inbox.put("b", "b1");
    await inbox.put("a", "a2");
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    const items = await collect(inbox.iterAny());
    expect(items).toEqual([
      ["a", "a1"],
      ["b", "b1"],
      ["a", "a2"]
    ]);
  });

  it("completes when all handles are drained", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("x", 1);

    await inbox.put("x", 42);
    inbox.markSourceDone("x");

    const items = await collect(inbox.iterAny());
    expect(items).toEqual([["x", 42]]);
    expect(inbox.isFullyDrained()).toBe(true);
  });
});

describe("NodeInbox – tryPopAny", () => {
  it("returns null when empty", () => {
    const inbox = new NodeInbox();
    expect(inbox.tryPopAny()).toBeNull();
  });

  it("pops the earliest item", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    await inbox.put("a", "first");
    await inbox.put("b", "second");

    const r1 = inbox.tryPopAny();
    expect(r1).toEqual(["a", "first"]);

    const r2 = inbox.tryPopAny();
    expect(r2).toEqual(["b", "second"]);

    expect(inbox.tryPopAny()).toBeNull();
  });
});

describe("NodeInbox – state queries", () => {
  it("hasAny returns true when data is buffered", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    expect(inbox.hasAny()).toBe(false);
    await inbox.put("a", 1);
    expect(inbox.hasAny()).toBe(true);
  });

  it("hasBuffered checks specific handle", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    await inbox.put("a", 1);
    expect(inbox.hasBuffered("a")).toBe(true);
    expect(inbox.hasBuffered("b")).toBe(false);
  });

  it("isOpen reflects upstream count", () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    expect(inbox.isOpen("a")).toBe(true);
    inbox.markSourceDone("a");
    expect(inbox.isOpen("a")).toBe(false);
  });

  it("hasPendingWork is inverse of isFullyDrained", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    expect(inbox.hasPendingWork()).toBe(true);
    expect(inbox.isFullyDrained()).toBe(false);

    await inbox.put("a", 1);
    inbox.markSourceDone("a");

    // Still has buffered data
    expect(inbox.hasPendingWork()).toBe(true);

    // Consume it
    inbox.tryPopAny();
    expect(inbox.isFullyDrained()).toBe(true);
    expect(inbox.hasPendingWork()).toBe(false);
  });
});

describe("NodeInbox – backpressure", () => {
  it("blocks put when buffer is at limit", async () => {
    const inbox = new NodeInbox(2); // limit = 2
    inbox.addUpstream("a", 1);

    await inbox.put("a", 1);
    await inbox.put("a", 2);

    // Third put should block until consumer drains
    let putResolved = false;
    const putPromise = inbox.put("a", 3).then(() => {
      putResolved = true;
    });

    // Not resolved yet
    await new Promise((r) => setTimeout(r, 50));
    expect(putResolved).toBe(false);

    // Consume one item to make room
    inbox.tryPopAny();

    // Now the put should resolve
    await putPromise;
    expect(putResolved).toBe(true);
  });

  it("drops the oldest buffered item when configured", async () => {
    const inbox = new NodeInbox({
      handlePolicies: {
        frame: { capacity: 2, overflowPolicy: "drop_oldest" }
      }
    });
    inbox.addUpstream("frame", 1);

    await inbox.put("frame", "f1");
    await inbox.put("frame", "f2");
    await inbox.put("frame", "f3");
    inbox.markSourceDone("frame");

    const items = await collect(inbox.iterInput("frame"));
    expect(items).toEqual(["f2", "f3"]);
    expect(inbox.getDroppedCount("frame")).toBe(1);
  });

  it("drops the newest item when configured", async () => {
    const inbox = new NodeInbox({
      handlePolicies: {
        frame: { capacity: 2, overflowPolicy: "drop_newest" }
      }
    });
    inbox.addUpstream("frame", 1);

    await inbox.put("frame", "f1");
    await inbox.put("frame", "f2");
    await inbox.put("frame", "f3");
    inbox.markSourceDone("frame");

    const items = await collect(inbox.iterInput("frame"));
    expect(items).toEqual(["f1", "f2"]);
    expect(inbox.getDroppedCounts()).toEqual({ frame: 1 });
  });

  it("applies per-handle policy without changing other handles", async () => {
    const inbox = new NodeInbox({
      bufferLimit: 2,
      handlePolicies: {
        fast: { capacity: 1, overflowPolicy: "drop_oldest" }
      }
    });
    inbox.addUpstream("fast", 1);
    inbox.addUpstream("slow", 1);

    await inbox.put("fast", "f1");
    await inbox.put("fast", "f2");
    await inbox.put("slow", "s1");
    await inbox.put("slow", "s2");
    inbox.markSourceDone("fast");
    inbox.markSourceDone("slow");

    expect(await collect(inbox.iterInput("fast"))).toEqual(["f2"]);
    expect(await collect(inbox.iterInput("slow"))).toEqual(["s1", "s2"]);
    expect(inbox.getDroppedCount("fast")).toBe(1);
    expect(inbox.getDroppedCount("slow")).toBe(0);
  });
});

describe("NodeInbox – closeAll", () => {
  it("unblocks waiting consumers", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    // Start consuming – will block because no data
    const consumePromise = collect(inbox.iterInput("a"));

    // Close after a small delay
    await new Promise((r) => setTimeout(r, 10));
    await inbox.closeAll();

    const items = await consumePromise;
    expect(items).toEqual([]);
  });
});

describe("NodeInbox – envelope metadata", () => {
  it("iterInputWithEnvelope yields envelopes with metadata", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    await inbox.put("a", "data", { key: "value" });
    inbox.markSourceDone("a");

    const envelopes = [];
    for await (const env of inbox.iterInputWithEnvelope("a")) {
      envelopes.push(env);
    }

    expect(envelopes).toHaveLength(1);
    expect(envelopes[0].data).toBe("data");
    expect(envelopes[0].metadata).toEqual({ key: "value" });
    expect(envelopes[0].event_id).toBeDefined();
    expect(envelopes[0].timestamp).toBeGreaterThan(0);
  });
});

describe("NodeInbox – prepend", () => {
  it("prepend puts envelope at front of buffer", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    await inbox.put("a", "second");

    inbox.prepend("a", {
      data: "first",
      metadata: {},
      timestamp: Date.now(),
      event_id: "test"
    });

    inbox.markSourceDone("a");
    const items = await collect(inbox.iterInput("a"));
    expect(items).toEqual(["first", "second"]);
  });
});
