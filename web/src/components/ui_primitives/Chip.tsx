/**
 * Chip Component
 *
 * A tag, count or filter. Wraps MUI Chip; the theme's MuiChip override draws
 * every chip as an outlined pill, tinted by its `color` tone.
 */

import React from "react";
import { Chip as MuiChip, ChipProps as MuiChipProps } from "@mui/material";

export interface ChipProps extends Omit<MuiChipProps, 'color'> {
  /** Semantic color variant */
  color?: "default" | "primary" | "secondary" | "success" | "warning" | "error" | "info";
  /**
   * Selected state of a filter or toggle chip. A selected chip takes its
   * `color` tone (primary when none is given), an unselected one stays
   * neutral, and a clickable chip announces the state as `aria-pressed`.
   */
  active?: boolean;
  /** Compact size for dense layouts */
  compact?: boolean;
  /**
   * A surface's own colour (a storyboard or script link) in place of a
   * palette `color`. Tints text, border and fill the way the palette tones do.
   */
  accent?: string;
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
  active,
  compact = false,
  accent,
  variant = "outlined",
  size,
  sx,
  ...props
}) => {
  const tone =
    active === undefined
      ? color
      : active
        ? color === "default"
          ? "primary"
          : color
        : "default";
  const pressed =
    active !== undefined && props.onClick !== undefined ? active : undefined;

  // Height, radius, text and tone tints come from the theme's MuiChip
  // override (DESIGN.md "Chips and pills"), so compact only picks the size.
  return (
    <MuiChip
      color={tone}
      variant={variant}
      size={compact ? "small" : size}
      aria-pressed={pressed}
      sx={[
        active === true && { fontWeight: 500 },
        accent !== undefined && {
          color: accent,
          // color-mix takes any CSS colour, including the palette vars.
          borderColor: `color-mix(in srgb, ${accent} 50%, transparent)`,
          backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`
        },
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
      {...props}
    />
  );
};

Chip.displayName = "Chip";
