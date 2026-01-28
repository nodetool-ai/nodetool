/** @jsxImportSource @emotion/react */
/**
 * RunWorkflowButton
 *
 * A button for running and stopping workflows.
 * Provides consistent styling for workflow execution controls.
 *
 * @example
 * <RunWorkflowButton
 *   isRunning={isRunning}
 *   onRun={handleRun}
 *   onStop={handleStop}
 * />
 */

import React, { forwardRef, memo, useCallback } from "react";
import { Button, ButtonProps, Fab, FabProps, Tooltip, CircularProgress } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface RunWorkflowButtonProps {
  /**
   * Whether the workflow is currently running
   */
  isRunning: boolean;
  /**
   * Callback when run is triggered
   */
  onRun: () => void;
  /**
   * Callback when stop is triggered
   */
  onStop: () => void;
  /**
   * Whether the button is disabled
   * @default false
   */
  disabled?: boolean;
  /**
   * Whether the workflow is loading/initializing
   * @default false
   */
  isLoading?: boolean;
  /**
   * Display variant
   * @default "button"
   */
  variant?: "button" | "fab";
  /**
   * Button size
   * @default "medium"
   */
  size?: "small" | "medium" | "large";
  /**
   * Whether to show text label
   * @default false
   */
  showLabel?: boolean;
  /**
   * Custom run label
   * @default "Run"
   */
  runLabel?: string;
  /**
   * Custom stop label
   * @default "Stop"
   */
  stopLabel?: string;
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
   * Additional class name
   */
  className?: string;
  /**
   * Additional sx props
   */
  sx?: ButtonProps["sx"] | FabProps["sx"];
}

/**
 * Button for running and stopping workflows with state-aware styling.
 */
export const RunWorkflowButton = memo(
  forwardRef<HTMLButtonElement, RunWorkflowButtonProps>(
    (
      {
        isRunning,
        onRun,
        onStop,
        disabled = false,
        isLoading = false,
        variant = "button",
        size = "medium",
        showLabel = false,
        runLabel = "Run",
        stopLabel = "Stop",
        tooltipPlacement = "top",
        nodrag = true,
        className,
        sx
      },
      ref
    ) => {
      const theme = useTheme();

      const handleClick = useCallback(() => {
        if (isRunning) {
          onStop();
        } else {
          onRun();
        }
      }, [isRunning, onRun, onStop]);

      const tooltip = isRunning ? stopLabel : runLabel;
      const icon = isRunning ? <StopIcon /> : <PlayArrowIcon />;

      const getSizeStyles = () => {
        switch (size) {
          case "small":
            return variant === "fab"
              ? { width: 36, height: 36 }
              : { height: 28, minWidth: showLabel ? 80 : 28 };
          case "large":
            return variant === "fab"
              ? { width: 56, height: 56 }
              : { height: 44, minWidth: showLabel ? 120 : 44 };
          default:
            return variant === "fab"
              ? { width: 48, height: 48 }
              : { height: 36, minWidth: showLabel ? 100 : 36 };
        }
      };

      const getColorStyles = () => {
        if (isRunning) {
          return {
            backgroundColor: theme.vars.palette.error.main,
            color: theme.vars.palette.grey[0],
            "&:hover": {
              backgroundColor: theme.vars.palette.error.dark
            }
          };
        }
        return {
          backgroundColor: "var(--palette-primary-main)",
          color: theme.vars.palette.grey[0],
          "&:hover": {
            backgroundColor: "var(--palette-primary-dark)"
          }
        };
      };

      const content = isLoading ? (
        <CircularProgress size={size === "small" ? 16 : 20} color="inherit" />
      ) : (
        <>
          {icon}
          {showLabel && (
            <span style={{ marginLeft: 4 }}>{tooltip}</span>
          )}
        </>
      );

      const sharedProps = {
        ref,
        className: cn(
          "run-workflow-button",
          nodrag && editorClassNames.nodrag,
          isRunning && "running",
          className
        ),
        onClick: handleClick,
        disabled: disabled || isLoading,
        "aria-label": tooltip
      };

      const sharedSx = {
        ...getSizeStyles(),
        ...getColorStyles(),
        transition: "all 0.2s ease-in-out",
        ...sx
      };

      if (variant === "fab") {
        return (
          <Tooltip
            title={tooltip}
            enterDelay={TOOLTIP_ENTER_DELAY}
            enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
            placement={tooltipPlacement}
          >
            <Fab
              {...sharedProps}
              sx={{
                ...sharedSx,
                boxShadow: "0px 3px 5px -1px rgba(0,0,0,0.2), 0px 6px 10px 0px rgba(0,0,0,0.14), 0px 1px 18px 0px rgba(0,0,0,0.12)"
              }}
            >
              {content}
            </Fab>
          </Tooltip>
        );
      }

      return (
        <Tooltip
          title={tooltip}
          enterDelay={TOOLTIP_ENTER_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          placement={tooltipPlacement}
        >
          <Button
            {...sharedProps}
            variant="contained"
            sx={{
              ...sharedSx,
              textTransform: "none"
            }}
          >
            {content}
          </Button>
        </Tooltip>
      );
    }
  )
);

RunWorkflowButton.displayName = "RunWorkflowButton";
