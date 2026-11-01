import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "../trpc/client";

const onePasswordKey = ["settings", "onepassword"] as const;

/** Whether 1Password can be used here, and which account is connected. */
export function useOnePasswordStatus(enabled = true) {
  return useQuery({
    queryKey: [...onePasswordKey, "status"],
    queryFn: () => trpcClient.settings.onepassword.status.query(),
    enabled,
    staleTime: 60 * 1000
  });
}

/** Connect or disconnect the desktop app account. */
export function useOnePasswordConnection() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: onePasswordKey });

  const connect = useMutation({
    mutationFn: (account: string) =>
      trpcClient.settings.onepassword.connect.mutate({ account }),
    onSuccess: invalidate
  });
  const disconnect = useMutation({
    mutationFn: () => trpcClient.settings.onepassword.disconnect.mutate(),
    onSuccess: invalidate
  });

  return {
    connect: connect.mutateAsync,
    isConnecting: connect.isPending,
    disconnect: disconnect.mutateAsync,
    isDisconnecting: disconnect.isPending
  };
}

/** Vaults, items and fields for the picker. Values never reach the client. */
export function useOnePasswordVaults(enabled: boolean) {
  return useQuery({
    queryKey: [...onePasswordKey, "vaults"],
    queryFn: () => trpcClient.settings.onepassword.vaults.query(),
    enabled,
    staleTime: 60 * 1000,
    retry: false
  });
}

export function useOnePasswordItems(vaultId: string | null) {
  return useQuery({
    queryKey: [...onePasswordKey, "items", vaultId],
    queryFn: () =>
      trpcClient.settings.onepassword.items.query({ vaultId: vaultId ?? "" }),
    enabled: Boolean(vaultId),
    staleTime: 60 * 1000,
    retry: false
  });
}

export function useOnePasswordFields(
  vaultId: string | null,
  itemId: string | null
) {
  return useQuery({
    queryKey: [...onePasswordKey, "fields", vaultId, itemId],
    queryFn: () =>
      trpcClient.settings.onepassword.fields.query({
        vaultId: vaultId ?? "",
        itemId: itemId ?? ""
      }),
    enabled: Boolean(vaultId && itemId),
    staleTime: 30 * 1000,
    retry: false
  });
}
