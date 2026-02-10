/**
 * Card Component
 * 
 * A card component with standardized styling, elevation, and padding.
 * Provides consistent card appearance across the application.
 */

import React from "react";
import { Box, BoxProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface CardProps extends BoxProps {
  /** Padding size variant */
  padding?: "none" | "compact" | "normal" | "comfortable" | "spacious" | number;
  /** Elevation/shadow level (0-24) */
  elevation?: number;
  /** Border variant */
  variant?: "default" | "outlined" | "elevated";
  /** Hover effect */
  hoverable?: boolean;
  /** Clickable card */
  clickable?: boolean;
}

const PADDING_VARIANTS = {
  none: 0,
  compact: 1.5,
  normal: 2.5,
  comfortable: 3,
  spacious: 4
};

/**
 * Card - A card component with standardized styling
 * 
 * @example
 * // Basic card
 * <Card>
 *   <Typography>Card content</Typography>
 * </Card>
 * 
 * @example
 * // Outlined card with custom padding
 * <Card variant="outlined" padding="compact">
 *   <Typography>Compact card</Typography>
 * </Card>
 * 
 * @example
 * // Clickable/hoverable card
 * <Card hoverable clickable onClick={handleClick}>
 *   <Typography>Click me</Typography>
 * </Card>
 * 
 * @example
 * // Elevated card
 * <Card variant="elevated" elevation={8}>
 *   <Typography>Elevated content</Typography>
 * </Card>
 */
export const Card: React.FC<CardProps> = ({
  padding = "normal",
  elevation = 1,
  variant = "default",
  hoverable = false,
  clickable = false,
  sx,
  children,
  onClick,
  ...props
}) => {
  const theme = useTheme();
  
  const paddingValue = typeof padding === "number" 
    ? padding 
    : PADDING_VARIANTS[padding];

  const getBackgroundColor = () => {
    if (variant === "elevated") {
      return theme.vars.palette.background.paper;
    }
    return theme.vars.palette.background.paper;
  };

  const getBorder = () => {
    if (variant === "outlined") {
      return `1px solid ${theme.vars.palette.divider}`;
    }
    return undefined;
  };

  const getBoxShadow = () => {
    if (variant === "elevated" && elevation > 0) {
      // Simple elevation shadow
      const shadowIntensity = Math.min(elevation / 24, 1);
      return `0 ${elevation}px ${elevation * 2}px rgba(0, 0, 0, ${0.2 * shadowIntensity})`;
    }
    return undefined;
  };

  return (
    <Box
      onClick={clickable ? onClick : undefined}
      sx={{
        padding: theme.spacing(paddingValue),
        backgroundColor: getBackgroundColor(),
        border: getBorder(),
        borderRadius: theme.shape.borderRadius,
        boxShadow: getBoxShadow(),
        cursor: clickable ? "pointer" : undefined,
        transition: hoverable || clickable 
          ? "transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease" 
          : undefined,
        "&:hover": hoverable || clickable 
          ? {
              transform: "translateY(-2px)",
              boxShadow: `0 ${elevation + 4}px ${(elevation + 4) * 2}px rgba(0, 0, 0, 0.25)`,
              backgroundColor: theme.vars.palette.action.hover
            }
          : undefined,
        ...sx
      }}
      {...props}
    >
      {children}
    </Box>
  );
};
