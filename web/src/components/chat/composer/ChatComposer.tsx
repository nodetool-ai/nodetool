/** @jsxImportSource @emotion/react */
import React, { useRef, useState, useCallback, useEffect } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { MessageContent } from "../../../stores/ApiTypes";
import { useKeyPressedStore } from "../../../stores/KeyPressedStore";
import { FilePreview } from "./FilePreview";
import { MessageInput } from "./MessageInput";
import { ActionButtons } from "./ActionButtons";
import { useFileHandling } from "../hooks/useFileHandling";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import { createStyles } from "./ChatComposer.styles";

interface ChatComposerProps {
  status:
    | "disconnected"
    | "connecting"
    | "connected"
    | "loading"
    | "error"
    | "streaming"
    | "reconnecting"
    | "disconnecting"
    | "failed";
  onSendMessage: (
    content: MessageContent[],
    prompt: string,
    agentMode: boolean
  ) => void;
  onStop?: () => void;
  disabled?: boolean;
  agentMode?: boolean;
}

const ChatComposer: React.FC<ChatComposerProps> = ({
  status,
  onSendMessage,
  onStop,
  disabled = false,
  agentMode = false
}) => {
  const theme = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");

  const { metaKeyPressed, altKeyPressed, shiftKeyPressed } = useKeyPressedStore(
    (state) => ({
      metaKeyPressed: state.isKeyPressed("Meta"),
      altKeyPressed: state.isKeyPressed("Alt"),
      shiftKeyPressed: state.isKeyPressed("Shift")
    })
  );

  const { droppedFiles, addFiles, removeFile, clearFiles, getFileContents } =
    useFileHandling();

  const { isDragging, handleDragOver, handleDragLeave, handleDrop } =
    useDragAndDrop(addFiles);

  // Clear the prompt and files when disconnected
  useEffect(() => {
    if (status === "disconnected" || status === "connecting") {
      setPrompt("");
      clearFiles();
    }
  }, [status, clearFiles]);

  const handleOnChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(event.target.value);
    },
    []
  );

  const handleSend = useCallback(() => {
    if (
      status !== "loading" &&
      status !== "disconnected" &&
      status !== "connecting" &&
      status !== "error" &&
      prompt.length > 0
    ) {
      const content: MessageContent[] = [
        {
          type: "text",
          text: prompt
        }
      ];

      const fileContents = getFileContents();

      onSendMessage([...content, ...fileContents], prompt, agentMode);
      setPrompt("");
      clearFiles();
    }
  }, [status, prompt, getFileContents, onSendMessage, clearFiles, agentMode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        if (shiftKeyPressed) {
          // Allow default behavior (newline insertion)
          // We don't call e.preventDefault() here
          // We also don't need to manually setPrompt or manage cursor
          return;
        }
        // For Enter without Shift (and without Meta/Alt), send the message
        if (!metaKeyPressed && !altKeyPressed) {
          e.preventDefault(); // Prevent default form submission or newline in some cases
          handleSend();
        }
      }
    },
    [shiftKeyPressed, metaKeyPressed, altKeyPressed, handleSend] // Removed prompt from dependencies
  );

  const isDisabled =
    disabled ||
    status === "loading" ||
    status === "error" ||
    status === "disconnected" ||
    status === "connecting";

  return (
    <div css={createStyles}>
      <div
        className={`compose-message ${isDragging ? "dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
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
          disabled={isDisabled}
          placeholder={
            status === "disconnected" || status === "connecting"
              ? "Connection required to send messages..."
              : "Type your message..."
          }
        />
        <ActionButtons
          status={status}
          onSend={handleSend}
          onStop={onStop}
          isDisabled={isDisabled}
          hasContent={prompt.trim() !== ""}
        />
      </div>
    </div>
  );
};

export default ChatComposer;
