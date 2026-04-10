/**
 * Tooltip Component
 *
 * A semantic wrapper around MUI Tooltip with standardized defaults.
 * Provides consistent tooltip behavior across the application.
 */

import React, { memo } from "react";
import MuiTooltip, {
  TooltipProps as MuiTooltipProps
} from "@mui/material/Tooltip";

export interface TooltipProps extends Omit<MuiTooltipProps, "enterDelay" | "enterNextDelay"> {
  /** Delay before showing (ms). Defaults to 400 for a snappy but non-intrusive feel. */
  delay?: number;
  /** Delay before showing when another tooltip was recently open (ms) */
  nextDelay?: number;
  /** MUI-compatible alias for `delay` */
  enterDelay?: number;
  /** MUI-compatible alias for `nextDelay` */
  enterNextDelay?: number;
  /** Shorthand: show an arrow pointer */
  arrow?: boolean;
  /** Disable the tooltip entirely (useful for conditional tooltips) */
  disabled?: boolean;
}

/**
 * Tooltip - Consistent tooltip wrapper
 *
 * @example
 * // Basic usage
 * <Tooltip title="Copy to clipboard">
 *   <IconButton><CopyIcon /></IconButton>
 * </Tooltip>
 *
 * @example
 * // With arrow and custom delay
 * <Tooltip title="Settings" arrow delay={200} placement="bottom">
 *   <SettingsIcon />
 * </Tooltip>
 *
 * @example
 * // Conditionally disabled
 * <Tooltip title="Disabled when loading" disabled={isLoading}>
 *   <Button>Submit</Button>
 * </Tooltip>
 */
const TooltipInternal: React.FC<TooltipProps> = ({
  delay,
  nextDelay,
  enterDelay,
  enterNextDelay,
  arrow = false,
  disabled = false,
  children,
  ...props
}) => {
  const resolvedDelay = delay ?? enterDelay ?? 400;
  const resolvedNextDelay = nextDelay ?? enterNextDelay ?? 100;
  if (disabled) {
    return <>{children}</>;
  }

  return (
    <MuiTooltip
      enterDelay={resolvedDelay}
      enterNextDelay={resolvedNextDelay}
      arrow={arrow}
      {...props}
    >
      {children}
    </MuiTooltip>
  );
};

export const Tooltip = memo(TooltipInternal);
