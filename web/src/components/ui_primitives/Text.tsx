/**
 * Text Component
 * 
 * A flexible text component with size, color, and weight variants.
 * Simplifies common typography patterns across the application.
 */

import React, { forwardRef } from "react";
import { Typography, TypographyProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

export interface TextProps extends Omit<TypographyProps, 'variant'> {
  /** Text size variant — five sizes (22/18/15/13/11px), no aliases */
  size?: "giant" | "big" | "normal" | "small" | "smaller";
  /** Text color variant */
  color?: "primary" | "secondary" | "error" | "warning" | "success" | "inherit" | string;
  /**
   * Font weight. Defaults to the sanctioned weight for the chosen size
   * (the size+weight combo from the design system). Only override with an
   * allowed weight (400/500/600) when the role's default genuinely doesn't fit.
   */
  weight?: 400 | 500 | 600 | "normal";
  /** Font family */
  family?: "primary" | "secondary";
  /** Truncate text with ellipsis */
  truncate?: boolean;
  /** Line clamp (multiline truncation) */
  lineClamp?: number;
  /** Polymorphic component type (e.g., "a" for anchor) */
  component?: React.ElementType;
  /** URL for anchor usage */
  href?: string;
  /** Link target */
  target?: string;
  /** Link rel attribute */
  rel?: string;
  /** Button type, for `component="button"` usage */
  type?: "button" | "submit" | "reset";
}

// Font sizes are driven by the theme CSS variables (single source of truth
// in ThemeNodetool). Five names, five real values — no aliases.
const FONT_SIZES = {
  giant: "var(--fontSizeGiant)",
  big: "var(--fontSizeBig)",
  normal: "var(--fontSizeNormal)",
  small: "var(--fontSizeSmall)",
  smaller: "var(--fontSizeSmaller)"
} satisfies Record<NonNullable<TextProps["size"]>, string>;

// The sanctioned size+weight combos for the sans family: 22/18→600
// (display/title), 15→400 (body), 13→500 (label), 11→400 (caption). The mono
// family is 400 throughout.
const SANS_WEIGHTS = {
  giant: 600,
  big: 600,
  normal: 400,
  small: 500,
  smaller: 400
} satisfies Record<NonNullable<TextProps["size"]>, 400 | 500 | 600>;

const TRUNCATE_STYLES: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};

const resolveColor = (color: string, theme: Theme): string => {
  switch (color) {
    case "inherit":
      return "inherit";
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
    default:
      return color;
  }
};

/**
 * Text - A flexible text component with theme-aware styling
 * 
 * @example
 * // Basic usage
 * <Text>Default text</Text>
 * 
 * @example
 * // With size and color
 * <Text size="small" color="secondary">
 *   Small secondary text
 * </Text>
 * 
 * @example
 * // Bold text with custom weight
 * <Text weight={600} size="big">
 *   Important text
 * </Text>
 * 
 * @example
 * // Truncated text
 * <Text truncate maxWidth={200}>
 *   This is a very long text that will be truncated
 * </Text>
 * 
 * @example
 * // Line clamped text (multiline ellipsis)
 * <Text lineClamp={2}>
 *   This is a long paragraph that will be clamped to 2 lines with ellipsis
 * </Text>
 */
export const Text = forwardRef<HTMLElement, TextProps>(({
  size = "normal",
  color = "inherit",
  weight,
  family = "primary",
  truncate = false,
  lineClamp,
  sx,
  children,
  ...props
}, ref) => {
  const theme = useTheme();

  const defaultWeight = family === "secondary" ? 400 : SANS_WEIGHTS[size];
  const resolvedWeight = weight === "normal" ? 400 : weight ?? defaultWeight;

  const truncateStyles = lineClamp
    ? {
        display: "-webkit-box",
        WebkitLineClamp: lineClamp,
        WebkitBoxOrient: "vertical" as const,
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    : truncate
      ? TRUNCATE_STYLES
      : undefined;

  return (
    <Typography
      ref={ref}
      sx={{
        fontSize: FONT_SIZES[size],
        color: resolveColor(color, theme),
        fontWeight: resolvedWeight,
        fontFamily: family === "secondary" ? theme.fontFamily2 : theme.fontFamily1,
        ...truncateStyles,
        ...sx
      }}
      {...props}
    >
      {children}
    </Typography>
  );
});

Text.displayName = "Text";
