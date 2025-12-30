import React, { forwardRef } from "react";
import { Slider, SliderProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "../EditorUiContext";

export interface NodeSliderProps extends SliderProps {
  /** Value differs from default — shows visual indicator */
  changed?: boolean;
}

/**
 * NodeSlider is a themed slider component for the editor UI.
 * It automatically adapts its size based on the editor scope (node vs inspector)
 * and supports the changed semantic prop.
 */
export const NodeSlider = forwardRef<HTMLSpanElement, NodeSliderProps>(
  ({ changed, sx, ...props }, ref) => {
    const theme = useTheme();
    const scope = useEditorScope();

    const height = scope === "inspector" ? 4 : 3;

    return (
      <Slider
        ref={ref}
        size="small"
        className="nodrag"
        sx={{
          height,
          padding: "8px 0",

          "& .MuiSlider-thumb": {
            width: 12,
            height: 12,
            backgroundColor: theme.vars.palette.grey[300],
            "&:hover, &.Mui-focusVisible": {
              boxShadow: `0 0 0 4px ${theme.vars.palette.action.hover}`
            }
          },
          "& .MuiSlider-track": {
            backgroundColor: theme.vars.palette.grey[500],
            border: "none"
          },
          "& .MuiSlider-rail": {
            backgroundColor: theme.vars.palette.grey[600]
          },

          // Semantic: changed state
          ...(changed && {
            "& .MuiSlider-track": {
              backgroundColor: theme.vars.palette.primary.main
            }
          }),

          ...sx
        }}
        {...props}
      />
    );
  }
);

NodeSlider.displayName = "NodeSlider";
