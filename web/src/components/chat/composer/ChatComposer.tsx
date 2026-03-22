/** @jsxImportSource @emotion/react */
import React, {
  useRef,
  useState,
  useCallback,
  memo
} from "react";
import { useTheme } from "@mui/material/styles";
import { Box, Typography, IconButton, Tooltip, Collapse } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ClearIcon from "@mui/icons-material/Clear";
import { MessageContent } from "../../../stores/ApiTypes";
import { useKeyPressed } from "../../../stores/KeyPressedStore";
import { FilePreview } from "./FilePreview";
import { MessageInput } from "./MessageInput";
import { ActionButtons } from "./ActionButtons";
import { useFileHandling } from "../hooks/useFileHandling";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import { useMessageQueue } from "../../../hooks/useMessageQueue";
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
  toolbarNode?: React.ReactNode;
}

const ChatComposer: React.FC<ChatComposerProps> = memo(({
  isLoading,
  isStreaming,
  onSendMessage,
  onStop,
  onNewChat,
  disabled = false,
  agentMode = false,
  toolbarNode
}) => {
  const theme = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");

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

  const { queuedMessage, sendMessage, cancelQueued, sendQueuedNow } = useMessageQueue({
    isLoading,
    isStreaming,
    onSendMessage,
    onStop,
    textareaRef
  });

  const handleOnChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(event.target.value);
    },
    []
  );

  const handleSend = useCallback(() => {
    if (prompt.length === 0) {
      return;
    }

    const content: MessageContent[] = [
      {
        type: "text",
        text: prompt
      }
    ];
    const fileContents = getFileContents();
    const fullContent = [...content, ...fileContents];

    sendMessage(fullContent, prompt, agentMode);
    setPrompt("");
    clearFiles();
  }, [prompt, getFileContents, sendMessage, clearFiles, agentMode]);

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
        <Box sx={{ display: "flex", justifyContent: "flex-end", px: 1, mb: 1 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1.5,
              py: 0.75,
              maxWidth: "400px",
              borderRadius: 2,
              backgroundColor: theme.vars.palette.background.paper,
              border: `1px solid ${theme.vars.palette.primary.main}`,
              boxShadow: `0 2px 8px ${theme.vars.palette.primary.main}25`
            }}
          >
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
                onClick={sendQueuedNow}
                disabled={!onStop}
                aria-label="Send now"
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
                onClick={cancelQueued}
                aria-label="Cancel queued message"
                sx={{
                  color: "text.secondary",
                  "&:hover": { color: "error.main" }
                }}
              >
                <ClearIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
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
                  key={file.id}
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
          <div className="composer-footer">
            {toolbarNode}
            <ActionButtons
              isLoading={isLoading}
              isStreaming={isStreaming}
              onSend={handleSend}
              onStop={onStop}
              onNewChat={onNewChat}
              isDisabled={isDisabled && !queuedMessage}
              hasContent={prompt.trim() !== "" || !!queuedMessage}
            />
          </div>
        </>
      </div>
    </div>
  );
});
ChatComposer.displayName = "ChatComposer";

export default ChatComposer;
