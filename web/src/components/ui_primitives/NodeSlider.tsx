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

import { forwardRef, useMemo, memo } from "react";
import { Slider, SliderProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "../editor_ui";
import { editorClassNames, cn } from "../editor_ui/editorUtils";
import { BORDER_RADIUS, MOTION, reducedMotion } from "./tokens";
import { SPACING } from "./spacing";

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

    const sliderSx = useMemo(() => ({
      marginTop: 0,
      minWidth: 0,
      padding: `${theme.spacing(SPACING.md)} 0`,
      "& .MuiSlider-rail": {
        backgroundColor: theme.vars.palette.action.selected,
        opacity: 1,
        borderRadius: BORDER_RADIUS.pill,
        height: density === "compact" ? 4 : 6
      },
      "& .MuiSlider-track": {
        height: density === "compact" ? 4 : 6,
        opacity: 1,
        left: 0,
        borderRadius: BORDER_RADIUS.pill,
        border: "none",
        backgroundColor: theme.vars.palette.primary.main
      },
      "& .MuiSlider-thumb": {
        backgroundColor: changed
          ? theme.vars.palette.primary.main
          : theme.vars.palette.text.secondary,
        boxShadow: "none",
        borderRadius: BORDER_RADIUS.circle,
        width: density === "compact" ? 10 : 12,
        height: density === "compact" ? 10 : 12,
        transition: MOTION.background,
        ...reducedMotion({ transition: MOTION.none }),
        "&:hover, &:focus, &:active": {
          boxShadow: `0 0 0 4px ${theme.vars.palette.action.selected}`,
          backgroundColor: theme.vars.palette.primary.main
        },
        "&.Mui-focusVisible": {
          outline: `2px solid ${theme.vars.palette.primary.main}`,
          outlineOffset: 3
        },
        "&.Mui-active": {
          boxShadow: `0 0 0 4px ${theme.vars.palette.action.selected}`
        },
        "&::before, &::after": {
          width: 24,
          height: 24
        }
      },
      ...sx
    }), [theme, changed, density, sx]);

    return (
      <Slider
        ref={ref}
        className={cn(editorClassNames.nodrag, className)}
        sx={sliderSx}
        {...props}
      />
    );
  }
);

NodeSlider.displayName = "NodeSlider";

const NodeSliderMemo = memo(NodeSlider);
NodeSliderMemo.displayName = "NodeSlider";

export default NodeSliderMemo;
