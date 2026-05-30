/**
 * Text Component
 * 
 * A flexible text component with size, color, and weight variants.
 * Simplifies common typography patterns across the application.
 */

import React from "react";
import { Typography, TypographyProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface TextProps extends Omit<TypographyProps, 'variant'> {
  /** Text size variant */
  size?: "giant" | "bigger" | "big" | "normal" | "small" | "smaller" | "tiny" | "tinyer";
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
}

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
export const Text: React.FC<TextProps> = ({
  size = "normal",
  color = "inherit",
  weight,
  family = "primary",
  truncate = false,
  lineClamp,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();

  // Font sizes are driven by the theme CSS variables (single source of truth
  // in ThemeNodetool). The eight legacy size names collapse onto the four vars.
  const getFontSize = () => {
    const sizeMap = {
      giant: "var(--fontSizeBig)",
      bigger: "var(--fontSizeBig)",
      big: "var(--fontSizeBig)",
      normal: "var(--fontSizeNormal)",
      small: "var(--fontSizeSmall)",
      smaller: "var(--fontSizeSmaller)",
      tiny: "var(--fontSizeSmaller)",
      tinyer: "var(--fontSizeSmaller)"
    };
    return sizeMap[size];
  };

  // Default weight follows the sanctioned size+weight combo for the size.
  // sans: 18→600 (title), 15→400 (body), 13→500 (label), 11→400 (caption)
  // mono: 13→400 (code), 12→500 (label), 11→400 (caption)
  const getDefaultWeight = (): 400 | 500 | 600 => {
    const titleSizes = ["giant", "bigger", "big"];
    const labelSizes = ["small"];
    if (titleSizes.includes(size)) {
      return family === "secondary" ? 400 : 600;
    }
    if (labelSizes.includes(size)) {
      return family === "secondary" ? 400 : 500;
    }
    return 400; // body + caption
  };
  const resolvedWeight = weight === "normal" ? 400 : weight ?? getDefaultWeight();

  const getColor = () => {
    const colorMap = {
      primary: theme.vars.palette.primary.main,
      secondary: theme.vars.palette.text.secondary,
      error: theme.vars.palette.error.main,
      warning: theme.vars.palette.warning.main,
      success: theme.vars.palette.success.main,
      inherit: "inherit"
    };
    return colorMap[color as keyof typeof colorMap] || color;
  };

  const getFontFamily = () => {
    return family === "secondary" ? theme.fontFamily2 : theme.fontFamily1;
  };

  const getTruncateStyles = (): React.CSSProperties => {
    if (lineClamp) {
      return {
        display: "-webkit-box",
        WebkitLineClamp: lineClamp,
        WebkitBoxOrient: "vertical" as const,
        overflow: "hidden",
        textOverflow: "ellipsis"
      } as React.CSSProperties;
    }
    if (truncate) {
      return {
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      };
    }
    return {};
  };

  return (
    <Typography
      sx={{
        fontSize: getFontSize() as string,
        color: getColor() as string,
        fontWeight: resolvedWeight,
        fontFamily: getFontFamily() as string,
        ...getTruncateStyles(),
        ...sx
      }}
      {...props}
    >
      {children}
    </Typography>
  );
};
