/**
 * FlexColumn Component
 *
 * A flexible vertical container with consistent gap spacing.
 * Eliminates repetitive `display: flex, flexDirection: column, gap` patterns.
 */

import React, { memo, useMemo } from "react";
import { Box, BoxProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface FlexColumnProps extends Omit<BoxProps, 'display' | 'flexDirection'> {
  /** Gap spacing between children (theme spacing units, e.g., 1 = 4px, 2 = 8px) */
  gap?: number;
  /** Padding (theme spacing units) */
  padding?: number | string;
  /** Align items horizontally */
  align?: "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
  /** Justify content vertically */
  justify?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly";
  /** Enable wrapping of flex items */
  wrap?: boolean;
  /** Full width */
  fullWidth?: boolean;
  /** Full height */
  fullHeight?: boolean;
}

/**
 * FlexColumn - A vertical flex container with gap spacing
 * 
 * @example
 * // Basic usage
 * <FlexColumn gap={2}>
 *   <div>Item 1</div>
 *   <div>Item 2</div>
 * </FlexColumn>
 * 
 * @example
 * // With padding and alignment
 * <FlexColumn gap={1.5} padding={2} align="center">
 *   <Typography>Centered content</Typography>
 * </FlexColumn>
 * 
 * @example
 * // Full width container
 * <FlexColumn gap={2} fullWidth padding={3}>
 *   <Button>Button 1</Button>
 *   <Button>Button 2</Button>
 * </FlexColumn>
 */
const FlexColumnComponent = ({
  gap = 0,
  padding,
  align = "stretch",
  justify = "flex-start",
  wrap = false,
  fullWidth = false,
  fullHeight = false,
  sx,
  children,
  ...props
}: FlexColumnProps) => {
  const theme = useTheme();

  // Memoize the sx prop to prevent unnecessary re-renders
  const boxSx = useMemo(() => ({
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: theme.spacing(gap),
    padding: typeof padding === "number" ? theme.spacing(padding) : padding,
    alignItems: align,
    justifyContent: justify,
    flexWrap: wrap ? "wrap" as const : "nowrap" as const,
    width: fullWidth ? "100%" : undefined,
    height: fullHeight ? "100%" : undefined,
    ...sx
  }), [theme, gap, padding, align, justify, wrap, fullWidth, fullHeight, sx]);

  return (
    <Box
      sx={boxSx}
      {...props}
    >
      {children}
    </Box>
  );
};

export const FlexColumn = memo(FlexColumnComponent);
FlexColumn.displayName = "FlexColumn";
