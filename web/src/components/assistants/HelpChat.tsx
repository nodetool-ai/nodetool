import React, { useCallback } from "react";
import ChatView from "./ChatView";
import { useChatStore } from "../../stores/ChatStore";
import { Box, Typography, Button, Stack } from "@mui/material";
import { useTutorialStore } from "../../stores/TutorialStore";
import { useQueryClient } from "@tanstack/react-query";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { ChatHeader } from "./chat/ChatHeader";
import { DEFAULT_MODEL } from "../../config/constants";
import LlamaModelSelect from "../properties/LlamaModelSelect";

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
  const { messages, isLoading, sendMessage, setMessages } = useChatStore();
  const [selectedModel, setSelectedModel] = React.useState(DEFAULT_MODEL);
  const handleResetChat = useCallback(() => {
    setMessages([]);
    useTutorialStore.getState().endTutorial();
  }, [setMessages]);

  const handleModelChange = useCallback((model: any) => {
    setSelectedModel(model.repo_id);
  }, []);

  const handleStarterClick = useCallback(
    (prompt: string) => {
      sendMessage(
        {
          type: "message",
          name: "user",
          role: "user",
          content: prompt
        },
        selectedModel
      );
    },
    [sendMessage, selectedModel]
  );

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

      <Box sx={{ px: 2, py: 1, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Model:
        </Typography>
        <Box sx={{ flexGrow: 1 }}>
          <LlamaModelSelect
            value={selectedModel}
            onChange={handleModelChange}
          />
        </Box>
      </Box>

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
        status={isLoading ? "loading" : "connected"}
        messages={messages}
        sendMessage={(message) => sendMessage(message, selectedModel)}
        currentNodeName={null}
        progress={0}
        total={0}
        currentToolCall={null}
        chunks={""}
      />
    </div>
  );
};

export default HelpChat;
