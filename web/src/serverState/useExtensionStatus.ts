import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { trpcClient } from "../trpc/client";

export const extensionQueryKeys = {
  all: ["extension"] as const,
  status: () => [...extensionQueryKeys.all, "status"] as const
};

export interface ExtensionStatus {
  /** The extension is running and reached its native host. */
  connected: boolean;
  /** A browser on the server's machine has the native host registered. */
  hostInstalled: boolean;
  /** Where the server finds the built extension. Empty on the cloud profile. */
  distPath: string;
  distExists: boolean;
}

interface UseExtensionStatusResult {
  status: ExtensionStatus | undefined;
  isLoading: boolean;
}

/**
 * Whether the NodeTool Chrome extension is connected. Polls while mounted,
 * because the user installs the extension in another window and the surface
 * that asked should notice without a reload.
 */
export const useExtensionStatus = (): UseExtensionStatusResult => {
  const { data, isLoading } = useQuery({
    queryKey: extensionQueryKeys.status(),
    queryFn: () => trpcClient.extension.status.query(),
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    staleTime: 0
  });
  return { status: data, isLoading };
};

interface UseInstallExtensionHostResult {
  install: () => void;
  isInstalling: boolean;
  /** Why the last registration failed, as the server reported it. */
  error: string | null;
}

/**
 * Register the extension's native host with the browsers on this machine, so
 * Chrome can start the bridge between the extension and NodeTool.
 */
export const useInstallExtensionHost = (): UseInstallExtensionHostResult => {
  const queryClient = useQueryClient();
  const { mutate, isPending, error } = useMutation({
    mutationFn: () => trpcClient.extension.installHost.mutate(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: extensionQueryKeys.status() })
  });
  return {
    install: mutate,
    isInstalling: isPending,
    error: error ? error.message : null
  };
};

export default useExtensionStatus;
