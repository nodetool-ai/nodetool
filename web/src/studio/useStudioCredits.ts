/**
 * Server-backed Studio credits: balance, plan, and the plan catalog come from
 * `trpc.credits.status`, which accrues the month's plan grant on read. The
 * server enforces spend only when the deployment sets
 * NODETOOL_CREDITS_ENFORCED (`enforced` in the payload says so).
 */

import { trpc } from "../trpc/client";
import type { RouterOutputs } from "../trpc/client";

export type CreditStatusOutput = RouterOutputs["credits"]["status"];

export interface StudioCredits {
  status: CreditStatusOutput | null;
  remaining: number;
  loading: boolean;
  refetch: () => void;
}

export function useStudioCredits(): StudioCredits {
  const query = trpc.credits.status.useQuery(undefined, {
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false
  });
  return {
    status: query.data ?? null,
    remaining: query.data?.balanceCredits ?? 0,
    loading: query.isLoading,
    refetch: () => void query.refetch()
  };
}
