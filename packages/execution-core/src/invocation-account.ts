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

// Lazily resolved so this module still loads in browser/Edge bundles. There the
// fallback holder has no per-context isolation, and concurrent invocations
// would share one account — acceptable only because the supervisor that reads
// these numbers runs in the kernel, which is Node-only.
import type { ProviderCost } from "@nodetool-ai/protocol";
import { AsyncLocalStorage } from "./async-local-storage.js";

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

/**
 * Charge the invocation currently on the async stack, if any.
 *
 * A non-finite amount means a provider reported something we cannot add up —
 * and "cannot add up" must not read as "free", or the invocation would look
 * cost-free and re-earn a retry after a real charge. It is recorded as a
 * nominal charge instead: the number is meaningless, the fact of spending is
 * not. `costUsd` stays finite so the escalation record remains JSON-safe.
 */
export function recordInvocationCost(usd: number | undefined | null): void {
  if (usd === undefined || usd === null) return;
  const account = store.getStore();
  if (!account) return;
  account.costUsd += Number.isFinite(usd) ? usd : Number.MIN_VALUE;
}

/** Mark the invocation currently on the async stack as having written an asset. */
export function recordInvocationAsset(): void {
  const account = store.getStore();
  if (account) account.createdAssets = true;
}

/**
 * The provider charge one node run reported. Every actor shares one
 * ProcessingContext and all actors start together, so a single slot on the
 * context let a downstream node report an upstream node's charge again. The
 * slot travels with the node's async execution instead.
 */
export interface NodeCostSlot {
  cost: ProviderCost | null;
}

const nodeCostStore = new AsyncLocalStorage<NodeCostSlot>();

/** Run one node inside its own cost slot. */
export function inNodeCostSlot<T>(slot: NodeCostSlot, fn: () => Promise<T>): Promise<T> {
  return nodeCostStore.run(slot, fn);
}

/** Store a charge in the node slot on the async stack. False when no slot is there. */
export function setNodeCost(cost: ProviderCost): boolean {
  const slot = nodeCostStore.getStore();
  if (!slot) return false;
  slot.cost = cost;
  return true;
}

/** The account for the invocation currently on the async stack, if any. */
export function currentInvocationAccount(): InvocationAccount | undefined {
  return store.getStore();
}
