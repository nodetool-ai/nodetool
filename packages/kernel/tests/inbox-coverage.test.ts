/**
 * Additional NodeInbox tests for coverage:
 *  - iterAnyWithEnvelope
 *  - put to unregistered handle (auto-create)
 *  - backpressure with closeAll
 *  - prepend to nonexistent handle
 *  - markSourceDone when count is already 0
 */

import { describe, it, expect } from "vitest";
import { NodeInbox, fallbackUuidV4 } from "../src/inbox.js";
import { EMPTY_LINEAGE } from "@nodetool-ai/protocol";
import type { LineageDone, LineageScopeClosed } from "@nodetool-ai/protocol";

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

describe("NodeInbox – iterAnyWithEnvelope", () => {
  it("yields (handle, envelope) tuples in arrival order", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    await inbox.put("a", "data-a", { metadata: { source: "node1" } });
    await inbox.put("b", "data-b", { metadata: { source: "node2" } });
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    const items = await collect(inbox.iterAnyWithEnvelope());

    expect(items).toHaveLength(2);
    expect(items[0][0]).toBe("a");
    expect(items[0][1].data).toBe("data-a");
    expect(items[0][1].metadata).toEqual({ source: "node1" });
    expect(items[0][1].event_id).toBeTruthy();
    expect(items[0][1].timestamp).toBeGreaterThan(0);

    expect(items[1][0]).toBe("b");
    expect(items[1][1].data).toBe("data-b");
  });

  it("completes when all handles are drained", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("x", 1);

    await inbox.put("x", 42);
    inbox.markSourceDone("x");

    const items = await collect(inbox.iterAnyWithEnvelope());
    expect(items).toHaveLength(1);
    expect(items[0][0]).toBe("x");
    expect(items[0][1].data).toBe(42);
  });

  it("completes when inbox is closed", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const consumePromise = collect(inbox.iterAnyWithEnvelope());

    await new Promise((r) => setTimeout(r, 10));
    await inbox.closeAll();

    const items = await consumePromise;
    expect(items).toEqual([]);
  });
});

describe("NodeInbox – iterAnyWithEnvelope waiting for async data", () => {
  it("waits for data when nothing is buffered yet", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    // Start consuming before data is available
    const items: Array<[string, unknown]> = [];
    const consumePromise = (async () => {
      for await (const [handle, envelope] of inbox.iterAnyWithEnvelope()) {
        items.push([handle, envelope.data]);
      }
    })();

    // Wait a tick then provide data
    await new Promise((r) => setTimeout(r, 10));
    await inbox.put("a", "delayed-data");
    inbox.markSourceDone("a");

    await consumePromise;

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(["a", "delayed-data"]);
  });
});

describe("NodeInbox – tryPopAnyWithEnvelope stale entries", () => {
  it("skips stale arrival entries in envelope mode", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    await inbox.put("a", "a1");
    await inbox.put("b", "b1");

    // Pop first using tryPopAnyWithEnvelope
    const popped1 = inbox.tryPopAnyWithEnvelope();
    expect(popped1).not.toBeNull();
    expect(popped1![0]).toBe("a");
    expect(popped1![1].data).toBe("a1");

    const popped2 = inbox.tryPopAnyWithEnvelope();
    expect(popped2).not.toBeNull();
    expect(popped2![0]).toBe("b");
    expect(popped2![1].data).toBe("b1");

    expect(inbox.tryPopAnyWithEnvelope()).toBeNull();
  });
});

describe("NodeInbox – auto-create handle on put", () => {
  it("creates buffer for unregistered handle", async () => {
    const inbox = new NodeInbox();
    // No addUpstream call, put to unknown handle
    await inbox.put("unknown", "value");

    expect(inbox.hasBuffered("unknown")).toBe(true);
    const popped = inbox.tryPopAny();
    expect(popped).toEqual(["unknown", "value"]);
  });
});

describe("NodeInbox – backpressure with closeAll", () => {
  it("unblocks put waiters when closed", async () => {
    const inbox = new NodeInbox(1); // buffer limit 1
    inbox.addUpstream("a", 1);

    await inbox.put("a", 1); // fills buffer

    let putResolved = false;
    const putPromise = inbox.put("a", 2).then(() => {
      putResolved = true;
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(putResolved).toBe(false);

    // Close should unblock the put
    await inbox.closeAll();
    await putPromise;
    expect(putResolved).toBe(true);
  });

  it("rejects writes after close", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    await inbox.closeAll();
    await inbox.put("a", "should-be-ignored");

    expect(inbox.hasBuffered("a")).toBe(false);
  });
});

describe("NodeInbox – prepend edge cases", () => {
  it("prepend to nonexistent handle does nothing", () => {
    const inbox = new NodeInbox();
    // Should not throw
    inbox.prepend("nonexistent", {
      data: "test",
      metadata: {},
      timestamp: Date.now(),
      event_id: "test-id"
    });
    expect(inbox.hasAny()).toBe(false);
  });
});

describe("NodeInbox – markSourceDone edge cases", () => {
  it("markSourceDone when count is already 0 does not go negative", () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.markSourceDone("a");
    inbox.markSourceDone("a"); // extra call
    expect(inbox.isOpen("a")).toBe(false);
  });

  it("markSourceDone on unregistered handle does nothing", () => {
    const inbox = new NodeInbox();
    inbox.markSourceDone("unknown"); // should not throw
    expect(inbox.isOpen("unknown")).toBe(false);
  });
});

describe("NodeInbox – iterAny waiting for async data (lines 228-229)", () => {
  it("waits for data when nothing is buffered in iterAny", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const items: Array<[string, unknown]> = [];
    const consumePromise = (async () => {
      for await (const [handle, data] of inbox.iterAny()) {
        items.push([handle, data]);
      }
    })();

    // Wait a tick then provide data
    await new Promise((r) => setTimeout(r, 10));
    await inbox.put("a", "delayed");
    inbox.markSourceDone("a");

    await consumePromise;

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(["a", "delayed"]);
  });
});

describe("NodeInbox – iterInputWithEnvelope waiting for async data (lines 210-211)", () => {
  it("waits for data when nothing is buffered in iterInputWithEnvelope", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const items: Array<{ data: unknown }> = [];
    const consumePromise = (async () => {
      for await (const env of inbox.iterInputWithEnvelope("a")) {
        items.push({ data: env.data });
      }
    })();

    await new Promise((r) => setTimeout(r, 10));
    await inbox.put("a", "delayed-envelope");
    inbox.markSourceDone("a");

    await consumePromise;

    expect(items).toHaveLength(1);
    expect(items[0].data).toBe("delayed-envelope");
  });
});

describe("NodeInbox – tryPopAnyWithEnvelope stale arrival skip (lines 276-278)", () => {
  it("skips stale arrival entries when buffer was consumed by iterInput", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    await inbox.put("a", "a1");
    await inbox.put("b", "b1");

    // Consume "a" via iterInput (drains buffer but leaves stale arrival entry)
    const gen = inbox.iterInput("a");
    const next = await gen.next();
    expect(next.value).toBe("a1");
    inbox.markSourceDone("a");

    // Now tryPopAnyWithEnvelope should skip stale "a" entry and find "b"
    const result = inbox.tryPopAnyWithEnvelope();
    expect(result).not.toBeNull();
    expect(result![0]).toBe("b");
    expect(result![1].data).toBe("b1");
  });
});

describe("NodeInbox – tryPopAnyWithEnvelope stale skip via iterInput drain", () => {
  it("skips stale arrivals after iterInput consumed buffer items", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    // Put items to both handles (creates arrival entries for both)
    await inbox.put("a", "val-a");
    await inbox.put("b", "val-b");

    // Drain "a" buffer via iterInput (but stale "a" arrival entry remains)
    const gen = inbox.iterInput("a");
    const first = await gen.next();
    expect(first.value).toBe("val-a");
    inbox.markSourceDone("a");

    // Now tryPopAnyWithEnvelope should encounter stale "a" (buffer empty)
    // and skip to "b"
    const result = inbox.tryPopAnyWithEnvelope();
    expect(result).not.toBeNull();
    expect(result![0]).toBe("b");
    expect(result![1].data).toBe("val-b");

    // No more items
    expect(inbox.tryPopAnyWithEnvelope()).toBeNull();
  });
});

describe("NodeInbox – hasBuffered for unregistered handle", () => {
  it("returns false for handle with no buffer", () => {
    const inbox = new NodeInbox();
    expect(inbox.hasBuffered("nonexistent")).toBe(false);
  });
});

describe("NodeInbox – tryPopAnyWithEnvelope stale entries", () => {
  it("skips stale arrival entries", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);

    await inbox.put("a", "a1");
    await inbox.put("b", "b1");

    // Pop from specific handle buffer directly to create stale arrival entry
    const popped1 = inbox.tryPopAny();
    expect(popped1).toEqual(["a", "a1"]);

    const popped2 = inbox.tryPopAny();
    expect(popped2).toEqual(["b", "b1"]);

    expect(inbox.tryPopAny()).toBeNull();
  });
});

describe("NodeInbox – addUpstream re-registration", () => {
  it("re-registering upstream does not clear an existing buffer", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("h", 1);
    await inbox.put("h", "x");
    inbox.addUpstream("h", 1); // must NOT reset the buffer to []
    expect(inbox.hasBuffered("h")).toBe(true);
    expect(inbox.tryPopAny()).toEqual(["h", "x"]);
  });
});

describe("NodeInbox – close during backpressure", () => {
  it("does not enqueue a value after the inbox closes mid-backpressure", async () => {
    const inbox = new NodeInbox(1); // bufferLimit 1
    inbox.addUpstream("h", 1);
    await inbox.put("h", "a"); // buffer now full: [a]
    const blocked = inbox.put("h", "b"); // blocks on backpressure
    await inbox.closeAll();
    await blocked; // resolves without enqueuing "b"
    expect(inbox.tryPopAny()).toEqual(["h", "a"]);
    expect(inbox.tryPopAny()).toBeNull(); // "b" was dropped
  });
});

describe("NodeInbox – markSourceDone lower bound", () => {
  it("does not drive the open count below zero", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("h", 1);
    inbox.markSourceDone("h"); // -> 0
    inbox.markSourceDone("h"); // extra: must stay at 0, not -1
    // If the count went negative the handle would never reach EOS and the
    // iterator would hang; bound the wait so a regression fails fast.
    const drained = (async () => {
      for await (const item of inbox.iterInput("h")) {
        void item;
      }
      return "done";
    })();
    const result = await Promise.race([
      drained,
      new Promise((r) => setTimeout(() => r("timeout"), 100))
    ]);
    expect(result).toBe("done");
  });
});

describe("NodeInbox – arrival-queue cleanup", () => {
  it("drops a consumed handle from the arrival queue, preserving order", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("h", 2);
    inbox.addUpstream("g", 1);
    await inbox.put("h", "a");
    await inbox.put("g", "b");

    const gen = inbox.iterInputWithEnvelope("h");
    await gen.next(); // consumes "a" -> h removed from arrival

    await inbox.put("h", "c"); // h re-enqueued at the tail
    const order: string[] = [];
    order.push(inbox.tryPopAny()![0]);
    order.push(inbox.tryPopAny()![0]);
    expect(order).toEqual(["g", "h"]);
  });
});

describe("NodeInbox – lineage signals", () => {
  it("projects an unprojectable lineage_done to the empty key", () => {
    const inbox = new NodeInbox();
    const signal: LineageDone = {
      type: "lineage_done",
      source_edge_id: "e1",
      output: "out",
      lineage: EMPTY_LINEAGE
    };
    // scope needs root "r" but the lineage lacks it -> projects to "".
    inbox.signalLineageDone("h", signal, ["r"]);
    expect(inbox.isEdgeDoneFor("e1", "")).toBe(true);
  });

  it("projects an unprojectable lineage_scope_closed to the empty parent key", () => {
    const inbox = new NodeInbox();
    const signal: LineageScopeClosed = {
      type: "lineage_scope_closed",
      source_edge_id: "e1",
      output: "out",
      parent_lineage: EMPTY_LINEAGE,
      closed_root: "root1"
    };
    inbox.signalLineageScopeClosed("h", signal, ["p"]);
    expect(inbox.isScopeClosedFor("e1", "", "root1")).toBe(true);
  });

  it("records multiple closed roots for the same edge and key", () => {
    const inbox = new NodeInbox();
    const mk = (root: string): LineageScopeClosed => ({
      type: "lineage_scope_closed",
      source_edge_id: "e1",
      output: "out",
      parent_lineage: EMPTY_LINEAGE,
      closed_root: root
    });
    inbox.signalLineageScopeClosed("h", mk("r1"), []);
    inbox.signalLineageScopeClosed("h", mk("r2"), []);
    expect(inbox.isScopeClosedFor("e1", "", "r1")).toBe(true);
    expect(inbox.isScopeClosedFor("e1", "", "r2")).toBe(true);
  });

  it("isScopeClosedFor returns false for an unknown edge", () => {
    const inbox = new NodeInbox();
    expect(inbox.isScopeClosedFor("nope", "k", "r")).toBe(false);
  });
});

describe("fallbackUuidV4", () => {
  it("builds an RFC4122 v4 string from the random source", () => {
    // r = (0.1 * 16) | 0 = 1: x-slots -> 1, the y-slot -> (1 & 0x3) | 0x8 = 9.
    expect(fallbackUuidV4(() => 0.1)).toBe(
      "11111111-1111-4111-9111-111111111111"
    );
    // r = (0.7 * 16) | 0 = 11: every slot -> hex "b" (pins toString(16)).
    expect(fallbackUuidV4(() => 0.7)).toBe(
      "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"
    );
  });

  it("stamps a unique UUID event_id on each put", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("h", 1);
    await inbox.put("h", "x");
    await inbox.put("h", "y");
    const e1 = inbox.tryPopAnyWithEnvelope()!;
    const e2 = inbox.tryPopAnyWithEnvelope()!;
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(e1[1].event_id).toMatch(uuidRe);
    expect(e2[1].event_id).not.toBe(e1[1].event_id);
  });
});
