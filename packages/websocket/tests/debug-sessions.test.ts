/**
 * The session registry behind the interactive run/debug endpoints: verdict
 * validation at submit time, and the lifetime guarantees that keep a run
 * nobody finishes from holding a session (and its cancel request) forever.
 */
import { describe, it, expect } from "vitest";
import type { Escalation, Verdict } from "@nodetool-ai/protocol";
import {
  debugSessions,
  InteractiveEscalationHandle,
  MAX_LIVE_SESSIONS_PER_USER,
  TooManyDebugSessionsError,
  type ParkedEscalation
} from "../src/debug-sessions.js";

function escalation(overrides: Partial<Escalation> = {}): Escalation {
  return {
    nodeId: "work",
    nodeType: "test.Fail",
    correlationLineage: [],
    invocationKey: "",
    allowedActions: ["substitute", "skip", "fail"],
    detail: "boom 42",
    inputs: {},
    declaredOutputs: { value: "str" },
    attempt: 1,
    spentCostUsd: 0,
    createdAssets: false,
    retrySafe: false,
    emitted: false,
    ...overrides
  };
}

/** Park an escalation on a fresh handle and return everything to assert on. */
function park(e: Escalation = escalation()): {
  handle: InteractiveEscalationHandle;
  controller: AbortController;
  parked: Promise<ParkedEscalation>;
  decided: Promise<{ verdict: Verdict }>;
} {
  const handle = new InteractiveEscalationHandle();
  const controller = new AbortController();
  const parked = new Promise<ParkedEscalation>((resolve) => {
    handle.subscribe(resolve);
  });
  const decided = handle.decide(e, controller.signal);
  return { handle, controller, parked, decided };
}

describe("InteractiveEscalationHandle.submit", () => {
  it("rejects a substitute payload that does not match the declared outputs", async () => {
    const { handle, parked, decided } = park();
    const { id } = await parked;

    const rejected = await handle.submit(id, {
      action: "substitute",
      outputs: { value: 42 }
    });
    expect(rejected?.error).toContain('output "value" must be a string');

    // The escalation is still parked, so the caller can answer again.
    expect(handle.current()?.id).toBe(id);

    const accepted = await handle.submit(id, {
      action: "substitute",
      outputs: { value: "repaired" }
    });
    expect(accepted).toBeNull();
    expect((await decided).verdict).toEqual({
      action: "substitute",
      outputs: { value: "repaired" }
    });
  });

  it("rejects a substitute that leaves a declared slot unfilled", async () => {
    const { handle, parked } = park(
      escalation({ declaredOutputs: { a: "str", b: "int" } })
    );
    const { id } = await parked;

    const rejected = await handle.submit(id, {
      action: "substitute",
      outputs: { a: "ok" }
    });
    expect(rejected?.error).toContain('output "b"');
    expect(handle.current()?.id).toBe(id);

    handle.close();
  });

  it("still rejects verdicts outside the allowed actions", async () => {
    const { handle, parked } = park(
      escalation({ allowedActions: ["skip", "fail"] })
    );
    const { id } = await parked;

    const rejected = await handle.submit(id, {
      action: "substitute",
      outputs: { value: "anything" }
    });
    expect(rejected?.error).toContain("not allowed");
    handle.close();
  });
});

describe("debug session lifetime", () => {
  it("force-settles a run that never finishes, and reports why", async () => {
    const session = debugSessions.create({
      userId: "lifetime-user",
      workflowId: "wf-1",
      jobId: "job-1",
      handle: new InteractiveEscalationHandle(),
      // A run whose promise never resolves — the leak this ceiling exists for.
      done: new Promise<Record<string, unknown>>(() => {}),
      cancel: () => {},
      maxLifetimeMs: 20
    });

    const event = await session.waitForEvent();
    expect(event.kind).toBe("done");
    if (event.kind !== "done") throw new Error("expected a done event");
    expect(event.report.status).toBe("failed");
    expect(String(event.report.error)).toContain("maximum session lifetime");
    expect(session.isLive()).toBe(false);
  });

  it("answers a cancel the run never acknowledges", async () => {
    let cancelled = false;
    const session = debugSessions.create({
      userId: "cancel-user",
      workflowId: "wf-2",
      jobId: "job-2",
      handle: new InteractiveEscalationHandle(),
      done: new Promise<Record<string, unknown>>(() => {}),
      cancel: () => {
        cancelled = true;
      },
      cancelWaitMs: 20
    });

    const report = await session.cancel();
    expect(cancelled).toBe(true);
    expect(report.status).toBe("failed");
    expect(String(report.error)).toContain("did not settle");
  });

  it("caps live sessions per user and frees the slot once one settles", async () => {
    const open = (
      done: Promise<Record<string, unknown>>
    ): ReturnType<typeof debugSessions.create> =>
      debugSessions.create({
        userId: "cap-user",
        workflowId: "wf-3",
        jobId: "job-3",
        handle: new InteractiveEscalationHandle(),
        done,
        cancel: () => {},
        cancelWaitMs: 10
      });

    const sessions = [];
    for (let i = 0; i < MAX_LIVE_SESSIONS_PER_USER; i++) {
      sessions.push(open(new Promise<Record<string, unknown>>(() => {})));
    }
    expect(debugSessions.liveCount("cap-user")).toBe(
      MAX_LIVE_SESSIONS_PER_USER
    );
    expect(() => open(Promise.resolve({ status: "completed" }))).toThrow(
      TooManyDebugSessionsError
    );

    // A settled session is not a live one: freeing a slot admits the next run.
    const first = sessions[0];
    if (!first) throw new Error("expected a session");
    await first.cancel();
    expect(debugSessions.liveCount("cap-user")).toBe(
      MAX_LIVE_SESSIONS_PER_USER - 1
    );
    const admitted = open(new Promise<Record<string, unknown>>(() => {}));
    expect(admitted.isLive()).toBe(true);

    for (const session of sessions.slice(1)) await session.cancel();
    await admitted.cancel();
  });
});
