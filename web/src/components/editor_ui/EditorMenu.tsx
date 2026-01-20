/** @jsxImportSource @emotion/react */
/**
 * EditorMenu
 *
 * A Menu primitive for editor/node UI that applies consistent styling
 * via slotProps/sx and is safe for portal rendering (no reliance on global CSS).
 */

import React, { memo } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import { Menu, MenuItem, type MenuItemProps, type MenuProps } from "@mui/material";
import { editorUiClasses } from "../../constants/editorUiClasses";
import { cn } from "./editorUtils";

type SlotPropsWithSx = { sx?: SxProps<Theme> } & Record<string, unknown>;

export interface EditorMenuProps extends Omit<MenuProps, "slotProps"> {
  /**
   * Optional sx for the Paper slot.
   * Prefer this over global CSS for portal-safe styling.
   */
  paperSx?: SxProps<Theme>;
  /**
   * Optional sx for the List slot.
   */
  listSx?: SxProps<Theme>;
  /**
   * Advanced: pass through slotProps (merged with defaults).
   */
  slotProps?: MenuProps["slotProps"];
}

export const EditorMenu = memo(function EditorMenu({
  paperSx,
  listSx,
  slotProps,
  ...props
}: EditorMenuProps) {
  const paperSlot = (slotProps?.paper ?? {}) as SlotPropsWithSx;
  const listSlot = (slotProps?.list ?? {}) as SlotPropsWithSx;

  return (
    <Menu
      {...props}
      slotProps={{
        ...slotProps,
        paper: {
          ...paperSlot,
          className: cn(
            editorUiClasses.menuPaper,
            (paperSlot as { className?: string }).className
          ),
          sx: {
            ...paperSx,
            ...(paperSlot.sx as object | undefined)
          }
        },
        list: {
          ...listSlot,
          className: cn(
            editorUiClasses.menuList,
            (listSlot as { className?: string }).className
          ),
          sx: {
            ...(listSx as object | undefined),
            ...(listSlot.sx as object | undefined)
          }
        }
      }}
    />
  );
});

export interface EditorMenuItemProps extends Omit<MenuItemProps, "dense"> {
  /**
   * Keep menu density consistent across editor menus.
   */
  dense?: boolean;
}

export const EditorMenuItem = memo(function EditorMenuItem({
  dense = true,
  sx,
  ...props
}: EditorMenuItemProps) {
  return (
    <MenuItem
      dense={dense}
      className={cn(editorUiClasses.menuItem, props.className)}
      sx={{
        // Tighten default MUI spacing in list items
        "& .MuiListItemText-root": {
          margin: 0
        },
        "& .MuiListItemIcon-root": {
          minWidth: 24
        },
        ...sx
      }}
      {...props}
    />
  );
});


