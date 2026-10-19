/** @jsxImportSource @emotion/react */
/**
 * AdjustmentSlider — the shared slider row for slider-driven bespoke bodies
 * (AdjustmentBody, CurvesBody, …). Renders `label | slider | value` cells into
 * the parent's `.controls` grid.
 *
 * Bipolar specs (range straddling 0, neutral at 0 — temperature, tint,
 * shadows, …) pass `origin={0}` to the shared `Slider`, which fills outward
 * from the centre so the control reads as a signed adjustment, not a 0–100%
 * level. A non-default value lights the thumb via `changed`. The rail, track
 * and thumb look is the primitive's; nothing here restyles MUI.
 *
 * `adjustmentSliderStyles` carries the row's CSS (labels, value chip, cell
 * layout) — compose it into the body's emotion
 * block alongside the body's own styles: `css={[bodyStyles, sliderStyles]}`.
 */

import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

import { NodeSlider, FONT_WEIGHT, SPACING } from "../../ui_primitives";

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

export const adjustmentSliderStyles = (theme: Theme) =>
  css({
    ".ctrl-label": {
      fontSize: theme.fontSizeSmaller,
      fontWeight: FONT_WEIGHT.medium,
      color: theme.vars.palette.text.secondary,
      letterSpacing: "normal",
      lineHeight: 1.3,
      minWidth: 0,
      overflowWrap: "anywhere"
    },
    // Wraps the slider so the centre tick + bipolar fill can be positioned
    // over the rail. Zero vertical jitter: the slider's rail sits at 50%.
    ".slider-wrap": {
      position: "relative",
      display: "flex",
      alignItems: "center",
      width: "100%",
      height: 24
    },
    ".ctrl-value": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      fontVariantNumeric: "tabular-nums",
      color: theme.vars.palette.text.primary,
      minWidth: 40,
      textAlign: "right",
      lineHeight: 1,
      padding: `0 ${theme.spacing(SPACING.xs)}`
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

// Memoized: a scrub re-renders the body ~60x/s, and only the dragged row's
// `value` changes — the other rows' props are all stable.
export const AdjustmentSlider: React.FC<AdjustmentSliderProps> = memo(({
  spec,
  value,
  onChange,
  onCommit,
  labelClassName
}) => {
  const { t } = useTranslation();
  const handleChange = useCallback(
    (_: Event, v: number | number[]) => {
      const next = Array.isArray(v) ? v[0] : v;
      const rounded = spec.step >= 1 ? Math.round(next) : Math.round(next * 100) / 100;
      onChange(spec.name, rounded);
    },
    [onChange, spec.name, spec.step]
  );

  return (
    <>
      <span className={`ctrl-label${labelClassName ? ` ${labelClassName}` : ""}`}>
        {spec.label}
      </span>
      <span className="slider-wrap">
        <NodeSlider
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          changed={value !== spec.default}
          // Bipolar: fill outward from the neutral 0 instead of the left edge.
          origin={spec.bipolar ? 0 : undefined}
          onChange={handleChange}
          onChangeCommitted={onCommit}
          aria-label={t("i18n-next34.adjustmentSlider.ariaLabel", {
            label: spec.label
          })}
        />
      </span>
      <span className="ctrl-value">{formatSliderValue(spec, value)}</span>
    </>
  );
});
AdjustmentSlider.displayName = "AdjustmentSlider";
