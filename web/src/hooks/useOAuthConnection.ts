import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { restFetch } from "../lib/rest-fetch";
import { isElectron } from "../lib/env";
import { useNotificationStore } from "../stores/NotificationStore";

export type OAuthProvider = "openai" | "hf";

interface OAuthProviderConfig {
  label: string;
  /** Whether the backend exposes a disconnect endpoint for this provider. */
  canDisconnect: boolean;
}

const PROVIDER_CONFIG: Record<OAuthProvider, OAuthProviderConfig> = {
  openai: { label: "OpenAI", canDisconnect: true },
  hf: { label: "HuggingFace", canDisconnect: false }
};

interface TokensResponse {
  tokens: unknown[];
}

export interface OAuthConnection {
  /** Provider label for UI (e.g. "OpenAI"). */
  label: string;
  /** True once the backend reports at least one stored token. */
  isConnected: boolean;
  /** True while an OAuth flow is in progress and we're polling for the token. */
  isConnecting: boolean;
  /** Whether disconnect is supported for this provider. */
  canDisconnect: boolean;
  /** Open the provider's OAuth flow and poll for completion. */
  connect: () => Promise<void>;
  /** Revoke stored tokens (no-op when unsupported). */
  disconnect: () => Promise<void>;
}

/**
 * OAuth connection state for a provider, extracted from the settings menus so
 * it can drive the provider cards. Pass `null` to keep the hook inert (no
 * request, never connected) — lets a card call it unconditionally.
 */
export const useOAuthConnection = (
  provider: OAuthProvider | null
): OAuthConnection => {
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore((state) => state.addNotification);
  const [isConnecting, setIsConnecting] = useState(false);

  const config = provider ? PROVIDER_CONFIG[provider] : null;
  const tokenQueryKey = useMemo(() => ["oauth-token", provider], [provider]);

  const { data, isError } = useQuery({
    queryKey: tokenQueryKey,
    queryFn: async () => {
      const response = await restFetch(`/api/oauth/${provider}/tokens`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${config?.label} token`);
      }
      return (await response.json()) as TokensResponse;
    },
    enabled: provider !== null,
    refetchInterval: (query) => {
      const current = query.state.data as TokensResponse | undefined;
      if (isConnecting && !(current?.tokens && current.tokens.length > 0)) {
        return 2000;
      }
      return false;
    },
    retry: true
  });

  const isConnected = !!(data?.tokens && data.tokens.length > 0);

  // Resolve the connecting state once the token lands (or the poll errors).
  useEffect(() => {
    if (!isConnecting || !config) {
      return;
    }
    if (isConnected) {
      setIsConnecting(false);
      addNotification({
        content: `Successfully connected to ${config.label}`,
        type: "success",
        alert: true
      });
    } else if (isError) {
      setIsConnecting(false);
      addNotification({
        content: `Failed to check ${config.label} connection`,
        type: "error",
        alert: true
      });
    }
  }, [isConnecting, isConnected, isError, addNotification, config]);

  const connect = useCallback(async () => {
    if (!provider || !config) {
      return;
    }
    setIsConnecting(true);
    try {
      const response = await restFetch(`/api/oauth/${provider}/start`);
      const body = (await response.json().catch(() => null)) as
        | { auth_url?: string; detail?: string }
        | null;

      if (!response.ok || !body?.auth_url) {
        throw new Error(body?.detail || "Failed to start OAuth flow");
      }

      const authUrl = body.auth_url;
      if (isElectron && window.api?.shell?.openExternal) {
        await window.api.shell.openExternal(authUrl);
      } else {
        window.open(
          authUrl,
          "_blank",
          "noopener,noreferrer,width=600,height=700"
        );
      }
    } catch (error) {
      setIsConnecting(false);
      addNotification({
        content:
          error instanceof Error
            ? error.message
            : `Failed to initiate ${config.label} login`,
        type: "error",
        alert: true
      });
    }
  }, [provider, config, addNotification]);

  const disconnect = useCallback(async () => {
    if (!provider || !config?.canDisconnect) {
      return;
    }
    try {
      const response = await restFetch(`/api/oauth/${provider}/disconnect`, {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Failed to disconnect");
      }
      await queryClient.invalidateQueries({ queryKey: tokenQueryKey });
      addNotification({
        content: `Disconnected from ${config.label}`,
        type: "success",
        alert: true
      });
    } catch {
      addNotification({
        content: `Failed to disconnect from ${config.label}`,
        type: "error",
        alert: true
      });
    }
  }, [provider, config, addNotification, queryClient, tokenQueryKey]);

  return {
    label: config?.label ?? "",
    isConnected,
    isConnecting,
    canDisconnect: config?.canDisconnect ?? false,
    connect,
    disconnect
  };
};
