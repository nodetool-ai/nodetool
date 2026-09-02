/**
 * ChatTurnHandler turn lifecycle: the seq/abort pair `beginTurn` hands out,
 * supersede-by-new-turn, `cancel`/`endTurn` controller bookkeeping, the
 * permission-mode switch, and provider-call cost logging. All through the
 * public surface, against {@link FakeClientSession}.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb, Prediction } from "@nodetool-ai/models";
import { makeChatTurnHarness, fakeProvider } from "./chat-turn-test-harness.js";

describe("turn lifecycle", () => {
  it("beginTurn aborts the previous turn and bumps the seq", () => {
    const { handler } = makeChatTurnHarness();
    const t1 = handler.beginTurn();
    expect(t1.signal.aborted).toBe(false);
    const t2 = handler.beginTurn();
    expect(t1.signal.aborted).toBe(true);
    expect(t2.signal.aborted).toBe(false);
    expect(t2.seq).toBe(t1.seq + 1);
    expect(handler.currentRequestSeq).toBe(t2.seq);
  });

  it("bumpRequestSeq advances the seq without aborting the live turn", () => {
    const { handler } = makeChatTurnHarness();
    const t1 = handler.beginTurn();
    handler.bumpRequestSeq();
    expect(handler.currentRequestSeq).toBe(t1.seq + 1);
    expect(t1.signal.aborted).toBe(false);
  });

  it("cancel aborts the in-flight turn and is idempotent", () => {
    const { handler } = makeChatTurnHarness();
    const t1 = handler.beginTurn();
    handler.cancel();
    expect(t1.signal.aborted).toBe(true);
    // Second cancel with no live controller must not throw.
    handler.cancel();
  });

  it("endTurn retires only the current controller", () => {
    const { handler } = makeChatTurnHarness();
    const t1 = handler.beginTurn();
    const t2 = handler.beginTurn();
    // Retiring the superseded turn's controller must not clear the live one:
    // a later Stop still has to abort turn 2.
    handler.endTurn(t1.controller);
    handler.cancel();
    expect(t2.signal.aborted).toBe(true);
  });

  it("endTurn on the current controller makes a later cancel a no-op", () => {
    const { handler } = makeChatTurnHarness();
    const t1 = handler.beginTurn();
    handler.endTurn(t1.controller);
    handler.cancel();
    // The turn finished on its own; nothing was left to abort.
    expect(t1.signal.aborted).toBe(false);
  });
});

describe("permission mode and tool results", () => {
  it("switching a thread to auto releases every approval waiting on it", async () => {
    const { handler, approvalBridge } = makeChatTurnHarness();
    const waiting = approvalBridge.createWaiter("appr_1", 0, "thread-a");
    const otherThread = approvalBridge.createWaiter("appr_2", 0, "thread-b");

    handler.setPermissionMode("thread-a", "auto");

    await expect(waiting).resolves.toEqual({ decision: "allow" });
    // The other thread's approval is untouched.
    let settled = false;
    void otherThread.then(() => {
      settled = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);
    approvalBridge.resolveResult("appr_2", { decision: "deny" });
    await otherThread;
  });

  it("switching to default releases nothing", async () => {
    const { handler, approvalBridge } = makeChatTurnHarness();
    const waiting = approvalBridge.createWaiter("appr_1", 0, "thread-a");
    handler.setPermissionMode("thread-a", "default");
    let settled = false;
    void waiting.then(() => {
      settled = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);
    approvalBridge.resolveResult("appr_1", { decision: "deny" });
    await waiting;
  });

  it("resolveToolResult resolves the matching tool bridge waiter", async () => {
    const { handler, toolBridge } = makeChatTurnHarness();
    const waiting = toolBridge.createWaiter("call_9", 0);
    handler.resolveToolResult("call_9", { result: 42 });
    await expect(waiting).resolves.toEqual({ result: 42 });
  });
});

describe("_logProviderCall", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("writes a priced row for a completed call", async () => {
    const { handler } = makeChatTurnHarness();
    await handler._logProviderCall(
      "1",
      fakeProvider({ cost: 0.42 }),
      "mock",
      "m1",
      "wf-1",
      "proj-1"
    );
    const [rows] = await Prediction.paginate("1", { provider: "mock" });
    expect(rows).toHaveLength(1);
    expect(rows[0].cost).toBeCloseTo(0.42);
    expect(rows[0].model).toBe("m1");
    expect(rows[0].workflow_id).toBe("wf-1");
    expect(rows[0].project_id).toBe("proj-1");
  });

  it("records an unpriced call as a null cost, never zero", async () => {
    const { handler } = makeChatTurnHarness();
    await handler._logProviderCall(
      "1",
      fakeProvider({ cost: 0, unpricedReason: "no catalog entry" }),
      "mock",
      "m1",
      null,
      null
    );
    const [rows] = await Prediction.paginate("1", { provider: "mock" });
    expect(rows).toHaveLength(1);
    expect(rows[0].cost).toBeNull();
    expect(rows[0].metadata).toEqual({ unpriced_reason: "no catalog entry" });
  });

  it("writes nothing when provider or model is missing", async () => {
    const { handler } = makeChatTurnHarness();
    await handler._logProviderCall(
      "1",
      fakeProvider({ cost: 1 }),
      "",
      "m1",
      null,
      null
    );
    await handler._logProviderCall(
      "1",
      fakeProvider({ cost: 1 }),
      "mock",
      "",
      null,
      null
    );
    const [rows] = await Prediction.paginate("1", {});
    expect(rows).toHaveLength(0);
  });

  it("swallows a provider whose cost accessor throws", async () => {
    const { handler } = makeChatTurnHarness();
    const explosive = fakeProvider({});
    Object.defineProperty(explosive, "cost", {
      get() {
        throw new TypeError("no cost here");
      }
    });
    // Best-effort contract: never throws.
    await handler._logProviderCall("1", explosive, "mock", "m1", null, null);
    const generic = fakeProvider({});
    Object.defineProperty(generic, "cost", {
      get() {
        throw new Error("ledger offline");
      }
    });
    await handler._logProviderCall("1", generic, "mock", "m1", null, null);
    const [rows] = await Prediction.paginate("1", {});
    expect(rows).toHaveLength(0);
  });
});
