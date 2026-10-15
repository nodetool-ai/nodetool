import { forwardRef, memo, useCallback, useRef, type ChangeEvent, type PointerEvent } from "react";
import { InputAdornment } from "@mui/material";

import type { Theme } from "@mui/material/styles";

import { TextInput, type TextInputProps } from "./TextInput";
import type { FieldDensity } from "./fieldDensity";
import { BORDER_RADIUS, CONTROL, MOTION, TYPOGRAPHY } from "./tokens";
import { SPACING } from "./spacing";

/** Control height of a number field: the small token on a compact surface, else the large one. */
export const numberFieldHeight = (density: FieldDensity): number =>
  density === "compact" ? CONTROL.height.sm : CONTROL.height.lg;

/**
 * The shared number-field surface: height per density, field background,
 * border, radius and the focus ring (a primary border). NumberField gets the
 * same look from TextInput; InspectorValueInput and inputs/NumberInput draw
 * their own wrapper with this so all three read as one control.
 */
export const numberFieldSurfaceStyles = (theme: Theme, density: FieldDensity, focused: boolean) => ({
  boxSizing: "border-box" as const,
  height: numberFieldHeight(density),
  backgroundColor: density === "compact" ? theme.vars.palette.background.default : theme.vars.palette.Paper.overlay,
  border: `1px solid ${focused ? theme.vars.palette.primary.main : theme.vars.palette.c_overlay}`,
  borderRadius: BORDER_RADIUS.sm,
  transition: `border-color ${MOTION.fast}`,
  "&:hover": { borderColor: focused ? theme.vars.palette.primary.main : theme.vars.palette.divider }
});

/** Value text of a number field (the compact field label size). */
export const numberFieldTextStyles = (theme: Theme) => ({
  ...TYPOGRAPHY.sans.label,
  color: theme.vars.palette.text.primary
});

/** Unit or suffix text: mono label, secondary colour. */
export const numberFieldUnitStyles = (theme: Theme) => ({
  ...TYPOGRAPHY.mono.label,
  color: theme.vars.palette.text.secondary,
  flexShrink: 0
});

/** Horizontal inset of the value inside the surface. */
export const numberFieldPaddingX = (theme: Theme): string => theme.spacing(SPACING.md);

export interface NumberFieldProps
  extends Omit<TextInputProps, "type" | "value" | "onChange" | "inputProps" | "InputProps"> {
  /** Current text of the field. Kept as text so a half-typed value ("-", "1.") survives. */
  value: string | number;
  /** Native change event, fired while typing. */
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Raw text after a typed edit or a scrub step. Required for `scrub` to do anything. */
  onValueChange?: (raw: string) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Suffix shown inside the field, such as "%", "px" or "ms". */
  unit?: string;
  /**
   * Drag horizontally on the unfocused field to change the value by `step`
   * per pixel (Shift x10, Alt x0.1), clamped to min/max. A press that does
   * not move focuses the field as usual.
   */
  scrub?: boolean;
  /** Accessible name when the visible label is hidden or absent. */
  ariaLabel?: string;
  /** Centre the value, for tight rows of channel values (RGB, HSL). */
  align?: "start" | "center";
}

const SCRUB_THRESHOLD_PX = 3;

const decimalsOf = (step: number): number => (String(step).split(".")[1] ?? "").length;

/**
 * NumberField - the one number input.
 *
 * A TextInput type="number" with a shared unit suffix, min/max/step, optional
 * drag-to-scrub, the field density of the surrounding surface
 * (FieldDensityContext) and one focus ring. Native spinner buttons are hidden;
 * ArrowUp/ArrowDown still step the value.
 */
export const NumberField = memo(
  forwardRef<HTMLDivElement, NumberFieldProps>(function NumberField(
    { value, onChange, onValueChange, min, max, step, unit, scrub = false, ariaLabel, align = "start", sx, onPointerDown, ...rest },
    ref
  ) {
    const dragRef = useRef<{ startX: number; startValue: number; moved: boolean; pointerId: number } | null>(null);
    const focusedRef = useRef(false);

    const handleChange = useCallback(
      (event: ChangeEvent<HTMLInputElement>) => {
        onChange?.(event);
        onValueChange?.(event.target.value);
      },
      [onChange, onValueChange]
    );

    const handlePointerDown = useCallback(
      (event: PointerEvent<HTMLDivElement>) => {
        onPointerDown?.(event);
        if (!scrub || !onValueChange || focusedRef.current || rest.disabled || event.button !== 0) return;
        const start = parseFloat(String(value));
        if (!Number.isFinite(start)) return;
        dragRef.current = { startX: event.clientX, startValue: start, moved: false, pointerId: event.pointerId };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      [onPointerDown, scrub, onValueChange, value, rest.disabled]
    );

    const handlePointerMove = useCallback(
      (event: PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || !onValueChange) return;
        const dx = event.clientX - drag.startX;
        if (!drag.moved) {
          if (Math.abs(dx) < SCRUB_THRESHOLD_PX) return;
          drag.moved = true;
        }
        const base = step ?? 1;
        const multiplier = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
        let next = drag.startValue + dx * base * multiplier;
        if (min !== undefined) next = Math.max(min, next);
        if (max !== undefined) next = Math.min(max, next);
        onValueChange(next.toFixed(decimalsOf(base) + (multiplier < 1 ? 1 : 0)));
      },
      [onValueChange, step, min, max]
    );

    const handlePointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      // Only a press that never moved focuses the field.
      if (!drag.moved && event.type === "pointerup") {
        const input = event.currentTarget.querySelector("input");
        input?.focus();
      }
    }, []);

    return (
      <TextInput
        {...rest}
        ref={ref}
        type="number"
        value={value}
        onChange={handleChange}
        onFocus={(event) => {
          focusedRef.current = true;
          rest.onFocus?.(event);
        }}
        onBlur={(event) => {
          focusedRef.current = false;
          rest.onBlur?.(event);
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        InputProps={
          unit
            ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> }
            : undefined
        }
        inputProps={{
          min,
          max,
          step,
          "aria-label": ariaLabel,
        }}
        sx={{
          "& input[type=number]": {
            MozAppearance: "textfield",
            textAlign: align === "center" ? "center" : undefined,
            cursor: scrub ? "ew-resize" : undefined
          },
          "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button": {
            WebkitAppearance: "none",
            margin: 0
          },
          "& .MuiInputAdornment-root": {
            marginLeft: 0,
            "& .MuiTypography-root": { ...TYPOGRAPHY.mono.label, color: "text.secondary" }
          },
          touchAction: scrub ? "none" : undefined,
          // TextInput spreads sx into an object, so callers pass a plain object.
          ...(sx as object)
        }}
      />
    );
  })
);
