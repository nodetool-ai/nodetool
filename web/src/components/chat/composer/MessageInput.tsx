import React, { forwardRef } from "react";
import { TextareaAutosize, Box } from "@mui/material";

interface MessageInputProps {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled: boolean;
  placeholder?: string;
  voiceButton?: React.ReactNode;
}

const MAX_ROWS = 15;
export const MessageInput = forwardRef<HTMLTextAreaElement, MessageInputProps>(
  (
    {
      value,
      onChange,
      onKeyDown,
      disabled,
      placeholder = "Type your message...",
      voiceButton
    },
    ref
  ) => {
    return (
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, flex: 1, width: "100%" }}>
        {voiceButton && (
          <Box sx={{ flexShrink: 0, mb: 0.5 }}>
            {voiceButton}
          </Box>
        )}
        <TextareaAutosize
          className="chat-input"
          id="chat-prompt"
          aria-labelledby="chat-prompt"
          ref={ref}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          disabled={disabled}
          minRows={1}
          maxRows={MAX_ROWS}
          placeholder={placeholder}
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck="false"
          autoComplete="off"
          style={{ flex: 1, resize: "none", border: "none", outline: "none", backgroundColor: "transparent", fontFamily: "inherit", fontSize: "inherit", padding: "8px" }}
        />
      </Box>
    );
  }
);

MessageInput.displayName = "MessageInput";
