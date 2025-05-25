import React, { useEffect } from "react";
import { Box } from "@mui/material";
import ChatView from "./ChatView";
import BackToEditorButton from "../panels/BackToEditorButton";
import useGlobalChatStore from "../../stores/GlobalChatStore";

const GlobalChat: React.FC = () => {
  const {
    connect,
    status,
    messages,
    sendMessage,
    progress,
    resetMessages,
    statusMessage,
  } = useGlobalChatStore();

  useEffect(() => {
    if (status === "disconnected") {
      connect().catch(console.error);
    }
    return () => {
      resetMessages();
      connect().catch(() => null);
    };
  }, [connect, status, resetMessages]);

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Box sx={{ p: 1 }}>
        <BackToEditorButton />
      </Box>
      <Box sx={{ flex: 1, overflow: "hidden" }}>
        <ChatView
          status={status}
          messages={messages}
          sendMessage={sendMessage}
          progress={progress.current}
          total={progress.total}
          progressMessage={statusMessage}
        />
      </Box>
    </Box>
  );
};

export default GlobalChat;
