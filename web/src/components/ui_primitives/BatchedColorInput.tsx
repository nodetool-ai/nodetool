/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";

import { useBatchedGesture } from "../../hooks/timeline/useBatchedGesture";
import { BORDER_RADIUS, CONTROL } from "./tokens";

export interface BatchedColorInputProps {
  value: string;
  /** Receives at most one call per frame while the picker is open. */
  onChange: (color: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}

/**
 * A native colour picker whose drag is one undo entry. The native control
 * fires `input` on every tick, so ticks go through `useBatchedGesture` and the
 * gesture closes on the native `change` event, on blur, or on unmount.
 */
export const BatchedColorInput = memo(function BatchedColorInput({
  value,
  onChange,
  ariaLabel,
  disabled = false
}: BatchedColorInputProps) {
  const theme = useTheme();
  const gesture = useBatchedGesture<string>(onChange);
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const draftRef = useRef<string | null>(null);

  const commit = useCallback(() => {
    const pending = draftRef.current;
    draftRef.current = null;
    gesture.commit(pending ?? undefined);
    setDraft(null);
  }, [gesture]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.addEventListener("change", commit);
    return () => {
      el.removeEventListener("change", commit);
      commit();
    };
  }, [commit]);

  return (
    <input
      ref={inputRef}
      type="color"
      css={css({
        width: CONTROL.height.sm,
        height: CONTROL.height.sm,
        borderRadius: BORDER_RADIUS.sm,
        border: `1px solid ${theme.vars.palette.divider}`,
        cursor: disabled ? "default" : "pointer",
        padding: 0,
        background: "none",
        flexShrink: 0,
        "&::-webkit-color-swatch": {
          border: "none",
          borderRadius: BORDER_RADIUS.xs
        },
        "&::-moz-color-swatch": {
          border: "none",
          borderRadius: BORDER_RADIUS.xs
        }
      })}
      value={draft ?? value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => {
        const next = event.target.value;
        draftRef.current = next;
        setDraft(next);
        gesture.schedule(next);
      }}
      onBlur={commit}
    />
  );
});
