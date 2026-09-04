import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  JobRunRegistry,
  type JobRunExecutionHooks
} from "../src/job-run-registry.js";

function makeHooks(): JobRunExecutionHooks & { cancels: number } {
  const state = { cancels: 0 };
  return {
    get cancels() {
      return state.cancels;
    },
    cancel: () => {
      state.cancels += 1;
    },
    pushInput: vi.fn().mockResolvedValue(undefined),
    finishInputStream: vi.fn(),
    updateNodeProperties: vi.fn().mockReturnValue(true)
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

describe("JobRunSession", () => {
  let registry: JobRunRegistry;

  beforeEach(() => {
    registry = new JobRunRegistry();
  });

  it("stamps emitted frames with increasing job_seq and delivers to the attached target", async () => {
    const session = registry.open("u1", "j1", "wf1", makeHooks());
    const target = makeTarget();
    session.attach(target, session.lastSeq);

    session.emit({ type: "node_update", job_id: "j1", node_id: "n1" });
    session.emit({ type: "node_update", job_id: "j1", node_id: "n2" });
    await session.deliverReplay(target, []); // flush the delivery chain

    expect(target.delivered.map((m) => m.job_seq)).toEqual([1, 2]);
    expect(target.delivered.map((m) => m.node_id)).toEqual(["n1", "n2"]);
  });

  it("buffers while detached and replays only the missed tail on attach", async () => {
    const session = registry.open("u1", "j1", "wf1", makeHooks());
    const target = makeTarget();
    session.attach(target, 0);
    session.emit({ type: "node_update", job_id: "j1", node_id: "n1" });
    await session.deliverReplay(target, []);

    session.detach(target);
    session.emit({ type: "node_update", job_id: "j1", node_id: "n2" });
    session.emit({ type: "job_update", job_id: "j1", status: "completed" });
    expect(target.delivered).toHaveLength(1);

    const reconnected = makeTarget();
    const { replay, incomplete } = session.attach(reconnected, 1);
    expect(incomplete).toBe(false);
    expect(replay.map((m) => m.type)).toEqual(["node_update", "job_update"]);

    await session.deliverReplay(reconnected, replay);
    session.emit({ type: "node_update", job_id: "j1", node_id: "n3" });
    await session.deliverReplay(reconnected, []);
    expect(reconnected.delivered).toHaveLength(3);
  });

  it("a guarded detach from a stale target does not clear a newer attachment", async () => {
    const session = registry.open("u1", "j1", "wf1", makeHooks());
    const oldTarget = makeTarget();
    session.attach(oldTarget, 0);
    const newTarget = makeTarget();
    session.attach(newTarget, session.lastSeq);

    session.detach(oldTarget);
    session.emit({ type: "node_update", job_id: "j1" });
    await session.deliverReplay(newTarget, []);
    expect(newTarget.delivered).toHaveLength(1);
  });

  it("a delivery that throws does not stall the chain", async () => {
    const session = registry.open("u1", "j1", "wf1", makeHooks());
    const dead = {
      deliver: async () => {
        throw new Error("socket closed");
      }
    };
    session.attach(dead, 0);
    session.emit({ type: "node_update", job_id: "j1" });

    const live = makeTarget();
    const { replay } = session.attach(live, 0);
    await session.deliverReplay(live, replay);
    expect(live.delivered).toHaveLength(1);
  });

  it("reports an incomplete replay when the buffer evicted the requested tail", () => {
    process.env.NODETOOL_JOB_REPLAY_BUFFER_EVENTS = "3";
    try {
      const session = registry.open("u1", "j1", "wf1", makeHooks());
      for (let i = 0; i < 5; i++) {
        session.emit({ type: "node_update", job_id: "j1", node_id: String(i) });
      }
      const target = makeTarget();
      const { replay, incomplete } = session.attach(target, 1);
      expect(incomplete).toBe(true);
      expect(replay.map((m) => m.node_id)).toEqual(["2", "3", "4"]);
    } finally {
      delete process.env.NODETOOL_JOB_REPLAY_BUFFER_EVENTS;
    }
  });

  it("records the run's terminal status on finish", () => {
    const session = registry.open("u1", "j1", "wf1", makeHooks());
    session.finish("completed");
    expect(session.status).toBe("finished");
    expect(session.terminalStatus).toBe("completed");
  });

  it("cancels a still-running session when its job id is reopened", () => {
    const first = makeHooks();
    registry.open("u1", "j1", "wf1", first);
    const second = registry.open("u1", "j1", "wf1", makeHooks());

    expect(first.cancels).toBe(1);
    expect(registry.get("u1", "j1")).toBe(second);
  });

  it("counts running runs per user and per workflow across sessions", () => {
    registry.open("u1", "j1", "wf1", makeHooks());
    registry.open("u1", "j2", "wf1", makeHooks());
    registry.open("u1", "j3", "wf2", makeHooks());
    const other = registry.open("u2", "j4", "wf1", makeHooks());

    expect(registry.countRunning("u1")).toBe(3);
    expect(registry.countRunningForWorkflow("u1", "wf1")).toBe(2);
    expect(registry.countRunning("u2")).toBe(1);

    // A finished run no longer occupies a slot.
    other.finish("completed");
    expect(registry.countRunning("u2")).toBe(0);
    expect(registry.countRunningForWorkflow("u2", "wf1")).toBe(0);
  });

  it("keys on the full user id even when it contains a space", () => {
    const a = registry.open("u 1", "j1", "wf1", makeHooks());
    const b = registry.open("u", "1 j1", "wf1", makeHooks());
    expect(registry.get("u 1", "j1")).toBe(a);
    expect(registry.get("u", "1 j1")).toBe(b);
  });

  it("sessions are scoped per user and per job", () => {
    const a = registry.open("u1", "j1", "wf1", makeHooks());
    expect(registry.get("u2", "j1")).toBeNull();
    expect(registry.get("u1", "j2")).toBeNull();
    expect(registry.get("u1", "j1")).toBe(a);
  });

  describe("drain", () => {
    it("counts and cancels only the runs still executing", () => {
      const first = makeHooks();
      registry.open("u1", "j1", "wf1", first);
      const finished = registry.open("u1", "j2", "wf1", makeHooks());
      finished.finish("completed");

      expect(registry.runningCount()).toBe(1);
      expect(registry.cancelAll()).toBe(1);
      expect(first.cancels).toBe(1);
    });

    it("drained resolves true once the last run finishes", async () => {
      const session = registry.open("u1", "j1", "wf1", makeHooks());
      const drained = registry.drained(5000);
      session.finish("completed");
      await expect(drained).resolves.toBe(true);
    });

    it("drained resolves false when the grace elapses first", async () => {
      registry.open("u1", "j1", "wf1", makeHooks());
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

    it("cancels a running job when the detach grace window elapses", () => {
      const hooks = makeHooks();
      const session = registry.open("u1", "j1", "wf1", hooks);
      const target = makeTarget();
      session.attach(target, 0);
      session.detach(target);

      vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      expect(hooks.cancels).toBe(1);
    });

    it("does not cancel while a target is attached", () => {
      const hooks = makeHooks();
      const session = registry.open("u1", "j1", "wf1", hooks);
      const target = makeTarget();
      session.attach(target, 0);
      session.detach(target);
      session.attach(makeTarget(), session.lastSeq);

      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(hooks.cancels).toBe(0);
    });

    it("does not cancel a finished job left detached", () => {
      const hooks = makeHooks();
      const session = registry.open("u1", "j1", "wf1", hooks);
      session.finish("completed");
      session.detach();

      vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      expect(hooks.cancels).toBe(0);
    });

    it("drops a finished session from the registry after the retention window", () => {
      const session = registry.open("u1", "j1", "wf1", makeHooks());
      session.finish("completed");
      expect(registry.get("u1", "j1")).toBe(session);

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      expect(registry.get("u1", "j1")).toBeNull();
    });
  });
});
