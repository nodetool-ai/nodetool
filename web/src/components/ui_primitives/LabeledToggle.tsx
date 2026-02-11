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
import { Box, IconButton, Tooltip } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useTheme } from "@mui/material/styles";
import type { TooltipProps } from "@mui/material/Tooltip";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

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
  sx?: object;
  /**
   * Whether to show tooltip
   * @default true
   */
  showTooltip?: boolean;
  /**
   * Button size
   * @default "small"
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
  size = "small",
  nodrag = true
}) => {
  const theme = useTheme();

  // Determine the label text
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

  // Memoize expand icon button styles
  const expandButtonSx = useMemo(() => ({
    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
    transition: "transform 0.2s",
    padding: size === "small" ? 0.5 : 1
  }), [isOpen, size]);

  // Memoize icon box styles
  const iconBoxSx = useMemo(() => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 0.5,
    color: isOpen
      ? theme.vars.palette.text.primary
      : theme.vars.palette.text.secondary,
    transition: "color 0.2s"
  }), [isOpen, theme]);

  // Memoize container styles
  const containerSx = useMemo(() => ({
    display: "flex",
    alignItems: "center",
    width: "fit-content",
    gap: 1,
    px: 1,
    py: 0.5,
    cursor: disabled ? "default" : "pointer",
    userSelect: "none",
    opacity: disabled ? 0.5 : 1,
    transition: "opacity 0.2s",
    ...sx
  }), [disabled, sx]);

  // Render the expand/collapse icon if enabled
  const expandIconNode = showExpandIcon ? (
    <IconButton
      size={size}
      onClick={handleToggle}
      disabled={disabled}
      className={cn(
        "labeled-toggle-expand",
        nodrag && editorClassNames.nodrag
      )}
      sx={expandButtonSx}
      aria-label={labelText}
    >
      {expandIcon || <ExpandMoreIcon fontSize="inherit" />}
    </IconButton>
  ) : null;

  // Render the main icon with state-based color
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
      onClick={disabled ? undefined : handleToggle}
    >
      {expandIconNode}
      {iconNode}
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
