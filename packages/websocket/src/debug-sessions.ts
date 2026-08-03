/**
 * Interactive escalation sessions for the agent-facing run/debug endpoints.
 *
 * The supervisor design (docs/workflow-supervisor-design.md) puts an LLM agent
 * on a run's failure path. This module puts the *calling* agent there instead:
 * `InteractiveEscalationHandle` is a `SupervisorHandle` whose `decide()` parks
 * the escalation until a verdict arrives over HTTP, so the tool that started
 * the run gets the problem back as its result and answers with one of the
 * same verdicts the supervisor vocabulary defines. The kernel's guarantees are
 * untouched — the handle is wrapped in `BoundedHandle` (decision/retry caps,
 * timeout, sticky verdicts) and the actor still enforces `allowedActions`.
 *
 * A session is one run: the parked escalations, the run's completion promise,
 * and the final report. Sessions are owned by the user who started the run and
 * are swept a few minutes after the run settles.
 *
 * Long-running work that is not a workflow run uses the same registry for its
 * polling and cancel — `POST /api/applications/build` fronts a build this way,
 * with a null `workflowId` and a handle nothing ever escalates to.
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import { validateSubstituteOutputs } from "@nodetool-ai/kernel";
import type { DecisionOutcome, SupervisorHandle } from "@nodetool-ai/kernel";
import type { Escalation, Verdict } from "@nodetool-ai/protocol";

const log = createLogger("nodetool.websocket.debug-sessions");

/** How long an agent gets to answer one escalation before it fails closed. */
export const INTERACTIVE_DECISION_TIMEOUT_MS = 10 * 60_000;

/** How long a settled session's report stays fetchable. */
const SESSION_DONE_TTL_MS = 10 * 60_000;

/**
 * Hard ceiling on a session's life. The TTL sweep only arms once a run
 * settles, so a run whose `done` never resolves — a wedged bridge, a promise
 * nobody rejects — used to hold its session (and the run behind it) forever.
 */
export const SESSION_MAX_LIFETIME_MS = 60 * 60_000;

/** How long `cancel()` waits for the run to settle before answering anyway. */
export const CANCEL_SETTLE_TIMEOUT_MS = 30_000;

/** Live (unsettled) sessions one user may hold at once. */
export const MAX_LIVE_SESSIONS_PER_USER = 8;

const FAIL_CLOSED: DecisionOutcome = {
  verdict: { action: "fail" },
  decidedBy: "default"
};

interface PendingEscalation {
  id: string;
  escalation: Escalation;
  settle: (outcome: DecisionOutcome) => void;
}

/** What escalation subscribers see: the record, never the settle handle. */
export interface ParkedEscalation {
  id: string;
  escalation: Escalation;
}

/**
 * A `SupervisorHandle` that answers nothing itself: each `decide()` parks the
 * escalation until `submit()` delivers a verdict (or the decision signal
 * aborts, which fails closed). `BoundedHandle` serializes decisions, so at
 * most one escalation is pending at a time.
 */
export class InteractiveEscalationHandle implements SupervisorHandle {
  private _pending: PendingEscalation | null = null;
  private _waiters: Array<(entry: ParkedEscalation) => void> = [];
  private _counter = 0;
  private _closed = false;

  decide(e: Escalation, signal: AbortSignal): Promise<DecisionOutcome> {
    if (this._closed || signal.aborted) return Promise.resolve(FAIL_CLOSED);
    return new Promise((resolve) => {
      let settled = false;
      const entry: PendingEscalation = {
        id: `esc-${++this._counter}`,
        escalation: e,
        settle: (outcome) => {
          if (settled) return;
          settled = true;
          if (this._pending === entry) this._pending = null;
          signal.removeEventListener("abort", onAbort);
          resolve(outcome);
        }
      };
      const onAbort = (): void => entry.settle(FAIL_CLOSED);
      signal.addEventListener("abort", onAbort, { once: true });
      this._pending = entry;
      const waiters = this._waiters;
      this._waiters = [];
      for (const waiter of waiters) waiter(entry);
    });
  }

  /** The escalation currently awaiting a verdict, if any. */
  current(): { id: string; escalation: Escalation } | null {
    if (!this._pending) return null;
    return { id: this._pending.id, escalation: this._pending.escalation };
  }

  /**
   * Subscribe to the next parked escalation. Returns an unsubscribe so a
   * caller racing this against run completion can withdraw when the run wins
   * — otherwise every verdict round trip would strand one waiter until the
   * session is swept.
   */
  subscribe(waiter: (entry: ParkedEscalation) => void): () => void {
    this._waiters.push(waiter);
    return () => {
      const index = this._waiters.indexOf(waiter);
      if (index !== -1) this._waiters.splice(index, 1);
    };
  }

  /**
   * Deliver the agent's verdict for the parked escalation. Returns an error
   * string instead of throwing so the HTTP layer can 400 with it; the verdict
   * is checked against the escalation's `allowedActions` here so the agent can
   * correct itself, and enforced again by the kernel regardless.
   *
   * A `substitute` payload is validated here too, against the same rules the
   * actor applies. Accepting it and letting the kernel reject it fails the
   * node with its *original* error and burns the decision — the agent never
   * learns its repair was malformed. Rejecting here keeps the escalation
   * parked, so it can answer again.
   */
  async submit(
    escalationId: string,
    verdict: Verdict
  ): Promise<{ error: string } | null> {
    const pending = this._pending;
    if (!pending) {
      return {
        error:
          "No escalation is awaiting a verdict — the run may have moved on " +
          "(a timed-out decision fails closed) or finished."
      };
    }
    if (pending.id !== escalationId) {
      return {
        error: `Escalation ${escalationId} is not pending (current: ${pending.id}).`
      };
    }
    if (!pending.escalation.allowedActions.includes(verdict.action)) {
      return {
        error:
          `Verdict "${verdict.action}" is not allowed for this escalation. ` +
          `Allowed: ${pending.escalation.allowedActions.join(", ")}.`
      };
    }
    if (verdict.action === "substitute") {
      const result = await validateSubstituteOutputs(verdict.outputs, {
        declaredOutputs: pending.escalation.declaredOutputs
      });
      if (!result.ok) {
        return {
          error:
            "Substituted outputs are invalid, so the escalation is still " +
            `awaiting a verdict: ${result.issues.join("; ")}`
        };
      }
      // Validation is async; the escalation may have failed closed meanwhile.
      if (this._pending !== pending) {
        return {
          error:
            "The escalation stopped awaiting a verdict while the substituted " +
            "outputs were being validated."
        };
      }
    }
    pending.settle({ verdict, decidedBy: "agent" });
    return null;
  }

  close(): void {
    this._closed = true;
    this._pending?.settle(FAIL_CLOSED);
  }
}

export type DebugSessionEvent =
  | { kind: "escalated"; escalationId: string; escalation: Escalation }
  | { kind: "done"; report: Record<string, unknown> }
  | { kind: "running" };

export interface CreateDebugSessionOptions {
  userId: string;
  /** Null when the session fronts something other than a workflow run. */
  workflowId: string | null;
  jobId: string;
  handle: InteractiveEscalationHandle;
  /** Resolves with the final report once the run settles. Must never reject. */
  done: Promise<Record<string, unknown>>;
  cancel: () => void;
  /** Overrides for tests; production uses the module constants. */
  maxLifetimeMs?: number;
  cancelWaitMs?: number;
}

export class DebugSession {
  readonly id: string;
  readonly userId: string;
  readonly workflowId: string | null;
  readonly jobId: string;
  private readonly _handle: InteractiveEscalationHandle;
  /** The run's own completion, raced with a forced settle. Never rejects. */
  private readonly _done: Promise<Record<string, unknown>>;
  private readonly _cancel: () => void;
  private readonly _cancelWaitMs: number;
  private _force: (report: Record<string, unknown>) => void = () => {};
  private _report: Record<string, unknown> | null = null;

  constructor(options: CreateDebugSessionOptions, onSettled: () => void) {
    this.id = randomUUID();
    this.userId = options.userId;
    this.workflowId = options.workflowId;
    this.jobId = options.jobId;
    this._handle = options.handle;
    this._cancel = options.cancel;
    this._cancelWaitMs = options.cancelWaitMs ?? CANCEL_SETTLE_TIMEOUT_MS;
    // A run that never settles must not hold the session — or its waiters —
    // open forever, so every wait goes through this race rather than through
    // the run's own promise.
    const forced = new Promise<Record<string, unknown>>((resolve) => {
      this._force = resolve;
    });
    this._done = Promise.race([options.done, forced]);
    void this._done.then((report) => {
      this._report = report;
      onSettled();
    });
  }

  /** True until the run (or a forced settle) has produced a final report. */
  isLive(): boolean {
    return this._report === null;
  }

  /**
   * Settle the session without the run: cancel what can be cancelled, fail the
   * parked escalation closed, and hand every waiter a failed report. Used by
   * the lifetime ceiling and by a cancel the run does not answer.
   */
  forceSettle(reason: string): void {
    try {
      this._cancel();
    } catch (error) {
      log.warn("cancel threw while force-settling a debug session", {
        sessionId: this.id,
        error: String(error)
      });
    }
    this._handle.close();
    this._force({
      status: "failed",
      error: reason,
      job_id: this.jobId,
      workflow_id: this.workflowId,
      outputs: {}
    });
  }

  /**
   * Wait until the run either parks an escalation or settles. There is no
   * wait cap of its own: the non-interactive endpoint awaits the whole run
   * too, a parked decision fails closed on its own timeout, and the session's
   * lifetime ceiling settles anything that outlives both.
   */
  async waitForEvent(): Promise<DebugSessionEvent> {
    const pending = this._handle.current();
    if (pending) {
      return {
        kind: "escalated",
        escalationId: pending.id,
        escalation: pending.escalation
      };
    }
    let unsubscribe: () => void = () => {};
    try {
      return await Promise.race([
        this._done.then(
          (report): DebugSessionEvent => ({ kind: "done", report })
        ),
        new Promise<DebugSessionEvent>((resolve) => {
          unsubscribe = this._handle.subscribe((entry) =>
            resolve({
              kind: "escalated",
              escalationId: entry.id,
              escalation: entry.escalation
            })
          );
        })
      ]);
    } finally {
      unsubscribe();
    }
  }

  /** Current state without waiting. */
  peek(): DebugSessionEvent {
    if (this._report) return { kind: "done", report: this._report };
    const pending = this._handle.current();
    if (pending) {
      return {
        kind: "escalated",
        escalationId: pending.id,
        escalation: pending.escalation
      };
    }
    return { kind: "running" };
  }

  async submitVerdict(
    escalationId: string,
    verdict: Verdict
  ): Promise<{ error: string } | null> {
    if (this._report) {
      return { error: "The run has already finished." };
    }
    return this._handle.submit(escalationId, verdict);
  }

  /**
   * Cancel the run and return its final report. The wait is bounded: a run
   * that ignores cancellation used to hang the cancel request itself, so past
   * the deadline the session settles on its own and answers with that.
   */
  async cancel(): Promise<Record<string, unknown>> {
    try {
      this._cancel();
    } catch (error) {
      log.warn("cancel threw for a debug session", {
        sessionId: this.id,
        error: String(error)
      });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), this._cancelWaitMs);
      timer.unref?.();
    });
    try {
      const outcome = await Promise.race([this._done, deadline]);
      if (outcome !== "timeout") return outcome;
    } finally {
      if (timer) clearTimeout(timer);
    }
    this.forceSettle(
      `Cancel requested, but the run did not settle within ${this._cancelWaitMs}ms.`
    );
    return this._done;
  }
}

/** Thrown by `create()` when a user already holds the maximum live sessions. */
export class TooManyDebugSessionsError extends Error {
  constructor(limit: number) {
    super(
      `Too many active debug sessions (limit ${limit}). Cancel or finish one ` +
        "with POST /api/debug/sessions/:id/cancel before starting another."
    );
    this.name = "TooManyDebugSessionsError";
  }
}

class DebugSessionRegistry {
  private readonly _sessions = new Map<string, DebugSession>();

  /** Live sessions this user holds. */
  liveCount(userId: string): number {
    let count = 0;
    for (const session of this._sessions.values()) {
      if (session.userId === userId && session.isLive()) count += 1;
    }
    return count;
  }

  create(options: CreateDebugSessionOptions): DebugSession {
    if (this.liveCount(options.userId) >= MAX_LIVE_SESSIONS_PER_USER) {
      throw new TooManyDebugSessionsError(MAX_LIVE_SESSIONS_PER_USER);
    }
    let lifetime: ReturnType<typeof setTimeout> | undefined;
    const session = new DebugSession(options, () => {
      if (lifetime) clearTimeout(lifetime);
      const timer = setTimeout(() => {
        this._sessions.delete(session.id);
      }, SESSION_DONE_TTL_MS);
      timer.unref?.();
    });
    lifetime = setTimeout(() => {
      log.warn("debug session hit its lifetime ceiling", {
        sessionId: session.id,
        jobId: options.jobId
      });
      session.forceSettle(
        "The run exceeded the maximum session lifetime and was force-settled."
      );
    }, options.maxLifetimeMs ?? SESSION_MAX_LIFETIME_MS);
    lifetime.unref?.();
    this._sessions.set(session.id, session);
    log.info("interactive debug session opened", {
      sessionId: session.id,
      jobId: options.jobId,
      workflowId: options.workflowId
    });
    return session;
  }

  /** Ownership is part of the lookup: a foreign session id is a miss. */
  get(sessionId: string, userId: string): DebugSession | null {
    const session = this._sessions.get(sessionId);
    if (!session || session.userId !== userId) return null;
    return session;
  }
}

export const debugSessions = new DebugSessionRegistry();
