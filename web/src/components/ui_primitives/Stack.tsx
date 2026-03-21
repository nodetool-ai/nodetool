/**
 * Stack Component
 * 
 * A semantic vertical stack container with spacing between children.
 * Similar to MUI Stack but with simplified API optimized for vertical layouts.
 */

import React from "react";
import { Box, BoxProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface StackProps extends Omit<BoxProps, 'display' | 'flexDirection'> {
  /** Spacing between children (theme spacing units) */
  spacing?: number;
  /** Padding (theme spacing units) */
  padding?: number | string;
  /** Divider element to render between children */
  divider?: React.ReactElement;
  /** Full width */
  fullWidth?: boolean;
}

/**
 * Stack - A vertical stack container with consistent spacing
 * 
 * @example
 * // Basic usage
 * <Stack spacing={2}>
 *   <Typography>Item 1</Typography>
 *   <Typography>Item 2</Typography>
 *   <Typography>Item 3</Typography>
 * </Stack>
 * 
 * @example
 * // With divider
 * <Stack spacing={1} divider={<Divider />}>
 *   <MenuItem>Option 1</MenuItem>
 *   <MenuItem>Option 2</MenuItem>
 * </Stack>
 * 
 * @example
 * // Full width with padding
 * <Stack spacing={2} padding={3} fullWidth>
 *   <TextField label="Name" />
 *   <TextField label="Email" />
 * </Stack>
 */
export const Stack: React.FC<StackProps> = ({
  spacing = 0,
  padding,
  divider,
  fullWidth = false,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();
  const childArray = React.Children.toArray(children);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: divider ? 0 : theme.spacing(spacing),
        padding: typeof padding === "number" ? theme.spacing(padding) : padding,
        width: fullWidth ? "100%" : undefined,
        ...sx
      }}
      {...props}
    >
      {divider
        ? childArray.map((child, index) => (
            <React.Fragment key={index}>
              {child}
              {index < childArray.length - 1 && (
                <Box sx={{ my: theme.spacing(spacing / 2) }}>
                  {React.cloneElement(divider)}
                </Box>
              )}
            </React.Fragment>
          ))
        : children}
    </Box>
  );
};
