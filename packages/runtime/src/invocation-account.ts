/**
 * Invocation-scoped cost and asset accounting.
 *
 * The supervisor may only offer `retry` for an invocation that spent nothing
 * and wrote nothing (docs/workflow-supervisor-design.md §5.3). Answering that
 * needs per-invocation numbers, and a stack on the shared `ProcessingContext`
 * cannot supply them: every actor holds the same context and actors complete
 * out of order, so push/pop would credit actor A's charge to actor B whenever
 * A finishes first — precisely the corruption that would re-expose retry after
 * a billed call.
 *
 * So the scope travels with the invocation's async execution instead. Cost and
 * asset hooks write to whichever account is on the async stack; concurrent
 * invocations each have their own, in any completion order.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface InvocationAccount {
  /** Provider charges (USD) recorded while this invocation ran. */
  costUsd: number;
  /** True once the invocation created an asset. */
  createdAssets: boolean;
}

const store = new AsyncLocalStorage<InvocationAccount>();

export function createInvocationAccount(): InvocationAccount {
  return { costUsd: 0, createdAssets: false };
}

/**
 * Run `fn` inside `account`. The caller owns the account so it can read what
 * the invocation spent even when `fn` throws — which is the case retry safety
 * turns on.
 */
export function inInvocationAccount<T>(
  account: InvocationAccount,
  fn: () => Promise<T>
): Promise<T> {
  return store.run(account, fn);
}

/** Charge the invocation currently on the async stack, if any. */
export function recordInvocationCost(usd: number | undefined | null): void {
  if (!usd) return;
  const account = store.getStore();
  if (account) account.costUsd += usd;
}

/** Mark the invocation currently on the async stack as having written an asset. */
export function recordInvocationAsset(): void {
  const account = store.getStore();
  if (account) account.createdAssets = true;
}

/** The account for the invocation currently on the async stack, if any. */
export function currentInvocationAccount(): InvocationAccount | undefined {
  return store.getStore();
}
