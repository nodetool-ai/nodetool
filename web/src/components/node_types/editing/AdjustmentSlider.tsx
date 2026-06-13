/** @jsxImportSource @emotion/react */
/**
 * AdjustmentSlider — the shared slider row for slider-driven bespoke bodies
 * (AdjustmentBody, CurvesBody, …). Renders `label | slider | value` cells into
 * the parent's `.controls` grid.
 *
 * Bipolar specs (range straddling 0, neutral at 0 — temperature, tint,
 * shadows, …) hide the native track and fill outward from the centre so the
 * control reads as a signed adjustment, not a 0–100% level. A non-default
 * value lights the thumb via `changed`.
 *
 * `adjustmentSliderStyles` carries the row's CSS (labels, value chip, centre
 * tick / bipolar fill, MUI slider polish) — compose it into the body's emotion
 * block alongside the body's own styles: `css={[bodyStyles, sliderStyles]}`.
 */

import React, { useCallback } from "react";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

import { NodeSlider, BORDER_RADIUS, FONT_WEIGHT } from "../../ui_primitives";

const TRACK_HEIGHT = 4;
const THUMB_SIZE = 12;

export interface SliderSpec {
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Range straddles 0 with a neutral midpoint — fill outward from centre. */
  bipolar: boolean;
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

const formatSliderValue = (spec: SliderSpec, value: number): string => {
  if (spec.step >= 1) {
    return String(Math.round(value));
  }
  const sign = spec.bipolar && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
};

/** Fraction 0..1 of where `value` sits in `[min, max]`. */
const fraction = (spec: SliderSpec, value: number): number =>
  spec.max === spec.min ? 0 : (value - spec.min) / (spec.max - spec.min);

export const adjustmentSliderStyles = (theme: Theme) =>
  css({
    ".ctrl-label": {
      fontSize: theme.fontSizeSmaller,
      fontWeight: FONT_WEIGHT.medium,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.045em",
      lineHeight: 1,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    // Wraps the slider so the centre tick + bipolar fill can be positioned
    // over the rail. Zero vertical jitter: the slider's rail sits at 50%.
    ".slider-wrap": {
      position: "relative",
      display: "flex",
      alignItems: "center",
      width: "100%",
      height: 16
    },
    ".slider-wrap .center-tick": {
      position: "absolute",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: 2,
      height: 9,
      borderRadius: BORDER_RADIUS.xs,
      backgroundColor: theme.vars.palette.grey[600],
      pointerEvents: "none",
      zIndex: 0
    },
    ".slider-wrap .bipolar-fill": {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
      backgroundColor: theme.vars.palette.primary.main,
      pointerEvents: "none",
      zIndex: 1
    },
    ".ctrl-value": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      fontVariantNumeric: "tabular-nums",
      color: theme.vars.palette.text.primary,
      minWidth: 46,
      textAlign: "right",
      lineHeight: 1,
      padding: "3px 6px",
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: theme.vars.palette.grey[800]
    },
    // Slider polish — rounded rail/track, ring-style thumb. Scoped here so the
    // app's square editor sliders elsewhere are untouched.
    ".controls .MuiSlider-root": {
      padding: 0,
      margin: 0
    },
    ".controls .MuiSlider-rail": {
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
      opacity: 1,
      backgroundColor: theme.vars.palette.grey[700]
    },
    ".controls .MuiSlider-track": {
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
      border: "none",
      backgroundColor: theme.vars.palette.primary.main
    },
    // backgroundColor is left to NodeSlider (grey when neutral, primary when
    // changed) so an unchanged thumb reads as a ring and a changed one fills in.
    ".controls .MuiSlider-thumb": {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: BORDER_RADIUS.circle,
      border: `2px solid ${theme.vars.palette.primary.main}`,
      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.45)",
      "&:hover, &.Mui-focusVisible, &.Mui-active": {
        boxShadow: `0 0 0 6px color-mix(in srgb, ${theme.vars.palette.primary.main} 20%, transparent)`
      }
    }
  });

interface AdjustmentSliderProps {
  spec: SliderSpec;
  value: number;
  onChange: (name: string, v: number) => void;
  onCommit: () => void;
  /** Extra class on the label cell (e.g. Curves' red/green/blue channels). */
  labelClassName?: string;
}

export const AdjustmentSlider: React.FC<AdjustmentSliderProps> = ({
  spec,
  value,
  onChange,
  onCommit,
  labelClassName
}) => {
  const handleChange = useCallback(
    (_: Event, v: number | number[]) => {
      const next = Array.isArray(v) ? v[0] : v;
      const rounded = spec.step >= 1 ? Math.round(next) : Math.round(next * 100) / 100;
      onChange(spec.name, rounded);
    },
    [onChange, spec.name, spec.step]
  );

  // Centre fill geometry (bipolar only): from the neutral point (where 0 sits)
  // out to the thumb. Slider padding is 0, so rail spans 0–100% and these
  // percentages line up with the thumb.
  const centreFrac = clamp(fraction(spec, 0), 0, 1);
  const valueFrac = clamp(fraction(spec, value), 0, 1);
  const fillLeft = Math.min(centreFrac, valueFrac) * 100;
  const fillWidth = Math.abs(valueFrac - centreFrac) * 100;

  return (
    <>
      <span className={`ctrl-label${labelClassName ? ` ${labelClassName}` : ""}`}>
        {spec.label}
      </span>
      <span className={`slider-wrap${spec.bipolar ? " is-bipolar" : ""}`}>
        {spec.bipolar && (
          <>
            <span className="center-tick" style={{ left: `${centreFrac * 100}%` }} />
            <span
              className="bipolar-fill"
              style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
            />
          </>
        )}
        <NodeSlider
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          changed={value !== spec.default}
          // Native fill hidden for bipolar — the centre fill replaces it.
          track={spec.bipolar ? false : "normal"}
          onChange={handleChange}
          onChangeCommitted={onCommit}
          aria-label={`${spec.label} adjustment`}
        />
      </span>
      <span className="ctrl-value">{formatSliderValue(spec, value)}</span>
    </>
  );
};
