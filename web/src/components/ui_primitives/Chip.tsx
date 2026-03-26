/**
 * Chip Component
 *
 * A themed chip/tag for displaying labels, categories, or status.
 * Wraps MUI Chip with consistent styling and semantic variants.
 * Used in 15+ files across the codebase.
 */

import React from "react";
import { Chip as MuiChip, ChipProps as MuiChipProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface ChipProps extends Omit<MuiChipProps, 'color'> {
  /** Semantic color variant */
  color?: "default" | "primary" | "secondary" | "success" | "warning" | "error" | "info";
  /** Whether the chip is in a selected/active state */
  active?: boolean;
  /** Compact size for dense layouts */
  compact?: boolean;
}

/**
 * Chip - A themed label/tag component
 *
 * @example
 * // Basic chip
 * <Chip label="Category" />
 *
 * @example
 * // Deletable chip
 * <Chip label="Tag" onDelete={handleDelete} />
 *
 * @example
 * // Active/selected state
 * <Chip label="Selected" active onClick={handleToggle} />
 *
 * @example
 * // Compact chip for dense layouts
 * <Chip label="v1.2" compact color="info" />
 *
 * @example
 * // With icon
 * <Chip label="Status" color="success" icon={<CheckIcon />} />
 */
export const Chip: React.FC<ChipProps> = ({
  color = "default",
  active = false,
  compact = false,
  variant,
  sx,
  ...props
}) => {
  const theme = useTheme();

  const chipVariant = variant || (active ? "filled" : "outlined");

  return (
    <MuiChip
      color={color === "default" ? "default" : color}
      variant={chipVariant}
      size={compact ? "small" : props.size}
      sx={{
        fontWeight: active ? 600 : 400,
        ...(compact && {
          height: "22px",
          fontSize: theme.fontSizeTinyer || "0.7rem",
          "& .MuiChip-label": {
            px: 1,
          },
        }),
        ...sx,
      }}
      {...props}
    />
  );
};

Chip.displayName = "Chip";
