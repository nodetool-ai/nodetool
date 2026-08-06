/**
 * Derives the Studio credit balance from the prediction ledger the whole
 * platform already writes: every provider call lands in `nodetool_predictions`
 * with its cost, `costs.dashboard` aggregates it, and this hook converts the
 * total to credits against the prototype grant. Display-level only — nothing
 * is blocked client-side; hard enforcement belongs to the server budget gate.
 */

import { useMemo } from "react";
import { trpc } from "../trpc/client";
import { STUDIO_CREDIT_GRANT, USD_PER_CREDIT } from "./curatedModels";

export interface StudioCredits {
  grant: number;
  used: number;
  remaining: number;
  /** True until the first ledger response arrives. */
  loading: boolean;
}

export function useStudioCredits(): StudioCredits {
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const query = trpc.costs.dashboard.useQuery(
    { days: 90, tzOffsetMinutes, executionsLimit: 1 },
    { staleTime: 60_000, retry: false, refetchOnWindowFocus: false }
  );

  return useMemo(() => {
    const spentUsd =
      query.data?.providers.reduce((sum, p) => sum + (p.total_cost ?? 0), 0) ??
      0;
    const used = Math.ceil(spentUsd / USD_PER_CREDIT);
    return {
      grant: STUDIO_CREDIT_GRANT,
      used,
      remaining: Math.max(0, STUDIO_CREDIT_GRANT - used),
      loading: query.isLoading
    };
  }, [query.data, query.isLoading]);
}
