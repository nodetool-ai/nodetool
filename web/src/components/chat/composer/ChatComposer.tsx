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
import { VoiceInputControl } from "./voice/VoiceInputControl";
import { useFileHandling } from "../hooks/useFileHandling";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import { usePromptHistory } from "../hooks/usePromptHistory";
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
  /** Override the textarea placeholder. */
  placeholder?: string;
}

const ChatComposer: React.FC<ChatComposerProps> = memo(({
  isLoading,
  isStreaming,
  onSendMessage,
  onStop,
  onNewChat,
  disabled = false,
  toolbarNode,
  placeholder
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composeCardRef = useRef<HTMLDivElement>(null);
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

  const {
    record: recordHistory,
    handleKeyDown: handleHistoryKeyDown,
    resetNavigation: resetHistoryNavigation
  } = usePromptHistory({ value: prompt, setValue: setPrompt, textareaRef });

  const handleOnChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      // A manual edit leaves history navigation so the next ArrowUp starts over.
      resetHistoryNavigation();
      setPrompt(event.target.value);
    },
    [resetHistoryNavigation]
  );

  const submitPrompt = useCallback(
    (text: string) => {
      // Allow attachment-only sends; a whitespace-only prompt with no files
      // is not a message. Trim so a spaces-only prompt never sends a text part.
      if (text.trim().length === 0 && droppedFiles.length === 0) {
        return;
      }

      const content: MessageContent[] = [];
      if (text.trim().length > 0) {
        content.push({ type: "text", text });
      }
      const fileContents = getFileContents();
      const fullContent = [...content, ...fileContents];

      // Only clear the input when the message was actually sent or queued;
      // a dropped message (one already queued) keeps its text and attachments.
      if (sendMessage(fullContent, text)) {
        recordHistory(text);
        setPrompt("");
        clearFiles();
      }
    },
    [droppedFiles, getFileContents, sendMessage, clearFiles, recordHistory]
  );

  const handleSend = useCallback(() => {
    submitPrompt(prompt);
  }, [prompt, submitPrompt]);

  // An accepted recording sends straight away, appended to whatever was typed.
  const handleVoiceTranscript = useCallback(
    (transcript: string) => {
      const typed = prompt.trim();
      submitPrompt(typed.length > 0 ? `${typed} ${transcript}` : transcript);
    },
    [prompt, submitPrompt]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Let history navigation (ArrowUp/ArrowDown) claim the key first.
      if (handleHistoryKeyDown(e)) {
        return;
      }
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
    [handleSend, handleHistoryKeyDown]
  );

  const isDisabled = disabled || isLoading || isStreaming;

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
        ref={composeCardRef}
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
            placeholder={
              placeholder ??
              (isMobile
                ? "Type a message..."
                : "Type a message... (Shift+Enter for new line)")
            }
          />
          <div className="composer-footer">
            {toolbarNode}
            <ActionButtons
              leadingAction={
                <VoiceInputControl
                  onTranscript={handleVoiceTranscript}
                  overlayHost={composeCardRef}
                  disabled={disabled}
                />
              }
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
