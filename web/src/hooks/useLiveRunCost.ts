/**
 * useLiveRunCost — running provider spend for a workflow's focused run.
 *
 * Sums the {@link ProviderCost} amounts ResultsStore recorded for every node of
 * the workflow's focused job. Keys are `${workflowId}:${jobId}:${nodeId}`, so we
 * filter by the run prefix and add up the USD charges. Returns `{ total: 0 }`
 * when there is no focused run.
 */

import { useMemo } from "react";
import useResultsStore from "../stores/ResultsStore";
import useWorkflowRunsStore from "../stores/WorkflowRunsStore";
import useBudgetStore from "../stores/BudgetStore";
import type { NodeKey } from "../stores/nodeKey";
import type { ProviderCost } from "../stores/ApiTypes";

export interface LiveRunCost {
  total: number;
  currency: string;
}

/** Is this charge a finite USD amount we can fold into a dollar figure? */
function isUsdCharge(cost: ProviderCost): boolean {
  // Mirror the guard below: credit-denominated providers (e.g. kie) still carry
  // USD in `amount`, so treat an undefined currency as USD.
  return (
    typeof cost.amount === "number" &&
    Number.isFinite(cost.amount) &&
    (!cost.currency || cost.currency === "USD")
  );
}

/**
 * Sum every recorded USD provider charge across all runs this session. This is
 * the source of truth for cumulative spend, so recomputing from it (rather than
 * adding deltas) is idempotent when a node re-emits its `provider_cost`.
 */
export function sumSessionProviderSpend(
  providerCosts: Record<string, ProviderCost>
): number {
  let sum = 0;
  for (const key in providerCosts) {
    const cost = providerCosts[key];
    if (isUsdCharge(cost)) {
      sum += cost.amount;
    }
  }
  return sum;
}

/**
 * Mirror BudgetStore's running `spent` onto the sum of the provider costs
 * ResultsStore has recorded. Call from the update pipeline (non-React context)
 * after writing a new `provider_cost`.
 */
export function syncBudgetSpentFromProviderCosts(): void {
  const providerCosts = useResultsStore.getState().providerCosts;
  useBudgetStore
    .getState()
    .setSpent(sumSessionProviderSpend(providerCosts));
}

export function useLiveRunCost(workflowId: string): LiveRunCost {
  const jobId = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  const total = useResultsStore((s) => {
    if (!jobId) {
      return 0;
    }
    const prefix = `${workflowId}:${jobId}:`;
    let sum = 0;
    for (const key in s.providerCosts) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      const cost = s.providerCosts[key as NodeKey];
      // Only fold same-currency (USD) charges into the running dollar figure;
      // credit-denominated providers (e.g. kie) carry USD in `amount` too.
      if (
        typeof cost.amount === "number" &&
        Number.isFinite(cost.amount) &&
        (!cost.currency || cost.currency === "USD")
      ) {
        sum += cost.amount;
      }
    }
    return sum;
  });

  return useMemo(() => ({ total, currency: "USD" }), [total]);
}

export default useLiveRunCost;
