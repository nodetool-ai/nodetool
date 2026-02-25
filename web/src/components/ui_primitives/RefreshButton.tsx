/** @jsxImportSource @emotion/react */
/**
 * RefreshButton
 *
 * A button for refresh/reset actions with optional loading state.
 * Used for refreshing data, resetting state, or retrying operations.
 *
 * @example
 * <RefreshButton
 *   onClick={handleRefresh}
 *   isLoading={isRefreshing}
 *   tooltip="Refresh data"
 * />
 */

import React, { forwardRef, memo } from "react";
import { IconButton, IconButtonProps, Tooltip, CircularProgress } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface RefreshButtonProps
  extends Omit<IconButtonProps, "children"> {
  /**
   * Tooltip text
   * @default "Refresh"
   */
  tooltip?: string;
  /**
   * Whether the refresh action is in progress
   * @default false
   */
  isLoading?: boolean;
  /**
   * Icon variant
   * - "refresh": Standard refresh icon
   * - "reset": Reset/restart icon
   * @default "refresh"
   */
  iconVariant?: "refresh" | "reset";
  /**
   * Tooltip placement
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
  buttonSize?: "small" | "medium" | "large";
  /**
   * Whether to animate the icon on hover
   * @default true
   */
  animateOnHover?: boolean;
  /**
   * Tab index for keyboard navigation
   * @default 0
   */
  tabIndex?: number;
}

/**
 * Refresh/reset button with loading state and animation.
 */
export const RefreshButton = memo(
  forwardRef<HTMLButtonElement, RefreshButtonProps>(
    (
      {
        tooltip = "Refresh",
        isLoading = false,
        iconVariant = "refresh",
        tooltipPlacement = "top",
        nodrag = true,
        buttonSize = "small",
        animateOnHover = true,
        className,
        disabled,
        sx,
        tabIndex = 0,
        ...props
      },
      ref
    ) => {
      const theme = useTheme();

      const getIcon = () => {
        if (isLoading) {
          return (
            <CircularProgress
              size={buttonSize === "large" ? 22 : buttonSize === "medium" ? 18 : 16}
              color="inherit"
            />
          );
        }
        return iconVariant === "reset" ? <RestartAltIcon /> : <RefreshIcon />;
      };

      const getSizeStyles = () => {
        switch (buttonSize) {
          case "large":
            return {
              width: 44,
              height: 44,
              "& svg": { fontSize: 26 }
            };
          case "medium":
            return {
              width: 36,
              height: 36,
              "& svg": { fontSize: 22 }
            };
          default:
            return {
              width: 28,
              height: 28,
              "& svg": { fontSize: 18 }
            };
        }
      };

      return (
        <Tooltip
          title={tooltip}
          enterDelay={TOOLTIP_ENTER_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          placement={tooltipPlacement}
        >
          <span>
            <IconButton
              ref={ref}
              className={cn(
                "refresh-button",
                nodrag && editorClassNames.nodrag,
                isLoading && "loading",
                className
              )}
              disabled={disabled || isLoading}
              aria-label={tooltip}
              tabIndex={tabIndex}
              sx={{
                ...getSizeStyles(),
                color: theme.vars.palette.grey[300],
                transition: "all 0.2s ease-in-out",
                ...(animateOnHover &&
                  !isLoading && {
                    "&:hover": {
                      backgroundColor: theme.vars.palette.grey[800],
                      color: "var(--palette-primary-main)",
                      "& svg": {
                        transform: "rotate(180deg)"
                      }
                    },
                    "& svg": {
                      transition: "transform 0.3s ease-in-out"
                    }
                  }),
                ...(!animateOnHover && {
                  "&:hover": {
                    backgroundColor: theme.vars.palette.grey[800],
                    color: "var(--palette-primary-main)"
                  }
                }),
                ...sx
              }}
              {...props}
            >
              {getIcon()}
            </IconButton>
          </span>
        </Tooltip>
      );
    }
  )
);

RefreshButton.displayName = "RefreshButton";
