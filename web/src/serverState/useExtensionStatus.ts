import { useQuery } from "@tanstack/react-query";

import { trpcClient } from "../trpc/client";

export const extensionQueryKeys = {
  all: ["extension"] as const,
  status: () => [...extensionQueryKeys.all, "status"] as const
};

export interface ExtensionStatus {
  /** The extension is running and reached its native host. */
  connected: boolean;
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

export default useExtensionStatus;
