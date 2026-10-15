/**
 * Toolbar
 *
 * The strip that sits above or below an editor surface: one height, one
 * padding, one gap, `background.paper` and a 1px `divider` rule on the edge
 * that faces the content. `StatusBar` is a bottom `Toolbar` with caption type.
 *
 * @example
 * <Toolbar>
 *   <ToolbarGroup>
 *     <ToolbarIconButton icon={<UndoIcon />} tooltip="Undo" />
 *     <ToolbarIconButton icon={<RedoIcon />} tooltip="Redo" />
 *   </ToolbarGroup>
 *   <ToolbarDivider />
 *   <ToolbarGroup>...</ToolbarGroup>
 * </Toolbar>
 */

import React, { forwardRef } from "react";
import { Box } from "./Box";
import type { BoxProps } from "./Box";
import { SPACING } from "./spacing";
import { CONTROL } from "./tokens";

/** Minimum bar height per density, px. `compact` holds 24-28px controls. */
export const TOOLBAR_HEIGHT = {
  compact: CONTROL.height.sm,
  normal: 40
} as const;

export type ToolbarDensity = keyof typeof TOOLBAR_HEIGHT;

export interface ToolbarProps extends Omit<BoxProps, "position"> {
  /**
   * `top` rules the bottom edge, `bottom` rules the top edge.
   * @default "top"
   */
  position?: "top" | "bottom";
  /**
   * `normal` (40px) for editor tool bars, `compact` (28px) for slim strips
   * and status bars.
   * @default "normal"
   */
  density?: ToolbarDensity;
  /**
   * Draw the divider rule on the edge facing the content.
   * @default true
   */
  bordered?: boolean;
}

export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(
  (
    {
      position = "top",
      density = "normal",
      bordered = true,
      sx,
      children,
      ...props
    },
    ref
  ) => {
    const edge = position === "top" ? "borderBottom" : "borderTop";
    return (
      <Box
        ref={ref}
        sx={[
          {
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            boxSizing: "border-box",
            minHeight: TOOLBAR_HEIGHT[density],
            px: SPACING.md,
            gap: SPACING.sm,
            bgcolor: "background.paper",
            [edge]: bordered ? 1 : 0,
            borderColor: "divider"
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

Toolbar.displayName = "Toolbar";

export type ToolbarGroupProps = BoxProps;

/** A cluster of related controls inside a `Toolbar`, tighter than the bar's own gap. */
export const ToolbarGroup = forwardRef<HTMLDivElement, ToolbarGroupProps>(
  ({ sx, children, ...props }, ref) => (
    <Box
      ref={ref}
      sx={[
        {
          display: "flex",
          alignItems: "center",
          gap: SPACING.xs,
          minWidth: 0
        },
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
      {...props}
    >
      {children}
    </Box>
  )
);

ToolbarGroup.displayName = "ToolbarGroup";

/** A vertical rule between two `ToolbarGroup`s. */
export const ToolbarDivider: React.FC<{ className?: string }> = ({
  className
}) => (
  <Box
    role="separator"
    aria-orientation="vertical"
    className={className}
    sx={{
      alignSelf: "stretch",
      flexShrink: 0,
      my: SPACING.sm,
      borderLeft: 1,
      borderColor: "divider"
    }}
  />
);

ToolbarDivider.displayName = "ToolbarDivider";
