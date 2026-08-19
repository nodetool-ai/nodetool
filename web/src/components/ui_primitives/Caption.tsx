/**
 * Caption Component
 *
 * A small secondary text component for captions, hints, and helper text.
 * Provides consistent styling for supplementary text content.
 */

import React, { memo, forwardRef } from "react";
import { Typography, TypographyProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

export interface CaptionProps extends Omit<TypographyProps, 'variant'> {
  /** Caption size variant */
  size?: "small" | "smaller";
  /** Text color variant */
  color?: "primary" | "secondary" | "error" | "warning" | "success" | "muted" | string;
  /** Italic text */
  italic?: boolean;
  /** Polymorphic component type (e.g., "a" for anchor) */
  component?: React.ElementType;
  /** URL for anchor usage */
  href?: string;
  /** Link target */
  target?: string;
  /** Link rel attribute */
  rel?: string;
}

const FONT_SIZES = {
  small: "var(--fontSizeSmall)", // 13px — label combo
  smaller: "var(--fontSizeSmaller)" // 11px — caption combo
} satisfies Record<NonNullable<CaptionProps["size"]>, string>;

const resolveColor = (color: string, theme: Theme): string => {
  switch (color) {
    case "primary":
      return theme.vars.palette.primary.main;
    case "secondary":
      return theme.vars.palette.text.secondary;
    case "error":
      return theme.vars.palette.error.main;
    case "warning":
      return theme.vars.palette.warning.main;
    case "success":
      return theme.vars.palette.success.main;
    case "muted":
      return theme.vars.palette.text.disabled;
    default:
      return color;
  }
};

/**
 * Caption - A small secondary text component
 * 
 * @example
 * // Basic caption
 * <Caption>Helper text for the field above</Caption>
 * 
 * @example
 * // Error caption
 * <Caption color="error">Invalid input format</Caption>
 * 
 * @example
 * // Muted caption
 * <Caption color="muted" size="smaller">
 *   Last updated 2 hours ago
 * </Caption>
 * 
 * @example
 * // Italic caption
 * <Caption italic>Optional field</Caption>
 */
const CaptionInternal = forwardRef<HTMLElement, CaptionProps>(({
  size = "smaller",
  color = "secondary",
  italic = false,
  sx,
  children,
  ...props
}, ref) => {
  const theme = useTheme();

  // Stay on the sanctioned combos: 13px text is medium (label), 11px is regular.
  const fontWeight = size === "small" ? 500 : 400;

  return (
    <Typography
      ref={ref}
      sx={{
        fontSize: FONT_SIZES[size],
        fontWeight,
        color: resolveColor(color, theme),
        fontStyle: italic ? "italic" : "normal",
        lineHeight: 1.4,
        ...sx
      }}
      {...props}
    >
      {children}
    </Typography>
  );
});

export const Caption = memo(CaptionInternal);
Caption.displayName = "Caption";
