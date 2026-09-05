/**
 * Message composer.
 *
 * Ported from `examples/chat_app/src/components/composer.tsx`: Enter sends,
 * Shift+Enter breaks the line, and the textarea grows with its content up to a
 * cap so a pasted block cannot swallow the panel.
 */

import { useEffect, useRef, useState } from "react";

import { SendIcon, StopIcon } from "./Icons.js";

/** Tallest the textarea grows before it scrolls internally (px). */
const MAX_TEXTAREA_HEIGHT = 200;

interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  disabled: boolean;
  streaming: boolean;
}

export function Composer({
  onSend,
  onStop,
  disabled,
  streaming,
}: ComposerProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [text]);

  function submit() {
    const value = text.trim();
    if (!value || streaming || disabled) return;
    onSend(value);
    setText("");
  }

  return (
    <div className="composer">
      <div className="composer__box" data-disabled={disabled}>
        <textarea
          ref={inputRef}
          className="composer__input"
          rows={1}
          value={text}
          disabled={disabled}
          aria-label="Message"
          placeholder={
            disabled ? "Connecting…" : "Message NodeTool… (Enter to send)"
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {streaming ? (
          <button
            type="button"
            className="icon-button icon-button--danger"
            aria-label="Stop generating"
            title="Stop generating"
            onClick={onStop}
          >
            <StopIcon />
          </button>
        ) : (
          <button
            type="button"
            className="icon-button icon-button--primary"
            aria-label="Send"
            title="Send"
            disabled={disabled || !text.trim()}
            onClick={submit}
          >
            <SendIcon />
          </button>
        )}
      </div>
    </div>
  );
}
