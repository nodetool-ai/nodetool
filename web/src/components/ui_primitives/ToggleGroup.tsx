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

// --- ToggleGroup ---

export interface ToggleGroupProps
  extends Omit<ToggleButtonGroupProps, "size"> {
  /** Size variant */
  size?: "small" | "medium" | "large";
  /** Compact mode with reduced padding */
  compact?: boolean;
  /** Full width */
  fullWidth?: boolean;
}

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
  fullWidth = false,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();

  return (
    <ToggleButtonGroup
      size={compact ? "small" : size}
      fullWidth={fullWidth}
      sx={{
        ...(compact && {
          "& .MuiToggleButton-root": {
            py: 0.25,
            px: 1,
            fontSize: theme.fontSizeSmall || "0.875rem",
          },
        }),
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
