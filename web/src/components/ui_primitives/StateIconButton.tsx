/**
 * StateIconButton
 *
 * A versatile icon button that handles multiple states: loading, active, disabled.
 * Combines icon, tooltip, loading spinner, and state-based styling.
 * Useful for toggle actions, async operations, and state-dependent buttons.
 *
 * @example
 * // Simple toggle button
 * <StateIconButton
 *   icon={<PlayIcon />}
 *   tooltip="Run workflow"
 *   onClick={handleRun}
 * />
 *
 * @example
 * // With loading state
 * <StateIconButton
 *   icon={<SaveIcon />}
 *   tooltip="Save"
 *   onClick={handleSave}
 *   isLoading={isSaving}
 * />
 *
 * @example
 * // With active state
 * <StateIconButton
 *   icon={<FilterIcon />}
 *   activeIcon={<FilterOffIcon />}
 *   tooltip="Toggle filter"
 *   isActive={isFilterActive}
 *   onClick={toggleFilter}
 * />
 */

import React, { memo, forwardRef, useCallback } from "react";
import { IconButton, Tooltip, CircularProgress } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface StateIconButtonProps {
  /**
   * Primary icon to display
   */
  icon: React.ReactNode;
  /**
   * Optional icon to display when active (falls back to icon if not provided)
   */
  activeIcon?: React.ReactNode;
  /**
   * Click handler
   */
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /**
   * Tooltip text (can be string or ReactNode for complex tooltips)
   */
  tooltip?: React.ReactNode;
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
   * Button size
   * @default "small"
   */
  size?: "small" | "medium" | "large";
  /**
   * Whether the button is in a loading state
   * @default false
   */
  isLoading?: boolean;
  /**
   * Whether the button is in an active/selected state
   * @default false
   */
  isActive?: boolean;
  /**
   * Whether the button is disabled
   * @default false
   */
  disabled?: boolean;
  /**
   * Loading spinner size (defaults to button size - 6px)
   */
  loadingSize?: number;
  /**
   * Whether to add nodrag class for ReactFlow compatibility
   * @default true
   */
  nodrag?: boolean;
  /**
   * Additional class name
   */
  className?: string;
  /**
   * Additional sx styles
   */
  sx?: object;
  /**
   * Color variant for the button
   * @default "default"
   */
  color?:
    | "default"
    | "primary"
    | "secondary"
    | "error"
    | "warning"
    | "info"
    | "success";
  /**
   * Accessible label for the button
   */
  ariaLabel?: string;
  /**
   * Tab index for keyboard navigation
   * @default 0
   */
  tabIndex?: number;
}

export const StateIconButton = memo(
  forwardRef<HTMLButtonElement, StateIconButtonProps>(
    (
      {
        icon,
        activeIcon,
        onClick,
        tooltip,
        tooltipPlacement = "bottom",
        size = "small",
        isLoading = false,
        isActive = false,
        disabled = false,
        loadingSize,
        nodrag = true,
        className,
        sx,
        color = "default",
        ariaLabel,
        tabIndex = 0
      },
      ref
    ) => {
      const theme = useTheme();

      const handleClick = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          if (!isLoading && !disabled) {
            onClick(e);
          }
        },
        [onClick, isLoading, disabled]
      );

      // Determine loading spinner size based on button size
      const spinnerSize =
        loadingSize || (size === "large" ? 24 : size === "medium" ? 20 : 16);

      // Display the appropriate icon
      const displayIcon = isLoading ? (
        <CircularProgress size={spinnerSize} />
      ) : isActive && activeIcon ? (
        activeIcon
      ) : (
        icon
      );

      const label = ariaLabel || (typeof tooltip === "string" ? tooltip : undefined);

      const button = (
        <IconButton
          ref={ref}
          tabIndex={tabIndex}
          aria-label={label}
          aria-pressed={isActive}
          className={cn(
            "state-icon-button",
            isActive && "active",
            isLoading && "loading",
            nodrag && editorClassNames.nodrag,
            className
          )}
          onClick={handleClick}
          disabled={disabled || isLoading}
          size={size}
          color={isActive && color !== "default" ? color : "default"}
          sx={{
            transition: "all 0.15s ease",
            ...(isActive && {
              color:
                theme.vars.palette[color]?.main ||
                theme.vars.palette.primary.main,
              backgroundColor: `${
                theme.vars.palette[color]?.main ||
                theme.vars.palette.primary.main
              }1a`
            }),
            ...sx
          }}
        >
          {displayIcon}
        </IconButton>
      );

      // If tooltip is provided, wrap in Tooltip component
      if (tooltip) {
        return (
          <Tooltip
            title={tooltip}
            enterDelay={TOOLTIP_ENTER_DELAY}
            enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
            placement={tooltipPlacement}
          >
            <span>{button}</span>
          </Tooltip>
        );
      }

      return button;
    }
  )
);

StateIconButton.displayName = "StateIconButton";
