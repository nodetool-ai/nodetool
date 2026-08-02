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
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import type { DecisionOutcome, SupervisorHandle } from "@nodetool-ai/kernel";
import type { Escalation, Verdict } from "@nodetool-ai/protocol";

const log = createLogger("nodetool.websocket.debug-sessions");

/** How long an agent gets to answer one escalation before it fails closed. */
export const INTERACTIVE_DECISION_TIMEOUT_MS = 10 * 60_000;

/** How long a settled session's report stays fetchable. */
const SESSION_DONE_TTL_MS = 10 * 60_000;

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
   */
  submit(escalationId: string, verdict: Verdict): { error: string } | null {
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
  workflowId: string;
  jobId: string;
  handle: InteractiveEscalationHandle;
  /** Resolves with the final report once the run settles. Must never reject. */
  done: Promise<Record<string, unknown>>;
  cancel: () => void;
}

export class DebugSession {
  readonly id: string;
  readonly userId: string;
  readonly workflowId: string;
  readonly jobId: string;
  private readonly _handle: InteractiveEscalationHandle;
  private readonly _done: Promise<Record<string, unknown>>;
  private readonly _cancel: () => void;
  private _report: Record<string, unknown> | null = null;

  constructor(options: CreateDebugSessionOptions, onSettled: () => void) {
    this.id = randomUUID();
    this.userId = options.userId;
    this.workflowId = options.workflowId;
    this.jobId = options.jobId;
    this._handle = options.handle;
    this._done = options.done;
    this._cancel = options.cancel;
    void this._done.then((report) => {
      this._report = report;
      onSettled();
    });
  }

  /**
   * Wait until the run either parks an escalation or settles. There is no
   * wait cap: the non-interactive endpoint awaits the whole run too, and a
   * parked decision fails closed on its own timeout, so this always resolves.
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

  submitVerdict(escalationId: string, verdict: Verdict): { error: string } | null {
    if (this._report) {
      return { error: "The run has already finished." };
    }
    return this._handle.submit(escalationId, verdict);
  }

  /** Cancel the run; resolves once the run settles with its final report. */
  async cancel(): Promise<Record<string, unknown>> {
    this._cancel();
    return this._done;
  }
}

class DebugSessionRegistry {
  private readonly _sessions = new Map<string, DebugSession>();

  create(options: CreateDebugSessionOptions): DebugSession {
    const session = new DebugSession(options, () => {
      const timer = setTimeout(() => {
        this._sessions.delete(session.id);
      }, SESSION_DONE_TTL_MS);
      timer.unref?.();
    });
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
