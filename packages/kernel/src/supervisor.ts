/**
 * Workflow Supervisor — the kernel half.
 *
 * A failing node invocation raises an `Escalation`; a `SupervisorHandle`
 * returns a `Verdict`. The kernel defines the interface, computes the set of
 * verdicts an escalation may legally receive, redacts everything the escalation
 * carries, and enforces the allowed set against whatever the handle returns.
 * The LLM-backed implementation lives in `@nodetool-ai/agents`; the dependency
 * arrow stays `kernel ← agents`.
 *
 * See docs/workflow-supervisor-design.md §5.
 */

import type {
  Escalation,
  Verdict,
  VerdictAction,
  DecidedBy
} from "@nodetool-ai/protocol";
import type { RunStateReader } from "./run-state.js";

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------

/** What a handle returns: the verdict, who made it, and what it cost. */
export interface DecisionOutcome {
  verdict: Verdict;
  decidedBy: DecidedBy;
  /** Supervisor spend for this decision, in USD. */
  costUsd?: number;
}

export interface SupervisorHandle {
  decide(e: Escalation, signal: AbortSignal): Promise<DecisionOutcome>;
  /**
   * True when the handle already enforces the run's bounds. Set by
   * `BoundedHandle`; `ensureBounded` reads it so a handle bounded by its
   * caller is not wrapped a second time.
   */
  readonly bounded?: boolean;
  /**
   * Handed the run's read-only state once, before any actor starts. A handle
   * is configured before the runner exists, so the reader cannot be a
   * constructor argument. Optional: a scripted handle needs no run state.
   */
  attach?(reader: RunStateReader): void;
  close(): void;
}

/**
 * The default, and what every failure of a supervisor degrades to: today's
 * behavior. A runner without a supervisor never constructs an escalation at
 * all, so this exists for callers that want the seam wired but inert.
 */
export class FailClosedHandle implements SupervisorHandle {
  async decide(): Promise<DecisionOutcome> {
    return { verdict: { action: "fail" }, decidedBy: "default" };
  }
  close(): void {}
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Field names whose values never leave the actor, whatever they contain.
 * Matched case-insensitively against whole names and name fragments, so
 * `authorization`, `Auth-Token`, and `api_key` all hit.
 */
const SENSITIVE_NAME_PATTERN =
  /(password|passwd|secret|token|api[-_]?key|apikey|authorization|auth|credential|private[-_]?key|session[-_]?id|cookie|bearer)/i;

const MASK = "«redacted»";

/** Per-value cap on redacted payloads. Truncation is size, not safety. */
export const MAX_ESCALATION_VALUE_CHARS = 2000;

/**
 * Mask every known secret value inside a string, wherever it appears —
 * headers, URLs, bodies, stringified errors.
 */
function maskSecrets(text: string, secrets: ReadonlySet<string>): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret) continue;
    out = out.split(secret).join(MASK);
  }
  return out;
}

function truncate(text: string): string {
  return text.length > MAX_ESCALATION_VALUE_CHARS
    ? `${text.slice(0, MAX_ESCALATION_VALUE_CHARS)}…[truncated]`
    : text;
}

/**
 * Redact one value: drop sensitive-named fields, mask known secret values in
 * every string, truncate what remains. Recurses through plain objects and
 * arrays; anything else is stringified, because a class instance's `toString`
 * is not a place to gamble on what it prints.
 */
/** A value with secrets masked and size capped — safe to put in a report. */
export type RedactedValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | RedactedValue[]
  | { [key: string]: RedactedValue };

export function redactValue(
  value: unknown,
  secrets: ReadonlySet<string>,
  depth = 0
): RedactedValue {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncate(maskSecrets(value, secrets));
  // SAFETY: the `typeof` above proved which of the two it is.
  if (typeof value === "number" || typeof value === "boolean") {
    return value as number | boolean;
  }
  if (depth >= 6) return MASK;
  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => redactValue(item, secrets, depth + 1));
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      const out: { [key: string]: RedactedValue } = {};
      for (const [key, item] of Object.entries(value)) {
        out[key] = SENSITIVE_NAME_PATTERN.test(key)
          ? MASK
          : redactValue(item, secrets, depth + 1);
      }
      return out;
    }
    if (value instanceof Uint8Array) return `«${value.byteLength} bytes»`;
  }
  return truncate(maskSecrets(String(value), secrets));
}

export function redactRecord(
  record: Record<string, unknown>,
  secrets: ReadonlySet<string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("_")) continue; // actor-internal, e.g. _control_context
    out[key] = SENSITIVE_NAME_PATTERN.test(key)
      ? MASK
      : redactValue(value, secrets);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Failure signatures
// ---------------------------------------------------------------------------

/**
 * A signature is a stable categorical code — an HTTP status, a provider error
 * code, a validation path. It is what lets one verdict resolve the other six
 * identical failures in a 200-item batch without waking the agent again.
 *
 * A plain `Error` gets none. Error class alone is not a category (every generic
 * throw would collide), and message text carries request-specific values, so
 * matching on it would make one item's verdict stick to an unrelated failure.
 * No signature simply means no stickiness: each such failure escalates on its
 * own.
 */
export function failureSignature(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const e = err as Record<string, unknown>;

  if (typeof e.code === "string" && e.code.length > 0) return `code:${e.code}`;

  const status =
    typeof e.status === "number"
      ? e.status
      : typeof e.statusCode === "number"
        ? e.statusCode
        : typeof (e.response as { status?: unknown } | undefined)?.status ===
            "number"
          ? ((e.response as { status: number }).status as number)
          : undefined;
  if (status !== undefined) return `http:${status}`;

  if (typeof e.errno === "string" || typeof e.errno === "number") {
    return `errno:${e.errno}`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Allowed actions
// ---------------------------------------------------------------------------

export interface AllowedActionsInput {
  /** Node metadata opt-in. Unknown ⇒ false ⇒ no retry. */
  retrySafe: boolean;
  /** Provider cost recorded by this invocation. */
  spentCostUsd: number;
  createdAssets: boolean;
  /** `substitute` needs the broken value in hand. */
  hasCandidateOutput: boolean;
  /**
   * Every declared output has a runtime validation rule. A partially-checked
   * substitution is an unchecked one for the slot that matters, so without
   * full coverage `substitute` is not offered at all.
   */
  validatorCoverage: boolean;
  /** `is_streaming_output` — the node yields through `genProcess`. */
  streamingOutput: boolean;
  /** `is_streaming_input` — the node drains its own inbox through `run()`. */
  streamingInput: boolean;
  /** True when this invocation already emitted downstream. */
  emitted: boolean;
}

/**
 * The kernel's answer to "what may this escalation legally receive". It shapes
 * the agent's verdict schema *and* is enforced independently by the actor: the
 * schema is UX, this is the guarantee.
 *
 * Design §5.3 (retry safety) and §5.4 (streaming).
 */
export function computeAllowedActions(
  input: AllowedActionsInput
): VerdictAction[] {
  // A `run()` node consumed inbox messages that are gone, across arbitrary
  // lineages — nothing is replayable and no single lineage exists for a skip
  // to target. Design §5.4.
  if (input.streamingInput) return ["end_stream", "fail"];

  const retryOk =
    input.retrySafe && input.spentCostUsd === 0 && !input.createdAssets;

  if (input.streamingOutput) {
    if (input.emitted) return ["end_stream", "fail"];
    // No `substitute` for a stream in either state: there is no single
    // invocation value for a substitution to stand in for.
    return retryOk ? ["retry", "skip", "fail"] : ["skip", "fail"];
  }

  const actions: VerdictAction[] = [];
  if (retryOk) actions.push("retry");
  if (input.hasCandidateOutput && input.validatorCoverage) {
    actions.push("substitute");
  }
  actions.push("skip", "fail");
  return actions;
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

export interface SupervisorBounds {
  /** Decisions the agent may make in one run. */
  maxDecisions?: number;
  /** Retries per `(nodeId, invocationKey)`. */
  maxRetriesPerNode?: number;
  /** Per-decision wall clock, in ms. */
  decisionTimeoutMs?: number;
}

export const DEFAULT_SUPERVISOR_BOUNDS = {
  maxDecisions: 10,
  maxRetriesPerNode: 2,
  decisionTimeoutMs: 60_000
} as const satisfies Required<SupervisorBounds>;

/**
 * Wraps a handle with everything that must hold whoever wrote it: decision and
 * retry ceilings, a per-decision timeout derived from the run signal, and the
 * sticky-verdict cache. Every boundary resolves as `fail` — degradation is
 * deterministic, never a cheaper model.
 */
export class BoundedHandle implements SupervisorHandle {
  readonly bounded = true;
  private readonly _inner: SupervisorHandle;
  private readonly _bounds: Required<SupervisorBounds>;
  private _decisions = 0;
  private readonly _retries = new Map<string, number>();
  /** `(nodeId, failureSignature)` → verdict, for `skip`/`fail` only. */
  private readonly _sticky = new Map<string, Verdict>();
  /** Serializes decisions: the agent sees consecutive failures in order. */
  private _queue: Promise<unknown> = Promise.resolve();

  constructor(inner: SupervisorHandle, opts: SupervisorBounds = {}) {
    this._inner = inner;
    this._bounds = { ...DEFAULT_SUPERVISOR_BOUNDS, ...stripUndefined(opts) };
  }

  attach(reader: RunStateReader): void {
    this._inner.attach?.(reader);
  }

  async decide(e: Escalation, signal: AbortSignal): Promise<DecisionOutcome> {
    const run = this._queue.then(() => this._decideSerial(e, signal));
    // Keep the chain alive even when one decision rejects; `_decideSerial`
    // never throws, but a handle replaced in a test could.
    this._queue = run.catch(() => undefined);
    return run;
  }

  private async _decideSerial(
    e: Escalation,
    runSignal: AbortSignal
  ): Promise<DecisionOutcome> {
    if (e.failureSignature !== undefined) {
      const hit = this._sticky.get(stickyKey(e));
      // A cached verdict is only a shortcut for a decision this escalation
      // could have received anyway. Replaying one the escalation does not
      // allow buys nothing: the actor overrules it to `fail`. Decide afresh.
      if (hit && e.allowedActions.includes(hit.action)) {
        return { verdict: hit, decidedBy: "sticky" };
      }
    }

    if (this._decisions >= this._bounds.maxDecisions) {
      return { verdict: { action: "fail" }, decidedBy: "bounds" };
    }

    // Cancel is free, not merely fast. Decisions are serialized, so a cancel
    // during a slow decision leaves a queue behind it; calling the handle for
    // each of those would spend real money deciding the fate of a run that is
    // already over.
    if (runSignal.aborted) {
      return { verdict: { action: "fail" }, decidedBy: "bounds" };
    }

    // The decision signal is the run signal plus a timeout, so an in-flight
    // decision is killed rather than un-awaited.
    const timeout = new AbortController();
    const onRunAbort = () => timeout.abort();
    runSignal.addEventListener("abort", onRunAbort, { once: true });
    const timer = setTimeout(
      () => timeout.abort(),
      this._bounds.decisionTimeoutMs
    );

    let decision: DecisionOutcome;
    try {
      this._decisions++;
      decision = await this._inner.decide(e, timeout.signal);
      if (timeout.signal.aborted) {
        // A handle that resolves after its signal fired decided against a run
        // that is already over. Design §5.5.
        decision = { verdict: { action: "fail" }, decidedBy: "bounds" };
      }
    } catch {
      // Any failure *of* the supervisor resolves as today's behavior.
      decision = { verdict: { action: "fail" }, decidedBy: "bounds" };
    } finally {
      clearTimeout(timer);
      runSignal.removeEventListener("abort", onRunAbort);
    }

    decision = this._applyRetryBudget(e, decision);
    this._remember(e, decision.verdict);
    return decision;
  }

  private _applyRetryBudget(
    e: Escalation,
    decision: DecisionOutcome
  ): DecisionOutcome {
    if (decision.verdict.action !== "retry") return decision;
    const key = `${e.nodeId}\u0000${e.invocationKey}`;
    const used = this._retries.get(key) ?? 0;
    if (used >= this._bounds.maxRetriesPerNode) {
      return { verdict: { action: "fail" }, decidedBy: "bounds" };
    }
    this._retries.set(key, used + 1);
    return decision;
  }

  private _remember(e: Escalation, verdict: Verdict): void {
    // Only `skip` and `fail` may stick. A sticky `retry` or `substitute` would
    // blindly replay a decision made against different inputs.
    if (verdict.action !== "skip" && verdict.action !== "fail") return;
    if (verdict.applyTo !== "signature") return;
    if (e.failureSignature === undefined) return;
    this._sticky.set(stickyKey(e), verdict);
  }

  close(): void {
    this._inner.close();
  }
}

/**
 * Bound a handle, once. `WorkflowRunnerOptions.supervisor` takes any
 * `SupervisorHandle`, and an unbounded one — a handle that answers `retry`
 * forever, or whose `decide()` never resolves — spins or parks an actor for
 * the life of the process. The ceilings are the kernel's, not the caller's,
 * so the runner applies them itself; a handle its caller already bounded is
 * returned untouched.
 */
export function ensureBounded(
  handle: SupervisorHandle,
  opts: SupervisorBounds = {}
): SupervisorHandle {
  return handle.bounded === true ? handle : new BoundedHandle(handle, opts);
}

function stickyKey(e: Escalation): string {
  return `${e.nodeId}\u0000${e.failureSignature}`;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}
