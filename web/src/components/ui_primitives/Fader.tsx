/** @jsxImportSource @emotion/react */
/**
 * Fader
 *
 * A vertical slider for channel levels. The value runs through `toPosition`
 * and `fromPosition` (0 at the bottom, 1 at the top), so a decibel fader can
 * use an audio taper while the control stays a plain `role="slider"`.
 *
 * - Pressing the cap drags it relative to where it was grabbed; pressing the
 *   track jumps the cap there first. Shift drags ten times finer.
 * - Arrow keys move 1% of the travel (Shift 0.1%), Page Up/Down 10%,
 *   Home/End the ends. Double-click or Delete resets to `defaultValue`.
 * - `marks` draws a scale beside the track; the same mapping places them.
 * - `onChangeStart`/`onChangeEnd` bracket one gesture, for one undo entry.
 * - The fader fills its parent's height; give the parent one.
 */

import React, { memo, useCallback, useMemo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { BORDER_RADIUS, CONTROL, TYPOGRAPHY } from "./tokens";
import { SPACING } from "./spacing";

export interface FaderMark {
  value: number;
  label: string;
}

export interface FaderProps {
  value: number;
  min: number;
  max: number;
  /** Value → travel position, 0 (bottom) to 1 (top). Default linear. */
  toPosition?: (value: number) => number;
  /** Travel position → value. Must invert `toPosition`. Default linear. */
  fromPosition?: (position: number) => number;
  defaultValue?: number;
  onChange: (value: number) => void;
  onChangeStart?: () => void;
  onChangeEnd?: () => void;
  /** Accessible name. */
  label: string;
  /** Spoken value, e.g. "-6.0 dB". Default the number. */
  valueText?: (value: number) => string;
  /** Scale beside the track. */
  marks?: readonly FaderMark[];
  disabled?: boolean;
  className?: string;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Cap size, from the control scale. */
const CAP_HEIGHT = CONTROL.height.xs - 4;
const CAP_WIDTH = CONTROL.height.sm;
const TRACK_WIDTH = 4;

const faderStyles = (theme: Theme, disabled: boolean) =>
  css({
    position: "relative",
    display: "flex",
    flexDirection: "row",
    alignItems: "stretch",
    height: "100%",
    minHeight: 0,
    gap: theme.spacing(SPACING.xs),
    opacity: disabled ? 0.5 : 1,
    userSelect: "none",
    ".fader__scale": {
      position: "relative",
      width: theme.spacing(SPACING.xl + SPACING.xs),
      margin: `${CAP_HEIGHT / 2}px 0`
    },
    ".fader__mark": {
      position: "absolute",
      right: 0,
      transform: "translateY(50%)",
      ...TYPOGRAPHY.mono.caption,
      lineHeight: 1,
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap"
    },
    ".fader__slot": {
      position: "relative",
      width: CAP_WIDTH,
      cursor: disabled ? "default" : "pointer",
      touchAction: "none",
      outline: "none",
      borderRadius: BORDER_RADIUS.sm
    },
    ".fader__slot:focus-visible": {
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}`
    },
    ".fader__track": {
      position: "absolute",
      left: "50%",
      top: CAP_HEIGHT / 2,
      bottom: CAP_HEIGHT / 2,
      width: TRACK_WIDTH,
      transform: "translateX(-50%)",
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: theme.vars.palette.action.selected
    },
    ".fader__tick": {
      position: "absolute",
      left: "50%",
      width: CAP_WIDTH - 8,
      height: 1,
      transform: "translate(-50%, 50%)",
      backgroundColor: theme.vars.palette.divider
    },
    ".fader__cap": {
      position: "absolute",
      left: 0,
      width: CAP_WIDTH,
      height: CAP_HEIGHT,
      transform: "translateY(50%)",
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.grey[300],
      boxSizing: "border-box",
      cursor: disabled ? "default" : "grab"
    },
    ".fader__cap::after": {
      content: '""',
      position: "absolute",
      left: 2,
      right: 2,
      top: "50%",
      height: 2,
      transform: "translateY(-50%)",
      backgroundColor: theme.vars.palette.background.default
    }
  });

export const Fader = memo(function Fader({
  value,
  min,
  max,
  toPosition,
  fromPosition,
  defaultValue,
  onChange,
  onChangeStart,
  onChangeEnd,
  label,
  valueText,
  marks,
  disabled = false,
  className
}: FaderProps): React.JSX.Element {
  const theme = useTheme();
  const slotRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ grabOffset: number } | null>(null);

  const posOf = useCallback(
    (v: number) =>
      clamp01(toPosition ? toPosition(v) : (v - min) / (max - min || 1)),
    [toPosition, min, max]
  );
  const valueOf = useCallback(
    (p: number) => {
      const v = fromPosition ? fromPosition(clamp01(p)) : min + clamp01(p) * (max - min);
      return Math.min(max, Math.max(min, v));
    },
    [fromPosition, min, max]
  );

  const emit = useCallback(
    (next: number) => {
      if (next !== value) onChange(next);
    },
    [value, onChange]
  );

  /** Travel position under a pointer, from the slot's geometry. */
  const pointerPosition = useCallback((clientY: number): number => {
    const slot = slotRef.current;
    if (!slot) return 0;
    const rect = slot.getBoundingClientRect();
    const travel = rect.height - CAP_HEIGHT;
    if (travel <= 0) return 0;
    return clamp01((rect.bottom - CAP_HEIGHT / 2 - clientY) / travel);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus();
      onChangeStart?.();
      const onCap = (event.target as HTMLElement).classList.contains("fader__cap");
      const here = pointerPosition(event.clientY);
      if (onCap) {
        drag.current = { grabOffset: here - posOf(value) };
      } else {
        drag.current = { grabOffset: 0 };
        emit(valueOf(here));
      }
    },
    [disabled, onChangeStart, pointerPosition, posOf, value, emit, valueOf]
  );

  const lastY = useRef(0);
  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) {
        lastY.current = event.clientY;
        return;
      }
      if (event.shiftKey) {
        // Fine: move a tenth of the pointer's travel from the current spot.
        const slot = slotRef.current;
        const travel = slot ? slot.getBoundingClientRect().height - CAP_HEIGHT : 0;
        if (travel > 0) {
          const delta = (lastY.current - event.clientY) / travel / 10;
          emit(valueOf(posOf(value) + delta));
          d.grabOffset = pointerPosition(event.clientY) - posOf(value) - delta;
        }
      } else {
        emit(valueOf(pointerPosition(event.clientY) - d.grabOffset));
      }
      lastY.current = event.clientY;
    },
    [emit, valueOf, posOf, value, pointerPosition]
  );

  const endDrag = useCallback(() => {
    if (!drag.current) return;
    drag.current = null;
    onChangeEnd?.();
  }, [onChangeEnd]);

  const once = useCallback(
    (next: number) => {
      onChangeStart?.();
      emit(next);
      onChangeEnd?.();
    },
    [onChangeStart, emit, onChangeEnd]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const p = posOf(value);
      let next: number | null = null;
      switch (event.key) {
        case "ArrowUp":
        case "ArrowRight":
          next = valueOf(p + (event.shiftKey ? 0.001 : 0.01));
          break;
        case "ArrowDown":
        case "ArrowLeft":
          next = valueOf(p - (event.shiftKey ? 0.001 : 0.01));
          break;
        case "PageUp":
          next = valueOf(p + 0.1);
          break;
        case "PageDown":
          next = valueOf(p - 0.1);
          break;
        case "Home":
          next = min;
          break;
        case "End":
          next = max;
          break;
        case "Delete":
        case "Backspace":
          if (defaultValue === undefined) return;
          next = defaultValue;
          break;
        default:
          return;
      }
      event.preventDefault();
      once(next);
    },
    [disabled, posOf, value, valueOf, min, max, defaultValue, once]
  );

  const onDoubleClick = useCallback(() => {
    if (!disabled && defaultValue !== undefined) once(defaultValue);
  }, [disabled, defaultValue, once]);

  const styles = useMemo(() => faderStyles(theme, disabled), [theme, disabled]);
  const position = posOf(value);
  const capBottom = `calc(${position} * (100% - ${CAP_HEIGHT}px))`;
  const markBottom = (v: number): string => `${posOf(v) * 100}%`;

  return (
    <div css={styles} className={className}>
      {marks && marks.length > 0 && (
        <div className="fader__scale" aria-hidden="true">
          {marks.map((mark) => (
            <span key={mark.value} className="fader__mark" style={{ bottom: markBottom(mark.value) }}>
              {mark.label}
            </span>
          ))}
        </div>
      )}
      <div
        ref={slotRef}
        className="fader__slot"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText ? valueText(value) : String(value)}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={onDoubleClick}
      >
        <div className="fader__track" />
        {marks?.map((mark) => (
          <div
            key={mark.value}
            className="fader__tick"
            style={{
              bottom: `calc(${CAP_HEIGHT / 2}px + ${posOf(mark.value)} * (100% - ${CAP_HEIGHT}px))`
            }}
          />
        ))}
        <div className="fader__cap" style={{ bottom: `calc(${capBottom} + ${CAP_HEIGHT / 2}px)` }} />
      </div>
    </div>
  );
});
