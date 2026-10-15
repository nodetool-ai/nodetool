/** @jsxImportSource @emotion/react */
/**
 * Slider
 *
 * The one slider for the app. A single rail / track / thumb look (rounded
 * pill rail, primary fill, ring-style thumb) shared by transport scrubbers,
 * settings, node bodies and inspectors.
 *
 * - `density`: `"normal"` (default) or `"compact"` for dense node bodies,
 *   inspectors and tool panels. MUI `size="small"` also selects compact.
 * - `layout`: `"inline"` (default) renders just the track; `"row"` renders
 *   `label | track | value` using `label` and `display`.
 * - `changed`: node-editor convention. `false` draws a neutral thumb (value is
 *   at its default); `true` or unset draws a primary thumb.
 * - `origin`: neutral value for bipolar controls. The fill grows outward from
 *   it instead of from the left edge and a tick marks it. With `resetValue`
 *   (defaults to `origin`) a double-click on the track resets the value via
 *   `onChange`.
 *
 * `onChange` / `onChangeCommitted` are MUI's, untouched.
 */

import { forwardRef, useCallback, useMemo, type CSSProperties } from "react";
import { css } from "@emotion/react";
import { Slider as MuiSlider, type SliderProps as MuiSliderProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { BORDER_RADIUS, MOTION, TYPOGRAPHY, reducedMotion } from "./tokens";
import { SPACING } from "./spacing";

export interface SliderProps extends MuiSliderProps {
  /** Compact sizing for dense toolbars, node bodies and inspectors. */
  density?: "compact" | "normal";
  /** `inline`: track only. `row`: label, track and value readout. */
  layout?: "inline" | "row";
  /** Row layout: text on the left. */
  label?: string;
  /** Row layout: formatted readout on the right ("0.50", "45°"). */
  display?: string;
  /** `false` = value equals its default (neutral thumb). Unset = primary thumb. */
  changed?: boolean;
  /** Neutral value of a bipolar control; the fill originates here. */
  origin?: number;
  /** Double-click reset target. Defaults to `origin`. Needs `origin` or this. */
  resetValue?: number;
  /** Receives the reset value on double-click. Defaults to `onChange`. */
  onReset?: (value: number) => void;
}

export const Slider = forwardRef<HTMLSpanElement, SliderProps>(
  (
    {
      sx,
      density,
      size,
      layout = "inline",
      label,
      display,
      changed,
      origin,
      resetValue,
      onReset,
      style,
      value,
      min = 0,
      max = 100,
      onChange,
      onDoubleClick,
      track,
      ...props
    },
    ref
  ) => {
    const theme = useTheme();
    const compact = density === "compact" || (density === undefined && size === "small");
    const railHeight = compact ? 4 : 6;
    const thumbSize = compact ? 12 : 16;
    const primary = theme.vars.palette.primary.main;
    const ring = `color-mix(in srgb, ${primary} 20%, transparent)`;
    const neutralThumb = changed === false;

    const mergedSx = useMemo(
      () => ({
        marginTop: 0,
        minWidth: 0,
        // Comfortable vertical hit area around a thin rail.
        padding: compact ? `${theme.spacing(SPACING.md)} 0` : `${theme.spacing(SPACING.lg)} 0`,
        "& .MuiSlider-rail": {
          backgroundColor: theme.vars.palette.action.selected,
          opacity: 1,
          borderRadius: BORDER_RADIUS.pill,
          height: railHeight,
          // Bipolar: the rail draws the fill (driven by --fill-* vars).
          background:
            origin === undefined
              ? theme.vars.palette.action.selected
              : `linear-gradient(to right, transparent 0, transparent var(--fill-lo, 0%), ${primary} var(--fill-lo, 0%), ${primary} var(--fill-hi, 0%), transparent var(--fill-hi, 0%)), ${theme.vars.palette.action.selected}`,
          "&::before": origin === undefined ? { display: "none" } : {
            content: '""',
            position: "absolute",
            left: "var(--fill-origin, 0%)",
            top: "50%",
            width: 2,
            height: railHeight + 5,
            transform: "translate(-50%, -50%)",
            borderRadius: BORDER_RADIUS.xs,
            backgroundColor: theme.vars.palette.text.disabled,
            opacity: "var(--fill-show-tick, 0)",
            pointerEvents: "none"
          }
        },
        "& .MuiSlider-track": {
          height: railHeight,
          opacity: 1,
          left: 0,
          borderRadius: BORDER_RADIUS.pill,
          border: "none",
          backgroundColor: primary
        },
        "& .MuiSlider-thumb": {
          width: thumbSize,
          height: thumbSize,
          borderRadius: BORDER_RADIUS.circle,
          backgroundColor: neutralThumb ? theme.vars.palette.text.secondary : primary,
          border: `2px solid ${theme.vars.palette.background.paper}`,
          boxShadow: "none",
          transition: MOTION.background,
          ...reducedMotion({ transition: MOTION.none }),
          "&:hover, &.Mui-focusVisible, &.Mui-active": {
            boxShadow: `0 0 0 6px ${ring}`
          },
          "&:hover, &:focus, &:active": {
            backgroundColor: primary
          },
          "&.Mui-focusVisible": {
            outline: `2px solid ${primary}`,
            outlineOffset: 3
          },
          // Suppress MUI's value-label ripple pseudo-elements; the thumb ring
          // above is the interaction affordance.
          "&::before, &::after": { display: "none" }
        },
        flex: layout === "row" ? "1 1 auto" : undefined,
        ...sx
      }),
      [theme, compact, railHeight, thumbSize, primary, ring, neutralThumb, origin, layout, sx]
    );

    // Bipolar fill geometry, as CSS vars on the root.
    const bipolarStyle = useMemo<CSSProperties | undefined>(() => {
      if (origin === undefined) return style;
      const span = max - min || 1;
      const pct = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / span) * 100;
      const current = typeof value === "number" ? value : min;
      const valuePct = pct(current);
      const originPct = pct(origin);
      return {
        ...style,
        "--fill-lo": `${Math.min(originPct, valuePct)}%`,
        "--fill-hi": `${Math.max(originPct, valuePct)}%`,
        "--fill-origin": `${originPct}%`,
        "--fill-show-tick": origin > min && origin < max ? 1 : 0
      } as CSSProperties;
    }, [origin, min, max, value, style]);

    const resetTarget = resetValue ?? origin;
    const handleDoubleClick = useCallback(
      (event: React.MouseEvent<HTMLSpanElement>) => {
        onDoubleClick?.(event);
        if (resetTarget !== undefined && !props.disabled) {
          if (onReset) onReset(resetTarget);
          else onChange?.(event.nativeEvent as unknown as Event, resetTarget, 0);
        }
      },
      [onDoubleClick, onChange, onReset, resetTarget, props.disabled]
    );

    const rowCss = useMemo(
      () =>
        css({
          display: "flex",
          alignItems: "center",
          gap: theme.spacing(SPACING.md),
          minHeight: 24
        }),
      [theme]
    );
    const labelCss = useMemo(
      () =>
        css({
          flex: "0 1 auto",
          minWidth: 60,
          color: theme.vars.palette.text.secondary,
          ...TYPOGRAPHY.sans.label,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }),
      [theme]
    );
    const valueCss = useMemo(
      () =>
        css({
          flex: "0 0 44px",
          ...TYPOGRAPHY.mono.label,
          color: theme.vars.palette.text.secondary,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums"
        }),
      [theme]
    );

    const slider = (
      <MuiSlider
        ref={ref}
        sx={mergedSx}
        value={value}
        min={min}
        max={max}
        onChange={onChange}
        // Bipolar sliders suppress MUI's left-anchored fill.
        track={origin !== undefined ? false : track}
        style={bipolarStyle}
        onDoubleClick={resetTarget !== undefined ? handleDoubleClick : onDoubleClick}
        {...props}
      />
    );

    if (layout !== "row") return slider;

    return (
      <div css={rowCss}>
        <span title={label} css={labelCss}>
          {label}
        </span>
        {slider}
        <span css={valueCss}>{display}</span>
      </div>
    );
  }
);

Slider.displayName = "Slider";
