import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import useGlobalChatStore from "../stores/GlobalChatStore";
import { Message, LanguageModel } from "../stores/ApiTypes";
import { truncateString } from "../utils/truncateString";

export const useChatService = (selectedModel: LanguageModel | null) => {
  const navigate = useNavigate();
  const {
    connect,
    disconnect,
    status,
    sendMessage,
    createNewThread,
    switchThread,
    threads,
    messageCache,
    ...rest
  } = useGlobalChatStore();

  useEffect(() => {
    if (status === "disconnected") {
      connect().catch((error) => {
        console.error("Failed to connect to chat service:", error);
      });
    }

    return () => {
      if (status !== "disconnected") {
        disconnect();
      }
    };
  }, [connect, disconnect, status]);

  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout | null = null;

    const attemptReconnect = () => {
      if (status === "disconnected" || status === "failed") {
        console.log(
          "Dashboard: Connection lost, attempting automatic reconnect..."
        );
        connect().catch((error) => {
          console.error("Dashboard: Automatic reconnect failed:", error);
        });
      }
    };

    if (status === "disconnected" || status === "failed") {
      reconnectTimer = setTimeout(attemptReconnect, 2000);
    }

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [status, connect]);

  const handleSendMessage = useCallback(
    async (message: Message) => {
      if (!selectedModel) {
        console.error("No model selected");
        return;
      }

      if (status !== "connected" && status !== "reconnecting") {
        console.error("Not connected to chat service");
        return;
      }

      try {
        const messageWithModel = {
          ...message,
          model: selectedModel.id
        };

        if (status !== "connected") {
          await connect();
        }
        const threadId = await createNewThread();
        switchThread(threadId);

        await sendMessage(messageWithModel);
        navigate("/chat");
      } catch (error) {
        console.error("Failed to send message:", error);
      }
    },
    [
      selectedModel,
      sendMessage,
      status,
      connect,
      navigate,
      createNewThread,
      switchThread
    ]
  );

  const handleThreadSelect = useCallback(
    (threadId: string) => {
      switchThread(threadId);
      navigate(`/chat/${threadId}`);
    },
    [switchThread, navigate]
  );

  const handleNewThread = useCallback(async () => {
    try {
      const newThreadId = await createNewThread();
      switchThread(newThreadId);
      navigate(`/chat/${newThreadId}`);
    } catch (error) {
      console.error("Failed to create new thread:", error);
    }
  }, [createNewThread, switchThread, navigate]);

  const getThreadPreview = useCallback(
    (threadId: string) => {
      const thread = threads[threadId];
      if (!thread) {
        return "No messages yet";
      }

      // Use thread title if available
      if (thread.title) {
        return truncateString(thread.title, 100);
      }

      // Check if we have cached messages for this thread
      const threadMessages = messageCache[threadId];
      if (!threadMessages || threadMessages.length === 0) {
        return "New conversation";
      }

      const firstUserMessage = threadMessages.find((m) => m.role === "user");
      const preview = firstUserMessage?.content
        ? typeof firstUserMessage.content === "string"
          ? firstUserMessage.content
          : "Chat started"
        : "Chat started";

      return truncateString(preview, 100);
    },
    [threads, messageCache]
  );

  return {
    status,
    sendMessage: handleSendMessage,
    onNewThread: handleNewThread,
    onSelectThread: handleThreadSelect,
    getThreadPreview,
    threads,
    ...rest
  };
};
