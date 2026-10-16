import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../queryClient";
import { requiredSecretForProvider } from "../stores/ModelMenuStore";
import useSecretsStore from "../stores/SecretsStore";

/**
 * The API key a provider needs when it is not set, else null. Null while the
 * secrets load, so a field never flashes a warning for a key that is set.
 *
 * Model fields render in places with no `QueryClientProvider` above them
 * (setup flows, tests), so this reads the app's client directly. It shares
 * the `["secrets"]` cache with `useSecrets`.
 */
export const useProviderKeyMissing = (provider?: string): string | null => {
  const secret = provider ? requiredSecretForProvider(provider) : null;
  const { data: secrets, isSuccess } = useQuery(
    {
      queryKey: ["secrets"],
      queryFn: () => useSecretsStore.getState().fetchSecrets(),
      staleTime: 30000,
      enabled: secret !== null
    },
    queryClient
  );
  if (!secret || !isSuccess) {
    return null;
  }
  return secrets.some((s) => s.key === secret && s.is_configured)
    ? null
    : secret;
};
