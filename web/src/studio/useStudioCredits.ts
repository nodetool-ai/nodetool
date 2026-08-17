/**
 * Server-backed Studio credits: balance, plan, and the plan catalog come from
 * `trpc.credits.status`, which accrues the month's plan grant on read.
 * Credits meter only the `nodetool` provider (`meteredProvider` in the
 * payload) — BYOK providers stay unmetered.
 */

import { trpc } from "../trpc/client";
import type { RouterOutputs } from "../trpc/client";

export type CreditStatusOutput = RouterOutputs["credits"]["status"];

interface StudioCredits {
  status: CreditStatusOutput | null;
  remaining: number;
  loading: boolean;
  /** The balance request failed — the balance is unknown, not full or empty. */
  unavailable: boolean;
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
    unavailable: query.isError,
    refetch: () => void query.refetch()
  };
}
