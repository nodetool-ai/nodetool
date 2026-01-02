/** @jsxImportSource @emotion/react */
/**
 * ToolbarIconButton
 *
 * A standardized IconButton for toolbar actions with built-in tooltip support.
 * Used in toolbars, panels, and action bars throughout the application.
 *
 * @example
 * <ToolbarIconButton
 *   icon={<SaveIcon />}
 *   tooltip="Save"
 *   onClick={handleSave}
 * />
 */

import React, { forwardRef, memo } from "react";
import { IconButton, IconButtonProps, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface ToolbarIconButtonProps
  extends Omit<IconButtonProps, "children"> {
  /**
   * The icon to display
   */
  icon: React.ReactNode;
  /**
   * Tooltip text
   */
  tooltip: string;
  /**
   * Tooltip placement
   * @default "bottom"
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
   * Visual variant
   * @default "default"
   */
  variant?: "default" | "primary" | "error";
  /**
   * Whether the button is in active/selected state
   * @default false
   */
  active?: boolean;
}

/**
 * Standardized toolbar icon button with tooltip and consistent styling.
 */
export const ToolbarIconButton = memo(
  forwardRef<HTMLButtonElement, ToolbarIconButtonProps>(
    (
      {
        icon,
        tooltip,
        tooltipPlacement = "bottom",
        nodrag = true,
        variant = "default",
        active = false,
        className,
        size = "small",
        sx,
        ...props
      },
      ref
    ) => {
      const theme = useTheme();

      const getVariantStyles = () => {
        switch (variant) {
          case "primary":
            return {
              color: "var(--palette-primary-main)",
              "&:hover": {
                backgroundColor: theme.vars.palette.grey[800],
                color: "var(--palette-primary-light)"
              }
            };
          case "error":
            return {
              color: theme.vars.palette.error.main,
              "&:hover": {
                backgroundColor: theme.vars.palette.error.dark,
                color: theme.vars.palette.grey[0]
              }
            };
          default:
            return {
              color: theme.vars.palette.grey[200],
              "&:hover": {
                backgroundColor: theme.vars.palette.grey[800],
                color: theme.vars.palette.grey[0]
              }
            };
        }
      };

      const variantStyles = getVariantStyles();

      return (
        <Tooltip
          title={tooltip}
          enterDelay={TOOLTIP_ENTER_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          placement={tooltipPlacement}
        >
          <IconButton
            ref={ref}
            className={cn(
              "toolbar-icon-button",
              nodrag && editorClassNames.nodrag,
              active && "active",
              className
            )}
            size={size}
            tabIndex={-1}
            sx={{
              ...variantStyles,
              ...(active && {
                backgroundColor: theme.vars.palette.grey[800],
                color: "var(--palette-primary-main)"
              }),
              ...sx
            }}
            {...props}
          >
            {icon}
          </IconButton>
        </Tooltip>
      );
    }
  )
);

ToolbarIconButton.displayName = "ToolbarIconButton";
