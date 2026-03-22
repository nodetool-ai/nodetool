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
  /** Font weight */
  weight?: 200 | 300 | 400 | 500 | 600 | 700 | "normal" | "bold";
  /** Font family */
  family?: "primary" | "secondary";
  /** Truncate text with ellipsis */
  truncate?: boolean;
  /** Line clamp (multiline truncation) */
  lineClamp?: number;
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
  weight = "normal",
  family = "primary",
  truncate = false,
  lineClamp,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();

  const getFontSize = () => {
    const sizeMap = {
      giant: theme.fontSizeGiant,
      bigger: theme.fontSizeBigger,
      big: theme.fontSizeBig,
      normal: theme.fontSizeNormal,
      small: theme.fontSizeSmall,
      smaller: theme.fontSizeSmaller,
      tiny: theme.fontSizeTiny,
      tinyer: theme.fontSizeTinyer
    };
    return sizeMap[size];
  };

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
        fontWeight: weight as number | string,
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
