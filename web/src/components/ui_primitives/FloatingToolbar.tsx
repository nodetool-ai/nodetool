/**
 * FloatingToolbar
 *
 * The bar that appears over a selection, a hovered card or a node: the same
 * surface as a menu (`menuPaperStyles`: overlay paper, divider frame,
 * `BORDER_RADIUS.lg`, `lg` elevation) holding a row of icon buttons. It owns
 * the look only; the caller positions it and decides when it shows.
 *
 * @example
 * <FloatingToolbar aria-label="Selection actions">
 *   <ToolbarIconButton icon={<CopyIcon />} tooltip="Duplicate" />
 * </FloatingToolbar>
 */

import { forwardRef } from "react";
import { useTheme } from "@mui/material/styles";
import { Box } from "./Box";
import type { BoxProps } from "./Box";
import { menuPaperStyles } from "./menuStyles";
import { SPACING } from "./spacing";

export interface FloatingToolbarProps extends BoxProps {
  /**
   * `horizontal` lays the controls out in a row, `vertical` in a column.
   * @default "horizontal"
   */
  orientation?: "horizontal" | "vertical";
}

export const FloatingToolbar = forwardRef<HTMLDivElement, FloatingToolbarProps>(
  ({ orientation = "horizontal", sx, children, ...props }, ref) => {
    const theme = useTheme();
    return (
      <Box
        ref={ref}
        role="toolbar"
        aria-orientation={orientation}
        sx={[
          {
            ...menuPaperStyles(theme),
            display: "flex",
            flexDirection: orientation === "vertical" ? "column" : "row",
            alignItems: "center",
            gap: SPACING.xs,
            p: SPACING.xs,
            boxSizing: "border-box"
          },
          ...(Array.isArray(sx) ? sx : [sx])
        ]}
        {...props}
      >
        {children}
      </Box>
    );
  }
);

FloatingToolbar.displayName = "FloatingToolbar";
