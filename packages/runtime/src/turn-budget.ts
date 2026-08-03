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
import { CostCalculator } from "./providers/cost-calculator.js";

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
