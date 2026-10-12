/**
 * ContextMenu Component
 *
 * A semantic wrapper around MUI Menu for context menus and dropdown menus.
 * Adds right-click positioning. The theme gives every MUI Menu the shared menu
 * surface and row style (`menuStyles.ts`); fill it with `MenuItemPrimitive`.
 */

import React, { memo } from "react";
import {
  Menu as MuiMenu,
  MenuProps as MuiMenuProps,
} from "@mui/material";
import { SxProps, Theme } from "@mui/material";
import { sxEntries } from "./tokens";
import { MENU_MIN_WIDTH } from "./menuStyles";

export interface ContextMenuProps extends Omit<MuiMenuProps, "anchorPosition"> {
  /** Position for right-click context menus */
  position?: { x: number; y: number } | null;
  /** Max height of the menu */
  maxHeight?: number | string;
  /** Min width of the menu. Defaults to `MENU_MIN_WIDTH` (180px) */
  minWidth?: number | string;
  /** Additional sx for the paper element, for layout only (size, overflow) */
  paperSx?: SxProps<Theme>;
}

/**
 * ContextMenu - A themed menu for context menus and dropdowns
 *
 * @example
 * // Anchor-based dropdown menu
 * <ContextMenu open={open} anchorEl={anchorEl} onClose={handleClose}>
 *   <MenuItemPrimitive label="Edit" onClick={handleEdit} />
 *   <MenuItemPrimitive label="Delete" color="error" onClick={handleDelete} />
 * </ContextMenu>
 *
 * @example
 * // Right-click context menu with position
 * <ContextMenu
 *   open={open}
 *   position={mousePosition}
 *   onClose={handleClose}
 * >
 *   <MenuItemPrimitive label="Copy" shortcut="⌘C" />
 *   <MenuItemPrimitive label="Paste" shortcut="⌘V" />
 * </ContextMenu>
 *
 * @example
 * // With size constraints
 * <ContextMenu open={open} anchorEl={ref} onClose={close} maxHeight={300} minWidth={200}>
 *   {items.map(item => <MenuItemPrimitive key={item.id} label={item.label} />)}
 * </ContextMenu>
 */
const ContextMenuInternal: React.FC<ContextMenuProps> = ({
  position,
  maxHeight,
  minWidth = MENU_MIN_WIDTH,
  paperSx,
  slotProps,
  children,
  ...props
}) => {
  const anchorPosition = position
    ? { top: position.y, left: position.x }
    : undefined;

  const anchorReference = position ? "anchorPosition" as const : undefined;

  return (
    <MuiMenu
      anchorPosition={anchorPosition}
      anchorReference={anchorReference}
      slotProps={{
        ...slotProps,
        paper: {
          ...slotProps?.paper,
          sx: [
            { maxHeight, minWidth },
            ...sxEntries(paperSx),
          ],
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
