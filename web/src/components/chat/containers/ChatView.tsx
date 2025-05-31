/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useMemo } from "react";
import { Message, MessageContent } from "../../../stores/ApiTypes";
import ChatThreadView from "../thread/ChatThreadView";
import ChatInputSection from "./ChatInputSection";
import { useQuery } from "@tanstack/react-query";
import useModelStore from "../../../stores/ModelStore";

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

      <ChatInputSection
        status={status}
        onSendMessage={handleSendMessage}
        onStop={onStop}
        selectedTools={selectedTools}
        onToolsChange={onToolsChange}
        selectedModel={model}
        onModelChange={onModelChange}
        showToolbar={!!onToolsChange}
      />
    </div>
  );
};

export default ChatView;
