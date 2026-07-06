/**
 * ToggleGroup Component
 *
 * A semantic wrapper around MUI ToggleButtonGroup/ToggleButton
 * for exclusive or multi-select toggle options.
 */

import React, { memo } from "react";
import {
  ToggleButtonGroup,
  ToggleButtonGroupProps,
  ToggleButton,
  ToggleButtonProps,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { MOTION } from "./tokens";

// --- ToggleGroup ---

export interface ToggleGroupProps
  extends Omit<ToggleButtonGroupProps, "size"> {
  /** Size variant */
  size?: "small" | "medium" | "large";
  /** Compact mode with reduced padding */
  compact?: boolean;
  /**
   * Segmented toolbar variant: a single bordered pill with a fixed 32px
   * height, sentence-case small text, and standardized selected/hover colors.
   * Use for toolbar filter/scope controls so they all share one look without
   * per-call `sx`.
   */
  segmented?: boolean;
  /** Full width */
  fullWidth?: boolean;
}

/** Fixed height for the segmented toolbar variant — keeps it level with 32px toolbar controls. */
const SEGMENTED_HEIGHT = 32;

/**
 * ToggleGroup - A themed toggle button group
 *
 * @example
 * // Exclusive selection (radio-like)
 * <ToggleGroup value={view} exclusive onChange={handleView}>
 *   <ToggleOption value="grid">Grid</ToggleOption>
 *   <ToggleOption value="list">List</ToggleOption>
 * </ToggleGroup>
 *
 * @example
 * // Multi-select
 * <ToggleGroup value={filters} onChange={handleFilters} compact>
 *   <ToggleOption value="images">Images</ToggleOption>
 *   <ToggleOption value="videos">Videos</ToggleOption>
 *   <ToggleOption value="audio">Audio</ToggleOption>
 * </ToggleGroup>
 */
const ToggleGroupInternal: React.FC<ToggleGroupProps> = ({
  size = "medium",
  compact = false,
  segmented = false,
  fullWidth = false,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();
  // Prefer the CSS-variables palette, but fall back to the static palette so the
  // primitive still renders under a plain (non-cssVariables) theme, e.g. in unit
  // tests without a ThemeProvider.
  const palette = theme.vars?.palette ?? theme.palette;

  const segmentedSx = segmented
    ? {
        height: SEGMENTED_HEIGHT,
        borderRadius: "var(--rounded-lg)",
        border: `1px solid ${palette.divider}`,
        backgroundColor: palette.action.hover,
        overflow: "hidden",
        "& .MuiToggleButton-root": {
          border: "none",
          borderRadius: 0,
          margin: 0,
          height: "100%",
          minWidth: 0,
          py: 0,
          px: 1.5,
          fontSize: theme.fontSizeSmall || "0.8125rem",
          fontWeight: 500,
          lineHeight: 1,
          letterSpacing: 0,
          textTransform: "none" as const,
          color: palette.text.secondary,
          transition: `${MOTION.background}, color ${MOTION.fast}`,
          "&:hover": {
            backgroundColor: palette.action.hover,
            color: palette.text.primary,
          },
          "&.Mui-selected": {
            backgroundColor: palette.action.selected,
            color: palette.text.primary,
            "&:hover": {
              backgroundColor: palette.action.selected,
            },
          },
        },
      }
    : {};

  return (
    <ToggleButtonGroup
      size={compact || segmented ? "small" : size}
      fullWidth={fullWidth}
      sx={{
        ...(compact &&
          !segmented && {
            "& .MuiToggleButton-root": {
              py: 0.5,
              px: 1,
              fontSize: theme.fontSizeSmall || "0.875rem",
            },
          }),
        ...segmentedSx,
        ...sx,
      }}
      {...props}
    >
      {children}
    </ToggleButtonGroup>
  );
};

export const ToggleGroup = memo(ToggleGroupInternal);
ToggleGroup.displayName = "ToggleGroup";

// --- ToggleOption ---

export interface ToggleOptionProps extends ToggleButtonProps {
  /** Icon shown before label text */
  icon?: React.ReactNode;
}

/**
 * ToggleOption - A single option within a ToggleGroup
 *
 * @example
 * <ToggleOption value="grid" icon={<GridIcon />}>Grid View</ToggleOption>
 */
const ToggleOptionInternal: React.FC<ToggleOptionProps> = ({
  icon,
  children,
  ...props
}) => {
  return (
    <ToggleButton {...props}>
      {icon && (
        <span style={{ display: "flex", marginRight: children ? 4 : 0 }}>
          {icon}
        </span>
      )}
      {children}
    </ToggleButton>
  );
};

export const ToggleOption = memo(ToggleOptionInternal);
ToggleOption.displayName = "ToggleOption";
