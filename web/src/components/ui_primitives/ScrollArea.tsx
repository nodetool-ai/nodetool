/**
 * ScrollArea Component
 *
 * A scrollable container with consistent styling and optional thin scrollbars.
 * Replaces 164+ instances of manual overflow: auto/scroll patterns.
 */

import { forwardRef } from "react";
import { Box, BoxProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface ScrollAreaProps extends BoxProps {
  /** Scroll direction */
  direction?: "vertical" | "horizontal" | "both";
  /** Use thin/minimal scrollbar styling */
  thin?: boolean;
  /** Hide scrollbar until hover */
  autoHide?: boolean;
  /** Max height constraint */
  maxHeight?: string | number;
  /** Max width constraint */
  maxWidth?: string | number;
  /** Take full height of parent */
  fullHeight?: boolean;
  /** Padding inside the scroll area (theme spacing units) */
  padding?: number;
}

/**
 * ScrollArea - A scrollable container with theme-aware styling
 *
 * @example
 * // Basic vertical scroll
 * <ScrollArea maxHeight={400}>
 *   <LongContent />
 * </ScrollArea>
 *
 * @example
 * // Horizontal scroll with thin scrollbar
 * <ScrollArea direction="horizontal" thin>
 *   <WideContent />
 * </ScrollArea>
 *
 * @example
 * // Full height scroll area with auto-hiding scrollbar
 * <ScrollArea fullHeight autoHide>
 *   <Content />
 * </ScrollArea>
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(({
  direction = "vertical",
  thin = false,
  autoHide = false,
  maxHeight,
  maxWidth,
  fullHeight = false,
  padding,
  sx,
  children,
  ...props
}, ref) => {
  const theme = useTheme();

  const overflowStyles = {
    vertical: { overflowY: "auto" as const, overflowX: "hidden" as const },
    horizontal: { overflowX: "auto" as const, overflowY: "hidden" as const },
    both: { overflow: "auto" as const },
  };

  const thinScrollbarStyles = thin ? {
    "&::-webkit-scrollbar": {
      width: "4px",
      height: "4px",
    },
    "&::-webkit-scrollbar-track": {
      background: "transparent",
    },
    "&::-webkit-scrollbar-thumb": {
      background: theme.vars.palette.grey[700],
      borderRadius: theme.rounded.xs,
    },
    "&::-webkit-scrollbar-thumb:hover": {
      background: theme.vars.palette.grey[600],
    },
  } : {};

  const autoHideStyles = autoHide ? {
    "&::-webkit-scrollbar-thumb": {
      background: "transparent",
    },
    "&:hover::-webkit-scrollbar-thumb": {
      background: theme.vars.palette.grey[700],
    },
  } : {};

  return (
    <Box
      ref={ref}
      sx={{
        ...overflowStyles[direction],
        maxHeight,
        maxWidth,
        height: fullHeight ? "100%" : undefined,
        padding: padding !== undefined ? theme.spacing(padding) : undefined,
        ...thinScrollbarStyles,
        ...autoHideStyles,
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
});

ScrollArea.displayName = "ScrollArea";
