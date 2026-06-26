/** @jsxImportSource @emotion/react */
/**
 * Slider
 *
 * General-purpose slider primitive for application UI (transport scrubbers,
 * setting controls, media seek bars). Theme-driven, full-width, with a normal
 * pointer hit area.
 *
 * This is distinct from {@link NodeSlider}, which carries node-editor baggage
 * (the ReactFlow `nodrag` class, editor scope, a collapsed `padding: 0` hit
 * area) and is meant only for node property panels. Use `Slider` everywhere
 * else.
 */

import { forwardRef, useMemo } from "react";
import { Slider as MuiSlider, type SliderProps as MuiSliderProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { MOTION } from "./tokens";

export interface SliderProps extends Omit<MuiSliderProps, "size"> {
  /** Compact sizing for dense toolbars/control bars. */
  density?: "compact" | "normal";
}

export const Slider = forwardRef<HTMLSpanElement, SliderProps>(
  ({ sx, density = "normal", ...props }, ref) => {
    const theme = useTheme();
    const primaryChannel = theme.vars.palette.primary.mainChannel ?? "0 0 0";
    const railHeight = density === "compact" ? 4 : 6;
    const thumbSize = density === "compact" ? 12 : 16;

    const mergedSx = useMemo(
      () => ({
        // Keep a comfortable vertical hit area so the thumb is easy to grab.
        padding: density === "compact" ? "8px 0" : "13px 0",
        "& .MuiSlider-rail": {
          backgroundColor: theme.vars.palette.grey[500],
          opacity: 0.4,
          height: railHeight
        },
        "& .MuiSlider-track": {
          backgroundColor: theme.vars.palette.primary.main,
          border: "none",
          height: railHeight
        },
        "& .MuiSlider-thumb": {
          width: thumbSize,
          height: thumbSize,
          backgroundColor: theme.vars.palette.primary.main,
          transition: MOTION.background,
          "&:hover, &.Mui-focusVisible": {
            boxShadow: `0 0 0 6px rgba(${primaryChannel} / 0.16)`
          },
          "&.Mui-active": {
            boxShadow: `0 0 0 8px rgba(${primaryChannel} / 0.16)`
          }
        },
        ...sx
      }),
      [theme, density, railHeight, thumbSize, primaryChannel, sx]
    );

    return <MuiSlider ref={ref} sx={mergedSx} {...props} />;
  }
);

Slider.displayName = "Slider";
