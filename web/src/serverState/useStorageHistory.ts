import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StorageRetentionPolicy } from "@nodetool-ai/protocol/api-schemas/settings.js";
import { trpcClient } from "../trpc/client";

const storageHistoryQueryKey = ["settings", "storage-history"] as const;

export function useStorageHistory() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: storageHistoryQueryKey,
    queryFn: () => trpcClient.settings.history.get.query(),
    staleTime: 30 * 1000
  });

  const update = useMutation({
    mutationFn: (policy: StorageRetentionPolicy) =>
      trpcClient.settings.history.update.mutate(policy),
    onSuccess: (data) => {
      queryClient.setQueryData(storageHistoryQueryKey, data);
    }
  });

  const cleanup = useMutation({
    mutationFn: () => trpcClient.settings.history.cleanup.mutate(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: storageHistoryQueryKey })
  });

  const compact = useMutation({
    mutationFn: () => trpcClient.settings.history.compact.mutate(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: storageHistoryQueryKey })
  });

  return {
    ...query,
    updatePolicy: update.mutateAsync,
    cleanup: cleanup.mutateAsync,
    compact: compact.mutateAsync,
    isUpdating: update.isPending,
    isCleaning: cleanup.isPending,
    isCompacting: compact.isPending
  };
}
