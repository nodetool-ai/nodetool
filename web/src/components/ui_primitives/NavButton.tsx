/** @jsxImportSource @emotion/react */
/**
 * NavButton
 *
 * A standardized navigation button with icon support.
 * Used for navigation between views, back buttons, and sidebar navigation.
 *
 * @example
 * <NavButton
 *   icon={<ArrowBackIcon />}
 *   label="Back to Dashboard"
 *   onClick={handleBack}
 * />
 */

import React, { forwardRef, memo } from "react";
import { Button, ButtonProps, IconButton, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

// Common props shared between Button and IconButton
type CommonButtonProps = Pick<ButtonProps, "onClick" | "disabled" | "color">;

export interface NavButtonProps extends CommonButtonProps {
  /**
   * The icon to display
   */
  icon: React.ReactNode;
  /**
   * Label text (optional - if omitted, renders as icon-only button)
   */
  label?: string;
  /**
   * Tooltip text (used when label is not provided)
   */
  tooltip?: string;
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
   * Whether the navigation item is currently active
   * @default false
   */
  active?: boolean;
  /**
   * Size variant
   * @default "medium"
   */
  navSize?: "small" | "medium" | "large";
  /**
   * Additional class name
   */
  className?: string;
  /**
   * Additional sx props
   */
  sx?: ButtonProps["sx"];
}

/**
 * Standardized navigation button with icon and optional label.
 * Renders as IconButton when no label is provided.
 */
export const NavButton = memo(
  forwardRef<HTMLButtonElement, NavButtonProps>(
    (
      {
        icon,
        label,
        tooltip,
        tooltipPlacement = "bottom",
        nodrag = true,
        active = false,
        navSize = "medium",
        className,
        sx,
        ...props
      },
      ref
    ) => {
      const theme = useTheme();

      const getSizeStyles = () => {
        switch (navSize) {
          case "small":
            return {
              minWidth: label ? 80 : 32,
              height: 32,
              fontSize: theme.fontSizeSmaller
            };
          case "large":
            return {
              minWidth: label ? 120 : 48,
              height: 48,
              fontSize: theme.fontSizeSmall
            };
          default:
            return {
              minWidth: label ? 100 : 40,
              height: 40,
              fontSize: theme.fontSizeSmall
            };
        }
      };

      const sizeStyles = getSizeStyles();
      const tooltipText = tooltip ?? label ?? "";

      const baseStyles = {
        color: active
          ? "var(--palette-primary-main)"
          : theme.vars.palette.grey[200],
        backgroundColor: active
          ? theme.vars.palette.grey[800]
          : "transparent",
        borderRadius: "8px",
        transition: "all 0.2s ease-in-out",
        "&:hover": {
          backgroundColor: theme.vars.palette.grey[700],
          color: active
            ? "var(--palette-primary-light)"
            : theme.vars.palette.grey[0]
        },
        ...sizeStyles,
        ...sx
      };

      // Render as IconButton when no label is provided
      if (!label) {
        return (
          <Tooltip
            title={tooltipText}
            enterDelay={TOOLTIP_ENTER_DELAY}
            enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
            placement={tooltipPlacement}
          >
            <IconButton
              ref={ref}
              className={cn(
                "nav-button",
                nodrag && editorClassNames.nodrag,
                active && "active",
                className
              )}
              tabIndex={-1}
              sx={baseStyles}
              onClick={props.onClick}
              disabled={props.disabled}
              aria-label={tooltipText}
            >
              {icon}
            </IconButton>
          </Tooltip>
        );
      }

      // Render as Button with icon and label
      const button = (
        <Button
          ref={ref}
          className={cn(
            "nav-button",
            nodrag && editorClassNames.nodrag,
            active && "active",
            className
          )}
          startIcon={icon}
          tabIndex={-1}
          sx={{
            ...baseStyles,
            textTransform: "none",
            justifyContent: "flex-start",
            padding: "6px 12px"
          }}
          {...props}
        >
          {label}
        </Button>
      );

      // Only wrap in Tooltip if tooltip differs from label
      if (tooltip && tooltip !== label) {
        return (
          <Tooltip
            title={tooltipText}
            enterDelay={TOOLTIP_ENTER_DELAY}
            enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
            placement={tooltipPlacement}
          >
            {button}
          </Tooltip>
        );
      }

      return button;
    }
  )
);

NavButton.displayName = "NavButton";
