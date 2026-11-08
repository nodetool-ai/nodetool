/* oxlint-disable anti-slop/no-unsafe-dictionary-type -- the entries keep the shape ProcessingContext.trackOperationCost and getOperationCosts expose: caller metadata spread into an open record. Narrowing it changes that public contract. */
/**
 * The cost totals of one run context: the running total that
 * `addToTotalCost` and `getTotalCost` read and write, and the per-operation
 * entries behind `trackOperationCost`. `ProcessingContext` in
 * `@nodetool-ai/runtime` and the native runner's guest context both keep
 * their totals in one. It has no host dependencies.
 */
export class CostLedger {
  private totalCost = 0;
  private entries: Array<Record<string, unknown>> = [];

  /** Adds a cost to the total. A cost that is not a finite number counts as 0. */
  add(cost: number): void {
    this.totalCost += finiteCost(cost);
  }

  /** Adds a cost to the total and records it as an operation entry. */
  track(
    operation: string,
    cost: number,
    metadata?: Record<string, unknown>
  ): void {
    const safeCost = finiteCost(cost);
    this.totalCost += safeCost;
    this.entries.push({
      operation,
      cost: safeCost,
      timestamp: new Date().toISOString(),
      ...(metadata ?? {})
    });
  }

  reset(): void {
    this.totalCost = 0;
    this.entries = [];
  }

  get total(): number {
    return this.totalCost;
  }

  get operations(): ReadonlyArray<Record<string, unknown>> {
    return this.entries;
  }

  /** An independent ledger with the same total and copies of the entries. */
  clone(): CostLedger {
    const next = new CostLedger();
    next.totalCost = this.totalCost;
    next.entries = this.entries.map((entry) => ({ ...entry }));
    return next;
  }
}

function finiteCost(cost: number): number {
  return Number.isFinite(cost) ? cost : 0;
}
