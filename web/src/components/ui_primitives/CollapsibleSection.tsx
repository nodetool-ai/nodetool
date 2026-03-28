/**
 * CollapsibleSection Component
 *
 * A section that can be expanded/collapsed with animation.
 * Wraps MUI Collapse with a toggle header pattern.
 */

import React, { memo, useState, useCallback } from "react";
import { Box, BoxProps, Collapse } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

export interface CollapsibleSectionProps extends Omit<BoxProps, "title" | "onToggle"> {
  /** Section title or header content */
  title: React.ReactNode;
  /** Controlled open state (omit for uncontrolled) */
  open?: boolean;
  /** Default open state for uncontrolled usage */
  defaultOpen?: boolean;
  /** Callback when open state changes */
  onToggle?: (open: boolean) => void;
  /** Animation duration in ms */
  timeout?: number;
  /** Hide the expand/collapse icon */
  hideIcon?: boolean;
  /** Compact mode with less padding */
  compact?: boolean;
}

/**
 * CollapsibleSection - Expandable/collapsible content area
 *
 * @example
 * // Uncontrolled (manages its own state)
 * <CollapsibleSection title="Advanced Settings" defaultOpen={false}>
 *   <TextField label="API Key" />
 * </CollapsibleSection>
 *
 * @example
 * // Controlled
 * <CollapsibleSection title="Details" open={isOpen} onToggle={setIsOpen}>
 *   <Typography>Detail content</Typography>
 * </CollapsibleSection>
 *
 * @example
 * // Compact with custom title
 * <CollapsibleSection
 *   title={<Typography variant="subtitle2">I/O Info</Typography>}
 *   compact
 *   defaultOpen
 * >
 *   {children}
 * </CollapsibleSection>
 */
const CollapsibleSectionInternal: React.FC<CollapsibleSectionProps> = ({
  title,
  open: controlledOpen,
  defaultOpen = true,
  onToggle,
  timeout = 200,
  hideIcon = false,
  compact = false,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const handleToggle = useCallback(() => {
    const next = !isOpen;
    if (!isControlled) {
      setInternalOpen(next);
    }
    onToggle?.(next);
  }, [isOpen, isControlled, onToggle]);

  return (
    <Box sx={sx} {...props}>
      <Box
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToggle();
          }
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: theme.spacing(1),
          cursor: "pointer",
          padding: compact ? theme.spacing(0.5, 0) : theme.spacing(1, 0),
          userSelect: "none",
          "&:hover": {
            opacity: 0.8
          }
        }}
      >
        {!hideIcon && (
          <ExpandMoreIcon
            sx={{
              fontSize: compact ? 18 : 22,
              transition: "transform 0.2s ease",
              transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
              color: theme.vars.palette.text.secondary
            }}
          />
        )}
        <Box sx={{ flex: 1 }}>{title}</Box>
      </Box>
      <Collapse in={isOpen} timeout={timeout}>
        {children}
      </Collapse>
    </Box>
  );
};

export const CollapsibleSection = memo(CollapsibleSectionInternal);
