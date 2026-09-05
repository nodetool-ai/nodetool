/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo } from "react";
import MediaChatComposer from "../composer/MediaChatComposer";
import { LanguageModel, MessageContent } from "../../../stores/ApiTypes";
import { CHAT_COLUMN_MAX_WIDTH, type ChatStatus } from "../types/chat.types";
import type { MediaGenerationRequest } from "../types/media.types";

const styles = (_theme: Theme) =>
  css({
    width: "100%",
    // Match the message column (`chatMessagesList`) so the composer and the
    // thread share the same left/right edges.
    maxWidth: `${CHAT_COLUMN_MAX_WIDTH}px`,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    padding: "0",
    margin: "auto auto 0 auto", // Center horizontally, push to bottom
    flexShrink: 0,

    ".chat-composer-wrapper": {
      flex: 1,
      minWidth: 0,
      width: "100%",
      minHeight: "44px",
      display: "flex",
      flexDirection: "column"
    }
  });

type ChatInputSectionProps = {
  status: ChatStatus;
  onSendMessage: (
    content: MessageContent[],
    prompt: string,
    mediaGeneration?: MediaGenerationRequest
  ) => Promise<void> | void;
  onStop?: () => void;
  selectedModel?: LanguageModel;
  onModelChange?: (model: LanguageModel) => void;
  allowedProviders?: string[];
  requireToolSupport?: boolean;
  /** Override the composer's textarea placeholder. */
  placeholder?: string;
  /** Pure chat panel: hide the media mode picker, force chat mode. */
  hideModePicker?: boolean;
  hideModelPicker?: boolean;
  /** Thread this composer writes to; used to pick up a seeded prompt. */
  threadId?: string | null;
};

const ChatInputSection = ({
  status,
  onSendMessage,
  onStop,
  selectedModel,
  onModelChange,
  allowedProviders,
  requireToolSupport,
  placeholder,
  hideModePicker,
  hideModelPicker,
  threadId
}: ChatInputSectionProps) => {
  const isLoading = status === "loading";
  const isStreaming = status === "streaming";
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  return (
    <div className="chat-input-section" css={cssStyles}>
      <div className="chat-composer-wrapper">
        <MediaChatComposer
          isLoading={isLoading}
          isStreaming={isStreaming}
          onSendMessage={onSendMessage}
          onStop={onStop}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          allowedProviders={allowedProviders}
          requireToolSupport={requireToolSupport}
          placeholder={placeholder}
          hideModePicker={hideModePicker}
          hideModelPicker={hideModelPicker}
          threadId={threadId}
        />
      </div>
    </div>
  );
};

export default memo(ChatInputSection);
