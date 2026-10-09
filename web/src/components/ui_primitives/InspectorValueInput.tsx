/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type Ref } from "react";
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
  /**
   * Commit a blank draft. Off by default: clearing a numeric field and
   * leaving it reverts to the previous value instead of committing "", which
   * `Number("")` would read as 0. Turn it on for fields where blank means
   * "use the default" (an easing, an optional outline width).
   */
  allowEmpty?: boolean;
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

const clampToScrub = (next: number, scrub: InspectorValueScrub): number => {
  let clamped = next;
  if (scrub.min != null) clamped = Math.max(scrub.min, clamped);
  if (scrub.max != null) clamped = Math.min(scrub.max, clamped);
  return clamped;
};

const unitStyles = (theme: Theme) => css({
  ...TYPOGRAPHY.mono.label,
  color: theme.vars.palette.text.secondary,
  flexShrink: 0
});

/** Scrub and arrow-key step multiplier: Shift is coarse, Alt is fine. */
const stepMultiplier = (event: { shiftKey: boolean; altKey: boolean }): number =>
  event.shiftKey ? 10 : event.altKey ? 0.1 : 1;

/**
 * A buffered inspector value with optional drag scrubbing supplied by the
 * editor. With `scrub`, ArrowUp and ArrowDown step the value by `scrub.step`
 * (Shift ×10, Alt ×0.1), clamped to the scrub range.
 */
export const InspectorValueInput = memo(function InspectorValueInput({
  value, onCommit, unit, placeholder, disabled = false, ariaLabel, id, minWidth, scrub,
  scrubGesture, size = "small", grow = false, allowEmpty = false, ref
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

  // The last value an arrow key committed. Leaving the field afterwards must
  // not write it a second time as a separate undo entry.
  const steppedValueRef = useRef<string | null>(null);

  const commit = useCallback(() => {
    if (draft === value || draft === steppedValueRef.current) return;
    if (!allowEmpty && draft.trim() === "") return;
    onCommit(draft);
  }, [draft, value, onCommit, allowEmpty]);

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
    const next = drag.startValue + dx * scrub.step * stepMultiplier(event);
    const formatted = clampToScrub(next, scrub).toFixed(scrubDecimals);
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

  // Arrow keys step the value. A held key repeats into one undo entry: the
  // gesture opens on the first press and commits on key up or blur.
  const keyStepActiveRef = useRef(false);
  const endKeyStep = useCallback(() => {
    if (!keyStepActiveRef.current) return;
    keyStepActiveRef.current = false;
    scrubGesture?.commit();
  }, [scrubGesture]);

  const handleArrowStep = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (!scrub || disabled) return;
    const current = parseFloat(draft);
    const base = Number.isFinite(current) ? current : parseFloat(value);
    if (!Number.isFinite(base)) return;
    event.preventDefault();
    const direction = event.key === "ArrowUp" ? 1 : -1;
    const next = base + direction * scrub.step * stepMultiplier(event);
    const formatted = clampToScrub(next, scrub).toFixed(scrubDecimals);
    setDraft(formatted);
    steppedValueRef.current = formatted;
    if (scrubGesture) {
      if (!keyStepActiveRef.current) {
        keyStepActiveRef.current = true;
        scrubGesture.begin();
      }
      scrubGesture.schedule(formatted);
    } else {
      onCommit(formatted);
    }
  }, [scrub, disabled, draft, value, scrubDecimals, scrubGesture, onCommit]);

  const wrapCss = useMemo(() => wrapStyles(theme, disabled, focused, Boolean(scrub),
    size === "small" ? CONTROL.height.xs : CONTROL.height.sm, grow), [theme, disabled, focused, scrub, size, grow]);
  const inputCss = useMemo(() => inputStyles(theme, Boolean(scrub), focused), [theme, scrub, focused]);
  const unitCss = useMemo(() => unitStyles(theme), [theme]);

  return <div css={wrapCss} style={minWidth ? { minWidth } : undefined}
    onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
    <input id={id} ref={setRefs} type="text" size={1} css={inputCss} value={draft}
      placeholder={placeholder} disabled={disabled} aria-label={ariaLabel}
      onChange={(event) => {
        steppedValueRef.current = null;
        setDraft(event.target.value);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        endKeyStep();
        setFocused(false);
        if (cancelBlurCommitRef.current) cancelBlurCommitRef.current = false;
        else commit();
        steppedValueRef.current = null;
        setDraft(value);
      }}
      onKeyUp={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") endKeyStep();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") handleArrowStep(event);
        else if (event.key === "Enter") event.currentTarget.blur();
        else if (event.key === "Escape") {
          cancelBlurCommitRef.current = true;
          setDraft(value);
          event.currentTarget.blur();
        }
      }} />
    {unit && <span css={unitCss}>{unit}</span>}
  </div>;
});
