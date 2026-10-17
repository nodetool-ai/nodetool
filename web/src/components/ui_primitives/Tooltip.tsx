/**
 * Tooltip Component
 *
 * A semantic wrapper around MUI Tooltip with standardized defaults.
 * Provides consistent tooltip behavior across the application.
 */

import React, { memo, useCallback, useEffect, useState } from "react";
import MuiTooltip, {
  TooltipProps as MuiTooltipProps
} from "@mui/material/Tooltip";
import { FlexColumn } from "./FlexColumn";
import { ShortcutHint } from "./ShortcutHint";
import {
  canOpenTooltip,
  closeTooltipOnPointerDown
} from "./tooltipPointerGate";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";

/**
 * A tooltip label with its keyboard shortcut drawn as a key hint below it,
 * instead of "Undo (Ctrl+Z)" in the text.
 */
export const tooltipWithShortcut = (
  title: React.ReactNode,
  shortcut?: string[]
): React.ReactNode =>
  shortcut && shortcut.length > 0 ? (
    <FlexColumn align="center" gap={0.5}>
      <span>{title}</span>
      <ShortcutHint shortcut={shortcut} size="small" />
    </FlexColumn>
  ) : (
    title
  );

export interface TooltipProps extends Omit<MuiTooltipProps, "enterDelay" | "enterNextDelay"> {
  /** Delay before showing (ms). Defaults to TOOLTIP_ENTER_DELAY. Pass one only to wait longer. */
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
  /** Keyboard shortcut shown as a key hint below the title, e.g. ["Ctrl", "Z"] */
  shortcut?: string[];
}

/**
 * Tooltip - Consistent tooltip wrapper
 *
 * @example
 * // Basic usage
 * <Tooltip title="Copy link">
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
  shortcut,
  title,
  children,
  open: openProp,
  onOpen,
  onClose,
  ...props
}) => {
  const resolvedDelay = delay ?? enterDelay ?? TOOLTIP_ENTER_DELAY;
  const resolvedNextDelay =
    nextDelay ?? enterNextDelay ?? TOOLTIP_ENTER_NEXT_DELAY;
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;

  const handleOpen = useCallback(
    (event: React.SyntheticEvent) => {
      if (!controlled && !canOpenTooltip(event)) {
        return;
      }
      setOpenState(true);
      onOpen?.(event);
    },
    [controlled, onOpen]
  );

  const handleClose = useCallback(
    (event: React.SyntheticEvent | Event) => {
      setOpenState(false);
      onClose?.(event);
    },
    [onClose]
  );

  // A press anywhere closes a hover tooltip, so it cannot outlive a click on
  // its trigger, a closing menu or a hidden panel row.
  useEffect(() => {
    if (controlled || !openState) {
      return undefined;
    }
    return closeTooltipOnPointerDown(() => setOpenState(false));
  }, [controlled, openState]);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <MuiTooltip
      enterDelay={resolvedDelay}
      enterNextDelay={resolvedNextDelay}
      arrow={arrow}
      title={tooltipWithShortcut(title, shortcut)}
      {...props}
      open={open}
      onOpen={handleOpen}
      onClose={handleClose}
    >
      {children}
    </MuiTooltip>
  );
};

export const Tooltip = memo(TooltipInternal);
