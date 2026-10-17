/**
 * LabeledToggle
 *
 * A toggle button with an icon, label, and expand/collapse indicator.
 * Combines IconButton with visual label and rotatable expand icon.
 * Commonly used for collapsible sections, mode toggles, and feature toggles.
 *
 * @example
 * // Basic toggle with label
 * <LabeledToggle
 *   isOpen={showDetails}
 *   onToggle={() => setShowDetails(!showDetails)}
 *   label="Show details"
 *   icon={<InfoIcon />}
 * />
 *
 * @example
 * // Mode toggle without expand indicator
 * <LabeledToggle
 *   isOpen={agentMode}
 *   onToggle={() => setAgentMode(!agentMode)}
 *   showLabel="Enable agent mode"
 *   hideLabel="Disable agent mode"
 *   icon={<PsychologyIcon />}
 *   showExpandIcon={false}
 * />
 */

import React, { useCallback, useMemo, memo } from "react";
import { Box } from "@mui/material";
import { Tooltip } from "./Tooltip";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useTheme, SxProps, Theme } from "@mui/material/styles";
import type { TooltipProps } from "@mui/material/Tooltip";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";
import { MOTION, FONT_SIZE_SANS, BORDER_RADIUS } from "./tokens";
import { focusRing } from "./selectionStyles";
import { activateOnKey } from "./keyboardActivation";
import { Text } from "./Text";

export interface LabeledToggleProps {
  /**
   * Whether the toggle is in the open/active state
   */
  isOpen: boolean;
  /**
   * Toggle handler
   */
  onToggle: (event?: React.MouseEvent) => void;
  /**
   * Label to show when closed (falls back to 'label' if not provided)
   */
  showLabel?: string;
  /**
   * Label to show when open (falls back to 'label' if not provided)
   */
  hideLabel?: string;
  /**
   * Generic label (used when showLabel/hideLabel not provided)
   */
  label?: string;
  /**
   * Icon to display alongside the toggle
   */
  icon?: React.ReactNode;
  /**
   * Whether to show the expand/collapse indicator
   * @default true
   */
  showExpandIcon?: boolean;
  /**
   * Custom expand icon (defaults to ExpandMoreIcon)
   */
  expandIcon?: React.ReactNode;
  /**
   * Whether the toggle is disabled
   * @default false
   */
  disabled?: boolean;
  /**
   * Tooltip placement
   * @default "bottom-start"
   */
  tooltipPlacement?: TooltipProps["placement"];
  /**
   * Tooltip enter delay
   * @default TOOLTIP_ENTER_DELAY
   */
  enterDelay?: number;
  /**
   * Additional class name
   */
  className?: string;
  /**
   * Additional sx styles for the container
   */
  sx?: SxProps<Theme>;
  /**
   * Whether to show tooltip
   * @default true
   */
  showTooltip?: boolean;
  /**
   * @deprecated The expand indicator is no longer a separate button; the
   * whole toggle is one button. Kept so existing callers still compile.
   */
  size?: "small" | "medium" | "large";
  /**
   * Whether to add nodrag class for ReactFlow compatibility
   * @default true
   */
  nodrag?: boolean;
}

const LabeledToggleInternal: React.FC<LabeledToggleProps> = ({
  isOpen,
  onToggle,
  showLabel,
  hideLabel,
  label,
  icon,
  showExpandIcon = true,
  expandIcon,
  disabled = false,
  tooltipPlacement = "bottom-start",
  enterDelay = TOOLTIP_ENTER_DELAY,
  className,
  sx,
  showTooltip = true,
  nodrag = true
}) => {
  const theme = useTheme();

  const labelText = isOpen
    ? hideLabel || label || "Hide"
    : showLabel || label || "Show";

  const handleToggle = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onToggle(event);
    },
    [onToggle]
  );

  // The toggle is a single button: Enter and Space activate it like a native
  // one, so keyboard users can open and close it too.
  const handleKeyDown = useMemo(
    () =>
      activateOnKey((event) => {
        event.stopPropagation();
        onToggle();
      }),
    [onToggle]
  );

  const expandButtonSx: SxProps<Theme> = useMemo(() => ({
    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
    transition: MOTION.transform,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: theme.spacing(6),
    height: theme.spacing(6),
    color: "inherit",
    "& svg": {
      fontSize: FONT_SIZE_SANS.label
    }
  }), [isOpen, theme]);

  const iconBoxSx: SxProps<Theme> = useMemo(() => ({
    display: "inline-flex",
    alignItems: "center",
    lineHeight: 1,
    "& svg": {
      fontSize: FONT_SIZE_SANS.label
    }
  }), []);

  const containerSx: SxProps<Theme> = useMemo(() => ({
    display: "flex",
    alignItems: "center",
    width: "fit-content",
    gap: 1,
    px: 0,
    py: 0.5,
    lineHeight: 1.35,
    color: isOpen
      ? theme.vars.palette.text.primary
      : theme.vars.palette.text.secondary,
    cursor: disabled ? "default" : "pointer",
    userSelect: "none",
    opacity: disabled ? 0.5 : 1,
    transition: MOTION.opacity,
    borderRadius: BORDER_RADIUS.sm,
    "&:focus-visible": focusRing(theme, 2),
    ...sx
  }), [disabled, isOpen, sx, theme]);

  // A visual indicator only: the whole toggle is the button, so a nested
  // button here would be a second, redundant tab stop.
  const expandIconNode = showExpandIcon ? (
    <Box
      component="span"
      aria-hidden
      className="labeled-toggle-expand"
      sx={expandButtonSx}
    >
      {expandIcon || <ExpandMoreIcon fontSize="inherit" />}
    </Box>
  ) : null;

  const iconNode = icon ? (
    <Box
      component="span"
      sx={iconBoxSx}
    >
      {icon}
    </Box>
  ) : null;

  const content = (
    <Box
      className={cn(
        "labeled-toggle",
        isOpen && "open",
        disabled && "disabled",
        nodrag && editorClassNames.nodrag,
        className
      )}
      sx={containerSx}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-expanded={showExpandIcon ? isOpen : undefined}
      aria-pressed={showExpandIcon ? undefined : isOpen}
      onClick={disabled ? undefined : handleToggle}
      onKeyDown={disabled ? undefined : handleKeyDown}
    >
      {expandIconNode}
      {iconNode}
      <Text
        component="span"
        size="small"
        className="labeled-toggle-label"
        sx={{ m: 0, lineHeight: 1.35, color: "inherit" }}
      >
        {labelText}
      </Text>
    </Box>
  );

  if (showTooltip && labelText) {
    return (
      <Tooltip
        title={labelText}
        enterDelay={enterDelay}
        enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
        placement={tooltipPlacement}
      >
        {content}
      </Tooltip>
    );
  }

  return content;
};

export const LabeledToggle = memo(LabeledToggleInternal);

LabeledToggle.displayName = "LabeledToggle";

export default LabeledToggle;
