/** @jsxImportSource @emotion/react */
/**
 * Knob
 *
 * A rotary control over a numeric range: a 270° arc with a pointer, for
 * dense audio surfaces (pan, sends, device parameters) where a slider does not
 * fit. It is a `role="slider"` with the value spoken through `valueText`.
 *
 * - Drag up or right to raise, down or left to lower. Shift drags finer.
 * - Arrow keys step by `step`, Page Up/Down by ten steps, Home/End jump to
 *   the ends. Double-click or Delete resets to `defaultValue`.
 * - `bipolar` draws the arc from the centre (pan), not from the minimum.
 * - `onChangeStart`/`onChangeEnd` bracket one gesture (a drag or one key
 *   press), so a caller can record it as one undo entry.
 */

import React, { memo, useCallback, useMemo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { BORDER_RADIUS, CONTROL, MOTION, TYPOGRAPHY, reducedMotion } from "./tokens";
import { SPACING } from "./spacing";

export interface KnobProps {
  value: number;
  min: number;
  max: number;
  /** Keyboard step. Default 1/100 of the range. */
  step?: number;
  /** Double-click and Delete reset here. Default `min`, or the centre when `bipolar`. */
  defaultValue?: number;
  onChange: (value: number) => void;
  /** A gesture began: a pointer press or a key press. */
  onChangeStart?: () => void;
  /** The gesture ended. */
  onChangeEnd?: () => void;
  /** Accessible name. */
  label: string;
  /** Spoken and shown value, e.g. "30% left". Default the number. */
  valueText?: (value: number) => string;
  /** Arc from the centre of the range. */
  bipolar?: boolean;
  /** Diameter in px. Default the medium control height. */
  size?: number;
  /** Visible caption under the knob. */
  caption?: string;
  disabled?: boolean;
  className?: string;
}

const SWEEP_DEG = 270;
const START_DEG = -135;
/** Pixels of drag for the whole range; Shift is ten times finer. */
const DRAG_RANGE_PX = 160;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const [a, b] = fromDeg <= toDeg ? [fromDeg, toDeg] : [toDeg, fromDeg];
  if (b - a < 0.01) return "";
  const [x1, y1] = polar(cx, cy, r, a);
  const [x2, y2] = polar(cx, cy, r, b);
  const large = b - a > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

const knobStyles = (theme: Theme, disabled: boolean) =>
  css({
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    gap: theme.spacing(SPACING.micro),
    opacity: disabled ? 0.5 : 1,
    ".knob__dial": {
      display: "block",
      cursor: disabled ? "default" : "ns-resize",
      touchAction: "none",
      borderRadius: BORDER_RADIUS.circle,
      outline: "none",
      transition: MOTION.shadow,
      ...reducedMotion({ transition: MOTION.none })
    },
    ".knob__dial:focus-visible": {
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}`
    },
    ".knob__caption": {
      ...TYPOGRAPHY.sans.caption,
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap",
      userSelect: "none"
    }
  });

export const Knob = memo(function Knob({
  value,
  min,
  max,
  step,
  defaultValue,
  onChange,
  onChangeStart,
  onChangeEnd,
  label,
  valueText,
  bipolar = false,
  size = CONTROL.height.md,
  caption,
  disabled = false,
  className
}: KnobProps): React.JSX.Element {
  const theme = useTheme();
  const range = max - min || 1;
  const keyStep = step ?? range / 100;
  const reset = defaultValue ?? (bipolar ? (min + max) / 2 : min);
  const drag = useRef<{ startY: number; startX: number; startValue: number } | null>(null);

  const emit = useCallback(
    (next: number) => {
      const v = clamp(next, min, max);
      if (v !== value) onChange(v);
    },
    [min, max, value, onChange]
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus();
      drag.current = { startY: event.clientY, startX: event.clientX, startValue: value };
      onChangeStart?.();
    },
    [disabled, value, onChangeStart]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      const delta = d.startY - event.clientY + (event.clientX - d.startX);
      const scale = event.shiftKey ? 10 : 1;
      emit(d.startValue + (delta / (DRAG_RANGE_PX * scale)) * range);
    },
    [emit, range]
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
    [emit, onChangeStart, onChangeEnd]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const fine = event.shiftKey ? 0.1 : 1;
      let next: number | null = null;
      switch (event.key) {
        case "ArrowUp":
        case "ArrowRight":
          next = value + keyStep * fine;
          break;
        case "ArrowDown":
        case "ArrowLeft":
          next = value - keyStep * fine;
          break;
        case "PageUp":
          next = value + keyStep * 10;
          break;
        case "PageDown":
          next = value - keyStep * 10;
          break;
        case "Home":
          next = min;
          break;
        case "End":
          next = max;
          break;
        case "Delete":
        case "Backspace":
          next = reset;
          break;
        default:
          return;
      }
      event.preventDefault();
      once(next);
    },
    [disabled, value, keyStep, min, max, reset, once]
  );

  const onDoubleClick = useCallback(() => {
    if (!disabled) once(reset);
  }, [disabled, once, reset]);

  const styles = useMemo(() => knobStyles(theme, disabled), [theme, disabled]);
  const t = (clamp(value, min, max) - min) / range;
  const angle = START_DEG + t * SWEEP_DEG;
  const originDeg = bipolar ? 0 : START_DEG;
  const c = size / 2;
  const r = c - 3;
  const [px, py] = polar(c, c, r - 4, angle);
  const text = valueText ? valueText(value) : String(Math.round(value * 100) / 100);

  return (
    <div css={styles} className={className}>
      <div
        className="knob__dial"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
        aria-disabled={disabled || undefined}
        aria-orientation="vertical"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={onDoubleClick}
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={c} cy={c} r={r - 2} fill={theme.vars.palette.action.hover} />
          <path
            d={arcPath(c, c, r, START_DEG, START_DEG + SWEEP_DEG)}
            fill="none"
            stroke={theme.vars.palette.divider}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <path
            d={arcPath(c, c, r, originDeg, angle)}
            fill="none"
            stroke={theme.vars.palette.primary.main}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <line
            x1={c}
            y1={c}
            x2={px}
            y2={py}
            stroke={theme.vars.palette.text.primary}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      </div>
      {caption !== undefined && <span className="knob__caption">{caption}</span>}
    </div>
  );
});
