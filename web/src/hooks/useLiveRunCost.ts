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
import type { NodeKey } from "../stores/nodeKey";

export interface LiveRunCost {
  total: number;
  currency: string;
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
