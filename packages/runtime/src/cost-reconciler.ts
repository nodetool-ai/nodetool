/**
 * Provider cost reconciler registry.
 *
 * Most generative providers (FAL, …) can only return an *estimated* cost at
 * call time. When a provider also exposes an after-the-fact billing API keyed
 * by request id, it registers a reconciler here. The runner then refines the
 * estimate it persisted into the actual billed amount in the background.
 *
 * Keeping this in `runtime` lets the runner stay decoupled from any specific
 * provider package — FAL registers its reconciler when its node module loads.
 */

export interface CostReconcileInput {
  /** Provider-side request id to look the charge up by. */
  requestId: string;
  /** Provider endpoint / model id, when known (helps narrow the query). */
  endpointId?: string | null;
  /** Per-user secrets (API keys) available for the originating run. */
  secrets?: Record<string, string>;
}

export interface ReconciledCost {
  /** Actual billed cost, in `currency`. */
  cost: number;
  currency?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
}

export type CostReconciler = (
  input: CostReconcileInput
) => Promise<ReconciledCost | null>;

const reconcilers = new Map<string, CostReconciler>();

/** Register a reconciler for a provider (e.g. "fal"). Last registration wins. */
export function registerCostReconciler(
  provider: string,
  reconciler: CostReconciler
): void {
  reconcilers.set(provider, reconciler);
}

/** Look up a provider's reconciler, if one was registered. */
export function getCostReconciler(
  provider: string
): CostReconciler | undefined {
  return reconcilers.get(provider);
}
