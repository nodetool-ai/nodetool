/** @jsxImportSource @emotion/react */
/**
 * NodeSlider
 *
 * A Slider primitive for editor/node UI that applies consistent styling
 * via sx and maintains nodrag behavior.
 *
 * Accepts semantic props for state-based styling:
 * - `changed`: Shows visual indicator when value differs from default
 * - `density`: Controls compact vs normal sizing
 */

import React, { forwardRef } from "react";
import { Slider, SliderProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "../editor_ui";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface NodeSliderProps extends Omit<SliderProps, "size"> {
  /**
   * Additional class name for the root element.
   */
  className?: string;
  /**
   * Value differs from default — shows visual indicator
   */
  changed?: boolean;
  /**
   * Density variant
   */
  density?: "compact" | "normal";
}

/**
 * A styled Slider for use in node properties and editor UI.
 * Applies editor tokens for consistent styling and maintains nodrag behavior.
 *
 * @example
 * <NodeSlider
 *   value={value}
 *   onChange={(e, val) => onChange(val)}
 *   min={0}
 *   max={100}
 *   changed={hasChanged}
 * />
 */
export const NodeSlider = forwardRef<HTMLSpanElement, NodeSliderProps>(
  ({ className, sx, changed, density = "compact", ...props }, ref) => {
    const theme = useTheme();
    // useEditorScope is called to maintain consistency with other editor_ui primitives
    // and can be used for future scope-aware styling (inspector vs node context)
    useEditorScope();

    const height = density === "compact" ? 5 : 6;
    const thumbSize = density === "compact" ? 8 : 10;

    return (
      <Slider
        ref={ref}
        className={cn(editorClassNames.nodrag, className)}
        sx={{
          marginTop: density === "compact" ? "3px" : "6px",
          padding: 0,
          // Rail (background track)
          "& .MuiSlider-rail": {
            backgroundColor: theme.vars.palette.grey[500],
            borderRadius: 0,
            height
          },
          // Track (filled portion)
          "& .MuiSlider-track": {
            height,
            opacity: 1,
            left: 0,
            borderRadius: 0,
            backgroundColor: changed
              ? theme.vars.palette.primary.main
              : theme.vars.palette.primary.main
          },
          // Thumb (draggable handle)
          "& .MuiSlider-thumb": {
            backgroundColor: changed
              ? theme.vars.palette.primary.main
              : theme.vars.palette.grey[200],
            boxShadow: "0px 0px 5px 1px rgba(0, 0, 0, 0.25)",
            borderRadius: 0,
            width: thumbSize,
            height: thumbSize,
            "&:hover, &:focus, &:active": {
              boxShadow: "0px 0px 5px 1px rgba(0, 0, 0, 0.25)",
              backgroundColor: theme.vars.palette.primary.main
            },
            "&.Mui-focusVisible": {
              boxShadow: "0px 0px 5px 1px rgba(0, 0, 0, 0.25)"
            },
            "&.Mui-active": {
              boxShadow: "0px 0px 5px 1px rgba(0, 0, 0, 0.25)"
            },
            "&::before, &::after": {
              width: thumbSize + 4,
              height: thumbSize + 4
            }
          },
          ...sx
        }}
        {...props}
      />
    );
  }
);

NodeSlider.displayName = "NodeSlider";
