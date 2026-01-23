/** @jsxImportSource @emotion/react */
import React, {
  useRef,
  useState,
  useCallback,
  useEffect
} from "react";
import { useTheme } from "@mui/material/styles";
import { Box, Typography, IconButton, Tooltip, Collapse } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ClearIcon from "@mui/icons-material/Clear";
import ScheduleSendIcon from "@mui/icons-material/ScheduleSend";
import { MessageContent } from "../../../stores/ApiTypes";
import { useKeyPressed } from "../../../stores/KeyPressedStore";
import { FilePreview } from "./FilePreview";
import { MessageInput } from "./MessageInput";
import { ActionButtons } from "./ActionButtons";
import { useFileHandling } from "../hooks/useFileHandling";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import { createStyles } from "./ChatComposer.styles";

interface ChatComposerProps {
  isLoading: boolean;
  isStreaming: boolean;
  onSendMessage: (
    content: MessageContent[],
    prompt: string,
    agentMode: boolean
  ) => void;
  onStop?: () => void;
  onNewChat?: () => void;
  disabled?: boolean;
  agentMode?: boolean;
}

interface QueuedMessage {
  content: MessageContent[];
  prompt: string;
  agentMode: boolean;
}

const ChatComposer: React.FC<ChatComposerProps> = ({
  isLoading,
  isStreaming,
  onSendMessage,
  onStop,
  onNewChat,
  disabled = false,
  agentMode = false
}) => {
  const theme = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [queuedMessage, setQueuedMessage] = useState<QueuedMessage | null>(null);

  const { metaKeyPressed, altKeyPressed, shiftKeyPressed } = useKeyPressed(
    (state) => ({
      metaKeyPressed: state.isKeyPressed("meta"),
      altKeyPressed: state.isKeyPressed("alt"),
      shiftKeyPressed: state.isKeyPressed("shift")
    })
  );

  const { droppedFiles, addFiles, removeFile, clearFiles, getFileContents, addDroppedFiles } =
    useFileHandling();

  const { isDragging, handleDragOver, handleDragLeave, handleDrop } =
    useDragAndDrop(addFiles, addDroppedFiles);

  const handleOnChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(event.target.value);
    },
    []
  );

  const sendMessageNow = useCallback((
    content: MessageContent[],
    messagePrompt: string,
    messageAgentMode: boolean
  ) => {
    onSendMessage(content, messagePrompt, messageAgentMode);
    // Keep focus in the textarea after sending
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [onSendMessage]);

  const handleSend = useCallback(() => {
    if (prompt.length === 0) return;

    const content: MessageContent[] = [
      {
        type: "text",
        text: prompt
      }
    ];
    const fileContents = getFileContents();
    const fullContent = [...content, ...fileContents];

    if (!isLoading && !isStreaming) {
      // Send immediately
      sendMessageNow(fullContent, prompt, agentMode);
      setPrompt("");
      clearFiles();
    } else {
      // Queue the message
      setQueuedMessage({
        content: fullContent,
        prompt: prompt,
        agentMode: agentMode
      });
      setPrompt("");
      clearFiles();
    }
  }, [isLoading, isStreaming, prompt, getFileContents, sendMessageNow, clearFiles, agentMode]);

  // Send queued message when streaming/loading stops
  useEffect(() => {
    if (!isLoading && !isStreaming && queuedMessage) {
      sendMessageNow(queuedMessage.content, queuedMessage.prompt, queuedMessage.agentMode);
      setQueuedMessage(null);
    }
  }, [isLoading, isStreaming, queuedMessage, sendMessageNow]);

  const handleCancelQueued = useCallback(() => {
    setQueuedMessage(null);
  }, []);

  const handleSendNow = useCallback(() => {
    if (queuedMessage && onStop) {
      // Stop current response and send queued message immediately
      onStop();
      // Small delay to ensure stop is processed before sending
      setTimeout(() => {
        sendMessageNow(queuedMessage.content, queuedMessage.prompt, queuedMessage.agentMode);
        setQueuedMessage(null);
      }, 100);
    }
  }, [queuedMessage, onStop, sendMessageNow]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        if (shiftKeyPressed) {
          // Allow default behavior (newline insertion)
          return;
        }
        // For Enter without Shift (and without Meta/Alt), send the message
        if (!metaKeyPressed && !altKeyPressed) {
          e.preventDefault();
          handleSend();
        }
      }
    },
    [shiftKeyPressed, metaKeyPressed, altKeyPressed, handleSend]
  );

  const isDisabled = disabled || isLoading || isStreaming;
  // Input is never disabled - messages are always queued by globalWebSocketManager
  const isInputDisabled = false;

  return (
    <div css={createStyles(theme)} className="chat-composer">
      {/* Queued Message Widget */}
      <Collapse in={!!queuedMessage}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 2,
            py: 1,
            mb: 1,
            mx: 1,
            borderRadius: 2,
            backgroundColor: theme.vars.palette.primary.main + "15",
            border: `1px solid ${theme.vars.palette.primary.main}40`
          }}
        >
          <ScheduleSendIcon sx={{ fontSize: 18, color: "primary.main" }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "primary.main",
                fontWeight: 500,
                mb: 0.25
              }}
            >
              Message queued
            </Typography>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "text.secondary",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {queuedMessage?.prompt}
            </Typography>
          </Box>
          <Tooltip title="Send now (interrupts current response)">
            <IconButton
              size="small"
              onClick={handleSendNow}
              disabled={!onStop}
              sx={{
                color: "primary.main",
                "&:hover": { backgroundColor: theme.vars.palette.primary.main + "20" }
              }}
            >
              <SendIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Cancel queued message">
            <IconButton
              size="small"
              onClick={handleCancelQueued}
              sx={{
                color: "text.secondary",
                "&:hover": { color: "error.main" }
              }}
            >
              <ClearIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Collapse>

      <div
        className={`compose-message ${isDragging ? "dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <>
          {droppedFiles.length > 0 && (
            <div className="file-preview-container">
              {droppedFiles.map((file, index) => (
                <FilePreview
                  key={index}
                  file={file}
                  onRemove={() => removeFile(index)}
                />
              ))}
            </div>
          )}
          <MessageInput
            ref={textareaRef}
            value={prompt}
            onChange={handleOnChange}
            onKeyDown={handleKeyDown}
            disabled={isInputDisabled}
            placeholder="Type your message..."
          />
          <ActionButtons
            isLoading={isLoading}
            isStreaming={isStreaming}
            onSend={handleSend}
            onStop={onStop}
            onNewChat={onNewChat}
            isDisabled={isDisabled && !queuedMessage}
            hasContent={prompt.trim() !== "" || !!queuedMessage}
          />
        </>
      </div>
    </div>
  );
};

export default ChatComposer;
