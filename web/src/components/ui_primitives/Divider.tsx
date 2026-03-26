/**
 * Divider Component
 *
 * A themed divider/separator with spacing variants.
 * Wraps MUI Divider with consistent spacing presets.
 * Used in 23+ files across the codebase.
 */

import React from "react";
import { Divider as MuiDivider, DividerProps as MuiDividerProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface DividerProps extends Omit<MuiDividerProps, 'variant'> {
  /** Spacing around the divider */
  spacing?: "none" | "compact" | "normal" | "comfortable" | "spacious";
  /** Visual variant */
  variant?: "full" | "inset" | "middle";
  /** Divider color */
  color?: "default" | "subtle" | "strong";
}

const SPACING_MAP = {
  none: 0,
  compact: 0.5,
  normal: 1,
  comfortable: 2,
  spacious: 3,
};

/**
 * Divider - A themed separator with spacing presets
 *
 * @example
 * // Basic horizontal divider
 * <Divider />
 *
 * @example
 * // With spacing
 * <Divider spacing="comfortable" />
 *
 * @example
 * // Vertical divider in a flex row
 * <FlexRow>
 *   <Button>Left</Button>
 *   <Divider orientation="vertical" flexItem />
 *   <Button>Right</Button>
 * </FlexRow>
 *
 * @example
 * // Subtle divider
 * <Divider color="subtle" spacing="compact" />
 */
export const Divider: React.FC<DividerProps> = ({
  spacing = "none",
  variant = "full",
  color = "default",
  orientation,
  sx,
  ...props
}) => {
  const theme = useTheme();

  const spacingValue = SPACING_MAP[spacing];
  const isVertical = orientation === "vertical";

  const colorMap = {
    default: theme.vars.palette.divider,
    subtle: `${theme.vars.palette.divider}80`,
    strong: theme.vars.palette.text.secondary,
  };

  const variantMap = {
    full: "fullWidth" as const,
    inset: "inset" as const,
    middle: "middle" as const,
  };

  return (
    <MuiDivider
      orientation={orientation}
      variant={variantMap[variant]}
      sx={{
        my: !isVertical ? spacingValue : undefined,
        mx: isVertical ? spacingValue : undefined,
        borderColor: colorMap[color],
        ...sx,
      }}
      {...props}
    />
  );
};

Divider.displayName = "Divider";
