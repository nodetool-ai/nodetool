import React, { forwardRef, useEffect, useRef, useCallback, memo, useLayoutEffect } from "react";
import { useAutoFocusEnabled } from "../../../hooks/useAutoFocusEnabled";

interface MessageInputProps {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled: boolean;
  placeholder?: string;
}

const MAX_HEIGHT = 180;
const LINE_HEIGHT = 24;

export const MessageInput = memo(forwardRef<HTMLTextAreaElement, MessageInputProps>(
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
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;
    const autoFocusEnabled = useAutoFocusEnabled();

    const adjustHeight = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) { return; }

      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = "auto";

      const newHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
      textarea.style.height = `${newHeight}px`;
      textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
    }, [textareaRef]);

    useEffect(() => {
      adjustHeight();
    }, [value, adjustHeight]);

    // Skipped on touch, where the virtual keyboard would cover the thread.
    useLayoutEffect(() => {
      const textarea = textareaRef.current;
      if (textarea && !disabled && autoFocusEnabled) {
        textarea.focus();
      }
    }, [textareaRef, disabled, autoFocusEnabled]);

    const handleChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(event);
    }, [onChange]);

    return (
      <textarea
        className="chat-input"
        id="chat-prompt"
        aria-label={placeholder}
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck="false"
        autoComplete="off"
        rows={1}
        style={{
          maxHeight: `${MAX_HEIGHT}px`,
          lineHeight: `${LINE_HEIGHT}px`
        }}
      />
    );
  }
));

MessageInput.displayName = "MessageInput";
