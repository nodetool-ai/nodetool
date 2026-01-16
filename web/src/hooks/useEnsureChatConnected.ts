import { useEffect } from "react";
import log from "loglevel";

type UseEnsureChatConnectedOptions = {
  autoConnect?: boolean;
  disconnectOnUnmount?: boolean;
};

/**
 * Hook to ensure the GlobalWebSocketManager connection is active.
 *
 * NOTE: The GlobalWebSocketManager now handles connection automatically,
 * so this hook is largely a no-op. It's kept for compatibility.
 */
export function useEnsureChatConnected(
  _options: UseEnsureChatConnectedOptions = {}
) {
  const { autoConnect = true, disconnectOnUnmount = false } = _options;

  useEffect(() => {
    if (!autoConnect) {
      return;
    }

    // Connection is handled automatically by GlobalWebSocketManager
    // Just log for debugging
    log.debug("useEnsureChatConnected: WebSocketManager handles connection automatically");

    return () => {
      if (disconnectOnUnmount) {
        // WebSocketManager doesn't have a disconnect method in the new architecture
        // The connection is managed by the singleton and kept alive
      }
    };
  }, [autoConnect, disconnectOnUnmount]);
}
