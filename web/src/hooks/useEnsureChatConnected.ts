import { useEffect } from "react";
import useGlobalChatStore from "../stores/GlobalChatStore";
import type { NodeStore } from "../stores/NodeStore";

type UseEnsureChatConnectedOptions = {
  nodeStore?: NodeStore | null;
  autoConnect?: boolean;
  disconnectOnUnmount?: boolean;
};

export function useEnsureChatConnected(
  options: UseEnsureChatConnectedOptions = {}
) {
  const {
    nodeStore = null,
    autoConnect = true,
    disconnectOnUnmount = false
  } = options;
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
  }, [status, nodeStore, autoConnect]);

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
