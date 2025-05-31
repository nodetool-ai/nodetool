/** @jsxImportSource @emotion/react */
import React, { useRef, useState, useCallback } from "react";
import { MessageContent } from "../../../stores/ApiTypes";
import { useKeyPressedStore } from "../../../stores/KeyPressedStore";
import { FilePreview } from "./FilePreview";
import { MessageInput } from "./MessageInput";
import { ActionButtons } from "./ActionButtons";
import { useFileHandling } from "../hooks/useFileHandling";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import { createStyles } from "./ChatComposer.styles";

interface ChatComposerProps {
  status: "disconnected" | "connecting" | "connected" | "loading" | "error";
  onSendMessage: (content: MessageContent[], prompt: string) => void;
  onStop?: () => void;
  disabled?: boolean;
}

const ChatComposer: React.FC<ChatComposerProps> = ({
  status,
  onSendMessage,
  onStop,
  disabled = false
}) => {
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

  const handleOnChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(event.target.value);
    },
    []
  );

  const handleSend = useCallback(() => {
    if (status !== "loading" && prompt.length > 0) {
      const content: MessageContent[] = [
        {
          type: "text",
          text: prompt
        }
      ];

      const fileContents = getFileContents();

      onSendMessage([...content, ...fileContents], prompt);
      setPrompt("");
      clearFiles();
    }
  }, [status, prompt, getFileContents, onSendMessage, clearFiles]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        if (shiftKeyPressed) {
          e.preventDefault();
          setPrompt((p) => p + "\n");
          return;
        }
        if (!metaKeyPressed && !altKeyPressed) {
          e.preventDefault();
          handleSend();
        }
      }
    },
    [shiftKeyPressed, metaKeyPressed, altKeyPressed, handleSend]
  );

  const isDisabled = disabled || status === "loading" || status === "error";

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
