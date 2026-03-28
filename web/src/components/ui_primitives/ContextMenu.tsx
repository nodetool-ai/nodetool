/**
 * ContextMenu Component
 *
 * A semantic wrapper around MUI Menu for context menus and dropdown menus.
 * Provides simplified positioning and consistent styling.
 * Used in 20+ context menu files across the codebase.
 */

import React, { memo } from "react";
import {
  Menu as MuiMenu,
  MenuProps as MuiMenuProps,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { SxProps, Theme } from "@mui/material";

export interface ContextMenuProps extends Omit<MuiMenuProps, "anchorPosition"> {
  /** Position for right-click context menus */
  position?: { x: number; y: number } | null;
  /** Max height of the menu */
  maxHeight?: number | string;
  /** Min width of the menu */
  minWidth?: number | string;
  /** Additional sx for the paper element */
  paperSx?: SxProps<Theme>;
  /** Compact spacing between items */
  compact?: boolean;
}

/**
 * ContextMenu - A themed menu for context menus and dropdowns
 *
 * @example
 * // Anchor-based dropdown menu
 * <ContextMenu open={open} anchorEl={anchorEl} onClose={handleClose}>
 *   <MenuItem onClick={handleEdit}>Edit</MenuItem>
 *   <MenuItem onClick={handleDelete}>Delete</MenuItem>
 * </ContextMenu>
 *
 * @example
 * // Right-click context menu with position
 * <ContextMenu
 *   open={open}
 *   position={mousePosition}
 *   onClose={handleClose}
 *   compact
 * >
 *   <MenuItem>Copy</MenuItem>
 *   <MenuItem>Paste</MenuItem>
 * </ContextMenu>
 *
 * @example
 * // With size constraints
 * <ContextMenu open={open} anchorEl={ref} onClose={close} maxHeight={300} minWidth={200}>
 *   {items.map(item => <MenuItem key={item.id}>{item.label}</MenuItem>)}
 * </ContextMenu>
 */
const ContextMenuInternal: React.FC<ContextMenuProps> = ({
  position,
  maxHeight,
  minWidth,
  paperSx,
  compact = false,
  slotProps,
  children,
  ...props
}) => {
  const theme = useTheme();

  const anchorPosition = position
    ? { top: position.y, left: position.x }
    : undefined;

  const anchorReference = position ? "anchorPosition" as const : undefined;

  // Compute border radius with type guard since borderRadius can be string | number
  const borderRadiusValue = typeof theme.shape.borderRadius === "number"
    ? theme.shape.borderRadius / 4
    : undefined;

  return (
    <MuiMenu
      anchorPosition={anchorPosition}
      anchorReference={anchorReference}
      slotProps={{
        ...slotProps,
        paper: {
          ...slotProps?.paper,
          sx: {
            borderRadius: borderRadiusValue,
            maxHeight,
            minWidth,
            ...(compact && {
              "& .MuiMenuItem-root": {
                minHeight: "auto",
                py: 0.5,
                fontSize: theme.fontSizeSmall || "0.875rem",
              },
            }),
            ...(paperSx as object),
          } as SxProps<Theme>,
        },
      }}
      {...props}
    >
      {children}
    </MuiMenu>
  );
};

export const ContextMenu = memo(ContextMenuInternal);
ContextMenu.displayName = "ContextMenu";
