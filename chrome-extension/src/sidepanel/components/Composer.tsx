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
  /**
   * Why this message cannot be sent yet — no model chosen, or one the server
   * does not offer. The text stays editable; only sending is blocked, and the
   * reason is on screen rather than waiting for a failed send.
   */
  blockedReason?: string | null;
}

/**
 * Whether this message may be sent. The send button and the Enter key share
 * it, so a blocked model cannot slip through one path while the other holds.
 */
export function canSend(state: {
  text: string;
  disabled: boolean;
  streaming: boolean;
  blockedReason?: string | null;
}): boolean {
  return (
    !!state.text.trim() &&
    !state.disabled &&
    !state.streaming &&
    !state.blockedReason
  );
}

export function Composer({
  onSend,
  onStop,
  disabled,
  streaming,
  blockedReason,
}: ComposerProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [text]);

  // The panel opens on the composer, and the caret returns to it when the
  // connection comes up or a turn ends, so a follow-up needs no click.
  useEffect(() => {
    if (disabled || streaming) return;
    inputRef.current?.focus();
  }, [disabled, streaming]);

  function submit() {
    if (!canSend({ text, disabled, streaming, blockedReason })) return;
    onSend(text.trim());
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
            disabled={!canSend({ text, disabled, streaming, blockedReason })}
            title={blockedReason ?? "Send"}
            onClick={submit}
          >
            <SendIcon />
          </button>
        )}
      </div>
      {!disabled && blockedReason && (
        <p className="composer__hint composer__hint--blocked" role="status">
          {blockedReason}
        </p>
      )}
    </div>
  );
}
