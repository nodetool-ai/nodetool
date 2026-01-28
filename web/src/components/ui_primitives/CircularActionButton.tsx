/**
 * CircularActionButton
 *
 * A circular action button with consistent styling for primary actions.
 * Combines icon, loading state, and circular background with hover effects.
 * Commonly used for floating actions, primary workflow actions, and quick access buttons.
 *
 * @example
 * // Simple action button
 * <CircularActionButton
 *   icon={<PlayArrowIcon />}
 *   onClick={handleRun}
 *   tooltip="Run workflow"
 * />
 *
 * @example
 * // With loading state
 * <CircularActionButton
 *   icon={<SaveIcon />}
 *   onClick={handleSave}
 *   tooltip="Save"
 *   isLoading={isSaving}
 * />
 *
 * @example
 * // Fixed positioned button (like scroll to bottom)
 * <CircularActionButton
 *   icon={<ArrowDownwardIcon />}
 *   onClick={scrollToBottom}
 *   position="fixed"
 *   bottom={120}
 *   left="50%"
 *   transform="translateX(-50%)"
 * />
 */

import React, { memo, forwardRef, useCallback } from "react";
import { IconButton, Tooltip, CircularProgress } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface CircularActionButtonProps {
  /**
   * Icon to display
   */
  icon: React.ReactNode;
  /**
   * Click handler
   */
  onClick: () => void;
  /**
   * Tooltip text
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
   * Button size in pixels
   * @default 32
   */
  size?: number;
  /**
   * Icon size in pixels (defaults to size - 14)
   */
  iconSize?: number;
  /**
   * Whether the button is in a loading state
   * @default false
   */
  isLoading?: boolean;
  /**
   * Loading spinner size (defaults to size - 16)
   */
  loadingSize?: number;
  /**
   * Whether the button is disabled
   * @default false
   */
  disabled?: boolean;
  /**
   * Background color
   * Can be a theme color key or a CSS color value
   * @default "primary"
   */
  backgroundColor?: string;
  /**
   * Hover background color
   * Can be a theme color key or a CSS color value
   */
  hoverBackgroundColor?: string;
  /**
   * Icon/text color
   * Can be a theme color key or a CSS color value
   */
  color?: string;
  /**
   * CSS position property
   * @default "relative"
   */
  position?: "relative" | "absolute" | "fixed" | "sticky";
  /**
   * CSS top property (for positioned elements)
   */
  top?: string | number;
  /**
   * CSS bottom property (for positioned elements)
   */
  bottom?: string | number;
  /**
   * CSS left property (for positioned elements)
   */
  left?: string | number;
  /**
   * CSS right property (for positioned elements)
   */
  right?: string | number;
  /**
   * CSS transform property (for positioned elements)
   */
  transform?: string;
  /**
   * CSS z-index property
   */
  zIndex?: number;
  /**
   * Opacity when visible
   * @default 1
   */
  opacity?: number;
  /**
   * Whether the button is visible (controls opacity and pointer events)
   * @default true
   */
  isVisible?: boolean;
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
   * Whether to disable ripple effect
   * @default false
   */
  disableRipple?: boolean;
}

const getThemeColor = (theme: Theme, colorKey: string): string => {
  // Check if it's a theme palette color
  const parts = colorKey.split(".");
  if (parts.length === 2 && parts[0] in theme.vars.palette) {
    const [category, variant] = parts;
    return (theme.vars.palette as any)[category]?.[variant] || colorKey;
  }
  // Check if it's a direct palette key
  if (colorKey in theme.vars.palette) {
    return (theme.vars.palette as any)[colorKey]?.main || colorKey;
  }
  // Otherwise return as-is (assume it's a CSS color)
  return colorKey;
};

export const CircularActionButton = memo(
  forwardRef<HTMLButtonElement, CircularActionButtonProps>(
    (
      {
        icon,
        onClick,
        tooltip,
        tooltipPlacement = "bottom",
        size = 32,
        iconSize,
        isLoading = false,
        loadingSize,
        disabled = false,
        backgroundColor = "primary",
        hoverBackgroundColor,
        color,
        position = "relative",
        top,
        bottom,
        left,
        right,
        transform,
        zIndex,
        opacity = 1,
        isVisible = true,
        nodrag = true,
        className,
        sx,
        disableRipple = false
      },
      ref
    ) => {
      const theme = useTheme();

      const handleClick = useCallback(() => {
        if (!isLoading && !disabled) {
          onClick();
        }
      }, [onClick, isLoading, disabled]);

      // Calculate sizes
      const finalIconSize = iconSize || size - 14;
      const finalLoadingSize = loadingSize || size - 16;

      // Resolve theme colors
      const bgColor = getThemeColor(theme, backgroundColor);
      const hoverBgColor = hoverBackgroundColor
        ? getThemeColor(theme, hoverBackgroundColor)
        : backgroundColor === "primary"
          ? theme.vars.palette.primary.light
          : theme.vars.palette.grey[400];
      const iconColor = color
        ? getThemeColor(theme, color)
        : backgroundColor === "primary"
          ? theme.vars.palette.common.black
          : theme.vars.palette.grey[0];

      const buttonStyles = {
        width: `${size}px`,
        height: `${size}px`,
        padding: 0,
        borderRadius: "50%",
        backgroundColor: bgColor,
        color: iconColor,
        transition: "all 0.15s ease",
        position,
        ...(top !== undefined && { top }),
        ...(bottom !== undefined && { bottom }),
        ...(left !== undefined && { left }),
        ...(right !== undefined && { right }),
        ...(transform && { transform }),
        ...(zIndex !== undefined && { zIndex }),
        opacity: isVisible ? opacity : 0,
        pointerEvents: isVisible ? "auto" : "none",
        "&:hover": {
          backgroundColor: `${hoverBgColor} !important`
        },
        "&.disabled": {
          opacity: 0.7,
          cursor: "not-allowed"
        },
        "& svg": {
          fontSize: `${finalIconSize}px`
        },
        "& .MuiCircularProgress-root": {
          width: `${finalLoadingSize}px !important`,
          height: `${finalLoadingSize}px !important`,
          color: iconColor
        },
        ...sx
      };

      const displayContent = isLoading ? (
        <CircularProgress size={finalLoadingSize} />
      ) : (
        icon
      );

      const button = (
        <IconButton
          ref={ref}
          tabIndex={-1}
          className={cn(
            "circular-action-button",
            nodrag && editorClassNames.nodrag,
            (disabled || isLoading) && "disabled",
            className
          )}
          onClick={handleClick}
          disabled={disabled || isLoading}
          size="small"
          disableRipple={disableRipple}
          sx={buttonStyles}
        >
          {displayContent}
        </IconButton>
      );

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

CircularActionButton.displayName = "CircularActionButton";
