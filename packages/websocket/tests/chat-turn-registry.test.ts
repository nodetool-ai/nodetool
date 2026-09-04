import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ChatTurnRegistry,
  type ChatTurnExecutionHooks
} from "../src/chat-turn-registry.js";

function makeHooks(): ChatTurnExecutionHooks & {
  cancelled: string[];
} {
  const cancelled: string[] = [];
  return {
    cancelled,
    resolveToolResult: vi.fn(),
    resolveApproval: vi.fn(),
    cancelPendingCalls: (threadId: string) => {
      cancelled.push(threadId);
    }
  };
}

function makeTarget() {
  const delivered: Array<Record<string, unknown>> = [];
  return {
    delivered,
    deliver: async (message: Record<string, unknown>) => {
      delivered.push(message);
    }
  };
}

describe("ChatTurnSession", () => {
  let registry: ChatTurnRegistry;

  beforeEach(() => {
    registry = new ChatTurnRegistry();
  });

  it("stamps emitted frames with increasing chat_seq and delivers to the attached target", async () => {
    const session = registry.open("u1", "t1", new AbortController(), makeHooks());
    const target = makeTarget();
    session.attach(target, session.lastSeq);

    session.emit({ type: "chunk", thread_id: "t1", content: "a" });
    session.emit({ type: "chunk", thread_id: "t1", content: "b" });
    await session.deliverReplay(target, []); // flush the delivery chain

    expect(target.delivered.map((m) => m.chat_seq)).toEqual([1, 2]);
    expect(target.delivered.map((m) => m.content)).toEqual(["a", "b"]);
  });

  it("buffers while detached and replays only the missed tail on attach", async () => {
    const session = registry.open("u1", "t1", new AbortController(), makeHooks());
    const target = makeTarget();
    session.attach(target, 0);
    session.emit({ type: "chunk", thread_id: "t1", content: "a" });
    await session.deliverReplay(target, []);

    session.detach(target);
    session.emit({ type: "chunk", thread_id: "t1", content: "b" });
    session.emit({ type: "chunk", thread_id: "t1", content: "c" });
    expect(target.delivered).toHaveLength(1);

    const reconnected = makeTarget();
    const { replay, incomplete } = session.attach(reconnected, 1);
    expect(incomplete).toBe(false);
    expect(replay.map((m) => m.content)).toEqual(["b", "c"]);

    // Live frames after reattach flow to the new target, after the replay.
    await session.deliverReplay(reconnected, replay);
    session.emit({ type: "chunk", thread_id: "t1", content: "d" });
    await session.deliverReplay(reconnected, []);
    expect(reconnected.delivered.map((m) => m.content)).toEqual(["b", "c", "d"]);
  });

  it("a guarded detach from a stale target does not clear a newer attachment", async () => {
    const session = registry.open("u1", "t1", new AbortController(), makeHooks());
    const oldTarget = makeTarget();
    session.attach(oldTarget, 0);
    const newTarget = makeTarget();
    session.attach(newTarget, session.lastSeq);

    session.detach(oldTarget);
    session.emit({ type: "chunk", thread_id: "t1", content: "x" });
    await session.deliverReplay(newTarget, []);
    expect(newTarget.delivered).toHaveLength(1);
  });

  it("reports an incomplete replay when the buffer evicted the requested tail", () => {
    process.env.NODETOOL_CHAT_REPLAY_BUFFER_EVENTS = "3";
    try {
      const session = registry.open(
        "u1",
        "t1",
        new AbortController(),
        makeHooks()
      );
      for (let i = 0; i < 5; i++) {
        session.emit({ type: "chunk", thread_id: "t1", content: String(i) });
      }
      const target = makeTarget();
      const { replay, incomplete } = session.attach(target, 1);
      expect(incomplete).toBe(true);
      expect(replay.map((m) => m.content)).toEqual(["2", "3", "4"]);
    } finally {
      delete process.env.NODETOOL_CHAT_REPLAY_BUFFER_EVENTS;
    }
  });

  it("opening a new turn supersedes and aborts the previous session for the thread", () => {
    const controller = new AbortController();
    const hooks = makeHooks();
    registry.open("u1", "t1", controller, hooks);
    const next = registry.open("u1", "t1", new AbortController(), makeHooks());

    expect(controller.signal.aborted).toBe(true);
    expect(hooks.cancelled).toEqual(["t1"]);
    expect(registry.get("u1", "t1")).toBe(next);
  });

  it("continues seq numbering across turns on the same thread", () => {
    const first = registry.open("u1", "t1", new AbortController(), makeHooks());
    first.emit({ type: "chunk", thread_id: "t1", content: "a" });
    first.emit({ type: "chunk", thread_id: "t1", content: "b" });
    first.finish();
    registry.drop(first);

    const second = registry.open("u1", "t1", new AbortController(), makeHooks());
    const stamped = second.emit({
      type: "chunk",
      thread_id: "t1",
      content: "c"
    });
    expect(stamped.chat_seq).toBe(3);
  });

  it("carries the abort reason into signal.reason", () => {
    const controller = new AbortController();
    const session = registry.open("u1", "t1", controller, makeHooks());
    session.abort("shutdown");
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBe("shutdown");
  });

  it("supersede aborts with the superseded reason", () => {
    const controller = new AbortController();
    registry.open("u1", "t1", controller, makeHooks());
    registry.open("u1", "t1", new AbortController(), makeHooks());
    expect(controller.signal.reason).toBe("superseded");
  });

  it("sessions are scoped per user", () => {
    const a = registry.open("u1", "t1", new AbortController(), makeHooks());
    expect(registry.get("u2", "t1")).toBeNull();
    expect(registry.get("u1", "t1")).toBe(a);
  });

  describe("drain", () => {
    it("counts only the turns still running", () => {
      const a = registry.open("u1", "t1", new AbortController(), makeHooks());
      registry.open("u1", "t2", new AbortController(), makeHooks());
      expect(registry.runningCount()).toBe(2);
      a.finish();
      expect(registry.runningCount()).toBe(1);
    });

    it("abortAll aborts every running turn with one reason", () => {
      const first = new AbortController();
      const second = new AbortController();
      registry.open("u1", "t1", first, makeHooks());
      const finished = registry.open("u2", "t2", second, makeHooks());
      finished.finish();

      expect(registry.abortAll("shutdown")).toBe(1);
      expect(first.signal.reason).toBe("shutdown");
      expect(second.signal.aborted).toBe(false);
    });

    it("drained resolves at once when nothing is running", async () => {
      await expect(registry.drained(0)).resolves.toBe(true);
    });

    it("drained resolves true once the last turn finishes", async () => {
      const session = registry.open(
        "u1",
        "t1",
        new AbortController(),
        makeHooks()
      );
      const drained = registry.drained(5000);
      session.finish();
      await expect(drained).resolves.toBe(true);
    });

    it("drained resolves false when the grace elapses first", async () => {
      registry.open("u1", "t1", new AbortController(), makeHooks());
      await expect(registry.drained(10)).resolves.toBe(false);
    });
  });

  describe("timers", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("aborts a running turn when the detach grace window elapses", () => {
      const controller = new AbortController();
      const session = registry.open("u1", "t1", controller, makeHooks());
      const target = makeTarget();
      session.attach(target, 0);
      session.detach(target);

      vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      expect(controller.signal.aborted).toBe(true);
    });

    it("does not abort while a target is attached", () => {
      const controller = new AbortController();
      const session = registry.open("u1", "t1", controller, makeHooks());
      const target = makeTarget();
      session.attach(target, 0);
      session.detach(target);
      session.attach(makeTarget(), session.lastSeq);

      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(controller.signal.aborted).toBe(false);
    });

    it("drops a finished session from the registry after the retention window", () => {
      const session = registry.open("u1", "t1", new AbortController(), makeHooks());
      session.finish();
      expect(registry.get("u1", "t1")).toBe(session);

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      expect(registry.get("u1", "t1")).toBeNull();
    });
  });
});
