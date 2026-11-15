import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ProviderCreditResponse,
  ProviderCreditsOutput
} from "@nodetool-ai/protocol/api-schemas/settings.js";
import { trpcClient } from "../trpc/client";

export const providerCreditsQueryKey = ["settings", "provider-credits"] as const;

interface UseProviderCreditResult {
  credit: ProviderCreditResponse | null;
  /** Ask the provider again, bypassing the server cache. */
  refresh: () => Promise<void>;
}

/**
 * The remaining credit of one provider, from the server's cache of balance
 * reads and payment refusals. Null while loading and for providers with no
 * balance endpoint and no refusal on record.
 */
export function useProviderCredit(
  providerId: string | undefined
): UseProviderCreditResult {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: providerCreditsQueryKey,
    queryFn: () => trpcClient.settings.providerCredits.query(),
    enabled: Boolean(providerId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const credit = useMemo(
    () => data?.find((row) => row.provider === providerId)?.credit ?? null,
    [data, providerId]
  );

  const refresh = useCallback(async () => {
    if (!providerId) return;
    const fresh = await trpcClient.settings.providerCredits.query({
      provider: providerId,
      refresh: true
    });
    queryClient.setQueryData<ProviderCreditsOutput>(
      providerCreditsQueryKey,
      (previous) => [
        ...(previous ?? []).filter((row) => row.provider !== providerId),
        ...fresh
      ]
    );
  }, [providerId, queryClient]);

  return { credit, refresh };
}
