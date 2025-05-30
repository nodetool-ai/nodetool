/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo } from "react";
import { Message, MessageContent } from "../../stores/ApiTypes";
import ChatThreadView from "./ChatThreadView";
import ChatComposer from "./ChatComposer";
import ChatToolBar from "./ChatToolBar";
import { Box, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import useModelStore from "../../stores/ModelStore";

const formatToolName = (toolName: string) => {
  return toolName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const styles = (theme: any) =>
  css({
    "&": {
      position: "relative",
      height: "100%",
      width: "100%",
      display: "flex",
      flexGrow: 1,
      flexDirection: "column",
      padding: "1em"
    },
    ".info-display-container": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      textAlign: "right",
      padding: "0 1em 0.5em 1em"
    },
    ".model-name-display": {
      fontSize: "var(--fontSizeNormal)",
      marginBottom: "0.5em",
      padding: "0 .5em",
      color: theme.palette.text.secondary
      // fontWeight: "bold"
    },
    ".tool-tags-container": {
      display: "flex",
      maxWidth: "800px",
      flexWrap: "wrap",
      justifyContent: "flex-end"
    },
    ".tool-tag": {
      backgroundColor: theme.palette.c_gray2,
      padding: "2px 6px",
      margin: "2px",
      borderRadius: "4px",
      fontSize: "var(--fontSizeSmaller)",
      color: theme.palette.text.primary,
      lineHeight: "1.2"
    },
    ".chat-controls": {
      padding: "0 1em",
      marginTop: "auto",
      zIndex: 1,
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    ".chat-composer-wrapper": {
      flex: 1,
      minWidth: 0
    }
  });

type ChatViewProps = {
  status: "disconnected" | "connecting" | "connected" | "loading" | "error";
  progress: number;
  total: number;
  messages: Array<Message>;
  model?: string;
  sendMessage: (message: Message) => Promise<void>;
  progressMessage: string | null;
  selectedTools?: string[];
  onToolsChange?: (tools: string[]) => void;
  onModelChange?: (modelId: string) => void;
  onStop?: () => void;
};

const ChatView = ({
  status,
  progress,
  total,
  messages,
  model,
  sendMessage,
  progressMessage,
  selectedTools = [],
  onToolsChange,
  onModelChange,
  onStop
}: ChatViewProps) => {
  const loadLanguageModels = useModelStore((state) => state.loadLanguageModels);
  const { data: availableModels } = useQuery({
    queryKey: ["models"],
    queryFn: async () => await loadLanguageModels(),
    staleTime: Infinity
  });

  const selectedModelName = useMemo(() => {
    if (!availableModels || !model) return null;
    const modelDetails = availableModels.find((m) => m.id === model);
    return modelDetails?.name || model;
  }, [availableModels, model]);

  const handleSendMessage = useCallback(
    async (content: MessageContent[], prompt: string) => {
      try {
        await sendMessage({
          type: "message",
          name: "",
          role: "user",
          model: model ? `help:${model}` : undefined,
          content: content,
          tools: selectedTools.length > 0 ? selectedTools : undefined
        });
      } catch (error) {
        console.error("Error sending message:", error);
      }
    },
    [sendMessage, model, selectedTools]
  );

  return (
    <div className="chat-view" css={styles}>
      <ChatThreadView
        messages={messages}
        status={status}
        progress={progress}
        total={total}
        progressMessage={progressMessage}
      />

      <Box className="info-display-container">
        {selectedModelName && (
          <Typography
            variant="caption"
            className="model-name-display"
            sx={{ mt: selectedTools.length > 0 ? 0.25 : 0 }}
          >
            {selectedModelName}
          </Typography>
        )}
        {selectedTools.length > 0 && (
          <Box className="tool-tags-container">
            {selectedTools.map((tool) => (
              <Box key={tool} className="tool-tag">
                {formatToolName(tool)}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <div className="chat-controls">
        {onToolsChange && (
          <ChatToolBar
            selectedTools={selectedTools}
            onToolsChange={onToolsChange}
            selectedModel={model}
            onModelChange={onModelChange}
          />
        )}
        <div className="chat-composer-wrapper">
          <ChatComposer
            status={status}
            onSendMessage={handleSendMessage}
            onStop={onStop}
            disabled={status === "loading" || status === "error"}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatView;

export { Progress } from "./ChatThreadView";
