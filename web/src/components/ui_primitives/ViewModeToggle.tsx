/** @jsxImportSource @emotion/react */
/**
 * ViewModeToggle
 *
 * A toggle button group for switching between view modes.
 * Common use cases: grid/list view, sort options, filter modes.
 *
 * @example
 * <ViewModeToggle
 *   value={viewMode}
 *   onChange={setViewMode}
 *   options={[
 *     { value: "grid", icon: <GridViewIcon />, tooltip: "Grid view" },
 *     { value: "list", icon: <ListIcon />, tooltip: "List view" }
 *   ]}
 * />
 */

import React, { forwardRef, memo } from "react";
import {
  ToggleButton,
  ToggleButtonGroup,
  ToggleButtonGroupProps,
  Tooltip
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface ViewModeOption {
  /**
   * Value for this option
   */
  value: string;
  /**
   * Icon to display
   */
  icon: React.ReactNode;
  /**
   * Tooltip text
   */
  tooltip: string;
  /**
   * Whether this option is disabled
   */
  disabled?: boolean;
}

export interface ViewModeToggleProps
  extends Omit<ToggleButtonGroupProps, "value" | "onChange" | "children"> {
  /**
   * Current selected value
   */
  value: string;
  /**
   * Callback when value changes
   */
  onChange: (value: string) => void;
  /**
   * Array of options to display
   */
  options: ViewModeOption[];
  /**
   * Tooltip placement for all buttons
   * @default "top"
   */
  tooltipPlacement?:
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "bottom-end"
    | "bottom-start"
    | "left-end"
    | "left-start"
    | "right-end"
    | "right-start"
    | "top-end"
    | "top-start";
  /**
   * Whether to add nodrag class for ReactFlow compatibility
   * @default true
   */
  nodrag?: boolean;
  /**
   * Button size
   * @default "small"
   */
  buttonSize?: "small" | "medium";
}

/**
 * Toggle button group for view mode selection.
 */
export const ViewModeToggle = memo(
  forwardRef<HTMLDivElement, ViewModeToggleProps>(
    (
      {
        value,
        onChange,
        options,
        tooltipPlacement = "top",
        nodrag = true,
        buttonSize = "small",
        className,
        sx,
        ...props
      },
      ref
    ) => {
      const theme = useTheme();

      const handleChange = (
        _event: React.MouseEvent<HTMLElement>,
        newValue: string | null
      ) => {
        // Only allow change if a value is selected (prevent deselect)
        if (newValue !== null) {
          onChange(newValue);
        }
      };

      const getSizeStyles = () => {
        if (buttonSize === "medium") {
          return {
            padding: "6px 12px",
            "& svg": { fontSize: 22 }
          };
        }
        return {
          padding: "4px 8px",
          "& svg": { fontSize: 18 }
        };
      };

      const sizeStyles = getSizeStyles();

      return (
        <ToggleButtonGroup
          ref={ref}
          className={cn(
            "view-mode-toggle",
            nodrag && editorClassNames.nodrag,
            className
          )}
          value={value}
          exclusive
          onChange={handleChange}
          sx={{
            backgroundColor: theme.vars.palette.grey[800],
            borderRadius: "6px",
            "& .MuiToggleButton-root": {
              border: "none",
              color: theme.vars.palette.grey[400],
              transition: "all 0.2s ease-in-out",
              ...sizeStyles,
              "&:hover": {
                backgroundColor: theme.vars.palette.grey[700],
                color: theme.vars.palette.grey[100]
              },
              "&.Mui-selected": {
                backgroundColor: theme.vars.palette.grey[600],
                color: "var(--palette-primary-main)",
                "&:hover": {
                  backgroundColor: theme.vars.palette.grey[600]
                }
              }
            },
            ...sx
          }}
          {...props}
        >
          {options.map((option) => (
            <Tooltip
              key={option.value}
              title={option.tooltip}
              enterDelay={TOOLTIP_ENTER_DELAY}
              enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
              placement={tooltipPlacement}
            >
              <ToggleButton
                value={option.value}
                disabled={option.disabled}
                aria-label={option.tooltip}
              >
                {option.icon}
              </ToggleButton>
            </Tooltip>
          ))}
        </ToggleButtonGroup>
      );
    }
  )
);

ViewModeToggle.displayName = "ViewModeToggle";
