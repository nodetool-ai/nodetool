import React, { forwardRef } from "react";
import { TextareaAutosize } from "@mui/material";

interface MessageInputProps {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled: boolean;
  placeholder?: string;
}

const MAX_ROWS = 15;
export const MessageInput = forwardRef<HTMLTextAreaElement, MessageInputProps>(
  (
    {
      value,
      onChange,
      onKeyDown,
      disabled,
      placeholder = "Type your message..."
    },
    ref
  ) => {
    return (
      <TextareaAutosize
        className="chat-input"
        id="chat-prompt"
        aria-labelledby="chat-prompt"
        ref={ref}
        style={{
          height: "2.2em",
          backgroundColor: "transparent"
        }}
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
      />
    );
  }
);

MessageInput.displayName = "MessageInput";
