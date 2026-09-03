import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { restFetch } from "../lib/rest-fetch";
import { isElectron } from "../lib/env";
import { useNotificationStore } from "../stores/NotificationStore";

export type OAuthProvider = "openai" | "hf" | "claude";

interface OAuthProviderConfig {
  label: string;
  /** Whether the backend exposes a disconnect endpoint for this provider. */
  canDisconnect: boolean;
  /**
   * Whether `/start` may answer `manual: true`, meaning the provider redirects
   * somewhere this server cannot receive and the user finishes the login by
   * pasting something back to `/complete`.
   */
  canCompleteManually: boolean;
  /**
   * What the user pastes back: the whole redirect address the browser lands
   * on (Codex), or the `code#state` the provider's own page displays (Claude).
   */
  manualInput: OAuthManualInput;
}

/** What a manual completion asks the user to paste. */
export type OAuthManualInput = "address" | "code";

const PROVIDER_CONFIG = {
  openai: {
    label: "OpenAI",
    canDisconnect: true,
    canCompleteManually: true,
    manualInput: "address"
  },
  hf: {
    label: "HuggingFace",
    canDisconnect: false,
    canCompleteManually: false,
    manualInput: "address"
  },
  claude: {
    label: "Claude",
    canDisconnect: true,
    canCompleteManually: true,
    manualInput: "code"
  }
} satisfies Record<OAuthProvider, OAuthProviderConfig>;

interface TokensResponse {
  tokens: unknown[];
}

interface StartResponse {
  auth_url?: string;
  /** The redirect can't reach this server — finish with a pasted address. */
  manual?: boolean;
  /** The address the provider redirects to, shown so the user recognizes it. */
  redirect_uri?: string;
  detail?: string;
}

/** A login waiting for the user to paste back where the browser was sent. */
export interface OAuthManualPrompt {
  /** Authorization URL, in case the pop-up was blocked or closed. */
  authUrl: string;
  /** The redirect address to look for in the browser's address bar. */
  redirectUri: string | null;
  /** Whether to paste that address, or a code the provider's page shows. */
  input: OAuthManualInput;
}

/**
 * Claim a window synchronously so the browser credits it to the user's click,
 * and show something while /start is in flight. Returns null when the pop-up
 * was blocked. `noopener` is deliberately absent — it would null the handle we
 * need to navigate — so the opener link is severed by hand instead.
 */
const openPlaceholderWindow = (label: string): Window | null => {
  const authWindow = window.open("", "_blank", "width=600,height=700");
  if (!authWindow) {
    return null;
  }
  try {
    authWindow.opener = null;
    const doc = authWindow.document;
    doc.title = `Connecting to ${label}…`;
    if (doc.body) {
      doc.body.style.font = "16px sans-serif";
      doc.body.style.padding = "2rem";
      doc.body.textContent = `Connecting to ${label}…`;
    }
  } catch {
    // A browser that refuses to let us touch the blank document can still be
    // navigated, which is all the flow actually needs.
  }
  return authWindow;
};

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
  /** Set when the login can only be finished by pasting the redirect address. */
  manualPrompt: OAuthManualPrompt | null;
  /** True while a pasted address is being exchanged. */
  isSubmittingManual: boolean;
  /** Finish the pending login from the pasted address. */
  submitManualCode: (input: string) => Promise<void>;
  /** Abandon the pending login. */
  cancelManual: () => void;
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
  const [manualPrompt, setManualPrompt] = useState<OAuthManualPrompt | null>(
    null
  );
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

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
      const current = query.state.data;
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
      setManualPrompt(null);
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

    // The auth URL only exists after a round-trip to /start, but a window
    // opened after that await counts as gestureless and mobile browsers block
    // it silently — the login page simply never appears. So claim the window
    // now, in the click's own tick, and point it at the URL once it lands.
    const useNativeBrowser = isElectron && !!window.api?.shell?.openExternal;
    const authWindow = useNativeBrowser
      ? null
      : openPlaceholderWindow(config.label);

    try {
      const response = await restFetch(`/api/oauth/${provider}/start`);
      const body = (await response.json().catch(() => null)) as
        | StartResponse
        | null;

      if (!response.ok || !body?.auth_url) {
        throw new Error(body?.detail || "Failed to start OAuth flow");
      }

      const authUrl = body.auth_url;
      // The provider will redirect somewhere this server never sees. Ask for
      // the address the browser lands on instead of waiting for a callback
      // that cannot arrive.
      if (body.manual && config.canCompleteManually) {
        setManualPrompt({
          authUrl,
          redirectUri: body.redirect_uri ?? null,
          input: config.manualInput
        });
      }
      if (useNativeBrowser) {
        await window.api?.shell?.openExternal(authUrl);
      } else if (authWindow) {
        authWindow.location.replace(authUrl);
      } else {
        // Pop-up blocked (the strict default on mobile Safari). Hand the whole
        // tab to the provider instead; the poll picks the token up on return.
        window.open(authUrl, "_self");
      }
    } catch (error) {
      authWindow?.close();
      setIsConnecting(false);
      setManualPrompt(null);
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

  const submitManualCode = useCallback(
    async (input: string) => {
      if (!provider || !config) {
        return;
      }
      setIsSubmittingManual(true);
      try {
        const response = await restFetch(`/api/oauth/${provider}/complete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: input })
        });
        const body = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        if (!response.ok) {
          throw new Error(body?.detail || "Could not complete the sign-in");
        }
        setManualPrompt(null);
        await queryClient.invalidateQueries({ queryKey: tokenQueryKey });
      } catch (error) {
        addNotification({
          content:
            error instanceof Error
              ? error.message
              : `Could not complete the ${config.label} sign-in`,
          type: "error",
          alert: true
        });
      } finally {
        setIsSubmittingManual(false);
      }
    },
    [provider, config, addNotification, queryClient, tokenQueryKey]
  );

  const cancelManual = useCallback(() => {
    setManualPrompt(null);
    setIsConnecting(false);
  }, []);

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
    disconnect,
    manualPrompt,
    isSubmittingManual,
    submitManualCode,
    cancelManual
  };
};
