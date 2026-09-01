/**
 * Per-turn spend admission for agent loops.
 *
 * A dollar ceiling cannot be enforced by checking spent cost before a call: the
 * next call's cost is only known afterwards, so $0.49 spent under a $0.50 cap
 * still admits a $0.30 call and lands at $0.79. The ceiling holds only if the
 * worst case is *reserved* before the turn and reconciled to actuals after it.
 *
 * The interception point has to sit inside the provider layer. A wrapper around
 * `generateLoop()` sees one call while the base loop makes its turns
 * internally, and providers that own their loop (the Claude Agent SDK) never
 * return between turns at all. So the budget is an object threaded through
 * `generateLoop` options and honored before every model turn — by the base loop
 * and, as a contract obligation, by any provider overriding it.
 *
 * See docs/workflow-supervisor-design.md §6.
 */

import type { ProviderId } from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";
import { CostCalculator } from "./providers/cost-calculator.js";

const log = createLogger("nodetool.runtime.turn-budget");

/** What a provider knows about the turn it is about to make. */
export interface TurnReservation {
  model: string;
  provider: ProviderId;
  /** Prompt tokens the turn will send, as well as the provider can tell. */
  inputTokens: number;
}

export interface TurnBudget {
  /**
   * Admit or refuse the turn. A refusal is final for this loop: the provider
   * stops rather than making the call.
   */
  reserve(turn: TurnReservation): boolean;
  /**
   * Reconcile the reservation against what the turn actually cost, in USD.
   *
   * Pass `null` when turns provably ran but their cost was never reported —
   * the Claude Agent SDK only reports usage on a terminal `result` message,
   * which an aborted session never emits. That is not the same as free, and
   * booking it as zero would hand the reserved headroom back for spend that
   * really happened. The reserved worst case is charged instead.
   */
  commit(actualUsd: number | null): void;
  /** Committed spend so far, in USD. */
  readonly spentUsd: number;
}

export interface CostCappedTurnBudgetOptions {
  /** Ceiling on total spend, in USD. */
  capUsd: number;
  /**
   * Output-token bound assumed for every turn. Reservation needs a *known*
   * worst case, so this is required — an optional `maxTokens` that providers
   * may ignore cannot bound anything.
   */
  maxOutputTokens: number;
}

/**
 * The reserving budget. Refuses a turn whose worst case would cross the cap,
 * and refuses any turn on a model with no price in the catalog — an unpriced
 * model has no worst case, and admitting it would make the cap advisory.
 */
export class CostCappedTurnBudget implements TurnBudget {
  private readonly _capUsd: number;
  private readonly _maxOutputTokens: number;
  private _spentUsd = 0;
  /** Worst case of the turn currently in flight, released by `commit`. */
  private _reservedUsd = 0;

  constructor(opts: CostCappedTurnBudgetOptions) {
    this._capUsd = opts.capUsd;
    this._maxOutputTokens = opts.maxOutputTokens;
  }

  get spentUsd(): number {
    return this._spentUsd;
  }

  reserve(turn: TurnReservation): boolean {
    const worstCase = CostCalculator.estimateTokenCostUsd(
      turn.model,
      { inputTokens: turn.inputTokens, outputTokens: this._maxOutputTokens },
      turn.provider
    );
    if (worstCase === null) return false;
    if (this._spentUsd + this._reservedUsd + worstCase > this._capUsd) {
      return false;
    }
    this._reservedUsd += worstCase;
    return true;
  }

  commit(actualUsd: number | null): void {
    // Unknown must not read as free — the same rule invocation-cost accounting
    // follows. With no number to book, the reservation becomes the charge.
    this._spentUsd +=
      actualUsd === null || !Number.isFinite(actualUsd)
        ? this._reservedUsd
        : Math.max(actualUsd, 0);
    this._reservedUsd = 0;
  }
}

/* ------------------------------------------------------------------------ *
 * Run-level bounds: deadline, concurrency, turn count.
 *
 * A USD cap alone does not bound a run. A loop on a free local model spends
 * nothing and still runs forever, and a fan-out of sub-agents multiplies
 * provider conversations until the process is the limit. These are the other
 * three ceilings, kept in one object so every loop in a run shares them
 * instead of each inventing its own.
 * ------------------------------------------------------------------------ */

/** Wall-clock ceiling for a run. */
export interface Deadline {
  /** Epoch milliseconds after which the run must stop. */
  readonly at: number;
  remainingMs(): number;
  expired(): boolean;
}

/**
 * A deadline `ms` from now. `Infinity` means no deadline — `at` is `Infinity`,
 * so `expired()` is false forever without a second "unbounded" code path.
 */
export function createDeadline(ms: number): Deadline {
  const at = Number.isFinite(ms) ? Date.now() + ms : Infinity;
  return {
    at,
    remainingMs: () => (at === Infinity ? Infinity : at - Date.now()),
    expired: () => Date.now() >= at
  };
}

/**
 * Hand back one permit. Idempotent: a caller that releases twice (a `finally`
 * plus an explicit release, say) must not inflate the semaphore.
 *
 * Not a `Symbol.dispose` object — this package compiles against `lib: ES2022`,
 * which has no disposable typings. A plain callable works in every consumer.
 */
export type Release = () => void;

/** FIFO permit pool bounding concurrent provider conversations for a run. */
export interface Semaphore {
  /** Permits the pool was created with. */
  readonly permits: number;
  /** Permits not currently held. */
  readonly available: number;
  /** Callers waiting for a permit. */
  readonly waiting: number;
  acquire(): Promise<Release>;
}

export function createSemaphore(permits: number): Semaphore {
  // A non-positive bound would deadlock every acquirer; treat it as "one at a
  // time", which is the strictest bound that still makes progress.
  const max = Number.isFinite(permits) && permits > 0 ? Math.floor(permits) : 1;
  let held = 0;
  const queue: Array<(release: Release) => void> = [];

  const makeRelease = (): Release => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = queue.shift();
      if (next) {
        // Hand the permit straight to the head of the queue: `held` stays put,
        // so a waiter cannot be overtaken by a caller that acquires between
        // this release and the waiter's continuation.
        next(makeRelease());
        return;
      }
      held--;
    };
  };

  return {
    permits: max,
    get available() {
      return max - held;
    },
    get waiting() {
      return queue.length;
    },
    acquire(): Promise<Release> {
      if (held < max) {
        held++;
        return Promise.resolve(makeRelease());
      }
      return new Promise<Release>((resolve) => queue.push(resolve));
    }
  };
}

/** Bounded counter. `increment` answers false once `max` has been reached. */
export interface Counter {
  readonly max: number;
  readonly current: number;
  increment(): boolean;
}

export function createCounter(max: number): Counter {
  let current = 0;
  return {
    max,
    get current() {
      return current;
    },
    increment(): boolean {
      if (current >= max) return false;
      current++;
      return true;
    }
  };
}

/** Why a run stopped. An `as const` union, not an enum (AGENTS.md § TypeScript). */
export const BUDGET_EXHAUSTION_KINDS = ["cost", "deadline", "turns"] as const;
export type BudgetExhaustionKind = (typeof BUDGET_EXHAUSTION_KINDS)[number];

export interface BudgetExhaustion {
  kind: BudgetExhaustionKind;
  detail: string;
}

/** Which ceiling a {@link CompositeTurnBudget} refusal hit. */
export const TURN_REFUSALS = ["cost-cap", "unpriced-token-ceiling"] as const;
export type TurnRefusal = (typeof TURN_REFUSALS)[number];

export interface CompositeTurnBudgetOptions {
  /**
   * Ceiling on total spend, in USD, or `null` for no USD cap (a local-only
   * install).
   */
  capUsd: number | null;
  /** Output-token bound assumed for every turn. See {@link CostCappedTurnBudgetOptions}. */
  maxOutputTokens: number;
  /**
   * Prompt-token ceiling applied to a turn on a model with no catalog price.
   * Only consulted when a USD cap exists — see {@link CompositeTurnBudget}.
   */
  unpricedTokenCeiling: number;
}

/** Models already logged as unpriced, so the notice fires once per model. */
const loggedUnpricedModels = new Set<string>();

/**
 * The budget every run gets. Priced models behave exactly like
 * {@link CostCappedTurnBudget}; a model with no catalog price is admitted
 * against a prompt-token ceiling instead and its turns are counted apart from
 * `spentUsd`.
 *
 * Why not just refuse an unpriced model the way `CostCappedTurnBudget` does:
 * that budget is the supervisor's, where refusing is right — a supervisor that
 * cannot be priced should not run. A user's chat turn on a model the catalog
 * has not caught up with is a different case; refusing it would make the
 * product unusable on any new model. So the run is bounded by the one thing
 * that is known (prompt size) and the unknown is *reported* rather than
 * booked: `spentUsd` is a lower bound whenever `unpricedTurns > 0`, never a
 * claim that those turns were free (assumption A-5, invariant I-4).
 *
 * With `capUsd: null` there is no USD cap, and admission is therefore
 * unbounded by cost — including for unpriced models. The token ceiling exists
 * to keep a *cap* meaningful when a turn cannot be priced; with no cap there
 * is nothing to keep meaningful, and enforcing it anyway would impose a prompt
 * limit nobody configured. Deadline and turn count still bound such a run.
 */
export class CompositeTurnBudget implements TurnBudget {
  private readonly _capUsd: number | null;
  private readonly _maxOutputTokens: number;
  private readonly _unpricedTokenCeiling: number;
  private _spentUsd = 0;
  private _reservedUsd = 0;
  private _unpricedTurns = 0;
  /** Set when the in-flight reservation is for a model with no price. */
  private _pendingUnpriced = false;
  private _lastRefusal: TurnRefusal | null = null;

  constructor(opts: CompositeTurnBudgetOptions) {
    this._capUsd = opts.capUsd;
    this._maxOutputTokens = opts.maxOutputTokens;
    this._unpricedTokenCeiling = opts.unpricedTokenCeiling;
  }

  get spentUsd(): number {
    return this._spentUsd;
  }

  /**
   * Why the most recent `reserve` refused, so a caller can name the ceiling in
   * the message the user sees rather than guessing which one it was.
   */
  get lastRefusal(): TurnRefusal | null {
    return this._lastRefusal;
  }

  /** Turns admitted on a model the price catalog does not cover. */
  get unpricedTurns(): number {
    return this._unpricedTurns;
  }

  /** True when `spentUsd` under-reports the run because some turns had no price. */
  get hasUnpricedTurns(): boolean {
    return this._unpricedTurns > 0;
  }

  reserve(turn: TurnReservation): boolean {
    const worstCase = CostCalculator.estimateTokenCostUsd(
      turn.model,
      { inputTokens: turn.inputTokens, outputTokens: this._maxOutputTokens },
      turn.provider
    );
    if (worstCase === null) {
      return this._reserveUnpriced(turn);
    }
    this._pendingUnpriced = false;
    if (this._capUsd === null) {
      this._lastRefusal = null;
      this._reservedUsd += worstCase;
      return true;
    }
    if (this._spentUsd + this._reservedUsd + worstCase > this._capUsd) {
      this._lastRefusal = "cost-cap";
      return false;
    }
    this._lastRefusal = null;
    this._reservedUsd += worstCase;
    return true;
  }

  commit(actualUsd: number | null): void {
    if (this._pendingUnpriced) {
      this._pendingUnpriced = false;
      this._unpricedTurns++;
      // No reservation to fall back on: an unpriced model has no worst case.
      // A number the provider reported anyway is real money and is booked; an
      // unknown adds nothing to `spentUsd` and is visible as an unpriced turn.
      if (actualUsd !== null && Number.isFinite(actualUsd)) {
        this._spentUsd += Math.max(actualUsd, 0);
      }
      return;
    }
    this._spentUsd +=
      actualUsd === null || !Number.isFinite(actualUsd)
        ? this._reservedUsd
        : Math.max(actualUsd, 0);
    this._reservedUsd = 0;
  }

  private _reserveUnpriced(turn: TurnReservation): boolean {
    if (this._capUsd === null) {
      this._lastRefusal = null;
      this._pendingUnpriced = true;
      return true;
    }
    const key = `${turn.provider}/${turn.model}`;
    if (!loggedUnpricedModels.has(key)) {
      loggedUnpricedModels.add(key);
      log.warn("Model has no catalog price; admitting against a token ceiling", {
        provider: turn.provider,
        model: turn.model,
        unpricedTokenCeiling: this._unpricedTokenCeiling
      });
    }
    if (turn.inputTokens > this._unpricedTokenCeiling) {
      this._lastRefusal = "unpriced-token-ceiling";
      return false;
    }
    this._lastRefusal = null;
    this._pendingUnpriced = true;
    return true;
  }
}

/** The four bounds one run shares, plus the reason it stopped. */
export interface RunBudget {
  /** USD admission; reserve before a turn, commit after. */
  turns: TurnBudget;
  /** Absolute deadline; every loop checks it before a turn and before a tool call. */
  deadline: Deadline;
  /** Process-wide bound on concurrent provider conversations for this run. */
  concurrency: Semaphore;
  /** Cumulative model turns across every loop in the run. */
  turnCount: Counter;
  /** Why a stop happened, set once — the first reason wins. */
  readonly exhausted: BudgetExhaustion | null;
}

export interface CreateRunBudgetOptions {
  /** `null` = no USD cap (local-only install). */
  capUsd: number | null;
  maxOutputTokens: number;
  /** Per-turn prompt-token ceiling when the model has no price. */
  unpricedTokenCeiling: number;
  deadlineMs: number;
  maxConcurrency: number;
  maxTurns: number;
}

/** Runtime narrower: a {@link RunBudget} carries the other three bounds. */
export function isRunBudget(
  value: TurnBudget | RunBudget | undefined | null
): value is RunBudget {
  return (
    typeof value === "object" &&
    value !== null &&
    "turns" in value &&
    "deadline" in value &&
    "concurrency" in value &&
    "turnCount" in value
  );
}

/**
 * Build the one budget a run shares downward (invariant I-2).
 *
 * `turns.reserve` is the single admission point: it checks the deadline, then
 * the cumulative turn count, then the USD cap, and records the first reason it
 * refuses for. A provider loop therefore only has to call `reserve` to honor
 * all three, and reads `exhausted` to say which one stopped it.
 */
export function createRunBudget(opts: CreateRunBudgetOptions): RunBudget {
  const cost = new CompositeTurnBudget({
    capUsd: opts.capUsd,
    maxOutputTokens: opts.maxOutputTokens,
    unpricedTokenCeiling: opts.unpricedTokenCeiling
  });
  const rawDeadline = createDeadline(opts.deadlineMs);
  const turnCount = createCounter(opts.maxTurns);
  let exhausted: BudgetExhaustion | null = null;

  // Set once: a run that ran out of money and then ran out of time stopped for
  // the money. Overwriting would report the symptom of the first stop.
  const markExhausted = (kind: BudgetExhaustionKind, detail: string): void => {
    if (exhausted === null) exhausted = { kind, detail };
  };

  // Any loop that checks the deadline records the reason by doing so, so a
  // pre-turn deadline check needs no separate setter on the interface.
  const deadline: Deadline = {
    at: rawDeadline.at,
    remainingMs: () => rawDeadline.remainingMs(),
    expired: () => {
      if (!rawDeadline.expired()) return false;
      markExhausted(
        "deadline",
        `run deadline of ${Math.round(opts.deadlineMs)}ms reached`
      );
      return true;
    }
  };

  const turns: TurnBudget = {
    reserve(turn: TurnReservation): boolean {
      if (deadline.expired()) return false;
      // Read the count before spending it: a turn refused on cost must not
      // also consume a turn slot, and a reservation cannot be handed back.
      if (turnCount.current >= turnCount.max) {
        markExhausted("turns", `turn limit of ${opts.maxTurns} reached`);
        return false;
      }
      if (!cost.reserve(turn)) {
        markExhausted(
          "cost",
          cost.lastRefusal === "unpriced-token-ceiling"
            ? `${turn.model} has no catalog price and the turn's ${turn.inputTokens} prompt tokens exceed the unpriced ceiling of ${opts.unpricedTokenCeiling}`
            : `turn budget of $${opts.capUsd} reached`
        );
        return false;
      }
      turnCount.increment();
      return true;
    },
    commit(actualUsd: number | null): void {
      cost.commit(actualUsd);
    },
    get spentUsd(): number {
      return cost.spentUsd;
    }
  };

  return {
    turns,
    deadline,
    concurrency: createSemaphore(opts.maxConcurrency),
    turnCount,
    get exhausted(): BudgetExhaustion | null {
      return exhausted;
    }
  };
}

/**
 * Context variable holding the run's {@link RunBudget}.
 *
 * A budget has to reach loops the host never sees: an `AgentNode` a chat turn
 * started through `run_node`, a JS script, a sub-agent three levels down. The
 * context bag is the one channel every one of them already carries, and
 * `ProcessingContext.copy()` shallow-copies it, so a child context shares the
 * same object rather than a clone of it — which is what makes the cap a run
 * total instead of a per-loop allowance (invariant I-2).
 *
 * It lives here, beside the type it names, so that hosts, `agents`, and
 * `llm-nodes` agree on the key without any of them importing each other.
 */
export const RUN_BUDGET_CONTEXT_KEY = "nodetool_run_budget";

/** Minimal reader for the context bag, so this stays free of a context import. */
interface RunBudgetContext {
  get<T = unknown>(key: string, defaultValue?: T): T;
}

/**
 * The run budget a host put on the context, or `undefined` when none did.
 *
 * Absent means unbudgeted, not exhausted: a workflow run started from the
 * kernel with no host budget must keep working exactly as it does today.
 */
export function budgetFromContext(
  context: RunBudgetContext | undefined | null
): RunBudget | undefined {
  const value = context?.get<unknown>(RUN_BUDGET_CONTEXT_KEY);
  return isRunBudget(value as RunBudget | undefined) ? (value as RunBudget) : undefined;
}
