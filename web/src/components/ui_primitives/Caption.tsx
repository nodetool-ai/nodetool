/**
 * Caption Component
 * 
 * A small secondary text component for captions, hints, and helper text.
 * Provides consistent styling for supplementary text content.
 */

import React from "react";
import { Typography, TypographyProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface CaptionProps extends Omit<TypographyProps, 'variant'> {
  /** Caption size variant */
  size?: "small" | "smaller" | "tiny";
  /** Text color variant */
  color?: "primary" | "secondary" | "error" | "warning" | "success" | "muted" | string;
  /** Italic text */
  italic?: boolean;
}

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
 * <Caption color="muted" size="tiny">
 *   Last updated 2 hours ago
 * </Caption>
 * 
 * @example
 * // Italic caption
 * <Caption italic>Optional field</Caption>
 */
export const Caption: React.FC<CaptionProps> = ({
  size = "small",
  color = "secondary",
  italic = false,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();

  const getFontSize = () => {
    const sizeMap = {
      small: theme.fontSizeSmall,
      smaller: theme.fontSizeSmaller,
      tiny: theme.fontSizeTiny
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
      muted: theme.vars.palette.text.disabled
    };
    return colorMap[color as keyof typeof colorMap] || color;
  };

  return (
    <Typography
      sx={{
        fontSize: getFontSize(),
        color: getColor(),
        fontStyle: italic ? "italic" : "normal",
        lineHeight: 1.4,
        ...sx
      }}
      {...props}
    >
      {children}
    </Typography>
  );
};
