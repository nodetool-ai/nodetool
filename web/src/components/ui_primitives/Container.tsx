/**
 * Container Component
 * 
 * A standardized container with consistent padding.
 * Eliminates repetitive padding patterns across the app.
 */

import React from "react";
import { Box, BoxProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface ContainerProps extends BoxProps {
  /** Padding size variant */
  padding?: "none" | "compact" | "normal" | "comfortable" | "spacious" | number;
  /** Enable overflow scroll */
  scrollable?: boolean;
  /** Max width */
  maxWidth?: string | number;
  /** Center content horizontally */
  centered?: boolean;
}

const PADDING_VARIANTS = {
  none: 0,
  compact: 1,
  normal: 2,
  comfortable: 3,
  spacious: 4
};

/**
 * Container - A standardized container with consistent padding
 * 
 * @example
 * // Basic usage with normal padding
 * <Container>
 *   <Typography>Content</Typography>
 * </Container>
 * 
 * @example
 * // Custom padding
 * <Container padding="spacious">
 *   <Typography>Spacious content</Typography>
 * </Container>
 * 
 * @example
 * // Scrollable container
 * <Container scrollable maxWidth={800}>
 *   <LongContent />
 * </Container>
 * 
 * @example
 * // Centered container
 * <Container centered maxWidth="lg">
 *   <Typography>Centered content</Typography>
 * </Container>
 */
export const Container: React.FC<ContainerProps> = ({
  padding = "normal",
  scrollable = false,
  maxWidth,
  centered = false,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();
  
  const paddingValue = typeof padding === "number" 
    ? padding 
    : PADDING_VARIANTS[padding];

  return (
    <Box
      sx={{
        padding: theme.spacing(paddingValue),
        overflow: scrollable ? "auto" : undefined,
        maxWidth,
        margin: centered ? "0 auto" : undefined,
        ...sx
      }}
      {...props}
    >
      {children}
    </Box>
  );
};
