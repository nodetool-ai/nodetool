/** @jsxImportSource @emotion/react */
import React, {
  useRef,
  useState,
  useCallback
} from "react";
import { useTheme } from "@mui/material/styles";
import { MessageContent } from "../../../stores/ApiTypes";
import { useKeyPressed } from "../../../stores/KeyPressedStore";
import { FilePreview } from "./FilePreview";
import { MessageInput } from "./MessageInput";
import { ActionButtons } from "./ActionButtons";
import { VoiceCommandButton } from "./VoiceCommandButton";
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

  const handleVoiceCommandTranscript = useCallback((result: any) => {
    setPrompt(result.transcript);
    textareaRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    if (!isLoading && !isStreaming && prompt.length > 0) {
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
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }, [isLoading, isStreaming, prompt, getFileContents, onSendMessage, clearFiles, agentMode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        if (shiftKeyPressed) {
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

  const isDisabled = disabled || isLoading || isStreaming;
  const isInputDisabled = false;

  return (
    <div css={createStyles(theme)} className="chat-composer">
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
            voiceButton={
              <VoiceCommandButton
                onCommandProcessed={handleVoiceCommandTranscript}
                size="small"
                showTranscript={true}
              />
            }
          />
          <ActionButtons
            isLoading={isLoading}
            isStreaming={isStreaming}
            onSend={handleSend}
            onStop={onStop}
            onNewChat={onNewChat}
            isDisabled={isDisabled}
            hasContent={prompt.trim() !== ""}
          />
        </>
      </div>
    </div>
  );
};

export default ChatComposer;
