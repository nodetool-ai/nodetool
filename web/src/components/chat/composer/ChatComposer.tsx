/** @jsxImportSource @emotion/react */
import React, {
  useRef,
  useState,
  useCallback,
  useMemo,
  memo
} from "react";
import { useTheme } from "@mui/material/styles";
import { Collapse, BORDER_RADIUS } from "../../ui_primitives";
import useMediaQuery from "@mui/material/useMediaQuery";
import { Caption, FlexRow, ToolbarIconButton } from "../../ui_primitives";
import SendIcon from "@mui/icons-material/Send";
import ClearIcon from "@mui/icons-material/Clear";
import { MessageContent } from "../../../stores/ApiTypes";
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
  onSendMessage: (content: MessageContent[], prompt: string) => void;
  onStop?: () => void;
  onNewChat?: () => void;
  disabled?: boolean;
  toolbarNode?: React.ReactNode;
}

const ChatComposer: React.FC<ChatComposerProps> = memo(({
  isLoading,
  isStreaming,
  onSendMessage,
  onStop,
  onNewChat,
  disabled = false,
  toolbarNode
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");

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
    // Allow attachment-only sends; a whitespace-only prompt with no files
    // is not a message. Trim so a spaces-only prompt never sends a text part.
    if (prompt.trim().length === 0 && droppedFiles.length === 0) {
      return;
    }

    const content: MessageContent[] = [];
    if (prompt.trim().length > 0) {
      content.push({ type: "text", text: prompt });
    }
    const fileContents = getFileContents();
    const fullContent = [...content, ...fileContents];

    // Only clear the input when the message was actually sent or queued;
    // a dropped message (one already queued) keeps its text and attachments.
    if (sendMessage(fullContent, prompt)) {
      setPrompt("");
      clearFiles();
    }
  }, [prompt, droppedFiles, getFileContents, sendMessage, clearFiles]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        // Ignore the Enter that confirms an IME composition candidate — it
        // fires keydown with isComposing/keyCode 229 and must not send.
        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) {
          return;
        }
        // Read modifiers from the event, not the global KeyPressedStore, which
        // is stale when the textarea was click-focused with a modifier held.
        if (e.shiftKey) {
          // Shift+Enter inserts a newline (default behavior)
          return;
        }
        if (!e.metaKey && !e.altKey) {
          e.preventDefault();
          handleSend();
        }
      }
    },
    [handleSend]
  );

  const isDisabled = disabled || isLoading || isStreaming;
  // Input is never disabled - messages are always queued by globalWebSocketManager
  const isInputDisabled = false;

  const removeCallbacks = useMemo(
    () => new Map(droppedFiles.map((f) => [f.id, () => removeFile(f.id)])),
    [droppedFiles, removeFile]
  );

  return (
    <div css={styles} className="chat-composer">
      {/* Queued Message Widget */}
      <Collapse in={!!queuedMessage}>
        <FlexRow justify="flex-end" sx={{ px: 1, mb: 1 }}>
          <FlexRow
            gap={1}
            align="center"
            sx={{
              px: 1.5,
              py: 1,
              maxWidth: "400px",
              borderRadius: BORDER_RADIUS.sm,
              backgroundColor: theme.vars.palette.background.paper,
              border: `1px solid ${theme.vars.palette.primary.main}`,
              boxShadow: `0 2px 8px ${theme.vars.palette.primary.main}25`
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Caption
                color="primary"
                sx={{
                  display: "block",
                  fontWeight: 500,
                  mb: 0.5
                }}
              >
                Message queued
              </Caption>
              <Caption
                sx={{
                  display: "block",
                  color: "text.secondary",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {queuedMessage?.prompt}
              </Caption>
            </div>
            <ToolbarIconButton
              tooltip="Send now (interrupts current response)"
              onClick={sendQueuedNow}
              disabled={!onStop}
              icon={<SendIcon sx={{ fontSize: 16 }} />}
              sx={{
                color: "primary.main",
                "&:hover": { backgroundColor: theme.vars.palette.primary.main + "20" }
              }}
            />
            <ToolbarIconButton
              tooltip="Cancel queued message"
              onClick={cancelQueued}
              icon={<ClearIcon sx={{ fontSize: 16 }} />}
              sx={{
                color: "text.secondary",
                "&:hover": { color: "error.main" }
              }}
            />
          </FlexRow>
        </FlexRow>
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
              {droppedFiles.map((file) => (
                <FilePreview
                  key={file.id}
                  file={file}
                  onRemove={removeCallbacks.get(file.id)!}
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
            placeholder={
              isMobile
                ? "Type a message..."
                : "Type a message... (Shift+Enter for new line)"
            }
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
              hasContent={
                prompt.trim() !== "" ||
                droppedFiles.length > 0 ||
                !!queuedMessage
              }
            />
          </div>
        </>
      </div>
    </div>
  );
});
ChatComposer.displayName = "ChatComposer";

export default ChatComposer;
