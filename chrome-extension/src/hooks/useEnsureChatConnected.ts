import { useEffect } from "react";
import useGlobalChatStore from "../stores/GlobalChatStore";

type UseEnsureChatConnectedOptions = {
  autoConnect?: boolean;
  disconnectOnUnmount?: boolean;
};

export function useEnsureChatConnected(
  options: UseEnsureChatConnectedOptions = {}
) {
  const { autoConnect = true, disconnectOnUnmount = false } = options;
  const { status, connect, disconnect } = useGlobalChatStore();

  // Effect 1: ensure connection when needed
  useEffect(() => {
    if (!autoConnect) return;

    if (status === "disconnected" || status === "failed") {
      connect().catch((error) => {
        console.error("Failed to connect to global chat:", error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, autoConnect]);

  // Effect 2: disconnect strictly on unmount if requested
  useEffect(() => {
    return () => {
      if (disconnectOnUnmount) {
        disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disconnectOnUnmount]);
}
