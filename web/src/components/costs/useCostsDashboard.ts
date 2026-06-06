import { useMemo } from "react";
import { trpc } from "../../trpc/client";
import type { DateRange } from "./costsData";
import { apiToView, rangeToDays, type CostsView } from "./costsView";

export interface UseCostsDashboardResult {
  /** Mapped view when the query has loaded real data; null otherwise. */
  view: CostsView | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Fetches `costs.dashboard` for the given range and maps it to the dashboard
 * view model. Returns `view: null` while loading or on error so callers can
 * fall back to the bundled sample data.
 */
export function useCostsDashboard(range: DateRange): UseCostsDashboardResult {
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const query = trpc.costs.dashboard.useQuery(
    { days: rangeToDays(range), tzOffsetMinutes, executionsLimit: 500 },
    { staleTime: 60_000, retry: false, refetchOnWindowFocus: false }
  );

  const view = useMemo(
    () => (query.isSuccess && query.data ? apiToView(query.data) : null),
    [query.isSuccess, query.data]
  );

  return { view, isLoading: query.isLoading, isError: query.isError };
}
