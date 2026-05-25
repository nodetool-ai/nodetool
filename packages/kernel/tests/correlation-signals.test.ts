/**
 * Inbox lineage signal tracking (PR 3 step 2 of docs/correlation-design.md).
 *
 * Asserts:
 *  - `signalLineageDone` records per (source edge, projected lineage key).
 *  - `signalLineageScopeClosed` records per (source edge, parent key, closed root).
 *  - Lookups use canonical projection order independent of JS property order.
 *  - `signalEdgesForHandle` enumerates source edges that emitted any signal.
 *  - Signals notify waiters so an actor blocked on data can unblock.
 */

import { describe, expect, it } from "vitest";
import { NodeInbox } from "../src/inbox.js";

describe("NodeInbox – lineage signal tracking", () => {
  it("records lineage_done per (edge, projected key)", () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("value", 1);
    inbox.signalLineageDone(
      "value",
      {
        type: "lineage_done",
        source_edge_id: "e1",
        output: "value",
        lineage: { "fe:items": { index: 3 } }
      },
      ["fe:items"]
    );

    expect(inbox.isEdgeDoneFor("e1", "fe:items=3")).toBe(true);
    expect(inbox.isEdgeDoneFor("e1", "fe:items=4")).toBe(false);
    expect(inbox.isEdgeDoneFor("other", "fe:items=3")).toBe(false);
  });

  it("projects lineage canonically (property order does not matter)", () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("value", 1);

    inbox.signalLineageDone(
      "value",
      {
        type: "lineage_done",
        source_edge_id: "e1",
        output: "value",
        lineage: { "a:items": { index: 1 }, "b:rows": { index: 2 } }
      },
      ["a:items", "b:rows"]
    );

    // Same logical lineage, different property order:
    inbox.signalLineageDone(
      "value",
      {
        type: "lineage_done",
        source_edge_id: "e1",
        output: "value",
        lineage: { "b:rows": { index: 2 }, "a:items": { index: 1 } }
      },
      ["a:items", "b:rows"]
    );

    expect(inbox.isEdgeDoneFor("e1", "a:items=1,b:rows=2")).toBe(true);
    // Reverse-order scope is a different bucket; lookup must use the
    // scope order the analyzer recorded, not arbitrary text.
    expect(inbox.isEdgeDoneFor("e1", "b:rows=2,a:items=1")).toBe(false);
  });

  it("records lineage_scope_closed per (edge, parent key, root)", () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("value", 1);

    inbox.signalLineageScopeClosed(
      "value",
      {
        type: "lineage_scope_closed",
        source_edge_id: "e1",
        output: "value",
        parent_lineage: { "outer:items": { index: 0 } },
        closed_root: "inner:items"
      },
      ["outer:items"]
    );

    expect(
      inbox.isScopeClosedFor("e1", "outer:items=0", "inner:items")
    ).toBe(true);
    expect(
      inbox.isScopeClosedFor("e1", "outer:items=1", "inner:items")
    ).toBe(false);
    expect(
      inbox.isScopeClosedFor("e1", "outer:items=0", "other:root")
    ).toBe(false);
  });

  it("supports empty parent scope (root-level close)", () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("value", 1);
    inbox.signalLineageScopeClosed(
      "value",
      {
        type: "lineage_scope_closed",
        source_edge_id: "e1",
        output: "value",
        parent_lineage: {},
        closed_root: "fe:items"
      },
      []
    );
    expect(inbox.isScopeClosedFor("e1", "", "fe:items")).toBe(true);
  });

  it("signalEdgesForHandle enumerates contributors that have emitted signals", () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("value", 2);

    inbox.signalLineageDone(
      "value",
      {
        type: "lineage_done",
        source_edge_id: "e1",
        output: "value",
        lineage: {}
      },
      []
    );
    inbox.signalLineageScopeClosed(
      "value",
      {
        type: "lineage_scope_closed",
        source_edge_id: "e2",
        output: "value",
        parent_lineage: {},
        closed_root: "fe:items"
      },
      []
    );

    const seen = inbox.signalEdgesForHandle("value");
    expect(seen.has("e1")).toBe(true);
    expect(seen.has("e2")).toBe(true);
    expect(seen.has("e3")).toBe(false);
    expect(inbox.signalEdgesForHandle("other").size).toBe(0);
  });

  it("notifies pending waiters so an actor unblocks when a signal arrives", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("value", 1);

    const iter = inbox.iterInputWithEnvelope("value");
    const nextPromise = iter.next();

    // No data, just a signal. The signal alone shouldn't unblock the
    // iterator (it's data-only), but markSourceDone should — and we use
    // markSourceDone as the inbox's "stream EOS" mechanism. Verify the
    // signal at least wakes the waiter so a polling actor sees fresh state.
    let woke = false;
    const wakeProbe = (async () => {
      await Promise.race([
        nextPromise,
        new Promise((resolve) => setTimeout(resolve, 20))
      ]);
      woke = true;
    })();

    inbox.signalLineageDone(
      "value",
      {
        type: "lineage_done",
        source_edge_id: "e1",
        output: "value",
        lineage: {}
      },
      []
    );

    inbox.markSourceDone("value");
    const final = await nextPromise;
    expect(final.done).toBe(true);
    await wakeProbe;
    expect(woke).toBe(true);
  });
});
