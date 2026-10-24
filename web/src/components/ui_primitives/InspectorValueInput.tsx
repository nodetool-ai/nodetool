/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";

import { isFunction } from "../../utils/typePredicates";
import { SPACING, getSpacingPx } from "./spacing";
import { CONTROL } from "./tokens";
import { useFieldDensity, type FieldDensity } from "./fieldDensity";
import { clampToRange, numberFieldPaddingX, stepDecimals, stepMultiplier, numberFieldSurfaceStyles, numberFieldTextStyles, numberFieldUnitStyles } from "./NumberField";

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

const wrapStyles = (theme: Theme, disabled: boolean, focused: boolean, scrubbable: boolean, density: FieldDensity, grow: boolean) => css({
  ...numberFieldSurfaceStyles(theme, density, focused),
  display: "inline-flex",
  flex: grow ? "1 1 auto" : undefined,
  width: grow ? "100%" : undefined,
  alignItems: "center",
  gap: getSpacingPx(SPACING.micro),
  padding: `0 ${numberFieldPaddingX(theme)}`,
  minWidth: CONTROL.height.xl + CONTROL.height.xs,
  justifyContent: "flex-end",
  opacity: disabled ? 0.5 : 1,
  cursor: scrubbable && !focused && !disabled ? "ew-resize" : undefined,
  touchAction: scrubbable ? "none" : undefined
});

const inputStyles = (theme: Theme, scrubbable: boolean, focused: boolean) => css({
  ...numberFieldTextStyles(theme),
  flex: "1 1 auto",
  minWidth: 0,
  background: "transparent",
  border: "none",
  outline: "none",
  letterSpacing: 0,
  textAlign: "right",
  padding: 0,
  width: "100%",
  cursor: scrubbable && !focused ? "ew-resize" : undefined
});

const unitStyles = (theme: Theme) => css(numberFieldUnitStyles(theme));

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
  // After an arrow step commits, the focused field shows what the owner kept
  // (the stepped value, or the old one when the owner rejected it) instead of
  // the draft. Typing turns this off.
  const [followValue, setFollowValue] = useState(false);
  // Whether the person typed since focusing. A focused field they have not
  // typed in still follows its value: when the owner switches what the field
  // edits (another clip selected), leaving the field must not write the old
  // value to the new target.
  const [typed, setTyped] = useState(false);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (!focused || followValue || !typed) setDraft(value);
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
    const multiplier = stepMultiplier(event);
    const next = drag.startValue + dx * scrub.step * multiplier;
    const formatted = clampToRange(next, scrub.min, scrub.max).toFixed(stepDecimals(scrub.step, multiplier));
    drag.lastValue = formatted;
    setDraft(formatted);
    scrubGesture?.schedule(formatted);
  }, [scrub, scrubGesture]);

  // Pointer up, pointer cancel and lost capture all end the scrub. Only a
  // press that never moved focuses the field.
  const handlePointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = gestureRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (drag.moved) {
      if (scrubGesture) scrubGesture.commit();
      else if (drag.lastValue !== undefined) onCommit(drag.lastValue);
      // Show what the owner kept; a rejected value must not stay on screen.
      setDraft(value);
    } else if (event.type === "pointerup") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [onCommit, scrubGesture, value]);

  // Arrow keys step the value. A held key repeats into one undo entry: the
  // gesture opens on the first press and commits on key up or blur.
  const keyStepActiveRef = useRef(false);
  const endKeyStep = useCallback(() => {
    if (!keyStepActiveRef.current) return;
    keyStepActiveRef.current = false;
    scrubGesture?.commit();
    setDraft(value);
    setFollowValue(true);
  }, [scrubGesture, value]);

  const handleArrowStep = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (!scrub || disabled) return;
    const current = parseFloat(draft);
    const base = Number.isFinite(current) ? current : parseFloat(value);
    if (!Number.isFinite(base)) return;
    event.preventDefault();
    const direction = event.key === "ArrowUp" ? 1 : -1;
    const multiplier = stepMultiplier(event);
    const next = base + direction * scrub.step * multiplier;
    const formatted = clampToRange(next, scrub.min, scrub.max).toFixed(stepDecimals(scrub.step, multiplier));
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
      setDraft(value);
      setFollowValue(true);
    }
  }, [scrub, disabled, draft, value, scrubGesture, onCommit]);

  const contextDensity = useFieldDensity();
  const density: FieldDensity = size === "small" ? "compact" : contextDensity;
  const wrapCss = useMemo(() => wrapStyles(theme, disabled, focused, Boolean(scrub),
    density, grow), [theme, disabled, focused, scrub, density, grow]);
  const inputCss = useMemo(() => inputStyles(theme, Boolean(scrub), focused), [theme, scrub, focused]);
  const unitCss = useMemo(() => unitStyles(theme), [theme]);

  return <div css={wrapCss} style={minWidth ? { minWidth } : undefined}
    onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerEnd}
    onPointerCancel={handlePointerEnd} onLostPointerCapture={handlePointerEnd}>
    <input id={id} ref={setRefs} type="text" size={1} css={inputCss} value={draft}
      placeholder={placeholder} disabled={disabled} aria-label={ariaLabel}
      onChange={(event) => {
        steppedValueRef.current = null;
        setFollowValue(false);
        setTyped(true);
        setDraft(event.target.value);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        endKeyStep();
        setFocused(false);
        if (cancelBlurCommitRef.current) cancelBlurCommitRef.current = false;
        else commit();
        steppedValueRef.current = null;
        setFollowValue(false);
        setTyped(false);
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
