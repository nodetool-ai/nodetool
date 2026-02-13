import React, { forwardRef, useEffect, useRef, useCallback, memo } from "react";

interface MessageInputProps {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled: boolean;
  placeholder?: string;
}

const MAX_HEIGHT = 180;
const LINE_HEIGHT = 24;

// Memoize input styles to prevent recreation on every render
const getInputStyles = (): React.CSSProperties => ({
  maxHeight: `${MAX_HEIGHT}px`,
  lineHeight: `${LINE_HEIGHT}px`
});

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

    const adjustHeight = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) { return; }

      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = "auto";

      // Calculate new height, capped at MAX_HEIGHT
      const newHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
      textarea.style.height = `${newHeight}px`;

      // Enable scrolling only when content exceeds max height
      textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
    }, [textareaRef]);

    useEffect(() => {
      adjustHeight();
    }, [value, adjustHeight]);

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(event);
    };

    return (
      <textarea
        className="chat-input"
        id="chat-prompt"
        aria-labelledby="chat-prompt"
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
        style={getInputStyles()}
      />
    );
  }
));

MessageInput.displayName = "MessageInput";
