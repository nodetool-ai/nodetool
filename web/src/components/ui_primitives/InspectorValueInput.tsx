/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo, useRef, useState, type PointerEvent, type Ref } from "react";
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";

import { isFunction } from "../../utils/typePredicates";
import { SPACING, getSpacingPx } from "./spacing";
import { BORDER_RADIUS, CONTROL, MOTION, TYPOGRAPHY } from "./tokens";

export interface InspectorValueScrub {
  step: number;
  min?: number;
  max?: number;
}

export interface InspectorValueGesture {
  begin: () => void;
  schedule: (value: string) => void;
  commit: (value?: string) => void;
}

export interface InspectorValueInputProps {
  value: string;
  onCommit: (raw: string) => void;
  unit?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
  minWidth?: number;
  scrub?: InspectorValueScrub;
  scrubGesture?: InspectorValueGesture;
  size?: "small" | "medium";
  grow?: boolean;
  ref?: Ref<HTMLInputElement>;
}

const wrapStyles = (theme: Theme, disabled: boolean, focused: boolean, scrubbable: boolean, height: number, grow: boolean) => css({
  display: "inline-flex",
  flex: grow ? "1 1 auto" : undefined,
  width: grow ? "100%" : undefined,
  alignItems: "center",
  gap: getSpacingPx(SPACING.micro),
  height,
  padding: theme.spacing(0, SPACING.md),
  backgroundColor: theme.vars.palette.background.default,
  border: `1px solid ${focused ? theme.vars.palette.primary.main : theme.vars.palette.c_overlay}`,
  borderRadius: BORDER_RADIUS.sm,
  minWidth: CONTROL.height.xl + CONTROL.height.xs,
  justifyContent: "flex-end",
  opacity: disabled ? 0.5 : 1,
  transition: `border-color ${MOTION.fast}`,
  cursor: scrubbable && !focused && !disabled ? "ew-resize" : undefined,
  touchAction: scrubbable ? "none" : undefined,
  "&:hover": { borderColor: focused ? theme.vars.palette.primary.main : theme.vars.palette.divider }
});

const inputStyles = (theme: Theme, scrubbable: boolean, focused: boolean) => css({
  ...TYPOGRAPHY.mono.code,
  flex: "1 1 auto",
  minWidth: 0,
  background: "transparent",
  border: "none",
  outline: "none",
  color: theme.vars.palette.text.primary,
  letterSpacing: 0,
  textAlign: "right",
  padding: 0,
  width: "100%",
  cursor: scrubbable && !focused ? "ew-resize" : undefined
});

const unitStyles = (theme: Theme) => css({
  ...TYPOGRAPHY.mono.label,
  color: theme.vars.palette.text.secondary,
  flexShrink: 0
});

/** A buffered inspector value with optional drag scrubbing supplied by the editor. */
export const InspectorValueInput = memo(function InspectorValueInput({
  value, onCommit, unit, placeholder, disabled = false, ariaLabel, id, minWidth, scrub,
  scrubGesture, size = "small", grow = false, ref
}: InspectorValueInputProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [syncedValue, setSyncedValue] = useState(value);
  if (!focused && value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }

  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelBlurCommitRef = useRef(false);
  const setRefs = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (isFunction(ref)) ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  const commit = useCallback(() => {
    if (draft !== value) onCommit(draft);
  }, [draft, value, onCommit]);

  const gestureRef = useRef<{ pointerId: number; startX: number; startValue: number; moved: boolean; lastValue?: string } | null>(null);
  const scrubDecimals = useMemo(() => scrub ? (String(scrub.step).split(".")[1] ?? "").length : 0, [scrub]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!scrub || disabled || focused || event.button !== 0) return;
    const start = parseFloat(value);
    if (!Number.isFinite(start)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startValue: start, moved: false };
  }, [scrub, disabled, focused, value]);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = gestureRef.current;
    if (!drag || !scrub) return;
    const dx = event.clientX - drag.startX;
    if (!drag.moved) {
      if (Math.abs(dx) < 3) return;
      drag.moved = true;
      scrubGesture?.begin();
    }
    const multiplier = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
    let next = drag.startValue + dx * scrub.step * multiplier;
    if (scrub.min != null) next = Math.max(scrub.min, next);
    if (scrub.max != null) next = Math.min(scrub.max, next);
    const formatted = next.toFixed(scrubDecimals);
    drag.lastValue = formatted;
    setDraft(formatted);
    scrubGesture?.schedule(formatted);
  }, [scrub, scrubDecimals, scrubGesture]);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = gestureRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (drag.moved) {
      if (scrubGesture) scrubGesture.commit();
      else if (drag.lastValue !== undefined) onCommit(drag.lastValue);
    } else {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [onCommit, scrubGesture]);

  const wrapCss = useMemo(() => wrapStyles(theme, disabled, focused, Boolean(scrub),
    size === "small" ? CONTROL.height.xs : CONTROL.height.sm, grow), [theme, disabled, focused, scrub, size, grow]);
  const inputCss = useMemo(() => inputStyles(theme, Boolean(scrub), focused), [theme, scrub, focused]);
  const unitCss = useMemo(() => unitStyles(theme), [theme]);

  return <div css={wrapCss} style={minWidth ? { minWidth } : undefined}
    onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
    <input id={id} ref={setRefs} type="text" size={1} css={inputCss} value={draft}
      placeholder={placeholder} disabled={disabled} aria-label={ariaLabel}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (cancelBlurCommitRef.current) cancelBlurCommitRef.current = false;
        else commit();
        setDraft(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        else if (event.key === "Escape") {
          cancelBlurCommitRef.current = true;
          setDraft(value);
          event.currentTarget.blur();
        }
      }} />
    {unit && <span css={unitCss}>{unit}</span>}
  </div>;
});
