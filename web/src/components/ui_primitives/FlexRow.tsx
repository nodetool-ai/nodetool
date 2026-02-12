/**
 * FlexRow Component
 * 
 * A flexible horizontal container with consistent gap spacing.
 * Eliminates repetitive `display: flex, gap` patterns.
 */

import React from "react";
import { Box, BoxProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface FlexRowProps extends Omit<BoxProps, 'display'> {
  /** Gap spacing between children (theme spacing units, e.g., 1 = 4px, 2 = 8px) */
  gap?: number;
  /** Padding (theme spacing units) */
  padding?: number | string;
  /** Align items vertically */
  align?: "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
  /** Justify content horizontally */
  justify?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly";
  /** Enable wrapping of flex items */
  wrap?: boolean;
  /** Full width */
  fullWidth?: boolean;
}

/**
 * FlexRow - A horizontal flex container with gap spacing
 * 
 * @example
 * // Basic usage
 * <FlexRow gap={1}>
 *   <Button>Button 1</Button>
 *   <Button>Button 2</Button>
 * </FlexRow>
 * 
 * @example
 * // With alignment and spacing
 * <FlexRow gap={2} align="center" justify="space-between" fullWidth>
 *   <Typography>Left</Typography>
 *   <Typography>Right</Typography>
 * </FlexRow>
 * 
 * @example
 * // Wrapping row
 * <FlexRow gap={1.5} wrap padding={2}>
 *   <Chip label="Tag 1" />
 *   <Chip label="Tag 2" />
 *   <Chip label="Tag 3" />
 * </FlexRow>
 */
export const FlexRow = React.forwardRef<HTMLDivElement, FlexRowProps>(({
  gap = 0,
  padding,
  align = "stretch",
  justify = "flex-start",
  wrap = false,
  fullWidth = false,
  sx,
  children,
  ...props
}, ref) => {
  const theme = useTheme();

  return (
    <Box
      ref={ref}
      sx={{
        display: "flex",
        flexDirection: "row",
        gap: theme.spacing(gap),
        padding: typeof padding === "number" ? theme.spacing(padding) : padding,
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? "wrap" : "nowrap",
        width: fullWidth ? "100%" : undefined,
        ...sx
      }}
      {...props}
    >
      {children}
    </Box>
  );
});

FlexRow.displayName = "FlexRow";
