import React, { useCallback, useEffect } from "react";
import ChatView from "./ChatView";
import { Button, Stack, Alert } from "@mui/material";
import { useTutorialStore } from "../../../stores/TutorialStore";
import { ChatHeader } from "./ChatHeader";
import { DEFAULT_MODEL } from "../../../config/constants";
import useHelpChatStore from "../../../stores/HelpChatStore";

const CONVERSATION_STARTERS = [
  {
    title: "Models",
    prompt: "Tell me about the different AI models I can use"
  },
  {
    title: "Assets",
    prompt: "How do I work with assets in Nodetool?"
  },
  {
    title: "Workflow Basics",
    prompt: "What are the basics of creating workflows?"
  },
  {
    title: "Keyboard Shortcuts",
    prompt: "What keyboard shortcuts are available?"
  }
];

const HelpChat: React.FC = () => {
  const {
    connect,
    messages,
    status,
    sendMessage,
    progressMessage,
    resetMessages,
    error,
    progress,
    total
  } = useHelpChatStore();
  const [selectedModel, setSelectedModel] = React.useState(DEFAULT_MODEL);
  const handleResetChat = useCallback(() => {
    resetMessages();
    useTutorialStore.getState().endTutorial();
  }, [resetMessages]);

  const handleModelChange = useCallback((model: any) => {
    setSelectedModel(model.id);
  }, []);

  const handleStarterClick = useCallback(
    (prompt: string) => {
      sendMessage({
        type: "message",
        name: "user",
        role: "user",
        model: "help:" + selectedModel,
        content: prompt
      });
    },
    [sendMessage, selectedModel]
  );

  useEffect(() => {
    if (status === "disconnected") {
      connect().catch((error) => {
        console.error("Failed to connect to help chat:", error);
      });
    }
  }, [connect, status]);

  return (
    <div
      className="help-chat"
      style={{
        margin: ".5em",
        height: "calc(100vh - 5em)",
        minHeight: "300px",
        maxHeight: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      <ChatHeader
        isMinimized={false}
        onReset={messages.length > 0 ? handleResetChat : undefined}
        messagesCount={messages.length}
        title="Help Chat"
        description="Help Chat"
      />

      {(error || status === "reconnecting") && (
        <Alert
          severity={status === "reconnecting" ? "info" : "error"}
          sx={{ mx: 2, my: 1 }}
        >
          {status === "reconnecting"
            ? progressMessage || "Reconnecting to help chat..."
            : error}
        </Alert>
      )}

      {messages.length === 0 && (
        <Stack spacing={1} sx={{ px: 2, py: 1 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Stack direction="column" spacing={1}>
              {CONVERSATION_STARTERS.slice(
                0,
                Math.ceil(CONVERSATION_STARTERS.length / 2)
              ).map((starter) => (
                <Button
                  key={starter.title}
                  variant="outlined"
                  size="small"
                  onClick={() => handleStarterClick(starter.prompt)}
                >
                  {starter.prompt}
                </Button>
              ))}
            </Stack>
            <Stack direction="column" spacing={1}>
              {CONVERSATION_STARTERS.slice(
                Math.ceil(CONVERSATION_STARTERS.length / 2)
              ).map((starter) => (
                <Button
                  key={starter.title}
                  variant="outlined"
                  size="small"
                  onClick={() => handleStarterClick(starter.prompt)}
                >
                  {starter.prompt}
                </Button>
              ))}
            </Stack>
          </Stack>
        </Stack>
      )}

      <ChatView
        model={selectedModel}
        onModelChange={handleModelChange}
        status={status}
        messages={messages}
        sendMessage={sendMessage}
        progress={progress}
        total={total}
        progressMessage={progressMessage}
      />
    </div>
  );
};

export default HelpChat;
